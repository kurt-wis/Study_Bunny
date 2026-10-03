/**
 * Unit tests for the pure SM-2 scheduler (Req 4.1–4.5).
 *
 * Runs under Node's built-in test runner (`node --test`). Pure function, no
 * database or network, so no fake-indexeddb harness is needed. A fixed `now`
 * reference is passed so `nextReviewDate` assertions are deterministic.
 *
 * Covers:
 *   - interval progression on successful recall (1 → 6 → round(prev * ease))
 *   - relearn reset when quality < 3 (repetitions → 0, interval → 1)
 *   - ease-factor floor at 1.3 (never drops below, even after many failures)
 *   - quality clamping into [0, 5]
 *   - nextReviewDate = now + interval days
 *   - totality: never throws on missing/garbage persisted state
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sm2, SM2_CONSTANTS } from './sm2.js';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const DAY = SM2_CONSTANTS.MS_PER_DAY;

/** Expected nextReviewDate for a given interval, relative to NOW. */
function dueAfter(days) {
  return new Date(NOW.getTime() + days * DAY);
}

// ─── interval progression on successful recall ──────────────────────────────

test('first successful review schedules interval = 1 day', () => {
  const r = sm2({ interval: 0, easeFactor: 2.5, repetitions: 0 }, 5, NOW);
  assert.equal(r.interval, 1);
  assert.equal(r.repetitions, 1);
  assert.deepEqual(r.nextReviewDate, dueAfter(1));
});

test('second successful review schedules interval = 6 days', () => {
  const r = sm2({ interval: 1, easeFactor: 2.5, repetitions: 1 }, 5, NOW);
  assert.equal(r.interval, 6);
  assert.equal(r.repetitions, 2);
  assert.deepEqual(r.nextReviewDate, dueAfter(6));
});

test('third+ successful review scales by round(prev interval * easeFactor)', () => {
  // repetitions >= 2 → interval = round(6 * ease). ease starts 2.5, q=5 bumps it to 2.6.
  const r = sm2({ interval: 6, easeFactor: 2.5, repetitions: 2 }, 5, NOW);
  assert.equal(r.easeFactor, 2.6);
  assert.equal(r.interval, Math.round(6 * 2.6)); // 16
  assert.equal(r.repetitions, 3);
  assert.deepEqual(r.nextReviewDate, dueAfter(16));
});

test('full progression 1 → 6 → ×ease across consecutive perfect reviews', () => {
  let state = { interval: 0, easeFactor: 2.5, repetitions: 0 };
  state = sm2(state, 5, NOW);
  assert.equal(state.interval, 1);
  state = sm2(state, 5, NOW);
  assert.equal(state.interval, 6);
  state = sm2(state, 5, NOW);
  assert.equal(state.interval, Math.round(6 * state.easeFactor));
});

// ─── relearn reset on q < 3 ─────────────────────────────────────────────────

test('relearn: quality below 3 resets repetitions to 0 and interval to 1', () => {
  const r = sm2({ interval: 40, easeFactor: 2.5, repetitions: 7 }, 2, NOW);
  assert.equal(r.repetitions, 0);
  assert.equal(r.interval, 1);
  assert.deepEqual(r.nextReviewDate, dueAfter(1));
});

test('relearn: a well-established topic collapses to a 1-day interval on failure', () => {
  for (const q of [0, 1, 2]) {
    const r = sm2({ interval: 100, easeFactor: 2.8, repetitions: 10 }, q, NOW);
    assert.equal(r.interval, 1, `q=${q} should relearn`);
    assert.equal(r.repetitions, 0, `q=${q} should reset streak`);
  }
});

test('q = 3 is a pass (boundary): streak advances, no reset', () => {
  const r = sm2({ interval: 6, easeFactor: 2.5, repetitions: 2 }, 3, NOW);
  assert.equal(r.repetitions, 3);
  assert.ok(r.interval > 1);
});

