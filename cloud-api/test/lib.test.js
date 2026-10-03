import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ApiError, errorResponse, CODES } from '../src/lib/errors.js';
import { jsonResponse, parseJsonBody, getMethod } from '../src/lib/http.js';
import { logDiagnostic } from '../src/lib/logger.js';
import {
  validateSummarize,
  validateQuiz,
  validateChat,
  validateIntervention,
} from '../src/lib/validation.js';
import {
  parseModelJson,
  validateChat as validateChatResponse,
  validateQuiz as validateQuizResponse,
  validateIntervention as validateInterventionResponse,
} from '../src/lib/responseValidators.js';
import { makeFakeBedrock } from './helpers/fakeBedrock.js';

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

test('errorResponse body carries only error + code, no stack or secret', () => {
  const err = new ApiError(400, CODES.VALIDATION_ERROR, 'bad input');
  const { status, body } = errorResponse(err.status, err.code, err.message);
  assert.equal(status, 400);
  assert.deepEqual(Object.keys(body).sort(), ['code', 'error']);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.ok(!('stack' in body));
  assert.ok(!JSON.stringify(body).includes('at '));
});

// ---------------------------------------------------------------------------
// http
// ---------------------------------------------------------------------------

test('jsonResponse serializes body and sets content type', () => {
  const res = jsonResponse(200, { a: 1 }, { origin: 'https://x.test' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '{"a":1}');
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://x.test');
});

test('getMethod handles v2 and v1 events', () => {
  assert.equal(getMethod({ requestContext: { http: { method: 'get' } } }), 'GET');
  assert.equal(getMethod({ httpMethod: 'post' }), 'POST');
});

test('parseJsonBody rejects malformed JSON as validation error', () => {
  assert.throws(
    () => parseJsonBody({ body: '{ not json' }),
    (e) => e instanceof ApiError && e.status === 400 && e.code === CODES.VALIDATION_ERROR,
  );
});

test('parseJsonBody returns parsed object for valid JSON', () => {
  assert.deepEqual(parseJsonBody({ body: '{"x":1}' }), { x: 1 });
});

// ---------------------------------------------------------------------------
// logger — must emit only operational metadata
// ---------------------------------------------------------------------------

test('logDiagnostic emits only handler/httpStatus/latencyMs/timestamp', () => {
  const original = console.log;
  const lines = [];
  console.log = (line) => lines.push(line);
  try {
    // Attempt to smuggle content through extra fields — it must be discarded.
    logDiagnostic({
      handler: 'chat',
      httpStatus: 200,
      latencyMs: 12,
      question: 'secret question text',
      chunkText: 'secret chunk text',
      apiKey: 'SECRET',
    });
  } finally {
    console.log = original;
  }
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(record).sort(), ['handler', 'httpStatus', 'latencyMs', 'timestamp']);
  const serialized = lines[0];
  assert.ok(!serialized.includes('secret'));
  assert.ok(!serialized.includes('SECRET'));
});

// ---------------------------------------------------------------------------
// request validation — accept + reject (incl. PII rejection)
// ---------------------------------------------------------------------------

test('validateSummarize accepts frozen shape and normalizes', () => {
  const out = validateSummarize({ chunks: [{ text: 'hello', page: 2 }], language: 'en' });
  assert.deepEqual(out, { chunks: [{ text: 'hello', page: 2 }], language: 'en' });
});

test('validateSummarize rejects empty chunks', () => {
  assert.throws(() => validateSummarize({ chunks: [] }), ApiError);
});

test('validateSummarize rejects PII-looking fields', () => {
  for (const bad of [
    { chunks: [{ text: 'x' }], filename: 'notes.pdf' },
    { chunks: [{ text: 'x' }], studentName: 'Juan' },
    { chunks: [{ text: 'x' }], classroomId: 'c-1' },
    { chunks: [{ text: 'x', studentName: 'Juan' }] },
  ]) {
    assert.throws(
      () => validateSummarize(bad),
      (e) => e instanceof ApiError && e.code === CODES.VALIDATION_ERROR,
      `expected rejection for ${JSON.stringify(bad)}`,
    );
  }
});

test('validateQuiz defaults count to 5 and normalizes topics', () => {
  const out = validateQuiz({ chunks: [{ chunkId: 'chunk-0', text: 'x' }], weakTopics: ['t'] });
  assert.equal(out.count, 5);
  assert.deepEqual(out.weakTopics, ['t']);
});

test('validateQuiz rejects non-positive count', () => {
  assert.throws(
    () => validateQuiz({ chunks: [{ chunkId: 'c', text: 'x' }], count: 0 }),
    ApiError,
  );
});

