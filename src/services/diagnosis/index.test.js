/**
 * Unit tests for the technique-diagnosis pure logic (Req 6.1, 6.4, 6.5).
 *
 * Runs under Node's built-in test runner (`node --test`). Only the pure,
 * network-free helpers are exercised here:
 *
 *   - `shouldDiagnose`  — the post-quiz trigger: score < 0.7 OR a 3-attempt
 *                         mastery plateau (Req 6.1).
 *   - `buildReviewCta`  — the Review deep-link pre-set to the recommended
 *                         technique + document (Req 6.5).
 *   - `coerceToInScope` — the cloud scope guard that keeps the recommendation
 *                         inside {feynman, spaced_repetition} (Req 6.4).
 *
 * The `diagnose()` orchestrator and `diagnosisTier2()` resolve the tier and talk
 * to the cloud via modules that read `import.meta.env`; those are covered by the
 * Vite build and integration flow, not this pure-logic suite (same pattern the
 * Spaced-Repetition suite uses for its `startSession` orchestrator).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldDiagnose,
  buildReviewCta,
  DIAGNOSIS_SCORE_THRESHOLD,
} from './index.js';
import { coerceToInScope, IN_SCOPE_TECHNIQUES } from './diagnosisTier2.js';

// ─── shouldDiagnose: trigger on low score (Req 6.1) ─────────────────────────

test('shouldDiagnose triggers when the score is below 70%', () => {
  assert.equal(shouldDiagnose({ quizScore: 0.4 }), true);
  assert.equal(shouldDiagnose({ quizScore: 0.69 }), true);
});

test('shouldDiagnose does not trigger on a healthy score with no plateau', () => {
  assert.equal(shouldDiagnose({ quizScore: 0.7, masteryHistory: [0.2, 0.4, 0.7] }), false);
  assert.equal(shouldDiagnose({ quizScore: 0.95, masteryHistory: [0.2, 0.5, 0.8] }), false);
});

test('threshold boundary: exactly 0.7 does not trigger (strictly below)', () => {
  assert.equal(DIAGNOSIS_SCORE_THRESHOLD, 0.7);
  assert.equal(shouldDiagnose({ quizScore: DIAGNOSIS_SCORE_THRESHOLD }), false);
});

// ─── shouldDiagnose: trigger on plateau (Req 6.1) ───────────────────────────

test('shouldDiagnose triggers on a 3-attempt mastery plateau even with a high score', () => {
  assert.equal(
    shouldDiagnose({ quizScore: 0.9, masteryHistory: [0.80, 0.81, 0.80] }),
    true,
  );
});

test('shouldDiagnose needs 3+ attempts before a plateau counts', () => {
  assert.equal(shouldDiagnose({ quizScore: 0.9, masteryHistory: [0.80, 0.81] }), false);
});

// ─── shouldDiagnose: totality ───────────────────────────────────────────────

test('shouldDiagnose is total: empty/garbage inputs do not throw and do not trigger', () => {
  assert.equal(shouldDiagnose(), false);
  assert.equal(shouldDiagnose({}), false);
  assert.equal(shouldDiagnose({ quizScore: NaN }), false);
  assert.equal(shouldDiagnose({ quizScore: 'bad', masteryHistory: 'nope' }), false);
});

// ─── buildReviewCta: pre-set technique + document (Req 6.5) ─────────────────

test('buildReviewCta deep-links to Review with the technique query param', () => {
  const cta = buildReviewCta(42, 'spaced_repetition');
  assert.deepEqual(cta, {
    to: '/student/document/42/review?technique=spaced_repetition',
    label: 'Try Spaced Repetition in Review',
    technique: 'spaced_repetition',
  });
});

test('buildReviewCta works for Feynman and preserves the document id', () => {
  const cta = buildReviewCta('abc', 'feynman');
  assert.equal(cta.to, '/student/document/abc/review?technique=feynman');
  assert.equal(cta.technique, 'feynman');
});

test('buildReviewCta returns null for a "keep going" result (no technique)', () => {
  assert.equal(buildReviewCta(1, null), null);
  assert.equal(buildReviewCta(1, undefined), null);
});

test('buildReviewCta rejects an unknown technique key (never links to an unbuilt one)', () => {
  assert.equal(buildReviewCta(1, 'interleaved'), null);
  assert.equal(buildReviewCta(1, 'practice_test'), null);
});

// ─── coerceToInScope: cloud scope guard (Req 6.4) ───────────────────────────

test('coerceToInScope passes the two in-scope HIGH techniques through unchanged', () => {
  assert.equal(coerceToInScope('feynman'), 'feynman');
  assert.equal(coerceToInScope('spaced_repetition'), 'spaced_repetition');
});

test('coerceToInScope coerces an out-of-scope model value to an in-scope technique', () => {
  for (const bad of ['interleaved', 'practice_test', 'mind_map', 'pomodoro', '', null, undefined]) {
    const out = coerceToInScope(bad);
    assert.ok(IN_SCOPE_TECHNIQUES.includes(out), `coerced ${bad} → ${out} out of scope`);
  }
});

test('coerceToInScope avoids the student\'s current habit when coercing', () => {
  // Garbage value + currentHabit = feynman → should steer to the other HIGH technique.
  assert.equal(coerceToInScope('mind_map', 'feynman'), 'spaced_repetition');
  assert.equal(coerceToInScope('mind_map', 'spaced_repetition'), 'feynman');
});
