/**
 * Feynman — Deterministic (Tier 3) evaluation. Pure, total, 100% offline.
 *
 * Implements Req 3.1, 3.3, 3.6, 3.7, 8.2, 8.4: when a student explains a topic
 * "in their own words" at the Deterministic tier, we compute a TF-IDF similarity
 * between the explanation and the topic's source chunks, surface the matched
 * passages, list the key source terms the explanation did NOT cover as
 * "possible gaps," and record a Got-it / Partial / Missed self-rating.
 *
 * The evaluation is PURE and TOTAL — no network, no persistence, no identity.
 * It never throws on malformed input; empty/garbage inputs yield an empty,
 * well-formed result. Persistence (saveFeynmanAttempt) and BKT updates are the
 * caller's job (feynman/index.js), keeping this function easy to unit-test.
 *
 * Output shape (aligns with the feynmanAttempts record + the cloud response):
 *   {
 *     tier: 'deterministic',
 *     coverage: number,              // ratio in [0, 1] of key terms covered
 *     matchedKeywords: string[],     // key source terms present in the explanation
 *     missedKeywords: string[],      // key source terms absent = "possible gaps"
 *     matchedPassages: [{ text, chunkIndex, score }],  // top source passages (tfidf)
 *     selfRating: 'got_it' | 'partial' | 'missed' | null,
 *   }
 */

import { tfidfSearch } from '../../utils/tfidf.js';

/**
 * Stopwords + tokenization MUST match utils/tfidf.js so that "key terms"
 * extracted here line up with what tfidfSearch actually scores against.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'is', 'it', 'as', 'be', 'was', 'are', 'from', 'this', 'that', 'its', 'not',
]);

/** Valid self-rating values (Got it / Partially / Missed it). */
const SELF_RATINGS = Object.freeze(['got_it', 'partial', 'missed']);

/**
 * Tokenize text: lowercase, strip non-alphanumeric, split on whitespace, drop
 * stopwords and tokens shorter than 3 chars. Mirrors utils/tfidf.js#tokenize.
 */
function tokenize(text) {
  if (typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Extract key terms from the topic's source chunks: the distinct content words
 * (post-tokenization) ordered by frequency across the chunks, then
 * alphabetically for deterministic ties. These are the terms a good
 * explanation is expected to touch.
 *
 * @param {string[]} chunks
 * @param {number} [limit=20] - cap on how many key terms to track
 * @returns {string[]}
 */
export function extractKeyTerms(chunks, limit = 20) {
  if (!Array.isArray(chunks) || chunks.length === 0) return [];

  const freq = new Map();
  for (const chunk of chunks) {
    for (const token of tokenize(chunk)) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
  }

  const cap = Number.isInteger(limit) && limit > 0 ? limit : 20;

  return [...freq.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, cap)
    .map(([term]) => term);
}

/** Normalize a self-rating to a known value or null. */
function normalizeSelfRating(selfRating) {
  return SELF_RATINGS.includes(selfRating) ? selfRating : null;
}

/**
 * Evaluate a student's explanation deterministically against the topic's chunks.
 *
 * @param {object}   params
 * @param {string}   params.explanation       - the student's explanation text
 * @param {string[]} params.chunks            - the topic's source text chunks
 * @param {string}   [params.selfRating]      - 'got_it' | 'partial' | 'missed'
 * @param {number}   [params.topK=3]          - top matched passages to surface
 * @param {number}   [params.keyTermLimit=20] - cap on key terms considered
 * @returns {{ tier: 'deterministic', coverage: number, matchedKeywords: string[],
 *   missedKeywords: string[], matchedPassages: {text:string,chunkIndex:number,score:number}[],
 *   selfRating: ('got_it'|'partial'|'missed'|null) }}
 */
export function evaluateFeynmanTier3({
  explanation,
  chunks,
  selfRating,
  topK = 3,
  keyTermLimit = 20,
} = {}) {
  const safeChunks = Array.isArray(chunks) ? chunks.filter(c => typeof c === 'string') : [];
  const keyTerms = extractKeyTerms(safeChunks, keyTermLimit);

  // Set of distinct tokens the student actually used.
  const explanationTokens = new Set(tokenize(explanation));

  const matchedKeywords = keyTerms.filter(term => explanationTokens.has(term));
  const missedKeywords = keyTerms.filter(term => !explanationTokens.has(term));

  // Coverage is the fraction of key terms the explanation covered. With no key
  // terms (empty source) there is nothing to cover, so coverage is 0.
  const coverage = keyTerms.length === 0
    ? 0
    : matchedKeywords.length / keyTerms.length;

  // Surface the source passages most relevant to what the student wrote.
  const matchedPassages = tfidfSearch(
    typeof explanation === 'string' ? explanation : '',
    safeChunks,
    topK,
  );

  return {
    tier: 'deterministic',
    coverage,
    matchedKeywords,
    missedKeywords,
    matchedPassages,
    selfRating: normalizeSelfRating(selfRating),
  };
}

export const FEYNMAN_SELF_RATINGS = SELF_RATINGS;
