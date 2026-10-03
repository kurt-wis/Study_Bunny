/**
 * Boundary request validators.
 *
 * Each validator enforces a frozen request shape (INTEGRATION.md section 4) and
 * REJECTS anything outside it. In particular, PII-looking fields such as
 * `filename`, `studentName`, `classroomId`, `studentId`, `rawText`, `title`
 * cause a VALIDATION_ERROR: the backend accepts anonymous content only.
 *
 * On success a validator returns a normalized value. On failure it throws
 * ApiError(400, VALIDATION_ERROR) with a generic, content-free message.
 */

import { ApiError, CODES } from './errors.js';

/** Field names that must never appear in a request body. */
const FORBIDDEN_FIELDS = Object.freeze([
  'filename',
  'fileName',
  'file',
  'pdf',
  'pdfBytes',
  'bytes',
  'rawText',
  'title',
  'studentName',
  'studentNames',
  'studentId',
  'studentIds',
  'name',
  'names',
  'classroomId',
  'classroomName',
  'classId',
  'className',
  'teacherName',
  'email',
]);

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  throw new ApiError(400, CODES.VALIDATION_ERROR, message);
}

/**
 * Reject requests that carry forbidden PII-looking fields, anywhere a top-level
 * object is passed in. Keeps the privacy boundary explicit and auditable.
 *
 * @param {object} obj
 */
function rejectForbiddenFields(obj) {
  for (const key of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      fail('Request contains a field that is not permitted');
    }
  }
  // Limit every content value, including arrays in metadata, before invoking AI.
  for (const value of Object.values(obj)) {
    if (typeof value === 'string' && value.length > 8000) fail('Text exceeds the limit');
    if (Array.isArray(value) && value.length > 32) fail('Too many items');
    if (typeof value === 'number' && !Number.isFinite(value)) fail('Invalid number');
  }
}

/**
 * @param {unknown} obj
 * @returns {obj is Record<string, unknown>}
 */
function isPlainObject(obj) {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
}

/**
 * Validate POST /api/summarize.
 * Shape: { chunks: [{ text: string, page?: number }], language?: string }
 *
 * @param {unknown} body
 * @returns {{ chunks: Array<{ text: string, page?: number }>, language?: string }}
 */
export function validateSummarize(body) {
  if (!isPlainObject(body)) fail('Request body must be an object');
  rejectForbiddenFields(body);

  const { chunks } = body;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    fail('chunks must be a non-empty array');
  }
  const normChunks = chunks.map((c) => {
    if (!isPlainObject(c)) fail('each chunk must be an object');
    rejectForbiddenFields(c);
    if (typeof c.text !== 'string' || c.text.length === 0) {
      fail('each chunk requires a non-empty text string');
    }
    const out = { text: c.text };
    if (c.page !== undefined) {
      if (typeof c.page !== 'number' || !Number.isFinite(c.page)) fail('page must be a number');
      out.page = c.page;
    }
    return out;
  });

  const result = { chunks: normChunks };
  if (body.language !== undefined) {
    if (typeof body.language !== 'string') fail('language must be a string');
    result.language = body.language;
  }
  return result;
}

/**
 * Validate POST /api/quiz.
 * Shape: { chunks: [{ chunkId: string, text: string }], weakTopics: string[], count?: number }
 *
 * @param {unknown} body
 * @returns {{ chunks: Array<{ chunkId: string, text: string }>, weakTopics: string[], count: number }}
 */
export function validateQuiz(body) {
  if (!isPlainObject(body)) fail('Request body must be an object');
  rejectForbiddenFields(body);

  const { chunks, weakTopics } = body;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    fail('chunks must be a non-empty array');
  }
  const normChunks = chunks.map((c) => {
    if (!isPlainObject(c)) fail('each chunk must be an object');
    rejectForbiddenFields(c);
    if (typeof c.chunkId !== 'string' || c.chunkId.length === 0) {
      fail('each chunk requires a non-empty chunkId string');
    }
    if (typeof c.text !== 'string' || c.text.length === 0) {
      fail('each chunk requires a non-empty text string');
    }
    return { chunkId: c.chunkId, text: c.text };
  });

  let normTopics = [];
  if (weakTopics !== undefined) {
    if (!Array.isArray(weakTopics) || !weakTopics.every((t) => typeof t === 'string')) {
      fail('weakTopics must be an array of strings');
    }
    normTopics = weakTopics;
  }

  let count = 5;
  if (body.count !== undefined) {
    if (body.count !== 5) {
      fail('count must be 5');
    }
    count = body.count;
  }

  return { chunks: normChunks, weakTopics: normTopics, count };
}

