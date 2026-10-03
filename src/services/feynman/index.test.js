/**
 * Unit tests for the Feynman tier-router pure logic (Req 3.2, 3.5, 8.2).
 *
 * Runs under Node's built-in test runner (`node --test`). Only the pure,
 * network-free, DB-free helpers are exercised here. The `evaluateFeynman()`
 * orchestrator resolves the tier and talks to the cloud + Dexie repository
 * through modules that read `import.meta.env` / browser globals; that path is
 * covered by the Vite build + integration flow, not this pure-logic suite —
 * the same convention the diagnosis / Spaced-Repetition / Tier-2 suites follow.
 *
 * Covers:
 *   - `selfRatingToCorrectness` — only "got it" is a correct BKT signal (Req 3.2)
 *   - `outcomeToCorrectness`    — self-rating wins, else AI coverage threshold (Req 3.2)
 *   - `buildAttemptRecord`      — saveFeynmanAttempt record shape (Req 3.2)
 *   - `relabelOffline`          — mid-flight cloud fallback relabel (Req 3.5, 8.2)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selfRatingToCorrectness,
  outcomeToCorrectness,
  buildAttemptRecord,
  relabelOffline,
  FEYNMAN_AI_CORRECT_THRESHOLD,
  FEYNMAN_SELF_RATINGS,
} from './index.js';

// ─── selfRatingToCorrectness: only "got it" is correct (Req 3.2) ─────────────

test('selfRatingToCorrectness treats only got_it as a correct signal', () => {
  assert.equal(selfRatingToCorrectness('got_it'), true);
  assert.equal(selfRatingToCorrectness('partial'), false);
  assert.equal(selfRatingToCorrectness('missed'), false);
});

test('selfRatingToCorrectness is total: null/garbage → false', () => {
  assert.equal(selfRatingToCorrectness(null), false);
  assert.equal(selfRatingToCorrectness(undefined), false);
  assert.equal(selfRatingToCorrectness('bogus'), false);
});

// ─── outcomeToCorrectness: self-rating wins, else AI coverage (Req 3.2) ──────

test('outcomeToCorrectness: an explicit self-rating wins over the AI score', () => {
  // got_it stays correct even with a terrible AI score.
  assert.equal(outcomeToCorrectness({ selfRating: 'got_it', aiScore: 0.0 }), true);
  // missed stays incorrect even with a perfect AI score.
  assert.equal(outcomeToCorrectness({ selfRating: 'missed', aiScore: 1.0 }), false);
  assert.equal(outcomeToCorrectness({ selfRating: 'partial', aiScore: 0.95 }), false);
});

test('outcomeToCorrectness falls back to the AI score when there is no self-rating', () => {
  assert.equal(outcomeToCorrectness({ aiScore: 0.8 }), true);
  assert.equal(outcomeToCorrectness({ aiScore: 0.3 }), false);
  // exactly at the threshold counts as correct (>=).
  assert.equal(outcomeToCorrectness({ aiScore: FEYNMAN_AI_CORRECT_THRESHOLD }), true);
  assert.equal(outcomeToCorrectness({ aiScore: FEYNMAN_AI_CORRECT_THRESHOLD - 0.01 }), false);
});

test('outcomeToCorrectness falls back to coverage when aiScore is absent (Tier 3)', () => {
  assert.equal(outcomeToCorrectness({ coverage: 0.7 }), true);
  assert.equal(outcomeToCorrectness({ coverage: 0.2 }), false);
  // aiScore wins over coverage when both are present.
  assert.equal(outcomeToCorrectness({ aiScore: 0.9, coverage: 0.1 }), true);
});

test('outcomeToCorrectness is total: no signal / garbage → incorrect', () => {
  assert.equal(outcomeToCorrectness(), false);
  assert.equal(outcomeToCorrectness({}), false);
  assert.equal(outcomeToCorrectness({ selfRating: 'bogus' }), false);
  assert.equal(outcomeToCorrectness({ aiScore: NaN }), false);
  assert.equal(outcomeToCorrectness({ aiScore: 'bad', coverage: 'nope' }), false);
});

// ─── buildAttemptRecord: saveFeynmanAttempt record shape (Req 3.2) ───────────

test('buildAttemptRecord shapes a cloud result into the saveFeynmanAttempt record', () => {
  const createdAt = new Date('2026-01-01T00:00:00Z');
  const record = buildAttemptRecord({
    documentId: 7,
    topic: 'Mitosis',
    prompt: 'Explain mitosis in your own words.',
    explanation: 'A cell splits into two identical cells.',
    createdAt,
    result: {
      tier: 'cloud',
      coverage: 0.75,
      aiScore: 0.75,
      matchedKeywords: ['mitosis', 'cells'],
      missedKeywords: ['chromosomes'],
      selfRating: 'partial',
    },
  });
  assert.deepEqual(record, {
    documentId: 7,
    topic: 'Mitosis',
    prompt: 'Explain mitosis in your own words.',
    explanation: 'A cell splits into two identical cells.',
    tier: 'cloud',
    selfRating: 'partial',
    aiScore: 0.75,
    matchedKeywords: ['mitosis', 'cells'],
    missedKeywords: ['chromosomes'],
    createdAt,
  });
});

test('buildAttemptRecord leaves aiScore null for a Tier 3 (deterministic) result', () => {
  const record = buildAttemptRecord({
    documentId: 1,
    topic: 'Osmosis',
    explanation: 'water moves',
    result: {
      tier: 'deterministic',
      coverage: 0.5,
      matchedKeywords: ['water'],
      missedKeywords: ['solute'],
      selfRating: 'got_it',
      // no aiScore on a Tier 3 result
    },
  });
  assert.equal(record.tier, 'deterministic');
  assert.equal(record.aiScore, null);
  assert.equal(record.selfRating, 'got_it');
  assert.deepEqual(record.matchedKeywords, ['water']);
});

test('buildAttemptRecord is total: missing/garbage fields coerce to safe defaults', () => {
  const record = buildAttemptRecord({ documentId: 9 });
  assert.equal(record.documentId, 9);
  assert.equal(record.topic, null);
  assert.equal(record.prompt, null);
  assert.equal(record.explanation, '');
  assert.equal(record.tier, null);
  assert.equal(record.selfRating, null);
  assert.equal(record.aiScore, null);
  assert.deepEqual(record.matchedKeywords, []);
  assert.deepEqual(record.missedKeywords, []);
  assert.ok(record.createdAt instanceof Date);

  // non-string explanation and non-array keyword lists are normalized.
  const coerced = buildAttemptRecord({
    documentId: 2,
    explanation: 42,
    result: { matchedKeywords: 'nope', missedKeywords: null },
  });
  assert.equal(coerced.explanation, '');
  assert.deepEqual(coerced.matchedKeywords, []);
  assert.deepEqual(coerced.missedKeywords, []);
});

// ─── relabelOffline: mid-flight cloud fallback relabel (Req 3.5, 8.2) ────────

test('relabelOffline forces tier:deterministic and the Offline mode label', () => {
  const tier3 = {
    tier: 'deterministic',
    coverage: 0.4,
    matchedKeywords: ['a'],
    missedKeywords: ['b'],
    matchedPassages: [],
    selfRating: 'partial',
  };
  const out = relabelOffline(tier3);
  assert.equal(out.tier, 'deterministic');
  assert.equal(out.tierLabel, 'Offline mode');
  // the underlying Tier 3 payload is preserved verbatim.
  assert.equal(out.coverage, 0.4);
  assert.deepEqual(out.matchedKeywords, ['a']);
  assert.equal(out.selfRating, 'partial');
});

test('relabelOffline accepts an injected label (the shared TIER_LABEL value)', () => {
  const out = relabelOffline({ tier: 'deterministic', coverage: 0 }, 'Offline mode');
  assert.equal(out.tierLabel, 'Offline mode');
});

test('relabelOffline is total on empty/garbage input, never throws', () => {
  for (const bad of [undefined, null, 'nope', 42]) {
    const out = relabelOffline(bad);
    assert.equal(out.tier, 'deterministic');
    assert.equal(out.tierLabel, 'Offline mode');
  }
});

// ─── re-export parity ────────────────────────────────────────────────────────

test('FEYNMAN_SELF_RATINGS is re-exported for callers (Got it / Partial / Missed)', () => {
  assert.deepEqual(FEYNMAN_SELF_RATINGS, ['got_it', 'partial', 'missed']);
});