// ─── ease-factor floor at 1.3 ───────────────────────────────────────────────

test('ease factor is floored at 1.3 and never drops below', () => {
  // Repeated low-but-passing grades (q=3) push ease down over time.
  let state = { interval: 6, easeFactor: 1.35, repetitions: 5 };
  for (let i = 0; i < 20; i += 1) {
    state = sm2(state, 3, NOW);
    assert.ok(state.easeFactor >= SM2_CONSTANTS.MIN_EASE_FACTOR, `ease ${state.easeFactor} below floor`);
  }
  assert.equal(state.easeFactor, 1.3);
});

test('a single hard pass cannot drive ease below the 1.3 floor', () => {
  // q=3 delta = 0.1 - 2*(0.08 + 2*0.02) = 0.1 - 0.24 = -0.14. From 1.4 → 1.26 → floored 1.3.
  const r = sm2({ interval: 6, easeFactor: 1.4, repetitions: 3 }, 3, NOW);
  assert.equal(r.easeFactor, SM2_CONSTANTS.MIN_EASE_FACTOR);
});

test('a corrupt sub-floor persisted easeFactor self-heals to >= 1.3', () => {
  const r = sm2({ interval: 6, easeFactor: 0.5, repetitions: 2 }, 5, NOW);
  assert.ok(r.easeFactor >= SM2_CONSTANTS.MIN_EASE_FACTOR);
});

// ─── quality clamping ───────────────────────────────────────────────────────

test('quality above 5 is clamped to 5 (treated as a perfect pass)', () => {
  const high = sm2({ interval: 1, easeFactor: 2.5, repetitions: 1 }, 99, NOW);
  const five = sm2({ interval: 1, easeFactor: 2.5, repetitions: 1 }, 5, NOW);
  assert.deepEqual(high, five);
});

test('quality below 0 is clamped to 0 (treated as a total fail → relearn)', () => {
  const low = sm2({ interval: 30, easeFactor: 2.5, repetitions: 5 }, -10, NOW);
  const zero = sm2({ interval: 30, easeFactor: 2.5, repetitions: 5 }, 0, NOW);
  assert.deepEqual(low, zero);
  assert.equal(low.interval, 1);
  assert.equal(low.repetitions, 0);
});

// ─── nextReviewDate ─────────────────────────────────────────────────────────

test('nextReviewDate is now + interval days using the supplied reference', () => {
  const r = sm2({ interval: 1, easeFactor: 2.5, repetitions: 1 }, 5, NOW);
  assert.equal(r.nextReviewDate.getTime() - NOW.getTime(), r.interval * DAY);
});

test('defaults to the current time when no now reference is given', () => {
  const before = Date.now();
  const r = sm2({ interval: 0, easeFactor: 2.5, repetitions: 0 }, 5);
  const after = Date.now();
  const expectedMin = before + 1 * DAY;
  const expectedMax = after + 1 * DAY;
  assert.ok(r.nextReviewDate.getTime() >= expectedMin && r.nextReviewDate.getTime() <= expectedMax);
});

// ─── totality: never throws on missing / garbage state ──────────────────────

test('is total: missing state object falls back to SM-2 defaults', () => {
  const r = sm2(undefined, 5, NOW);
  assert.equal(r.interval, 1);
  assert.equal(r.repetitions, 1);
  assert.equal(r.easeFactor, 2.6); // default 2.5 + q=5 bump
});

test('is total: garbage field types are coerced, no throw', () => {
  assert.doesNotThrow(() => {
    const r = sm2({ interval: 'x', easeFactor: null, repetitions: NaN }, 'bad', NOW);
    assert.ok(Number.isFinite(r.interval));
    assert.ok(Number.isFinite(r.easeFactor));
    assert.ok(Number.isFinite(r.repetitions));
    assert.ok(r.nextReviewDate instanceof Date);
  });
});