/**
 * Validate POST /api/chat.
 * Shape: { question: string, chunks: [{ chunkId: string, text: string, page?: number }] }
 *
 * @param {unknown} body
 * @returns {{ question: string, chunks: Array<{ chunkId: string, text: string, page?: number }> }}
 */
export function validateChat(body) {
  if (!isPlainObject(body)) fail('Request body must be an object');
  rejectForbiddenFields(body);

  if (typeof body.question !== 'string' || body.question.trim().length === 0) {
    fail('question must be a non-empty string');
  }
  const { chunks } = body;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    fail('chunks must be a non-empty array');
  }
  const normChunks = chunks.map((c) => {
    if (!isPlainObject(c)) fail('each chunk must be an object');
    rejectForbiddenFields(c);
    if (typeof c.chunkId !== 'string' || c.chunkId.length === 0) {
      fail('each chunk requires a non-empty chunkId string');
    }
    if (typeof c.text !== 'string' || c.text.length === 0) {
      fail('each chunk requires a non-empty text string');
    }
    const out = { chunkId: c.chunkId, text: c.text };
    if (c.page !== undefined) {
      if (typeof c.page !== 'number' || !Number.isFinite(c.page)) fail('page must be a number');
      out.page = c.page;
    }
    return out;
  });

  return { question: body.question, chunks: normChunks };
}

/**
 * Validate POST /api/intervention.
 * Shape: { gradeLevel: string, skill: string, groupSize: number,
 *          availableMaterials: string[], language: string }
 * All inputs are anonymous group metadata only.
 *
 * @param {unknown} body
 * @returns {{ gradeLevel: string, skill: string, groupSize: number, availableMaterials: string[], language: string }}
 */
export function validateIntervention(body) {
  if (!isPlainObject(body)) fail('Request body must be an object');
  rejectForbiddenFields(body);

  if (typeof body.gradeLevel !== 'string' || body.gradeLevel.length === 0) {
    fail('gradeLevel must be a non-empty string');
  }
  if (typeof body.skill !== 'string' || body.skill.length === 0) {
    fail('skill must be a non-empty string');
  }
  if (typeof body.groupSize !== 'number' || !Number.isInteger(body.groupSize) || body.groupSize <= 0) {
    fail('groupSize must be a positive integer');
  }
  if (
    !Array.isArray(body.availableMaterials) ||
    !body.availableMaterials.every((m) => typeof m === 'string')
  ) {
    fail('availableMaterials must be an array of strings');
  }
  if (typeof body.language !== 'string' || body.language.length === 0) {
    fail('language must be a non-empty string');
  }

  return {
    gradeLevel: body.gradeLevel,
    skill: body.skill,
    groupSize: body.groupSize,
    availableMaterials: body.availableMaterials,
    language: body.language,
  };
}

export function validateFeynman(body) {
  if (!isPlainObject(body)) fail('Invalid explanation input');
  rejectForbiddenFields(body);
  if (Object.keys(body).some(k => !['explanation', 'topic', 'chunks'].includes(k))) fail('Unexpected field');
  if (typeof body.explanation !== 'string' || !body.explanation.trim()) fail('Explanation is required');
  if (body.topic != null && (typeof body.topic !== 'string' || body.topic.length > 200)) fail('Invalid topic');
  if (!Array.isArray(body.chunks) || body.chunks.some(c => !isPlainObject(c) ||
      !(typeof c.chunkId === 'string' || (typeof c.chunkId === 'number' && Number.isFinite(c.chunkId))))) fail('Invalid source chunks');
  const input = validateQuiz({ chunks: body.chunks.map(c => ({ ...c, chunkId: String(c.chunkId) })) });
  return { explanation: body.explanation, topic: body.topic ?? null, chunks: input.chunks };
}

export function validateDiagnosis(body) {
  if (!isPlainObject(body)) fail('Invalid diagnosis input');
  rejectForbiddenFields(body);
  if (Object.keys(body).some(k => !['currentHabit', 'weakTopics', 'masteryHistory', 'topicType'].includes(k))) fail('Unexpected field');
  if (body.currentHabit != null && !['rereading', 'highlighting', 'summarizing', 'flashcards', 'pomodoro', 'feynman', 'spaced_repetition'].includes(body.currentHabit)) fail('Invalid habit');
  if (!Array.isArray(body.weakTopics) || body.weakTopics.some(t => typeof t !== 'string' || t.length > 200)) fail('Invalid topics');
  if (!Array.isArray(body.masteryHistory) || body.masteryHistory.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)) fail('Invalid history');
  if (body.topicType != null && (typeof body.topicType !== 'string' || body.topicType.length > 200)) fail('Invalid topic type');
  return { currentHabit: body.currentHabit ?? null, weakTopics: body.weakTopics,
    masteryHistory: body.masteryHistory, topicType: body.topicType ?? null };
}
