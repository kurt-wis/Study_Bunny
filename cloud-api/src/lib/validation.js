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
    if (typeof body.count !== 'number' || !Number.isInteger(body.count) || body.count <= 0) {
      fail('count must be a positive integer');
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
