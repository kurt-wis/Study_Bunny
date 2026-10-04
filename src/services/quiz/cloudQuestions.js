/**
 * Turns the cloud model's quiz questions into the shapes the quiz screen can
 * show. The model is asked for multiple-choice questions, but its `type` label
 * and answer format vary ("multiple-choice", "mcq", answer "B", ...), so the
 * type is decided from the content here, never from the label.
 *
 * Pure: no network, no storage.
 */

const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const LABEL = /^\(?[A-Ha-h][.):]\s+/; // "A. ", "b) ", "(C) "
const isTrueFalse = s => /^(?:true|false)$/i.test(s);

/** Find which option the model meant by `answer` (text, labelled text or a letter). */
function resolveAnswer(options, answer) {
  const a = clean(answer);
  if (!a) return null;
  const lower = a.toLowerCase();
  const exact = options.find(o => o.toLowerCase() === lower);
  if (exact) return exact;
  const bare = a.replace(LABEL, '').toLowerCase();
  const unlabelled = options.find(o => o.toLowerCase() === bare);
  if (unlabelled) return unlabelled;
  const letter = a.match(/^\(?([A-Ha-h])[.):]?\)?$/);
  if (letter) return options['abcdefgh'.indexOf(letter[1].toLowerCase())] ?? null;
  return null;
}

/**
 * @param {object} q      one question from /api/quiz
 * @param {number} index
 * @returns {object|null} a question the quiz screen can show, or null when it cannot be answered
 */
export function normalizeCloudQuestion(q, index = 0) {
  if (!q || typeof q !== 'object') return null;
  const question = String(q.prompt ?? q.question ?? '').trim();
  const answer = clean(q.answer ?? q.correct_answer);
  if (!question || !answer) return null;
  const base = {
    id: index + 1,
    topic: clean(q.topic),
    question,
    explanation: clean(q.explanation),
    difficulty: 'standard',
  };

  let options = Array.isArray(q.options) ? q.options.map(clean).filter(Boolean) : [];
  // "A. Paris" → "Paris" (the screen draws its own letters).
  if (options.length >= 2 && options.every(o => LABEL.test(o))) {
    const correctByLabel = resolveAnswer(options, answer);
    const stripped = options.map(o => o.replace(LABEL, ''));
    const kept = correctByLabel ? stripped[options.indexOf(correctByLabel)] : null;
    options = stripped;
    if (kept) return finishChoice(base, options, kept);
  }
  if (options.length >= 2) return finishChoice(base, options, answer);

  if (isTrueFalse(answer)) {
    return { ...base, type: 'true_false', options: ['True', 'False'], correct_answer: /^t/i.test(answer) ? 'True' : 'False' };
  }
  // No options: a short typed answer.
  return { ...base, type: 'fill_in_blank', options: null, correct_answer: answer, acceptable_answers: [answer] };
}

function finishChoice(base, rawOptions, answer) {
  const options = [...new Set(rawOptions)];
  if (options.length < 2) return null;
  const correct = resolveAnswer(options, answer);
  if (!correct) return null; // the right answer is not among the choices
  if (options.length === 2 && options.every(isTrueFalse)) {
    return { ...base, type: 'true_false', options: ['True', 'False'], correct_answer: /^t/i.test(correct) ? 'True' : 'False' };
  }
  return { ...base, type: 'multiple_choice', options, correct_answer: correct };
}

/** Normalise a whole cloud quiz, dropping questions that cannot be answered. */
export function normalizeCloudQuiz(questions) {
  return (Array.isArray(questions) ? questions : [])
    .map((q, i) => normalizeCloudQuestion(q, i))
    .filter(Boolean)
    .map((q, i) => ({ ...q, id: i + 1 }));
}
