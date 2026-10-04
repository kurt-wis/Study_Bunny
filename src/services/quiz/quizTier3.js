/**
 * Tier 3 Quiz Generation — deterministic, works 100% offline.
 * Generates fill-in-the-blank and true/false questions from RAKE keywords.
 */
import { extractKeywords } from '../../ai/rakeExtractor.js';
import { extractDefinitions, itemsToDefinitions, blankedDefinition, acceptableAnswers } from '../../ai/definitions.js';

/**
 * Generate 5 questions from raw text, biased toward weak topics.
 *
 * @param {string} rawText
 * @param {object} knowledgeState - { [topic]: { mastery: number } | number }
 * @returns {Promise<{ tier: string, questions: object[] }>}
 */
/** Trim a sentence to a short, readable length for feedback. */
function shorten(sentence, max = 180) {
  const clean = String(sentence ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, clean.lastIndexOf(' ', max))}…`;
}

const QUIZ_LENGTH = 5;
const FILL_BLANKS = 3;

function masteryOf(knowledgeState, term) {
  const state = knowledgeState?.[term];
  const m = typeof state === 'object' && state !== null ? state.mastery : state;
  return typeof m === 'number' && Number.isFinite(m) ? m : null;
}

/**
 * Build a quiz from term/definition pairs: weakest and never-seen terms first,
 * shuffled within the same level so each new quiz asks different things.
 *
 * @param {ReturnType<typeof extractDefinitions>} definitions
 * @param {object} knowledgeState
 * @param {() => number} [random]
 */
export function definitionQuestions(definitions, knowledgeState = {}, random = Math.random) {
  const ranked = definitions
    .map(d => ({ d, mastery: masteryOf(knowledgeState, d.term), tie: random() }))
    .sort((a, b) => ((a.mastery ?? 0.3) - (b.mastery ?? 0.3)) || (a.tie - b.tie));
  const picks = ranked.slice(0, QUIZ_LENGTH);
  const questions = [];
  const difficulty = p => (p.mastery != null && p.mastery < 0.6 ? 'review' : 'standard');

  const fillBlank = p => ({
    type: 'fill_in_blank',
    topic: p.d.term,
    question: `Fill in the blank:\n\n${blankedDefinition(p.d)}`,
    correct_answer: p.d.term,
    acceptable_answers: acceptableAnswers(p.d.term),
    explanation: `Your notes say: "${p.d.source}"`,
    difficulty: difficulty(p),
  });
  const sep = d => (d.kind === 'separator' ? (d.joiner === ':' ? ': ' : ' - ') : ` ${d.joiner} `);
  const trueFalse = (p, makeTrue) => {
    // A false statement pairs the term with another term's meaning.
    const others = definitions.filter(o => o.term !== p.d.term && o.definition !== p.d.definition);
    const wrong = !makeTrue && others.length > 0 ? others[Math.floor(random() * others.length)] : null;
    return {
      type: 'true_false',
      topic: p.d.term,
      question: `True or False:\n\n${p.d.term}${sep(p.d)}${wrong ? wrong.definition : p.d.definition}`,
      options: ['True', 'False'],
      correct_answer: wrong ? 'False' : 'True',
      explanation: wrong ? `False. Your notes say: "${p.d.source}"` : 'True. This is what your notes say.',
      difficulty: difficulty(p),
    };
  };

  picks.slice(0, FILL_BLANKS).forEach(p => questions.push(fillBlank(p)));
  let truthy = 0;
  picks.slice(FILL_BLANKS).forEach(p => questions.push(trueFalse(p, truthy++ % 2 === 1)));
  // Short glossaries: reuse terms as true/false until the quiz has five questions.
  for (let i = picks.length - 1; questions.length < QUIZ_LENGTH && i >= 0; i--) {
    if (!questions.some(q => q.type === 'true_false' && q.topic === picks[i].d.term)) {
      questions.push(trueFalse(picks[i], truthy++ % 2 === 1));
    }
  }
  questions.forEach((q, i) => { q.id = i + 1; });
  return questions;
}

const PROSE_STOPWORDS = new Set(['about', 'above', 'after', 'again', 'against', 'because', 'before', 'being', 'below', 'between', 'during', 'other', 'their', 'there', 'these', 'those', 'through', 'under', 'until', 'which', 'while', 'would', 'should', 'could', 'using', 'within', 'without', 'called', 'known', 'often', 'usually', 'always', 'never', 'every', 'where', 'when', 'what', 'into', 'from', 'with', 'that', 'this', 'they', 'them', 'have', 'been', 'were', 'will', 'also', 'such', 'than', 'then', 'some', 'most', 'many', 'more', 'each', 'both', 'only', 'very']);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Questions from plain paragraphs (no "term - meaning" lines). Each question
 * comes from one full sentence of the notes. The blank hides one short,
 * important word or phrase from that sentence — never a long clause — and the
 * sentences are picked weakest-first and shuffled, so a new quiz asks new things.
 */
export function proseQuestions(rawText, knowledgeState = {}, random = Math.random) {
  const text = String(rawText ?? '').replace(/\s*\n\s*/g, ' ');
  const sentences = [...new Set((text.match(/[^.!?]+[.!?]+/g) || []).map(x => x.replace(/\s+/g, ' ').trim()))]
    .filter(x => x.length >= 25 && x.length <= 240 && x.split(' ').length >= 5);
  // How many sentences each word appears in: rarer words are more specific.
  const wordsOf = sentence => sentence.match(/[A-Za-z][A-Za-z'-]{3,}/g) || [];
  const spread = new Map();
  for (const sentence of sentences) {
    for (const w of new Set(wordsOf(sentence).map(x => x.toLowerCase()))) spread.set(w, (spread.get(w) ?? 0) + 1);
  }

  const candidates = [];
  const usedAnswers = new Set();
  for (const sentence of sentences) {
    // Blank ONE word. Best is the subject the sentence is about (its first
    // real word); otherwise a long, specific word. Verb-like and filler words lose.
    const words = wordsOf(sentence).filter(w => !PROSE_STOPWORDS.has(w.toLowerCase()) && !usedAnswers.has(w.toLowerCase()));
    if (words.length === 0) continue;
    const scored = words.map((w, i) => {
      const lower = w.toLowerCase();
      let score = Math.min(w.length, 12);
      if (i === 0) score += 5;
      score += Math.max(0, 3 - i); // earlier words are usually what the sentence is about
      if ((spread.get(lower) ?? 1) === 1) score += 2;
      if (/(?:ize|ise|ate|ify|ing|ed|ly)s?$/.test(lower)) score -= 4;
      return { w, score };
    }).sort((x, y) => y.score - x.score);
    // Vary between the two best words so repeat quizzes are not identical.
    const top = scored.slice(0, 2).filter(x => x.score >= scored[0].score - 2);
    const answer = top[Math.floor(random() * top.length)].w;
    usedAnswers.add(answer.toLowerCase());
    candidates.push({ sentence, answer, topic: answer.toLowerCase(), subject: words[0] === answer, plural: /s$/i.test(answer) });
  }
  if (candidates.length === 0) return [];

  const ranked = candidates
    .map(cand => ({ ...cand, mastery: masteryOf(knowledgeState, cand.topic), tie: random() }))
    .sort((x, y) => ((x.mastery ?? 0.3) - (y.mastery ?? 0.3)) || (x.tie - y.tie));
  const picks = ranked.slice(0, QUIZ_LENGTH);
  const difficulty = p => (p.mastery != null && p.mastery < 0.6 ? 'review' : 'standard');
  const swapIn = (p, replacement) => p.sentence.replace(new RegExp(`\\b${escapeRegExp(p.answer)}\\b`, 'i'), replacement);

  const questions = [];
  const fill = p => ({
    type: 'fill_in_blank',
    topic: p.topic,
    question: `Fill in the blank:\n\n${swapIn(p, '________')}`,
    correct_answer: p.answer,
    acceptable_answers: acceptableAnswers(p.answer),
    explanation: `Your notes say: "${shorten(p.sentence)}"`,
    difficulty: difficulty(p),
  });
  const trueFalse = (p, makeTrue) => {
    // Swap in a word of the same kind (subject for subject, plural for plural)
    // so the false statement still reads like a real sentence.
    const others = candidates.filter(o => o.answer.toLowerCase() !== p.answer.toLowerCase());
    const alike = others.filter(o => o.subject === p.subject && o.plural === p.plural);
    const pool = alike.length > 0 ? alike : others.filter(o => o.subject === p.subject);
    const chosen = !makeTrue && (pool.length > 0 ? pool : others).length > 0
      ? (pool.length > 0 ? pool : others)[Math.floor(random() * (pool.length > 0 ? pool : others).length)].answer
      : null;
    const matchCase = w => (/^[A-Z]/.test(p.answer) ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1));
    const swap = chosen ? matchCase(chosen) : null;
    return {
      type: 'true_false',
      topic: p.topic,
      question: `True or False:\n\n${swap ? swapIn(p, swap) : p.sentence}`,
      options: ['True', 'False'],
      correct_answer: swap ? 'False' : 'True',
      explanation: swap ? `False. Your notes say: "${shorten(p.sentence)}"` : 'True. This is what your notes say.',
      difficulty: difficulty(p),
    };
  };

  picks.slice(0, FILL_BLANKS).forEach(p => questions.push(fill(p)));
  let n = 0;
  picks.slice(FILL_BLANKS).forEach(p => questions.push(trueFalse(p, n++ % 2 === 1)));
  for (let i = picks.length - 1; questions.length < QUIZ_LENGTH && i >= 0; i--) {
    if (!questions.some(q => q.type === 'true_false' && q.topic === picks[i].topic)) {
      questions.push(trueFalse(picks[i], n++ % 2 === 1));
    }
  }
  questions.forEach((q, i) => { q.id = i + 1; });
  return questions;
}

export async function quizTier3(rawText, knowledgeState = {}, { items = null } = {}) {
  // Cards the student corrected always win over what was detected automatically.
  const custom = itemsToDefinitions(items);
  if (custom.length > 0) {
    return { tier: 'deterministic', questions: definitionQuestions(custom, knowledgeState) };
  }

  // Handouts that define terms ("Men - a male person") are quizzed on those
  // terms directly. Keyword-based questions are the fallback for plain prose.
  const definitions = extractDefinitions(rawText);
  if (definitions.length >= 2) {
    return { tier: 'deterministic', questions: definitionQuestions(definitions, knowledgeState) };
  }

  return { tier: 'deterministic', questions: proseQuestions(rawText, knowledgeState) };
}
