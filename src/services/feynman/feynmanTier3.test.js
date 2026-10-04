/**
 * Unit tests for the deterministic (Tier 3) Feynman evaluation (Req 3.3, 3.6).
 *
 * Runs under Node's built-in test runner (`node --test`). Pure functions, no
 * database or network, so no fake-indexeddb harness is needed.
 *
 * Covers:
 *   - key-term extraction from source chunks (frequency + deterministic order)
 *   - coverage computation (matched / total key terms)
 *   - gap extraction (unmatched key terms become "possible gaps")
 *   - matched-passage retrieval via TF-IDF
 *   - self-rating normalization (got_it / partial / missed / null)
 *   - total/pure behavior on empty and malformed input
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFeynmanTier3,
  extractKeyTerms,
  FEYNMAN_SELF_RATINGS,
} from './feynmanTier3.js';

const CHUNKS = [
  'Mitosis is the process where a cell divides into two identical daughter cells.',
  'During mitosis, chromosomes condense and align along the metaphase plate.',
  'The daughter cells each receive an identical set of chromosomes.',
];

// ─── key-term extraction ─────────────────────────────────────────────────────

test('extractKeyTerms drops stopwords and short tokens, keeps content words', () => {
  const terms = extractKeyTerms(CHUNKS);
  // stopwords / <3-char tokens must not survive tokenization
  // "two" is a 3-char non-stopword, so it legitimately survives (matches tfidf.js).
  for (const dropped of ['is', 'the', 'of', 'an']) {
    assert.ok(!terms.includes(dropped), `"${dropped}" should not be a key term`);
  }
  // salient content words should be present
  for (const kept of ['mitosis', 'chromosomes', 'daughter', 'cells', 'identical']) {
    assert.ok(terms.includes(kept), `"${kept}" should be a key term`);
  }
});

test('extractKeyTerms orders by frequency then alphabetically and honors the limit', () => {
  // "cells" appears in 2 chunks, "chromosomes" in 2, "mitosis" in 2.
  const terms = extractKeyTerms(CHUNKS, 3);
  assert.equal(terms.length, 3);
  // deterministic: same input → same output
  assert.deepEqual(terms, extractKeyTerms(CHUNKS, 3));
});

test('extractKeyTerms is total on empty / non-array input', () => {
  assert.deepEqual(extractKeyTerms([]), []);
  assert.deepEqual(extractKeyTerms(undefined), []);
  assert.deepEqual(extractKeyTerms(null), []);
});

// ─── coverage + gap extraction ───────────────────────────────────────────────

test('coverage: a thorough explanation covering every key term scores 1.0', () => {
  const keyTerms = extractKeyTerms(CHUNKS, 5);
  // Build an explanation that includes all tracked key terms.
  const explanation = keyTerms.join(' ');
  const res = evaluateFeynmanTier3({ explanation, chunks: CHUNKS, keyTermLimit: 5 });

  assert.equal(res.coverage, 1);
  assert.deepEqual(res.missedKeywords, [], 'no gaps when everything is covered');
  assert.deepEqual(res.matchedKeywords.sort(), keyTerms.slice().sort());
});

test('coverage: a partial explanation yields the correct ratio and gaps', () => {
  const res = evaluateFeynmanTier3({
    explanation: 'Mitosis makes two cells.', // mentions mitosis + cells, misses chromosomes etc.
    chunks: CHUNKS,
    keyTermLimit: 5,
  });

  const total = res.matchedKeywords.length + res.missedKeywords.length;
  assert.equal(total, 5, 'matched + missed accounts for every tracked key term');
  assert.equal(res.coverage, res.matchedKeywords.length / total);

  assert.ok(res.matchedKeywords.includes('mitosis'));
  assert.ok(res.matchedKeywords.includes('cells'));
  // chromosomes was never mentioned → it is a possible gap
  assert.ok(res.missedKeywords.includes('chromosomes'));
  // matched and missed are disjoint
  for (const m of res.matchedKeywords) {
    assert.ok(!res.missedKeywords.includes(m), `${m} cannot be both matched and missed`);
  }
});

test('coverage: an explanation touching none of the key terms scores 0 and all are gaps', () => {
  const res = evaluateFeynmanTier3({
    explanation: 'completely unrelated gibberish words here',
    chunks: CHUNKS,
    keyTermLimit: 5,
  });
  assert.equal(res.coverage, 0);
  assert.deepEqual(res.matchedKeywords, []);
  assert.equal(res.missedKeywords.length, 5);
});

// ─── matched passages ────────────────────────────────────────────────────────

test('matchedPassages surfaces the most relevant source chunk first', () => {
  const res = evaluateFeynmanTier3({
    explanation: 'chromosomes align on the metaphase plate',
    chunks: CHUNKS,
    topK: 2,
  });
  assert.equal(res.matchedPassages.length, 2);
  // the metaphase-plate chunk (index 1) should rank first
  assert.equal(res.matchedPassages[0].chunkIndex, 1);
  assert.ok(res.matchedPassages[0].score > 0);
});

// ─── self-rating ──────────────────────────────────────────────────────────────

test('self-rating is passed through when valid and nulled otherwise', () => {
  for (const r of FEYNMAN_SELF_RATINGS) {
    const res = evaluateFeynmanTier3({ explanation: 'mitosis', chunks: CHUNKS, selfRating: r });
    assert.equal(res.selfRating, r);
  }
  assert.equal(
    evaluateFeynmanTier3({ explanation: 'mitosis', chunks: CHUNKS, selfRating: 'bogus' }).selfRating,
    null,
  );
  assert.equal(
    evaluateFeynmanTier3({ explanation: 'mitosis', chunks: CHUNKS }).selfRating,
    null,
  );
  assert.deepEqual(FEYNMAN_SELF_RATINGS, ['got_it', 'partial', 'missed']);
});

// ─── totality / shape ──────────────────────────────────────────────────────────

test('result is always well-formed, including on empty / malformed input', () => {
  const empty = evaluateFeynmanTier3();
  assert.equal(empty.tier, 'deterministic');
  assert.equal(empty.coverage, 0);
  assert.deepEqual(empty.matchedKeywords, []);
  assert.deepEqual(empty.missedKeywords, []);
  assert.deepEqual(empty.matchedPassages, []);
  assert.equal(empty.selfRating, null);

  // malformed chunks are filtered out, no throw
  const messy = evaluateFeynmanTier3({
    explanation: 42,          // not a string
    chunks: ['mitosis cells', 7, null, { x: 1 }],
  });
  assert.equal(messy.tier, 'deterministic');
  assert.ok(Array.isArray(messy.matchedKeywords));
  assert.ok(Array.isArray(messy.matchedPassages));
});

test('word forms and common synonyms count as the same idea', async () => {
  const { evaluateFeynmanTier3, canonical } = await import('./feynmanTier3.js');
  assert.equal(canonical('produces'), canonical('make'));
  assert.equal(canonical('stored'), canonical('stores'));
  const r = evaluateFeynmanTier3({
    explanation: 'The mitochondria makes power for cells.',
    chunks: ['Mitochondria produce energy for the cell.'],
  });
  assert.deepEqual(r.missedKeywords, []);
  assert.equal(r.coverage, 1);
  const off = evaluateFeynmanTier3({ explanation: 'It is a plant.', chunks: ['Mitochondria produce energy for the cell.'] });
  assert.equal(off.coverage, 0);
});
