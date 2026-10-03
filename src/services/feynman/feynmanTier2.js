/**
 * Feynman — Cloud (Tier 2) evaluation. Req 3.4, 3.5, 3.7, 8.2, 8.4.
 *
 * Posts the student's explanation plus the topic's anonymous source chunks to
 * `/api/feynman` and shapes the model's reply into the SAME object the
 * Deterministic (Tier 3) evaluator produces, so the tier router (`./index.js`)
 * can swap between them transparently and the "Offline mode" fallback is a
 * drop-in substitution (Req 3.5).
 *
 * Privacy (Req 3.7, INTEGRATION.md §3.2): ONLY the explanation text and the
 * extracted chunks ({chunkId, text}) are sent — never the PDF file, the
 * filename, the document id, the topic owner, or any identity.
 *
 * Shape parity with Tier 3 (feynmanTier3.js):
 *   {
 *     tier: 'cloud',
 *     coverage: number,              // ratio in [0, 1] from the model
 *     matchedKeywords: string[],     // model's "covered" terms
 *     missedKeywords: string[],      // model's "gaps" = possible gaps
 *     matchedPassages: [{ text, chunkIndex, score }],  // best-effort from chunks
 *     selfRating: 'got_it'|'partial'|'missed'|null,    // echoed through, model-independent
 *     aiScore: number|null,          // Tier-2 enrichment: coverage as a 0-1 AI score
 *     feedback: string|null,         // Tier-2 enrichment: the model's prose assessment
 *   }
 *
 * The cloud call throws on any transport/validation failure so the orchestrator
 * (`./index.js`) can catch it and fall back to the Deterministic path (Req 8.2).
 */

// `../../utils/apiTransport.js` reads `import.meta.env`, so `apiPost` is lazy-imported
// inside `evaluateFeynmanTier2()`. This keeps the pure builders/shapers in this module
// loadable outside a Vite runtime (e.g. under `node --test`).

/** Valid self-rating values — mirrors feynmanTier3.js (Got it / Partially / Missed it). */
const SELF_RATINGS = Object.freeze(['got_it', 'partial', 'missed']);

/** Normalize a self-rating to a known value or null. Matches Tier 3 behavior. */
function normalizeSelfRating(selfRating) {
  return SELF_RATINGS.includes(selfRating) ? selfRating : null;
}

/** Clamp a value into [0, 1], returning the fallback for non-finite input. */
function clamp01(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Keep only the distinct, non-empty, trimmed strings from an array (order-preserving). */
function cleanStringList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Normalize the caller's chunks into the privacy-safe `{ chunkId, text }` wire
 * shape (Req 3.7). Accepts either plain strings or objects carrying `text`
 * (and an optional `chunkId` / `chunkIndex` / `id`). Any non-text entry is
 * dropped. The returned `chunkId` falls back to the positional index so the
 * backend always has a stable handle, and no identity ever leaks.
 *
 * @param {Array<string|{text?:string, chunkId?:(string|number), chunkIndex?:number, id?:(string|number)}>} chunks
 * @returns {{ chunkId: (string|number), text: string }[]}
 */
export function toWireChunks(chunks) {
  if (!Array.isArray(chunks)) return [];
  const wire = [];
  chunks.forEach((chunk, index) => {
    if (typeof chunk === 'string') {
      const text = chunk.trim();
      if (text) wire.push({ chunkId: index, text });
      return;
    }
    if (chunk && typeof chunk === 'object' && typeof chunk.text === 'string') {
      const text = chunk.text.trim();
      if (!text) return;
      const chunkId = chunk.chunkId ?? chunk.chunkIndex ?? chunk.id ?? index;
      wire.push({ chunkId, text });
    }
  });
  return wire;
}

/**
 * Build the `/api/feynman` request payload (Req 3.4, 3.7).
 *
 * Chunks and the explanation only — nothing else. The optional `topic` label is
 * a plain string hint (a weak-topic label), never a document id or filename.
 *
 * @param {object} params
 * @param {string} params.explanation
 * @param {Array}  params.chunks
 * @param {string} [params.topic]
 * @returns {{ explanation: string, topic: string|null, chunks: {chunkId:(string|number),text:string}[] }}
 */
export function buildFeynmanPayload({ explanation, chunks, topic = null } = {}) {
  return {
    explanation: typeof explanation === 'string' ? explanation : '',
    topic: typeof topic === 'string' && topic.trim() ? topic.trim() : null,
    chunks: toWireChunks(chunks),
  };
}

/**
 * Best-effort matched passages from the model's `covered` terms against the
 * wire chunks, so a cloud result still carries the `matchedPassages` field the
 * router/UI expects. The cloud response does not return passages itself, so we
 * surface the source chunks that contain the covered terms, ranked by how many
 * covered terms each chunk mentions. Deterministic and total — never throws.
 *
 * @param {string[]} covered
 * @param {{chunkId:(string|number),text:string}[]} wireChunks
 * @param {number} [topK=3]
 * @returns {{ text: string, chunkIndex: number, score: number }[]}
 */
export function matchedPassagesFromCoverage(covered, wireChunks, topK = 3) {
  const terms = cleanStringList(covered).map(t => t.toLowerCase());
  if (terms.length === 0 || !Array.isArray(wireChunks) || wireChunks.length === 0) return [];

  const scored = wireChunks.map((chunk, chunkIndex) => {
    const haystack = (chunk?.text ?? '').toLowerCase();
    const hits = terms.reduce((n, term) => (haystack.includes(term) ? n + 1 : n), 0);
    return { text: chunk?.text ?? '', chunkIndex, score: hits / terms.length };
  });

  const cap = Number.isInteger(topK) && topK > 0 ? topK : 3;
  return scored
    .filter(p => p.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.chunkIndex - b.chunkIndex))
    .slice(0, cap);
}