test('validateChat accepts question + chunks and optional page', () => {
  const out = validateChat({ question: 'why?', chunks: [{ chunkId: 'chunk-0', text: 'x', page: 1 }] });
  assert.equal(out.question, 'why?');
  assert.equal(out.chunks[0].page, 1);
});

test('validateChat rejects empty question', () => {
  assert.throws(() => validateChat({ question: '  ', chunks: [{ chunkId: 'c', text: 'x' }] }), ApiError);
});

test('validateIntervention accepts anonymous group metadata only', () => {
  const out = validateIntervention({
    gradeLevel: '4',
    skill: 'main idea',
    groupSize: 5,
    availableMaterials: ['paper'],
    language: 'bilingual',
  });
  assert.equal(out.groupSize, 5);
});

test('validateIntervention rejects classroomId', () => {
  assert.throws(
    () =>
      validateIntervention({
        gradeLevel: '4',
        skill: 'main idea',
        groupSize: 5,
        availableMaterials: ['paper'],
        language: 'bilingual',
        classroomId: 'c-1',
      }),
    ApiError,
  );
});

// ---------------------------------------------------------------------------
// response validators — citation stripping, quiz count, parsing
// ---------------------------------------------------------------------------

test('parseModelJson throws on unparsable text', () => {
  assert.throws(() => parseModelJson('not json {'));
});

test('chat validator strips hallucinated chunkIds', () => {
  const allowed = ['chunk-0', 'chunk-1'];
  const out = validateChatResponse(
    { found: true, answer: 'grounded', citations: [{ chunkId: 'chunk-0' }, { chunkId: 'chunk-99' }] },
    allowed,
  );
  assert.deepEqual(out, { found: true, answer: 'grounded', citations: [{ chunkId: 'chunk-0' }] });
});

test('chat validator collapses to canonical not-found when no grounded citation', () => {
  const out = validateChatResponse(
    { found: true, answer: 'ungrounded', citations: [{ chunkId: 'chunk-99' }] },
    ['chunk-0'],
  );
  assert.deepEqual(out, { found: false, answer: null, citations: [] });
});

test('chat validator honors explicit found:false as canonical not-found', () => {
  const out = validateChatResponse({ found: false, answer: null, citations: [] }, ['chunk-0']);
  assert.deepEqual(out, { found: false, answer: null, citations: [] });
});

test('quiz validator enforces exactly 5 questions by default', () => {
  const four = { questions: Array.from({ length: 4 }, (_, i) => ({
    id: `q${i}`, type: 'multiple-choice', topic: 't', prompt: 'p', answer: 'A',
  })) };
  assert.throws(() => validateQuizResponse(four));

  const five = { questions: Array.from({ length: 5 }, (_, i) => ({
    id: `q${i}`, type: 'multiple-choice', topic: 't', prompt: 'p', options: ['A', 'B'], answer: 'A',
  })) };
  const out = validateQuizResponse(five);
  assert.equal(out.questions.length, 5);
});

test('intervention validator requires exactly 3 activities', () => {
  const base = {
    durationMinutes: 30,
    objective: 'o',
    materials: ['m'],
    checkpoint: 'c',
  };
  assert.throws(() =>
    validateInterventionResponse({ ...base, activities: [{ title: 't', description: 'd' }] }),
  );
  const ok = validateInterventionResponse({
    ...base,
    activities: [
      { title: 'a', description: 'd', durationMinutes: 8 },
      { title: 'b', description: 'd', durationMinutes: 14 },
      { title: 'c', description: 'd', durationMinutes: 8 },
    ],
  });
  assert.equal(ok.activities.length, 3);
});

// ---------------------------------------------------------------------------
// fakeBedrock stub — no network, canned + failure modes
// ---------------------------------------------------------------------------

test('fakeBedrock returns canned JSON and records calls', async () => {
  const { invokeModel, calls } = makeFakeBedrock({ endpoint: 'chat' });
  const raw = await invokeModel({ system: 's', messages: [] });
  const parsed = JSON.parse(raw);
  assert.equal(parsed.found, true);
  assert.equal(calls.length, 1);
});

test('fakeBedrock throw mode simulates upstream failure', async () => {
  const { invokeModel } = makeFakeBedrock({ mode: 'throw' });
  await assert.rejects(() => invokeModel({ system: 's', messages: [] }));
});

test('fakeBedrock unparsable mode returns non-JSON', async () => {
  const { invokeModel } = makeFakeBedrock({ mode: 'unparsable' });
  const raw = await invokeModel({ system: 's', messages: [] });
  assert.throws(() => parseModelJson(raw));
});
