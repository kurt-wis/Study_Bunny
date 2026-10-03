/**
 * Tier 3 Quiz Generation — deterministic, works 100% offline.
 * Generates fill-in-the-blank and true/false questions from RAKE keywords.
 */
import { extractKeywords } from '../../ai/rakeExtractor.js';

/**
 * Generate 5 questions from raw text, biased toward weak topics.
 *
 * @param {string} rawText
 * @param {object} knowledgeState - { [topic]: { mastery: number } | number }
 * @returns {Promise<{ tier: string, questions: object[] }>}
 */
export async function quizTier3(rawText, knowledgeState = {}, preferredTopics = []) {
  const keywords = extractKeywords(rawText, 8);
  const prioritized = (Array.isArray(preferredTopics) ? preferredTopics : [])
    .map(topic => String(topic).toLowerCase()).filter(Boolean);
  if (prioritized.length) {
    keywords.sort((a, b) => {
      const score = kw => prioritized.reduce((n, topic) =>
        n + (kw.phrase.toLowerCase().includes(topic) || topic.includes(kw.phrase.toLowerCase()) ? 1 : 0), 0);
      return score(b) - score(a);
    });
  }
  const sentences = rawText.match(/[^.!?]+[.!?]+/g) || [];
  const questions = [];

  // Determine weak topics for difficulty labeling
  const weakTopics = Object.entries(knowledgeState)
    .filter(([, state]) => {
      const mastery = typeof state === 'object' ? (state.mastery ?? 0) : state;
      return mastery < 0.6;
    })
    .map(([topic]) => topic.toLowerCase());

  // ─── Generate fill-in-the-blank questions (target: 3) ───────────────────────
  let fbGenerated = 0;
  const fillBlankTarget = 3;

  for (const kw of keywords) {
    if (fbGenerated >= fillBlankTarget) break;

    const sourceSentence = sentences.find(s =>
      s.toLowerCase().includes(kw.phrase.toLowerCase())
    );
    if (!sourceSentence) continue;

    const blanked = sourceSentence.replace(
      new RegExp(kw.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      '________'
    );

    const isWeakTopic = weakTopics.some(wt =>
      kw.phrase.toLowerCase().includes(wt) || wt.includes(kw.phrase.toLowerCase())
    );

    questions.push({
      id: questions.length + 1,
      type: 'fill_in_blank',
      topic: kw.phrase,
      question: `Fill in the blank:\n\n${blanked.trim()}`,
      correct_answer: kw.phrase,
      acceptable_answers: [kw.phrase, kw.phrase.toLowerCase(), kw.phrase.toUpperCase()],
      explanation: `The answer is "${kw.phrase}" — found in your notes.`,
      difficulty: isWeakTopic ? 'review' : 'standard',
    });
    fbGenerated++;
  }

  // ─── Generate true/false questions (target: 2) ────────────────────────────
  const tfTarget = 2;
  let tfGenerated = 0;
  const usedSentences = new Set();

  for (let i = 0; i < sentences.length && tfGenerated < tfTarget; i++) {
    const sentence = sentences[i].trim();
    if (sentence.length < 30 || usedSentences.has(sentence)) continue;
    usedSentences.add(sentence);

    const makeTrue = tfGenerated % 2 === 0;
    let questionText;
    let isActuallyTrue = true;

    if (makeTrue) {
      questionText = sentence;
      isActuallyTrue = true;
    } else {
      // Try to swap a keyword to make it false
      const kwInSentence = keywords.find(k =>
        sentence.toLowerCase().includes(k.phrase.toLowerCase())
      );
      const otherKw = keywords.find(k =>
        k.phrase !== kwInSentence?.phrase
      );

      if (kwInSentence && otherKw) {
        questionText = sentence.replace(
          new RegExp(kwInSentence.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
          otherKw.phrase
        );
        isActuallyTrue = false;
      } else {
        // Fallback to true when we can't make a false statement
        questionText = sentence;
        isActuallyTrue = true;
      }
    }

    const topicKw = keywords[tfGenerated]?.phrase || 'General';
    const isWeakTopic = weakTopics.some(wt =>
      topicKw.toLowerCase().includes(wt) || wt.includes(topicKw.toLowerCase())
    );

    questions.push({
      id: questions.length + 1,
      type: 'true_false',
      topic: topicKw,
      question: `True or False:\n\n${questionText}`,
      options: ['True', 'False'],
      correct_answer: isActuallyTrue ? 'True' : 'False',
      explanation: isActuallyTrue
        ? 'This statement is directly from your notes.'
        : 'This statement was modified — check your notes for the correct version.',
      difficulty: isWeakTopic ? 'review' : 'standard',
    });
    tfGenerated++;
  }

  // ─── Pad to exactly 5 if needed ──────────────────────────────────────────────
  let padIdx = 0;
  while (questions.length < 5 && padIdx < keywords.length) {
    const kw = keywords[padIdx];
    padIdx++;

    // Skip keywords already used
    if (questions.some(q => q.correct_answer === kw.phrase)) continue;

    questions.push({
      id: questions.length + 1,
      type: 'fill_in_blank',
      topic: kw.phrase,
      question: `What key concept is described as: "${kw.phrase}"?`,
      correct_answer: kw.phrase,
      acceptable_answers: [kw.phrase],
      explanation: `"${kw.phrase}" is a key concept from your notes.`,
      difficulty: 'standard',
    });
  }

  // Reassign sequential IDs
  questions.forEach((q, i) => { q.id = i + 1; });

  return {
    tier: 'deterministic',
    questions: questions.slice(0, 5),
  };
}
