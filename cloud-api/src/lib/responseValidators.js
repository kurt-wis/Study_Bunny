/**
 * Model-output validators.
 *
 * parseModelJson does a strict JSON parse (throwing on failure). Each
 * validate{Endpoint} asserts the required fields and throws on any deviation so
 * the handler can retry once and then return 502 UPSTREAM_ERROR.
 *
 * These throw plain Error (not ApiError): a model-output failure is an upstream
 * problem, mapped to UPSTREAM_ERROR by the handler, never surfaced verbatim.
 */

/**
 * Strict JSON parse of raw model text. Tolerates surrounding whitespace only.
 *
 * @param {string} rawText
 * @returns {unknown}
 */
export function parseModelJson(rawText) {
  if (typeof rawText !== 'string') {
    throw new Error('Model output was not a string');
  }
  return JSON.parse(rawText.trim());
}

/**
 * @param {unknown} obj
 * @returns {obj is Record<string, unknown>}
 */
function isObj(obj) {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
}

export function validateFeynman(obj) {
  if (!isObj(obj) || typeof obj.coverage !== 'number' || !Number.isFinite(obj.coverage) || obj.coverage < 0 || obj.coverage > 1 ||
      ![obj.covered, obj.gaps].every(list => Array.isArray(list) && list.length <= 40 && list.every(s => typeof s === 'string' && s.length <= 200)) ||
      typeof obj.feedback !== 'string' || obj.feedback.length > 4000) throw new Error('Invalid Feynman output');
  return { coverage: obj.coverage, covered: obj.covered, gaps: obj.gaps, feedback: obj.feedback };
}

export function validateDiagnosis(obj, input) {
  if (!isObj(obj) || !['feynman', 'spaced_repetition'].includes(obj.recommended_technique) ||
      obj.recommended_technique === input.currentHabit || typeof obj.analysis !== 'string' || !obj.analysis.trim() || obj.analysis.length > 2000 ||
      typeof obj.expected_improvement !== 'string' || obj.expected_improvement.length > 1000) throw new Error('Invalid diagnosis output');
  return { recommended_technique: obj.recommended_technique, analysis: obj.analysis, expected_improvement: obj.expected_improvement };
}

/**
 * @param {unknown} obj
 * @returns {{ overview: string, keyConcepts: object[], studyOutline: string[] }}
 */
export function validateSummarize(obj) {
  if (!isObj(obj)) throw new Error('summary must be an object');
  if (typeof obj.overview !== 'string') throw new Error('summary.overview must be a string');
  if (!Array.isArray(obj.keyConcepts)) throw new Error('summary.keyConcepts must be an array');
  for (const k of obj.keyConcepts) {
    if (!isObj(k) || typeof k.term !== 'string' || typeof k.explanation !== 'string') {
      throw new Error('each keyConcept requires term and explanation strings');
    }
  }
  if (!Array.isArray(obj.studyOutline) || !obj.studyOutline.every((s) => typeof s === 'string')) {
    throw new Error('summary.studyOutline must be an array of strings');
  }
  return {
    overview: obj.overview,
    keyConcepts: obj.keyConcepts.map((k) => ({
      term: k.term,
      explanation: k.explanation,
      importance: typeof k.importance === 'string' ? k.importance : '',
      commonMistakes: typeof k.commonMistakes === 'string' ? k.commonMistakes : '',
    })),
    studyOutline: obj.studyOutline,
  };
}

/**
 * Validate quiz output. Enforces exactly `expectedCount` questions (default 5).
 *
 * @param {unknown} obj
 * @param {number} [expectedCount=5]
 * @returns {{ questions: object[] }}
 */
