/**
 * Unit tests for the Dashboard data-derivation logic (Req 7.1–7.4).
 *
 * Runs under Node's built-in test runner (`node --test`). Only the pure,
 * network-free derivation is exercised — the same convention the diagnosis and
 * spaced-repetition suites follow (orchestrators / React components are covered
 * by the Vite build, not here).
 *
 * Covers:
 *   - buildCurvePoints   — ordering by time, score→mastery mapping, skipping
 *                          incomplete records, resolving technique + source.
 *   - findInflection     — the first technique switch (v5 §8.4), null when none.
 *   - techniqueEffectiveness — avg mastery gain per session, grouped + sorted.
 *   - sourceAttribution  — quiz vs review counts.
 *   - deriveDashboard    — one-shot, total, empty-but-valid on no data (Req 7.4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCurvePoints,
  findInflection,
  techniquesInCurve,
  techniqueEffectiveness,
  sourceAttribution,
  deriveDashboard,
  seriesKeyFor,
} from './learningCurve.js';

/** Make a quiz record with `score` correct of `total` questions. */
function quiz({ id, score, total = 5, createdAt, technique = null, source = 'quiz' }) {
  return {
    id,
    documentId: 1,
    tier: 'deterministic',
    questions: Array.from({ length: total }, (_, i) => ({ topic: `t${i}` })),
    score,
    completedAt: createdAt,
    createdAt,
    technique,
    source,
  };
}

// ─── buildCurvePoints: ordering + score→mastery (Req 7.1) ───────────────────

test('buildCurvePoints orders attempts oldest → newest by createdAt', () => {
  const points = buildCurvePoints([
    quiz({ id: 2, score: 4, createdAt: '2024-03-02' }),
    quiz({ id: 1, score: 2, createdAt: '2024-03-01' }),
    quiz({ id: 3, score: 5, createdAt: '2024-03-03' }),
  ]);
  assert.deepEqual(points.map(p => p.attempt), [1, 2, 3]);
  assert.deepEqual(points.map(p => p.score), [2, 4, 5]);
});

test('buildCurvePoints maps score/total to a 0–1 mastery', () => {
  const [p] = buildCurvePoints([quiz({ id: 1, score: 3, total: 5, createdAt: '2024-03-01' })]);
  assert.equal(p.mastery, 0.6);
  assert.equal(p.total, 5);
});

test('buildCurvePoints skips records with no numeric score or no questions', () => {
  const points = buildCurvePoints([
    quiz({ id: 1, score: null, createdAt: '2024-03-01' }),      // not completed
    { id: 2, score: 3, questions: [], createdAt: '2024-03-02' }, // no questions
    quiz({ id: 3, score: 4, createdAt: '2024-03-03' }),          // ok
  ]);
  assert.equal(points.length, 1);
  assert.equal(points[0].score, 4);
});

test('buildCurvePoints resolves technique + source and builds an accessible label', () => {
  const [p] = buildCurvePoints([
    quiz({ id: 1, score: 4, createdAt: '2024-03-01', technique: 'feynman', source: 'review' }),
  ]);
  assert.equal(p.technique, 'feynman');
  assert.equal(p.source, 'review');
  assert.match(p.label, /Attempt 1/);
  assert.match(p.label, /80%/);
  assert.match(p.label, /Feynman review/);
});

test('buildCurvePoints treats a missing/unknown technique as the plain series', () => {
  const [p] = buildCurvePoints([quiz({ id: 1, score: 1, createdAt: '2024-03-01', technique: null })]);
  assert.equal(p.technique, 'plain');
  assert.equal(seriesKeyFor('made_up'), 'plain');
});

test('buildCurvePoints is total on garbage input', () => {
  assert.deepEqual(buildCurvePoints(null), []);
  assert.deepEqual(buildCurvePoints(undefined), []);
  assert.deepEqual(buildCurvePoints('nope'), []);
});

// ─── findInflection: first technique switch (Req 7.2, v5 §8.4) ──────────────

test('findInflection marks the first attempt whose technique differs from the first', () => {
  const points = buildCurvePoints([
    quiz({ id: 1, score: 2, createdAt: '2024-03-01', technique: null }),
    quiz({ id: 2, score: 2, createdAt: '2024-03-02', technique: null }),
    quiz({ id: 3, score: 4, createdAt: '2024-03-03', technique: 'spaced_repetition' }),
    quiz({ id: 4, score: 5, createdAt: '2024-03-04', technique: 'spaced_repetition' }),
  ]);
  assert.deepEqual(findInflection(points), {
    attempt: 3,
    from: 'plain',
    to: 'spaced_repetition',
  });
});

