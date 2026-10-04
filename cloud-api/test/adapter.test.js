import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessCodeMatches, cloudReady, toVercel } from '../../api/_lib/adapter.js';

function fakeRes() {
  return { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
}
const READY = { AI_PROVIDER: 'gemini', AI_API_KEY: 'k', AI_MODEL: 'm', ACCESS_CODE: 'bunny-123' };
function withEnv(env, fn) {
  const saved = {};
  const keys = [...Object.keys(READY), 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'AI_BASE_URL'];
  for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  return fn().finally(() => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
}
const echo = async event => ({ statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '' }, body: JSON.stringify(event) });

test('access code comparison and readiness', () => {
  assert.equal(accessCodeMatches('bunny-123', 'bunny-123'), true);
  assert.equal(accessCodeMatches('nope', 'bunny-123'), false);
  assert.equal(accessCodeMatches(undefined, 'bunny-123'), false);
  assert.equal(accessCodeMatches('', ''), false);
  assert.equal(cloudReady(READY), true);
  assert.equal(cloudReady({ ...READY, ACCESS_CODE: '' }), false);
});
test('protected routes refuse when unconfigured, cross-origin, or the code is wrong', async () => {
  const fn = toVercel(echo);
  await withEnv({}, async () => {
    const res = fakeRes(); await fn({ method: 'POST', headers: {} }, res);
    assert.equal(res.statusCode, 503);
  });
  await withEnv(READY, async () => {
    let res = fakeRes(); await fn({ method: 'POST', headers: { origin: 'https://evil.example', host: 'app.example', 'x-study-bunny-code': 'bunny-123' } }, res);
    assert.equal(res.statusCode, 403);
    res = fakeRes(); await fn({ method: 'POST', headers: { host: 'app.example', 'x-study-bunny-code': 'wrong' } }, res);
    assert.equal(res.statusCode, 401);
  });
});
test('a valid request reaches the handler with method, body and a client id', async () => {
  await withEnv(READY, async () => {
    const res = fakeRes();
    await toVercel(echo)({ method: 'POST', headers: { origin: 'https://app.example', host: 'app.example', 'x-study-bunny-code': 'bunny-123', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, body: { a: 1 } }, res);
    assert.equal(res.statusCode, 200);
    const event = JSON.parse(res.body);
    assert.equal(event.requestContext.http.method, 'POST');
    assert.equal(event.body, '{"a":1}');
    assert.match(event.clientId, /^[0-9a-f]{12}:203\.0\.113\.9$/);
    assert.equal('Access-Control-Allow-Origin' in res.headers, false);
  });
});
