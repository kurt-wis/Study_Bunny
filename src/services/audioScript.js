/**
 * Audio summary script — turns a lesson summary into a short, spoken-style
 * script for students who learn by listening: a greeting, the key points said
 * conversationally, the key ideas, then a mini-quiz with a pause before each
 * answer. Pure and offline; the browser's built-in voice reads it aloud.
 *
 * Each line is { kind, text, pauseAfterMs? } so the player can pause between
 * a question and its answer.
 */

const LEAD_INS = ['First,', 'Next,', 'And lastly,'];
const QUIZ_PAUSE_MS = 4000;
const MAX_QUIZ = 3;

function clean(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function lowerFirst(text) {
  // Keep acronyms and proper nouns ("DNA", "The Golgi…" → "the Golgi…").
  return /^[A-Z][a-z]/.test(text) && /^(The|A|An|This|These|It|In|On|When|If)\b/.test(text)
    ? text[0].toLowerCase() + text.slice(1)
    : text;
}

/**
 * @param {{ title?: string, content?: object }} input  summary content (keyPoints, keyConcepts, overview)
 * @returns {Array<{ kind: 'intro'|'point'|'idea'|'question'|'answer'|'outro', text: string, pauseAfterMs?: number }>}
 */
export function buildAudioScript({ title = '', content = {} } = {}) {
  const c = content ?? {};
  const points = (Array.isArray(c.keyPoints) && c.keyPoints.length > 0
    ? c.keyPoints
    : (String(c.overview ?? '').match(/[^.!?]+[.!?]+/g) ?? [])
  ).map(clean).filter(Boolean).slice(0, 3);
  const ideas = (Array.isArray(c.keyConcepts) ? c.keyConcepts : [])
    .filter(k => clean(k?.term) && clean(k?.explanation) && !/\(score:/.test(k.explanation))
    .slice(0, 5);

  if (points.length === 0 && ideas.length === 0) return [];

  const lines = [];
  const name = clean(title);
  lines.push({
    kind: 'intro',
    text: `Hi! Here is a quick listen-through of ${name ? `your lesson, ${name}` : 'your lesson'}. It takes about a minute. Just listen.`,
  });

  if (points.length > 0) {
    lines.push({ kind: 'intro', text: `There are ${points.length === 1 ? 'one main point' : `${points.length} main points`} to remember.` });
    points.forEach((p, i) => {
      const lead = points.length === 1 ? 'Here it is:' : (LEAD_INS[i] ?? 'Also,');
      lines.push({ kind: 'point', text: `${lead} ${lowerFirst(p)}` });
    });
  }

  // Only read key ideas that add something the main points did not already say.
  const said = new Set(points.map(p => p.toLowerCase()));
  const extra = ideas.filter(k => !said.has(clean(k.explanation).toLowerCase()));
  if (extra.length > 0) {
    lines.push({ kind: 'intro', text: 'Now a few more ideas worth knowing.' });
    for (const k of extra) lines.push({ kind: 'idea', text: clean(k.explanation) });
  }

  const quiz = ideas.slice(0, MAX_QUIZ);
  if (quiz.length > 0) {
    lines.push({ kind: 'intro', text: `Quick check. I will ask ${quiz.length === 1 ? 'one question' : `${quiz.length} questions`}. Say the answer out loud before I do.` });
    quiz.forEach((k, i) => {
      lines.push({ kind: 'question', text: `Question ${i + 1}. What do your notes say about ${clean(k.term)}?`, pauseAfterMs: QUIZ_PAUSE_MS });
      lines.push({ kind: 'answer', text: `Answer: ${clean(k.explanation)}` });
    });
  }

  lines.push({ kind: 'outro', text: 'That is it. If any answer surprised you, listen again or try a quiz.' });
  return lines;
}

/** Rough listening time in seconds at a normal speaking pace (~150 words/min). */
export function estimateSeconds(lines) {
  const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const pauses = lines.reduce((n, l) => n + (l.pauseAfterMs ?? 0), 0);
  return Math.round((words / 150) * 60 + pauses / 1000);
}
