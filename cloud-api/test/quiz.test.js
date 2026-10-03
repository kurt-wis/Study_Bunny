import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeHandler } from '../src/handlers/quiz.js';
import { makeFakeBedrock } from './helpers/fakeBedrock.js';

/**
 * @param {object} body
 * @param {string} [method='POST']
 * @returns {object} minimal API Gateway HTTP API v2 event
 */
function event(body, method = 'POST') {
  return {
    requestContext: { http: { method } },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

const validBody = {
  chunks: [{ chunkId: 'chunk-0', text: 'Mitochondria are the powerhouse of the cell.' }],
  weakTopics: ['cell biology'],
};

test('quiz happy path returns 200 with exactly 5 questions', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'quiz' });
  const res = await makeHandler({ invokeModel })(event(validBody));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.questions.length, 5);
  const q = body.questions[0];
  assert.equal(typeof q.id, 'string');
  assert.equal(typeof q.type, 'string');
  assert.equal(typeof q.topic, 'string');
  assert.equal(typeof q.prompt, 'string');
  assert.equal(typeof q.answer, 'string');
});

test('quiz rejects missing chunks with 400 VALIDATION_ERROR', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'quiz' });
  const res = await makeHandler({ invokeModel })(event({ weakTopics: ['x'] }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).code, 'VALIDATION_ERROR');
});

test('quiz returns 502 UPSTREAM_ERROR when the model throws', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'quiz', mode: 'throw' });
  const res = await makeHandler({ invokeModel })(event(validBody));
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).code, 'UPSTREAM_ERROR');
});

test('quiz returns 502 when the model returns the wrong number of questions', async () => {
  const raw = JSON.stringify({
    questions: [
      { id: 'q1', type: 'multiple-choice', topic: 'T', prompt: 'P?', answer: 'A' },
    ],
  });
  const fake = makeFakeBedrock({ raw });
  const res = await makeHandler({ invokeModel: fake.invokeModel })(event(validBody));
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).code, 'UPSTREAM_ERROR');
  assert.equal(fake.calls.length, 2); // original + one retry
});