/**
 * Shape a raw `/api/feynman` reply into the Tier-3-parity Feynman result.
 *
 * Pure, total, and defensive: the model is free-form, so every field is
 * validated/coerced. `covered`/`gaps` map onto `matchedKeywords`/
 * `missedKeywords`; `coverage` is clamped to [0, 1]; `feedback` is kept as the
 * Tier-2 prose enrichment; `aiScore` is the clamped coverage (the AI's 0-1
 * assessment). The caller-supplied `selfRating` is echoed through unchanged so
 * a cloud attempt records the same self-rating a deterministic one would.
 *
 * @param {object} res               - raw model reply
 * @param {object} [opts]
 * @param {{chunkId:(string|number),text:string}[]} [opts.wireChunks]
 * @param {string} [opts.selfRating]
 * @param {number} [opts.topK=3]
 * @returns {{
 *   tier: 'cloud', coverage: number, matchedKeywords: string[], missedKeywords: string[],
 *   matchedPassages: {text:string,chunkIndex:number,score:number}[],
 *   selfRating: ('got_it'|'partial'|'missed'|null), aiScore: number|null, feedback: string|null,
 * }}
 */
export function shapeFeynmanCloudResult(res, { wireChunks = [], selfRating, topK = 3 } = {}) {
  const safe = res && typeof res === 'object' ? res : {};

  const coverage = clamp01(safe.coverage, 0);
  const matchedKeywords = cleanStringList(safe.covered);
  const missedKeywords = cleanStringList(safe.gaps);
  const feedback =
    typeof safe.feedback === 'string' && safe.feedback.trim() ? safe.feedback.trim() : null;

  return {
    tier: 'cloud',
    coverage,
    matchedKeywords,
    missedKeywords,
    matchedPassages: matchedPassagesFromCoverage(matchedKeywords, wireChunks, topK),
    selfRating: normalizeSelfRating(selfRating),
    // Tier-2 enrichment: the AI's coverage reading as a 0-1 score, plus its prose.
    aiScore: coverage,
    feedback,
  };
}

/**
 * Evaluate a student's explanation at the Cloud tier.
 *
 * Posts `{ explanation, topic, chunks: [{chunkId, text}] }` to `/api/feynman`
 * (chunks + explanation only, no identity — Req 3.4, 3.7) and returns a result
 * matching the Tier 3 shape with `tier: 'cloud'`.
 *
 * Throws on any transport/validation failure so the orchestrator can fall back
 * to the Deterministic evaluator and relabel to "Offline mode" (Req 3.5, 8.2).
 *
 * @param {object}   params
 * @param {string}   params.explanation       - the student's explanation text
 * @param {Array}    params.chunks            - the topic's source chunks (string | {text,...})
 * @param {string}   [params.topic]           - optional weak-topic label hint
 * @param {string}   [params.selfRating]      - 'got_it' | 'partial' | 'missed'
 * @param {number}   [params.topK=3]          - top matched passages to surface
 * @returns {Promise<ReturnType<typeof shapeFeynmanCloudResult>>}
 */
export async function evaluateFeynmanTier2({
  explanation,
  chunks,
  topic = null,
  selfRating,
  topK = 3,
} = {}) {
  const payload = buildFeynmanPayload({ explanation, chunks, topic });

  const { apiPost } = await import('../../utils/apiTransport.js');
  const res = await apiPost('/api/feynman', payload);

  return shapeFeynmanCloudResult(res, { wireChunks: payload.chunks, selfRating, topK });
}

export const FEYNMAN_SELF_RATINGS = SELF_RATINGS;