test('findInflection returns null when every attempt uses the same technique', () => {
  const points = buildCurvePoints([
    quiz({ id: 1, score: 2, createdAt: '2024-03-01', technique: 'feynman' }),
    quiz({ id: 2, score: 3, createdAt: '2024-03-02', technique: 'feynman' }),
  ]);
  assert.equal(findInflection(points), null);
});

test('findInflection returns null with fewer than two points', () => {
  assert.equal(findInflection([]), null);
  assert.equal(findInflection(buildCurvePoints([quiz({ id: 1, score: 2, createdAt: '2024-03-01' })])), null);
});

// ─── techniquesInCurve: distinct, first-seen order ──────────────────────────

test('techniquesInCurve lists distinct series in first-seen order', () => {
  const points = buildCurvePoints([
    quiz({ id: 1, score: 2, createdAt: '2024-03-01', technique: null }),
    quiz({ id: 2, score: 3, createdAt: '2024-03-02', technique: 'feynman' }),
    quiz({ id: 3, score: 4, createdAt: '2024-03-03', technique: 'feynman' }),
  ]);
  assert.deepEqual(techniquesInCurve(points), ['plain', 'feynman']);
});

// ─── techniqueEffectiveness: avg mastery gain per session (Req 7.3) ─────────

test('techniqueEffectiveness averages the per-session mastery gain by technique', () => {
  // plain: attempt1 mastery 0.4 (gain 0, first), attempt2 mastery 0.4 (gain 0)
  // feynman: attempt3 mastery 0.8 (gain +0.4), attempt4 mastery 1.0 (gain +0.2)
  const points = buildCurvePoints([
    quiz({ id: 1, score: 2, total: 5, createdAt: '2024-03-01', technique: null }),         // 0.4
    quiz({ id: 2, score: 2, total: 5, createdAt: '2024-03-02', technique: null }),         // 0.4
    quiz({ id: 3, score: 4, total: 5, createdAt: '2024-03-03', technique: 'feynman' }),    // 0.8
    quiz({ id: 4, score: 5, total: 5, createdAt: '2024-03-04', technique: 'feynman' }),    // 1.0
  ]);
  const eff = techniqueEffectiveness(points);
  const feynman = eff.find(e => e.technique === 'feynman');
  const plain = eff.find(e => e.technique === 'plain');
  assert.equal(plain.sessions, 2);
  assert.ok(Math.abs(plain.avgGain - 0) < 1e-9);
  assert.equal(feynman.sessions, 2);
  assert.ok(Math.abs(feynman.avgGain - 0.3) < 1e-9); // (0.4 + 0.2) / 2
  // Sorted by descending avg gain → feynman first.
  assert.equal(eff[0].technique, 'feynman');
});

test('techniqueEffectiveness is empty on no points', () => {
  assert.deepEqual(techniqueEffectiveness([]), []);
});

// ─── sourceAttribution: quiz vs review (Req 7.3) ────────────────────────────

test('sourceAttribution counts plain-quiz vs review attempts', () => {
  const points = buildCurvePoints([
    quiz({ id: 1, score: 2, createdAt: '2024-03-01', source: 'quiz' }),
    quiz({ id: 2, score: 3, createdAt: '2024-03-02', source: 'review' }),
    quiz({ id: 3, score: 4, createdAt: '2024-03-03', source: 'review' }),
  ]);
  assert.deepEqual(sourceAttribution(points), { quiz: 1, review: 2, total: 3 });
});

// ─── deriveDashboard: one-shot + empty state totality (Req 7.4) ─────────────

test('deriveDashboard returns an empty-but-valid shape when there is no data', () => {
  const d = deriveDashboard([]);
  assert.equal(d.hasData, false);
  assert.deepEqual(d.points, []);
  assert.equal(d.inflection, null);
  assert.deepEqual(d.techniques, []);
  assert.deepEqual(d.effectiveness, []);
  assert.deepEqual(d.attribution, { quiz: 0, review: 0, total: 0 });
});

test('deriveDashboard is total on garbage input (no throw)', () => {
  const d = deriveDashboard(null);
  assert.equal(d.hasData, false);
});

test('deriveDashboard composes points, inflection, effectiveness and attribution', () => {
  const d = deriveDashboard([
    quiz({ id: 1, score: 2, total: 5, createdAt: '2024-03-01', technique: null, source: 'quiz' }),
    quiz({ id: 2, score: 4, total: 5, createdAt: '2024-03-02', technique: 'feynman', source: 'review' }),
  ]);
  assert.equal(d.hasData, true);
  assert.equal(d.points.length, 2);
  assert.deepEqual(d.inflection, { attempt: 2, from: 'plain', to: 'feynman' });
  assert.deepEqual(d.attribution, { quiz: 1, review: 1, total: 2 });
});
