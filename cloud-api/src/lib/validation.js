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
  if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > 100) {
    fail('chunks must be a non-empty array');
  }
  let totalChars = 0;
  const normChunks = chunks.map((c) => {
    if (!isPlainObject(c)) fail('each chunk must be an object');
    rejectForbiddenFields(c);
    if (typeof c.text !== 'string' || c.text.length === 0 || c.text.length > 12000) {
      fail('each chunk requires a non-empty text string');
    }
    totalChars += c.text.length;
    const out = { text: c.text };
    if (c.page !== undefined) {
      if (typeof c.page !== 'number' || !Number.isFinite(c.page)) fail('page must be a number');
      out.page = c.page;
    }
    return out;
  });

  if (totalChars > 220000) fail('source notes are too long for one request');
  const result = { chunks: normChunks };
  if (body.language !== undefined) {
    if (typeof body.language !== 'string' || body.language.length > 80) fail('language must be a short string');
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
  if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > 100) {
    fail('chunks must be a non-empty array');
  }
  let totalChars = 0;
  const normChunks = chunks.map((c) => {
    if (!isPlainObject(c)) fail('each chunk must be an object');
    rejectForbiddenFields(c);
    if (typeof c.chunkId !== 'string' || c.chunkId.length === 0) {
      fail('each chunk requires a non-empty chunkId string');
    }
    if (typeof c.text !== 'string' || c.text.length === 0 || c.text.length > 12000) {
      fail('each chunk requires a non-empty text string');
    }
    totalChars += c.text.length;
    return { chunkId: c.chunkId, text: c.text };
  });
  if (totalChars > 220000) fail('source notes are too long for one request');

  let normTopics = [];
  if (weakTopics !== undefined) {
    if (!Array.isArray(weakTopics) || weakTopics.length > 20 || !weakTopics.every((t) => typeof t === 'string' && t.length <= 120)) {
      fail('weakTopics must be an array of strings');
    }
    normTopics = weakTopics;
  }

  let count = 5;
  if (body.count !== undefined) {
    if (typeof body.count !== 'number' || !Number.isInteger(body.count) || body.count <= 0 || body.count > 10) {
      fail('count must be an integer between 1 and 10');
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

  if (typeof body.question !== 'string' || body.question.trim().length === 0 || body.question.length > 4000) {
    fail('question must be a non-empty string');
  }
  const { chunks } = body;
  if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > 100) {
    fail('chunks must be a non-empty array');
  }
  let totalChars = 0;
  const normChunks = chunks.map((c) => {
    if (!isPlainObject(c)) fail('each chunk must be an object');
    rejectForbiddenFields(c);
    if (typeof c.chunkId !== 'string' || c.chunkId.length === 0) {
      fail('each chunk requires a non-empty chunkId string');
    }
    if (typeof c.text !== 'string' || c.text.length === 0 || c.text.length > 12000) {
      fail('each chunk requires a non-empty text string');
    }
    totalChars += c.text.length;
    const out = { chunkId: c.chunkId, text: c.text };
    if (c.page !== undefined) {
      if (typeof c.page !== 'number' || !Number.isFinite(c.page)) fail('page must be a number');
      out.page = c.page;
    }
    return out;
  });
  if (totalChars > 220000) fail('source notes are too long for one request');

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

/**
 * Validate POST /api/feynman. Only an explanation, topic label, and anonymous
 * note chunks cross the network. Request limits keep prompt size and cost bounded.
 */
export function validateFeynman(body) {
  if (!isPlainObject(body)) fail('Request body must be an object');
  rejectForbiddenFields(body);
  if (typeof body.explanation !== 'string' || !body.explanation.trim() || body.explanation.length > 8000) {
    fail('explanation must be a non-empty string of at most 8000 characters');
  }
  if (body.topic != null && (typeof body.topic !== 'string' || body.topic.length > 120)) {
    fail('topic must be a short string');
  }
  if (!Array.isArray(body.chunks) || body.chunks.length === 0 || body.chunks.length > 100) {
    fail('chunks must contain between 1 and 100 items');
  }
  let totalChars = 0;
  const chunks = body.chunks.map((c) => {
    if (!isPlainObject(c)) fail('each chunk must be an object');
    rejectForbiddenFields(c);
    if ((typeof c.chunkId !== 'string' && typeof c.chunkId !== 'number') || String(c.chunkId).length > 80) {
      fail('each chunk requires a short chunkId');
    }
    if (typeof c.text !== 'string' || !c.text.trim() || c.text.length > 12000) {
      fail('each chunk requires text of at most 12000 characters');
    }
    totalChars += c.text.length;
    return { chunkId: String(c.chunkId), text: c.text };
  });
  if (totalChars > 220000) fail('source notes are too long for one request');
  return { explanation: body.explanation.trim(), topic: body.topic?.trim() || null, chunks };
}

/** Validate POST /api/analyze-technique; only anonymous study metadata is accepted. */
export function validateTechniqueAnalysis(body) {
  if (!isPlainObject(body)) fail('Request body must be an object');
  rejectForbiddenFields(body);
  const habits = ['rereading', 'highlighting', 'summarizing', 'flashcards', 'pomodoro', 'feynman', 'spaced_repetition'];
  if (body.currentHabit != null && !habits.includes(body.currentHabit)) fail('currentHabit is not recognized');
  const weakTopics = body.weakTopics ?? [];
  if (!Array.isArray(weakTopics) || weakTopics.length > 20 || !weakTopics.every(t => typeof t === 'string' && t.trim().length <= 120)) {
    fail('weakTopics must be short labels');
  }
  const masteryHistory = body.masteryHistory ?? [];
  if (!Array.isArray(masteryHistory) || masteryHistory.length > 12 || !masteryHistory.every(m => typeof m === 'number' && Number.isFinite(m) && m >= 0 && m <= 1)) {
    fail('masteryHistory must contain up to 12 values between 0 and 1');
  }
  if (body.topicType != null && (typeof body.topicType !== 'string' || body.topicType.length > 120)) {
    fail('topicType must be a short string');
  }
  return {
    currentHabit: body.currentHabit ?? null,
    weakTopics: weakTopics.map(t => t.trim()).filter(Boolean),
    masteryHistory,
    topicType: body.topicType?.trim() || null,
  };
}