export function validateQuiz(obj, expectedCount = 5) {
  if (!isObj(obj)) throw new Error('quiz must be an object');
  if (!Array.isArray(obj.questions)) throw new Error('quiz.questions must be an array');
  if (obj.questions.length !== expectedCount) {
    throw new Error(`quiz must contain exactly ${expectedCount} questions`);
  }
  const questions = obj.questions.map((q) => {
    if (!isObj(q)) throw new Error('each question must be an object');
    if (typeof q.id !== 'string') throw new Error('question.id must be a string');
    if (typeof q.type !== 'string') throw new Error('question.type must be a string');
    if (typeof q.topic !== 'string') throw new Error('question.topic must be a string');
    if (typeof q.prompt !== 'string') throw new Error('question.prompt must be a string');
    if (typeof q.answer !== 'string') throw new Error('question.answer must be a string');
    const out = {
      id: q.id,
      type: q.type,
      topic: q.topic,
      prompt: q.prompt,
      answer: q.answer,
    };
    if (q.options !== undefined) {
      if (!Array.isArray(q.options) || !q.options.every((o) => typeof o === 'string')) {
        throw new Error('question.options must be an array of strings');
      }
      out.options = q.options;
    }
    if (q.explanation !== undefined) {
      if (typeof q.explanation !== 'string') throw new Error('question.explanation must be a string');
      out.explanation = q.explanation;
    }
    return out;
  });
  return { questions };
}

/**
 * Validate chat output and strip hallucinated citations.
 *
 * Any citation whose chunkId is not in `allowedChunkIds` is dropped. If, after
 * stripping, there is no grounded citation or no answer, the result collapses to
 * the canonical not-found shape { found:false, answer:null, citations:[] }.
 *
 * @param {unknown} obj
 * @param {Set<string>|string[]} allowedChunkIds
 * @returns {{ found: boolean, answer: string|null, citations: Array<{ chunkId: string }> }}
 */
export function validateChat(obj, allowedChunkIds) {
  if (!isObj(obj)) throw new Error('chat response must be an object');
  const allowed = allowedChunkIds instanceof Set ? allowedChunkIds : new Set(allowedChunkIds ?? []);

  const notFound = { found: false, answer: null, citations: [] };

  if (obj.found === false) return notFound;

  const rawCitations = Array.isArray(obj.citations) ? obj.citations : [];
  const citations = rawCitations
    .filter((c) => isObj(c) && typeof c.chunkId === 'string' && allowed.has(c.chunkId))
    .map((c) => ({ chunkId: c.chunkId }));

  if (typeof obj.answer !== 'string' || obj.answer.length === 0 || citations.length === 0) {
    return notFound;
  }

  return { found: true, answer: obj.answer, citations };
}

/**
 * Validate intervention output. Requires exactly 3 activities.
 *
 * @param {unknown} obj
 * @returns {{ durationMinutes: number, objective: string, materials: string[], activities: object[], checkpoint: string }}
 */
export function validateIntervention(obj) {
  if (!isObj(obj)) throw new Error('intervention must be an object');
  if (typeof obj.objective !== 'string') throw new Error('intervention.objective must be a string');
  if (typeof obj.checkpoint !== 'string') throw new Error('intervention.checkpoint must be a string');
  if (!Array.isArray(obj.materials) || !obj.materials.every((m) => typeof m === 'string')) {
    throw new Error('intervention.materials must be an array of strings');
  }
  if (!Array.isArray(obj.activities) || obj.activities.length !== 3) {
    throw new Error('intervention must contain exactly 3 activities');
  }
  const activities = obj.activities.map((a) => {
    if (!isObj(a) || typeof a.title !== 'string' || typeof a.description !== 'string') {
      throw new Error('each activity requires title and description strings');
    }
    return {
      title: a.title,
      description: a.description,
      durationMinutes: Number.isFinite(a.durationMinutes) ? a.durationMinutes : 10,
    };
  });
  return {
    durationMinutes: Number.isFinite(obj.durationMinutes) ? obj.durationMinutes : 30,
    objective: obj.objective,
    materials: obj.materials,
    activities,
    checkpoint: obj.checkpoint,
  };
}
