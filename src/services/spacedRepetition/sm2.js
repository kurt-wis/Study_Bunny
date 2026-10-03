/**
 * SM-2 spaced-repetition scheduler — pure, total, zero dependencies, 100% offline.
 *
 * Implements the SuperMemo-2 algorithm (Req 4.1–4.5). Given a topic's current
 * schedule state and a review `quality` score, it returns the next schedule:
 * an updated repetition count, review interval (in days), ease factor, and the
 * next review date.
 *
 * The function is pure and total: it never throws on valid persisted data. Inputs
 * are clamped defensively —
 *   - `quality` is clamped into [0, 5]
 *   - `easeFactor` is floored at 1.3 (SM-2's minimum)
 *   - missing/invalid state fields fall back to SM-2 defaults
 *
 * A `now` reference may be supplied for deterministic testing of `nextReviewDate`.
 */

/** SM-2 constants. */
const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Coerce a value to a finite number, falling back to `fallback`. */
function toFinite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Compute the next SM-2 schedule for a topic.
 *
 * @param {object} state - current schedule state (from persisted knowledgeState)
 * @param {number} [state.interval=0]    - current interval in days (>= 0)
 * @param {number} [state.easeFactor=2.5] - current ease factor (floored at 1.3)
 * @param {number} [state.repetitions=0] - count of consecutive successful reviews
 * @param {number} quality - review grade in [0, 5] (clamped if out of range)
 * @param {Date}   [now=new Date()] - reference "now" for nextReviewDate
 * @returns {{ interval: number, easeFactor: number, repetitions: number, nextReviewDate: Date }}
 */
export function sm2(state, quality, now = new Date()) {
  const s = state || {};
  const prevInterval = Math.max(0, toFinite(s.interval, 0));
  const prevRepetitions = Math.max(0, Math.trunc(toFinite(s.repetitions, 0)));
  // Floor the incoming ease factor too, so corrupt/low persisted values self-heal.
  const prevEase = Math.max(MIN_EASE_FACTOR, toFinite(s.easeFactor, DEFAULT_EASE_FACTOR));

  // Clamp quality into the SM-2 grade range [0, 5].
  const q = Math.max(0, Math.min(5, toFinite(quality, 0)));

  // Ease factor update (applied every review), floored at 1.3.
  const easeFactor = Math.max(
    MIN_EASE_FACTOR,
    prevEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  );

  let interval;
  let repetitions;

  if (q < 3) {
    // Failed recall → relearn: reset the streak and schedule for tomorrow.
    repetitions = 0;
    interval = 1;
  } else {
    // Successful recall → advance the streak and grow the interval.
    repetitions = prevRepetitions + 1;
    if (prevRepetitions === 0) {
      interval = 1;
    } else if (prevRepetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(prevInterval * easeFactor);
    }
  }

  const nextReviewDate = new Date(now.getTime() + interval * MS_PER_DAY);

  return { interval, easeFactor, repetitions, nextReviewDate };
}

export const SM2_CONSTANTS = Object.freeze({
  MIN_EASE_FACTOR,
  DEFAULT_EASE_FACTOR,
  MS_PER_DAY,
});
