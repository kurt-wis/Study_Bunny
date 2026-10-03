import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeHandler } from '../src/handlers/health.js';

/**
 * @param {string} method
 * @returns {object} minimal API Gateway HTTP API v2 event
 */
function event(method) {
  return { requestContext: { http: { method } } };
}

test('health GET returns 200 { status: "ok" }', async () => {
  const handler = makeHandler();
  const res = await handler(event('GET'));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { status: 'ok' });
  assert.equal(res.headers['Content-Type'], 'application/json');
});

test('health POST returns 405 METHOD_NOT_ALLOWED', async () => {
  const handler = makeHandler();
  const res = await handler(event('POST'));
  assert.equal(res.statusCode, 405);
  const body = JSON.parse(res.body);
  assert.equal(body.code, 'METHOD_NOT_ALLOWED');
  assert.equal(typeof body.error, 'string');
});

test('health response includes CORS origin header from env', async () => {
  const prev = process.env.ALLOWED_ORIGIN;
  process.env.ALLOWED_ORIGIN = 'https://app.example.com';
  try {
    const res = await makeHandler()(event('GET'));
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://app.example.com');
  } finally {
    if (prev === undefined) delete process.env.ALLOWED_ORIGIN;
    else process.env.ALLOWED_ORIGIN = prev;
  }
});
