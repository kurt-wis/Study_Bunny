import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforceQuota } from '../src/lib/quota.js';
const event = { clientId: 'client-a' };
const env = { DAILY_REQUEST_LIMIT: '2' };

test('quota is skipped for direct handler calls with no client id', async () => {
  let calls = 0;
  await enforceQuota({}, { env, increment: async () => ++calls });
  assert.equal(calls, 0);
});
test('quota counts per client per UTC day with a two-day expiry', async () => {
  let seen;
  const now = new Date('2026-10-04T23:59:00Z');
  await enforceQuota(event, { env, now, increment: async (key, ttl) => { seen = { key, ttl }; return 1; } });
  assert.deepEqual(seen, { key: 'sb:quota:client-a:2026-10-04', ttl: 172800 });
});
test('quota exhaustion is 429 and store failure does not bypass the allowance', async () => {
  await enforceQuota(event, { env, increment: async () => 2 });
  await assert.rejects(enforceQuota(event, { env, increment: async () => 3 }), e => e.status === 429);
  await assert.rejects(enforceQuota(event, { env, increment: async () => { throw new Error('unavailable'); } }), /unavailable/);
  await assert.rejects(enforceQuota(event, { env: { DAILY_REQUEST_LIMIT: '-1' }, increment: async () => 1 }), /configuration/);
});
test('in-memory fallback enforces the limit within one instance', async () => {
  const e = { clientId: `mem-${Math.random()}` };
  await enforceQuota(e, { env });
  await enforceQuota(e, { env });
  await assert.rejects(enforceQuota(e, { env }), err => err.status === 429);
});
test('Upstash store is used when configured and its errors fail closed', async () => {
  const upstash = { ...env, UPSTASH_REDIS_REST_URL: 'https://example.invalid/', UPSTASH_REDIS_REST_TOKEN: 't' };
  let request;
  const ok = async (url, init) => { request = { url, body: JSON.parse(init.body), auth: init.headers.Authorization }; return { ok: true, json: async () => [{ result: 1 }, { result: 1 }] }; };
  await enforceQuota(event, { env: upstash, now: new Date('2026-10-04T00:00:00Z'), fetchImpl: ok });
  assert.equal(request.url, 'https://example.invalid/pipeline');
  assert.equal(request.auth, 'Bearer t');
  assert.deepEqual(request.body[0], ['INCR', 'sb:quota:client-a:2026-10-04']);
  await assert.rejects(enforceQuota(event, { env: upstash, fetchImpl: async () => ({ ok: false }) }), /unavailable/);
});
