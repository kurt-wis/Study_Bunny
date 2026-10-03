/**
 * Feynman service — tier router + mid-flight fallback (Req 3.1–3.7, 8.2, 8.4).
 *
 * Owns the "explain this topic in your own words" flow end to end. It:
 *
 *   - resolves the effective tier per invocation via `resolveTier({ feature:
 *     'feynman' })` (Req 8.1, 8.4) — the badge the UI shows always reflects the
 *     tier that actually produced the result, never the user's preference;
 *   - Cloud  → `evaluateFeynmanTier2`; on ANY failure it catches and falls back
 *     MID-FLIGHT to the deterministic `evaluateFeynmanTier3`, relabelling the
 *     result "Offline mode" so the student never hits an error screen (Req 3.5,
 *     8.2);
 *   - Edge / Deterministic → `evaluateFeynmanTier3` directly (every technique is
 *     fully usable offline — Req 3.1, 3.3, 3.6);
 *   - persists the attempt through the repository helper `saveFeynmanAttempt`
 *     and runs a BKT mastery update derived from the outcome (Req 3.2).
 *
 * Structure mirrors the sibling tier routers (`quiz/index.js`,
 * `diagnosis/index.js`, `spacedRepetition/index.js`): the Vite-coupled modules
 * (`tierDetection`, `feynmanTier2` → `apiTransport`, the Dexie repository) are
 * lazy-imported inside the async orchestrator so the pure helpers in this file
 * stay loadable (and unit-testable) outside a Vite runtime (e.g. `node --test`).
 */
import { evaluateFeynmanTier3, FEYNMAN_SELF_RATINGS } from './feynmanTier3.js';

/**
 * AI coverage at/above which a cloud Feynman attempt counts as a "correct"
 * signal for the BKT update when the student gave no explicit self-rating.
 * Deliberately mid-range: a Feynman explanation that covers ~60%+ of the
 * source key terms is a reasonable "they got it" proxy.
 */
export const FEYNMAN_AI_CORRECT_THRESHOLD = 0.6;

/**
 * Map a self-rating to the binary correctness signal BKT consumes.
 * Only an explicit "got it" counts as correct; "partial"/"missed"/null do not.
 * Mirrors the Spaced-Repetition orchestrator's `confidence === 'got_it'` rule.
 *
 * @param {'got_it'|'partial'|'missed'|null|undefined} selfRating
 * @returns {boolean}
 */
export function selfRatingToCorrectness(selfRating) {
  return selfRating === 'got_it';
}

/**
 * Derive the binary correctness signal for the BKT update from a Feynman
 * outcome (Req 3.2). The student's explicit self-rating wins when present
 * (they are the authority on whether they could explain it); otherwise we fall
 * back to the AI coverage score, treating `>= FEYNMAN_AI_CORRECT_THRESHOLD` as
 * "got it." With neither signal available the attempt is treated as incorrect
 * so an empty/garbage attempt never inflates mastery.
 *
 * Pure and total.
 *
 * @param {{ selfRating?: string|null, aiScore?: number|null, coverage?: number|null }} [outcome]
 * @returns {boolean}
 */
export function outcomeToCorrectness({ selfRating = null, aiScore = null, coverage = null } = {}) {
  if (FEYNMAN_SELF_RATINGS.includes(selfRating)) {
    return selfRatingToCorrectness(selfRating);
  }
  const score = typeof aiScore === 'number' && Number.isFinite(aiScore)
    ? aiScore
    : (typeof coverage === 'number' && Number.isFinite(coverage) ? coverage : null);
  if (score == null) return false;
  return score >= FEYNMAN_AI_CORRECT_THRESHOLD;
}

