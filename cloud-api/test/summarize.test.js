import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeHandler } from '../src/handlers/summarize.js';
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
  chunks: [{ text: 'Photosynthesis converts light into chemical energy.', page: 1 }],
  language: 'English',
};

test('summarize happy path returns 200 with the frozen shape', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'summarize' });
  const res = await makeHandler({ invokeModel })(event(validBody));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(typeof body.overview, 'string');
  assert.ok(Array.isArray(body.keyConcepts));
  assert.equal(typeof body.keyConcepts[0].term, 'string');
  assert.equal(typeof body.keyConcepts[0].explanation, 'string');
  assert.ok(Array.isArray(body.studyOutline));
});

test('summarize rejects malformed body with 400 VALIDATION_ERROR', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'summarize' });
  const res = await makeHandler({ invokeModel })(event({ chunks: [] }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).code, 'VALIDATION_ERROR');
});

test('summarize rejects PII-looking fields with 400', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'summarize' });
  const res = await makeHandler({ invokeModel })(event({ ...validBody, studentName: 'x' }));
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).code, 'VALIDATION_ERROR');
});

test('summarize returns 502 UPSTREAM_ERROR when the model throws', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'summarize', mode: 'throw' });
  const res = await makeHandler({ invokeModel })(event(validBody));
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).code, 'UPSTREAM_ERROR');
});

test('summarize returns 502 when model output is unparsable after one retry', async () => {
  const fake = makeFakeBedrock({ endpoint: 'summarize', mode: 'unparsable' });
  const res = await makeHandler({ invokeModel: fake.invokeModel })(event(validBody));
  assert.equal(res.statusCode, 502);
  assert.equal(JSON.parse(res.body).code, 'UPSTREAM_ERROR');
  assert.equal(fake.calls.length, 2); // original + one retry
});

test('summarize error body carries no stack or prompt content', async () => {
  const { invokeModel } = makeFakeBedrock({ endpoint: 'summarize', mode: 'throw' });
  const res = await makeHandler({ invokeModel })(event(validBody));
  const body = JSON.parse(res.body);
  assert.deepEqual(Object.keys(body).sort(), ['code', 'error']);
  assert.ok(!/Photosynthesis/.test(res.body));
});
