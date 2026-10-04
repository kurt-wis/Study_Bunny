import { ApiError, CODES } from './errors.js';

/**
 * Daily allowance per client, shared across all AI routes.
 *
 * The deployed adapter sets `event.clientId` (access code + IP address). Two
 * stores are supported:
 *   - Upstash Redis over REST when UPSTASH_REDIS_REST_URL and
 *     UPSTASH_REDIS_REST_TOKEN are set: an accurate counter shared by every
 *     server instance.
 *   - Otherwise an in-memory counter: best effort only, because serverless
 *     instances do not share memory. Pair it with a spend limit at the provider.
 *
 * Unit tests that call handlers directly send no `clientId` and are not counted.
 */
const memory = new Map();

async function incrementMemory(key, ttlSeconds, nowMs) {
  for (const [k, v] of memory) if (v.expiresAt <= nowMs) memory.delete(k);
  const entry = memory.get(key) ?? { count: 0, expiresAt: nowMs + ttlSeconds * 1000 };
  entry.count += 1;
  memory.set(key, entry);
  return entry.count;
}

async function incrementUpstash(key, ttlSeconds, env, fetchImpl) {
  const response = await fetchImpl(`${env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(ttlSeconds)]]),
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error('Quota store unavailable');
  const result = await response.json();
  const count = Number(result?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error('Quota store unavailable');
  return count;
}

export async function enforceQuota(event, { increment, now = new Date(), env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const clientId = event?.clientId;
  if (!clientId) return; // Direct handler calls in unit tests.
  const limit = Number(env.DAILY_REQUEST_LIMIT ?? 20);
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid quota configuration');
  const key = `sb:quota:${clientId}:${now.toISOString().slice(0, 10)}`;
  const ttl = 172800;
  // Fail closed: if the counter cannot be read, the request does not proceed.
  const count = increment
    ? await increment(key, ttl)
    : env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? await incrementUpstash(key, ttl, env, fetchImpl)
      : await incrementMemory(key, ttl, now.getTime());
  if (count > limit) {
    throw new ApiError(429, CODES.QUOTA_EXCEEDED, 'Daily AI allowance reached. Try again tomorrow or use offline mode.');
  }
}