/**
 * Shape a Feynman evaluation result into the `feynmanAttempts` record expected
 * by `saveFeynmanAttempt` (Req 3.2). Pure and total: it only reads fields and
 * never performs I/O, so the persistence call site stays trivial to reason
 * about. `aiScore` is carried through only for the cloud tier (Tier 3 has none).
 *
 * @param {object} params
 * @param {number|string} params.documentId
 * @param {string|null} [params.topic]
 * @param {string|null} [params.prompt]
 * @param {string} [params.explanation]
 * @param {object} params.result - a Tier 2/3 Feynman result
 * @param {Date} [params.createdAt]
 * @returns {object} a saveFeynmanAttempt-shaped record
 */
export function buildAttemptRecord({
  documentId,
  topic = null,
  prompt = null,
  explanation = '',
  result,
  createdAt,
  masteryBefore = null,
  masteryAfter = null,
} = {}) {
  const r = result && typeof result === 'object' ? result : {};
  return {
    documentId,
    topic: topic ?? null,
    prompt: prompt ?? null,
    explanation: typeof explanation === 'string' ? explanation : '',
    tier: r.tier ?? null,
    selfRating: r.selfRating ?? null,
    // aiScore only exists on the cloud result; Tier 3 leaves it null.
    aiScore: typeof r.aiScore === 'number' ? r.aiScore : null,
    matchedKeywords: Array.isArray(r.matchedKeywords) ? r.matchedKeywords : [],
    missedKeywords: Array.isArray(r.missedKeywords) ? r.missedKeywords : [],
    source: 'review',
    technique: 'feynman',
    ...(Number.isFinite(masteryBefore) ? { masteryBefore } : {}),
    ...(Number.isFinite(masteryAfter) ? { masteryAfter } : {}),
    createdAt: createdAt ?? new Date(),
  };
}

/**
 * Relabel a deterministic result as the mid-flight cloud fallback (Req 3.5, 8.2).
 *
 * Keeps the Deterministic (Tier 3) payload intact and forces the tier to
 * `deterministic` with the human "Offline mode" label — the same relabel the
 * diagnosis router applies on a cloud miss. The "Offline mode" string comes
 * from the shared `TIER_LABEL` tier-label mechanism, injected by the caller so
 * this helper stays pure and node-testable.
 *
 * @param {object} result - a Tier 3 result
 * @param {string} [offlineLabel='Offline mode']
 * @returns {object} the result with tier:'deterministic' and tierLabel set
 */
export function relabelOffline(result, offlineLabel = 'Offline mode') {
  const r = result && typeof result === 'object' ? result : {};
  return { ...r, tier: 'deterministic', tierLabel: offlineLabel };
}

/** Clamp a mastery value into BKT's required [0.01, 0.99] range. */
function clampMastery(m, initial) {
  if (!Number.isFinite(m)) return initial;
  return Math.max(0.01, Math.min(0.99, m));
}

/**
 * Evaluate a student's Feynman explanation of a topic.
 *
 * Resolves the tier per invocation and routes (Req 3.1–3.7, 8.2):
 *   - Cloud: `evaluateFeynmanTier2`; on ANY failure, catch and fall back
 *     mid-flight to `evaluateFeynmanTier3`, relabelled "Offline mode".
 *   - Edge / Deterministic: `evaluateFeynmanTier3` directly.
 *
 * The attempt is persisted via `saveFeynmanAttempt` and a BKT mastery update is
 * run from the outcome (self-rating, else AI coverage — Req 3.2). The resolved
 * result carries the effective `tier` and its `tierLabel` so the UI badge
 * reflects what actually ran (Req 8.4). The source chunks come from the stored
 * document; only chunks + the explanation ever reach the cloud (Req 3.7).
 *
 * @param {object} params
 * @param {number|string} params.documentId    - document the topic belongs to
 * @param {string} [params.topic]              - weak-topic label (never an id)
 * @param {string} params.explanation          - the student's explanation text
 * @param {string} [params.prompt]             - the "explain this" prompt shown
 * @param {string} [params.selfRating]         - 'got_it' | 'partial' | 'missed'
 * @param {number} [params.topK=3]             - top matched passages to surface
 * @param {number} [params.keyTermLimit=20]    - cap on key terms considered
 * @param {string|null} [params.preference]    - manual tier override
 * @returns {Promise<object & { tier: string, tierLabel: string, attemptId: number, mastery: (number|null) }>}
 */
