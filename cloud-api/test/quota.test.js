import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforceQuota } from '../src/lib/quota.js';
const event = { requestContext: { authorizer: { jwt: { claims: { sub: 'test-user' } } } } };
const env = { QUOTA_TABLE: 'test-table', DAILY_REQUEST_LIMIT: '20' };

test('quota requires an authenticated JWT subject before any cloud operation', async () => {
  let calls = 0;
  await assert.rejects(enforceQuota({}, { env, send: async () => calls++ }), e => e.status === 401);
  assert.equal(calls, 0);
});
test('quota atomically shares a UTC daily counter with expiring rows', async () => {
  let command;
  const now = new Date('2026-10-04T23:59:00Z');
  await enforceQuota(event, { env, now, send: async input => { command = input; } });
  assert.equal(command.Key.pk.S, 'test-user:2026-10-04');
  assert.equal(command.ExpressionAttributeValues[':limit'].N, '20');
  assert.match(command.ConditionExpression, /requests < :limit/);
  assert.match(command.UpdateExpression, /ADD requests :one/);
  assert.equal(Number(command.ExpressionAttributeValues[':ttl'].N), now.getTime() / 1000 + 172800);
});
test('quota exhaustion is 429 and infrastructure failure does not bypass allowance', async () => {
  await assert.rejects(enforceQuota(event, { env, send: async () => { throw Object.assign(new Error('full'), { name: 'ConditionalCheckFailedException' }); } }), e => e.status === 429);
  await assert.rejects(enforceQuota(event, { env, send: async () => { throw new Error('unavailable'); } }), /unavailable/);
  await assert.rejects(enforceQuota(event, { env: { ...env, DAILY_REQUEST_LIMIT: '-1' }, send: async () => {} }), /configuration/);
});
