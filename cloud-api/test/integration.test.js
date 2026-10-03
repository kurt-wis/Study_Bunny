/**
 * Integration sweep: cross-cutting privacy guarantees that span every handler.
 *
 * Per-endpoint happy-path / 400 / 502 (and chat not-found) coverage lives in the
 * individual handler test files. This file adds the two sweep-level assertions:
 *   1. Content-free logging — a real handler invocation must not log any chunk
 *      text, question, or prompt content through the diagnostic logger.
 *   2. No secret in error — error bodies never contain a secret even when one is
 *      present in the environment, and never carry a stack trace.
 *
 * All tests run with NO network and NO AWS credentials (Bedrock is stubbed).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeHandler as makeChat } from '../src/handlers/chat.js';
import { makeHandler as makeSummarize } from '../src/handlers/summarize.js';
import { makeHandler as makeQuiz } from '../src/handlers/quiz.js';
import { makeHandler as makeHealth } from '../src/handlers/health.js';
import { makeFakeBedrock } from './helpers/fakeBedrock.js';

/**
 * @param {object|undefined} body
 * @param {string} [method='POST']
 * @returns {object} minimal API Gateway HTTP API v2 event
 */
function event(body, method = 'POST') {
  return {
    requestContext: { http: { method } },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

/**
 * Run a function while capturing everything written to console.log.
 *
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<string[]>} captured log lines
 */
async function captureLogs(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines;
}

// Distinctive sentinel strings so a leak is unambiguous if it ever appears.
const SECRET_QUESTION = 'ZZZ_SECRET_QUESTION_PHOTOSYNTHESIS';
const SECRET_CHUNK = 'ZZZ_SECRET_CHUNK_CHLOROPLAST_TEXT';
const SECRET_TOPIC = 'ZZZ_SECRET_WEAK_TOPIC';

test('content-free logging: no handler logs chunk text, question, or prompt content', async () => {
  const chatBody = {
    question: SECRET_QUESTION,
    chunks: [{ chunkId: 'chunk-0', text: SECRET_CHUNK, page: 1 }],
  };
  const summarizeBody = { chunks: [{ text: SECRET_CHUNK }], language: 'English' };
  const quizBody = { chunks: [{ chunkId: 'chunk-0', text: SECRET_CHUNK }], weakTopics: [SECRET_TOPIC] };

  const invocations = [
    () => makeChat({ invokeModel: makeFakeBedrock({ endpoint: 'chat' }).invokeModel })(event(chatBody)),
    () => makeSummarize({ invokeModel: makeFakeBedrock({ endpoint: 'summarize' }).invokeModel })(event(summarizeBody)),
    () => makeQuiz({ invokeModel: makeFakeBedrock({ endpoint: 'quiz' }).invokeModel })(event(quizBody)),
    () => makeHealth()(event(undefined, 'GET')),
  ];

  const lines = await captureLogs(async () => {
    for (const run of invocations) await run();
  });

  // Every handler emits exactly one diagnostic line per invocation.
  assert.equal(lines.length, invocations.length);
  const joined = lines.join('\n');
  for (const secret of [SECRET_QUESTION, SECRET_CHUNK, SECRET_TOPIC]) {
    assert.ok(!joined.includes(secret), `log must not contain "${secret}"`);
  }
  // Each line is strictly the operational metadata shape.
  for (const line of lines) {
    const record = JSON.parse(line);
    assert.deepEqual(Object.keys(record).sort(), ['handler', 'httpStatus', 'latencyMs', 'timestamp']);
  }
});

test('no secret in error: upstream failures never leak content, env secrets, or a stack', async () => {
  const prevModel = process.env.BEDROCK_MODEL_ID;
  // A secret-looking value in the environment must never surface in an error body.
  process.env.BEDROCK_MODEL_ID = 'ZZZ_SECRET_MODEL_ID_VALUE';

  const chatBody = {
    question: SECRET_QUESTION,
    chunks: [{ chunkId: 'chunk-0', text: SECRET_CHUNK }],
  };

  try {
    const failing = [
      ['chat', makeChat, chatBody],
      ['summarize', makeSummarize, { chunks: [{ text: SECRET_CHUNK }] }],
      ['quiz', makeQuiz, { chunks: [{ chunkId: 'chunk-0', text: SECRET_CHUNK }], weakTopics: [SECRET_TOPIC] }],
    ];

    for (const [name, make, body] of failing) {
      const { invokeModel } = makeFakeBedrock({ endpoint: name, mode: 'throw' });
      const res = await make({ invokeModel })(event(body));
      assert.equal(res.statusCode, 502, `${name} should 502 on upstream failure`);
      const parsed = JSON.parse(res.body);
      assert.deepEqual(Object.keys(parsed).sort(), ['code', 'error'], `${name} body is exactly { error, code }`);
      assert.equal(parsed.code, 'UPSTREAM_ERROR');
      // No content, no env secret, no stack trace artifacts.
      assert.ok(!res.body.includes(SECRET_QUESTION), `${name}: no question leak`);
      assert.ok(!res.body.includes(SECRET_CHUNK), `${name}: no chunk leak`);
      assert.ok(!res.body.includes(SECRET_TOPIC), `${name}: no topic leak`);
      assert.ok(!res.body.includes('ZZZ_SECRET_MODEL_ID_VALUE'), `${name}: no env secret leak`);
      assert.ok(!res.body.includes('simulated upstream failure'), `${name}: no raw error message leak`);
      assert.ok(!/\bat \w+.*:\d+:\d+/.test(res.body), `${name}: no stack trace`);
    }
  } finally {
    if (prevModel === undefined) delete process.env.BEDROCK_MODEL_ID;
    else process.env.BEDROCK_MODEL_ID = prevModel;
  }
});

test('no secret in error: validation (400) errors never echo rejected input', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'summarize' });
  // studentName is a forbidden PII field; the rejection must not echo its value.
  const res = await makeSummarize({ invokeModel })(
    event({ chunks: [{ text: SECRET_CHUNK }], studentName: SECRET_QUESTION }),
  );
  assert.equal(res.statusCode, 400);
  const parsed = JSON.parse(res.body);
  assert.deepEqual(Object.keys(parsed).sort(), ['code', 'error']);
  assert.equal(parsed.code, 'VALIDATION_ERROR');
  assert.ok(!res.body.includes(SECRET_QUESTION), 'no rejected PII value leak');
  assert.ok(!res.body.includes(SECRET_CHUNK), 'no chunk leak');
});