export async function evaluateFeynman({
  documentId,
  topic = null,
  explanation = '',
  prompt = null,
  selfRating,
  topK = 3,
  keyTermLimit = 20,
  preference = null,
} = {}) {
  // Lazy-import the Vite-coupled modules so the pure helpers above load under
  // `node --test`. tierDetection + feynmanTier2 (→ apiTransport) + the Dexie
  // repository all read import.meta.env / browser globals.
  const { resolveTier, TIER, TIER_LABEL } = await import('../../utils/tierDetection.js');
  const { getDocument, saveFeynmanAttempt, getKnowledgeState, updateKnowledgeState } =
    await import('../../db/database.js');

  const doc = await getDocument(documentId);
  if (!doc) throw new Error('Document not found');
  const chunks = Array.isArray(doc.chunks) && doc.chunks.length > 0
    ? doc.chunks
    : (typeof doc.rawText === 'string' ? [doc.rawText] : []);

  const { tier } = await resolveTier({ feature: 'feynman', preference });

  let result;
  if (tier === TIER.CLOUD) {
    try {
      const { evaluateFeynmanTier2 } = await import('./feynmanTier2.js');
      const cloud = await evaluateFeynmanTier2({ explanation, chunks, topic, selfRating, topK });
      result = { ...cloud, tierLabel: TIER_LABEL[TIER.CLOUD] ?? TIER.CLOUD };
    } catch (error) {
      // Mid-flight cloud failure → Deterministic result, "Offline mode" (Req 3.5, 8.2).
      console.error('[Feynman] Cloud tier failed, falling back to deterministic:', error);
      const deterministic = evaluateFeynmanTier3({ explanation, chunks, selfRating, topK, keyTermLimit });
      result = relabelOffline(deterministic, TIER_LABEL[TIER.DETERMINISTIC] ?? 'Offline mode');
    }
  } else {
    // Edge/Deterministic: no edge Feynman provider in MVP, so the deterministic
    // evaluator serves both paths. (Edge is reserved for a future on-device SLM.)
    const deterministic = evaluateFeynmanTier3({ explanation, chunks, selfRating, topK, keyTermLimit });
    result = {
      ...deterministic,
      tierLabel: TIER_LABEL[TIER.DETERMINISTIC] ?? 'Offline mode',
    };
  }

  // ── BKT mastery update from the outcome (Req 3.2) ──
  // Only when the attempt is tied to a concrete topic — a topic-less reflection
  // has no mastery row to move.
  let mastery = null;
  let masteryBefore = null;
  if (topic != null && topic !== '') {
    const { updateMastery, getInitialMastery } = await import('../bkt.js');
    const state = await getKnowledgeState(documentId);
    const current = state[topic] ?? {};
    const initial = getInitialMastery();
    const currentMastery = clampMastery(
      typeof current.mastery === 'number' ? current.mastery : initial,
      initial,
    );
    masteryBefore = currentMastery;
    const isCorrect = outcomeToCorrectness({
      selfRating: result.selfRating,
      aiScore: result.aiScore,
      coverage: result.coverage,
    });
    mastery = updateMastery(currentMastery, isCorrect);
    await updateKnowledgeState(documentId, topic, mastery);
  }

  // Persist the completed attempt together with its BKT change so the dashboard
  // can compare genuine mastery gain instead of treating quiz accuracy as mastery.
  const attemptId = await saveFeynmanAttempt(
    buildAttemptRecord({ documentId, topic, prompt, explanation, result, masteryBefore, masteryAfter: mastery }),
  );

  return { ...result, attemptId, mastery };
}

export { FEYNMAN_SELF_RATINGS };
