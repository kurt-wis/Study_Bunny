import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeHandler } from '../src/handlers/chat.js';
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
  question: 'What is photosynthesis?',
  chunks: [
    { chunkId: 'chunk-0', text: 'Photosynthesis converts light into chemical energy.', page: 1 },
    { chunkId: 'chunk-1', text: 'It occurs in the chloroplasts of plant cells.' },
  ],
};

test('chat found returns 200 with only valid citations', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'chat' });
  const res = await makeHandler({ invokeModel })(event(validBody));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.found, true);
  assert.equal(typeof body.answer, 'string');
  assert.deepEqual(body.citations, [{ chunkId: 'chunk-0' }]);
});

test('chat strips hallucinated citation chunkIds', async () => {
  const raw = JSON.stringify({
    found: true,
    answer: 'Grounded answer.',
    citations: [{ chunkId: 'chunk-0' }, { chunkId: 'chunk-999' }],
  });
  const { invokeModel } = makeFakeBedrock({ raw });
  const res = await makeHandler({ invokeModel })(event(validBody));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.found, true);
  assert.deepEqual(body.citations, [{ chunkId: 'chunk-0' }]);
});

test('chat collapses to canonical not-found shape when model says found:false', async () => {
  const raw = JSON.stringify({ found: false, answer: null, citations: [] });
  const { invokeModel } = makeFakeBedrock({ raw });
  const res = await makeHandler({ invokeModel })(event(validBody));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { found: false, answer: null, citations: [] });
});

test('chat collapses to not-found when every citation is hallucinated', async () => {
  const raw = JSON.stringify({
    found: true,
    answer: 'Ungrounded answer.',
    citations: [{ chunkId: 'chunk-999' }],
  });
  const { invokeModel } = makeFakeBedrock({ raw });
  const res = await makeHandler({ invokeModel })(event(validBody));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { found: false, answer: null, citations: [] });
});

test('chat rejects missing fields with 400 VALIDATION_ERROR', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'chat' });
  const res = await makeHandler({ invokeModel })(event({ chunks: validBody.chunks }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).code, 'VALIDATION_ERROR');
});

test('chat returns 502 UPSTREAM_ERROR when the model throws', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'chat', mode: 'throw' });
  const res = await makeHandler({ invokeModel })(event(validBody));
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).code, 'UPSTREAM_ERROR');
});

test('chat returns 502 when model output is unparsable after one retry', async () => {
  const fake = makeFakeBedrock({ endpoint: 'chat', mode: 'unparsable' });
  const res = await makeHandler({ invokeModel: fake.invokeModel })(event(validBody));
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).code, 'UPSTREAM_ERROR');
  assert.equal(fake.calls.length, 2); // original + one retry
});
