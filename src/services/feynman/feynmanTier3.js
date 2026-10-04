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

/** Words too general to count as a "key idea" of a topic. */
const GENERIC = new Set(['using', 'used', 'uses', 'use', 'down', 'into', 'onto', 'also', 'such', 'than', 'then', 'them', 'they', 'their', 'there', 'these', 'those', 'which', 'while', 'when', 'where', 'what', 'who', 'how', 'has', 'have', 'had', 'will', 'can', 'may', 'more', 'most', 'some', 'many', 'each', 'other', 'called', 'known', 'through', 'out', 'over', 'under', 'about', 'between', 'during', 'very', 'all', 'any', 'one', 'two']);

/** Groups of everyday words that mean roughly the same thing in study notes. */
const SYNONYM_GROUPS = [
  ['make', 'produce', 'create', 'generate', 'form', 'build', 'synthesize', 'construct', 'manufacture'],
  ['break', 'destroy', 'digest', 'decompose', 'dissolve', 'split'],
  ['store', 'keep', 'hold', 'contain', 'house', 'save'],
  ['control', 'regulate', 'manage', 'direct', 'govern'],
  ['move', 'transport', 'carry', 'transfer', 'deliver'],
  ['change', 'convert', 'transform', 'turn', 'alter'],
  ['need', 'require'], ['get', 'obtain', 'receive', 'gain', 'absorb', 'take'],
  ['give', 'provide', 'supply', 'release'], ['show', 'display', 'demonstrate', 'indicate'],
  ['help', 'aid', 'assist', 'support'], ['start', 'begin', 'initiate'], ['end', 'finish', 'stop', 'complete'],
  ['big', 'large', 'huge', 'great'], ['small', 'tiny', 'little', 'minute'], ['fast', 'quick', 'rapid'],
  ['part', 'component', 'piece', 'section'], ['job', 'function', 'role', 'purpose', 'task', 'work'],
  ['person', 'human', 'people', 'individual'], ['child', 'kid'],
  ['energy', 'power', 'fuel'], ['food', 'nutrient', 'glucose', 'sugar'], ['waste', 'garbage', 'trash', 'unwanted'],
  ['protect', 'defend', 'guard', 'shield'], ['join', 'combine', 'merge', 'unite', 'connect', 'link'],
  ['important', 'essential', 'vital', 'main', 'major'], ['cause', 'lead', 'result', 'trigger'],
  ['increase', 'rise', 'grow', 'raise'], ['decrease', 'reduce', 'lower', 'drop', 'fall'],
  ['idea', 'concept', 'notion'], ['rule', 'law', 'principle'],
];

/** Reduce a word to a simple base form: "stores"/"stored"/"storing" → "stor". */
export function stem(word) {
  let w = String(word ?? '').toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (/(?:s|x|z|ch|sh)es$/.test(w) && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith('e') && w.length > 3) w = w.slice(0, -1);
  return w;
}

const SYNONYM_OF = new Map();
SYNONYM_GROUPS.forEach((group, i) => group.forEach(word => SYNONYM_OF.set(stem(word), `~${i}`)));

/** One label for every word form and listed synonym of the same idea. */
export function canonical(word) {
  const base = stem(word);
  return SYNONYM_OF.get(base) ?? base;
}

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

/**
 * The few sentences in the notes that are actually about `topic`. Comparing an
 * explanation against these (instead of the whole document) keeps the "key
 * ideas" on-topic, so the feedback shows the real meaning the student should
 * have explained. Falls back to an empty list when nothing matches.
 *
 * @param {string[]} chunks
 * @param {string} topic
 * @param {number} [maxSentences=3]
 * @returns {string[]}
 */
export function focusSentences(chunks, topic, maxSentences = 3) {
  if (!Array.isArray(chunks) || typeof topic !== 'string' || !topic.trim()) return [];
  const sentences = chunks
    .filter(c => typeof c === 'string')
    .flatMap(c => c.match(/[^.!?]+[.!?]+/g) || [c])
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 0);
  const topicTokens = tokenize(topic);
  if (topicTokens.length === 0) return [];
  const scored = sentences
    .map((text, index) => {
      const tokens = new Set(tokenize(text));
      return { text, index, score: topicTokens.filter(t => tokens.has(t)).length };
    })
    .filter(s => s.score > 0);
  // Keep only sentences that match the topic well; a single shared word
  // ("material", "cell") is not enough to count as being about the topic.
  const best = scored.reduce((m, s) => Math.max(m, s.score), 0);
  const focused = scored
    .filter(s => s.score >= Math.max(1, best / 2))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index);
  return [...new Set(focused.map(s => s.text))];
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
  const termCap = Number.isInteger(keyTermLimit) && keyTermLimit > 0 ? keyTermLimit : 20;
  // Drop filler words, and treat different forms of one word as one idea.
  const seenIdeas = new Set();
  const keyTerms = extractKeyTerms(safeChunks, termCap + GENERIC.size)
    .filter(term => !GENERIC.has(term))
    .filter(term => { const idea = canonical(term); if (seenIdeas.has(idea)) return false; seenIdeas.add(idea); return true; })
    .slice(0, termCap);

  // Set of distinct tokens the student actually used.
  // The student's words in base form, so "makes" matches "produce" and "stored" matches "stores".
  const explanationTokens = new Set(tokenize(explanation).map(canonical));

  const matchedKeywords = keyTerms.filter(term => explanationTokens.has(canonical(term)));
  const missedKeywords = keyTerms.filter(term => !explanationTokens.has(canonical(term)));

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
