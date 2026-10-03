/**
 * Unit tests for the Cloud (Tier 2) Feynman pure logic (Req 3.4, 3.5, 3.7).
 *
 * Runs under Node's built-in test runner (`node --test`). Only the pure,
 * network-free helpers are exercised here — the `evaluateFeynmanTier2()`
 * orchestrator talks to the cloud via `apiTransport.js`, which reads
 * `import.meta.env`; that path is covered by the Vite build + integration flow,
 * not this pure-logic suite (same pattern the diagnosis/SR suites use).
 *
 * Covers:
 *   - `toWireChunks`        — privacy-safe {chunkId, text} wire shape (Req 3.7)
 *   - `buildFeynmanPayload` — chunks + explanation only (Req 3.4, 3.7)
 *   - `shapeFeynmanCloudResult` — Tier-3 shape parity + validation/coercion (Req 3.5)
 *   - `matchedPassagesFromCoverage` — best-effort passages from covered terms
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toWireChunks,
  buildFeynmanPayload,
  shapeFeynmanCloudResult,
  matchedPassagesFromCoverage,
  FEYNMAN_SELF_RATINGS,
} from './feynmanTier2.js';

const CHUNKS = [
  'Mitosis is the process where a cell divides into two identical daughter cells.',
  'During mitosis, chromosomes condense and align along the metaphase plate.',
  'The daughter cells each receive an identical set of chromosomes.',
];

// ─── toWireChunks: privacy-safe {chunkId, text} shape (Req 3.7) ──────────────

test('toWireChunks maps plain strings to {chunkId, text} with positional ids', () => {
  const wire = toWireChunks(CHUNKS);
  assert.equal(wire.length, 3);
  assert.deepEqual(wire[0], { chunkId: 0, text: CHUNKS[0] });
  assert.equal(wire[2].chunkId, 2);
});

test('toWireChunks preserves an explicit chunkId / chunkIndex / id on objects', () => {
  const wire = toWireChunks([
    { chunkId: 'c7', text: 'alpha' },
    { chunkIndex: 4, text: 'beta' },
    { id: 'x', text: 'gamma' },
    { text: 'delta' }, // no id → positional fallback (index 3)
  ]);
  assert.deepEqual(wire, [
    { chunkId: 'c7', text: 'alpha' },
    { chunkId: 4, text: 'beta' },
    { chunkId: 'x', text: 'gamma' },
    { chunkId: 3, text: 'delta' },
  ]);
});

test('toWireChunks carries ONLY chunkId + text — no identity leaks (Req 3.7)', () => {
  const wire = toWireChunks([
    { chunkId: 1, text: 'content', filename: 'secret.pdf', documentId: 42, owner: 'kurt' },
  ]);
  assert.deepEqual(Object.keys(wire[0]).sort(), ['chunkId', 'text']);
  const serialized = JSON.stringify(wire);
  assert.ok(!serialized.includes('secret.pdf'));
  assert.ok(!serialized.includes('kurt'));
});

test('toWireChunks is total: drops empty / non-text entries, never throws', () => {
  assert.deepEqual(toWireChunks(undefined), []);
  assert.deepEqual(toWireChunks(null), []);
  assert.deepEqual(toWireChunks('nope'), []);
  const wire = toWireChunks(['keep', '', '   ', 7, null, { x: 1 }, { text: '  ' }]);
  assert.equal(wire.length, 1);
  assert.equal(wire[0].text, 'keep');
});

// ─── buildFeynmanPayload: chunks + explanation only (Req 3.4, 3.7) ───────────

test('buildFeynmanPayload sends only explanation, topic, and wire chunks', () => {
  const payload = buildFeynmanPayload({
    explanation: 'Mitosis splits a cell into two.',
    chunks: CHUNKS,
    topic: 'Cell Division',
  });
  assert.deepEqual(Object.keys(payload).sort(), ['chunks', 'explanation', 'topic']);
  assert.equal(payload.explanation, 'Mitosis splits a cell into two.');
  assert.equal(payload.topic, 'Cell Division');
  assert.equal(payload.chunks.length, 3);
  assert.deepEqual(Object.keys(payload.chunks[0]).sort(), ['chunkId', 'text']);
});

test('buildFeynmanPayload is total: coerces missing explanation/topic to safe defaults', () => {
  const payload = buildFeynmanPayload();
  assert.deepEqual(payload, { explanation: '', topic: null, chunks: [] });

  const noTopic = buildFeynmanPayload({ explanation: 'x', chunks: [], topic: '   ' });
  assert.equal(noTopic.topic, null, 'blank topic normalizes to null');

  const badExplanation = buildFeynmanPayload({ explanation: 42, chunks: CHUNKS });
  assert.equal(badExplanation.explanation, '');
});

// ─── shapeFeynmanCloudResult: Tier-3 shape parity (Req 3.5) ──────────────────

test('shapeFeynmanCloudResult mirrors the Tier 3 shape with tier:"cloud" + enrichment', () => {
  const wireChunks = toWireChunks(CHUNKS);
  const res = shapeFeynmanCloudResult(
    {
      coverage: 0.75,
      covered: ['mitosis', 'cells'],
      gaps: ['chromosomes', 'metaphase'],
      feedback: 'Good start — mention how chromosomes align.',
    },
    { wireChunks, selfRating: 'partial' },
  );

  // Every Tier 3 field is present, plus the two Tier 2 enrichments.
  assert.deepEqual(
    Object.keys(res).sort(),
    ['aiScore', 'coverage', 'feedback', 'matchedKeywords', 'matchedPassages', 'missedKeywords', 'selfRating', 'tier'],
  );
  assert.equal(res.tier, 'cloud');
  assert.equal(res.coverage, 0.75);
  assert.equal(res.aiScore, 0.75);
  assert.deepEqual(res.matchedKeywords, ['mitosis', 'cells']);
  assert.deepEqual(res.missedKeywords, ['chromosomes', 'metaphase']);
  assert.equal(res.feedback, 'Good start — mention how chromosomes align.');
  assert.equal(res.selfRating, 'partial');
  assert.ok(Array.isArray(res.matchedPassages));
});

test('shapeFeynmanCloudResult clamps coverage into [0,1] and nulls bad feedback', () => {
  assert.equal(shapeFeynmanCloudResult({ coverage: 1.8 }).coverage, 1);
  assert.equal(shapeFeynmanCloudResult({ coverage: -3 }).coverage, 0);
  assert.equal(shapeFeynmanCloudResult({ coverage: 'bad' }).coverage, 0);
  assert.equal(shapeFeynmanCloudResult({ coverage: 0.5 }).aiScore, 0.5);
  assert.equal(shapeFeynmanCloudResult({ feedback: '   ' }).feedback, null);
  assert.equal(shapeFeynmanCloudResult({ feedback: 123 }).feedback, null);
});

test('shapeFeynmanCloudResult is total on empty / malformed replies, never throws', () => {
  for (const bad of [undefined, null, 'nope', 42, []]) {
    const res = shapeFeynmanCloudResult(bad);
    assert.equal(res.tier, 'cloud');
    assert.equal(res.coverage, 0);
    assert.deepEqual(res.matchedKeywords, []);
    assert.deepEqual(res.missedKeywords, []);
    assert.deepEqual(res.matchedPassages, []);
    assert.equal(res.selfRating, null);
    assert.equal(res.aiScore, 0);
    assert.equal(res.feedback, null);
  }
});

test('shapeFeynmanCloudResult de-dupes and trims the covered/gaps term lists', () => {
  const res = shapeFeynmanCloudResult({
    covered: ['mitosis', ' mitosis ', '', 7, 'cells'],
    gaps: ['chromosomes', 'chromosomes'],
  });
  assert.deepEqual(res.matchedKeywords, ['mitosis', 'cells']);
  assert.deepEqual(res.missedKeywords, ['chromosomes']);
});

test('shapeFeynmanCloudResult normalizes the echoed self-rating like Tier 3', () => {
  for (const r of FEYNMAN_SELF_RATINGS) {
    assert.equal(shapeFeynmanCloudResult({}, { selfRating: r }).selfRating, r);
  }
  assert.equal(shapeFeynmanCloudResult({}, { selfRating: 'bogus' }).selfRating, null);
  assert.equal(shapeFeynmanCloudResult({}).selfRating, null);
  assert.deepEqual(FEYNMAN_SELF_RATINGS, ['got_it', 'partial', 'missed']);
});

// ─── matchedPassagesFromCoverage: best-effort passages from covered terms ────

test('matchedPassagesFromCoverage ranks chunks by covered-term hits', () => {
  const wireChunks = toWireChunks(CHUNKS);
  const passages = matchedPassagesFromCoverage(['chromosomes', 'metaphase'], wireChunks, 2);
  assert.ok(passages.length >= 1);
  // chunk index 1 mentions BOTH chromosomes and metaphase → ranks first.
  assert.equal(passages[0].chunkIndex, 1);
  assert.ok(passages[0].score > 0);
  // shape parity with Tier 3 matchedPassages entries
  assert.deepEqual(Object.keys(passages[0]).sort(), ['chunkIndex', 'score', 'text']);
});

test('matchedPassagesFromCoverage is total: empty terms or chunks yield []', () => {
  assert.deepEqual(matchedPassagesFromCoverage([], toWireChunks(CHUNKS)), []);
  assert.deepEqual(matchedPassagesFromCoverage(['mitosis'], []), []);
  assert.deepEqual(matchedPassagesFromCoverage(null, null), []);
});
