/**
 * Technique diagnosis — tier router (Req 6.1, 6.2, 6.3, 6.5, 8.2).
 *
 * Owns the post-quiz "is your study method working, and if not, what should you
 * try?" flow. It:
 *
 *   - decides WHEN to diagnose (`shouldDiagnose`): score < 0.7 OR a 3-attempt
 *     mastery plateau (Req 6.1), reusing the engine's `isPlateaued`;
 *   - computes the recommendation at the effective tier (`diagnose`):
 *       Deterministic → the pure `recommendTechnique` engine with cited evidence
 *         (Req 6.2); Cloud → `diagnosisTier2`, with mid-flight fallback to the
 *         Deterministic result labelled "Offline mode" (Req 6.3, 8.2);
 *   - always attaches a Review CTA pre-set to the recommended technique and the
 *     current document (Req 6.5).
 *
 * The recommender's output is constrained to the three in-scope techniques (or
 * "keep going") by the engine and, on the cloud path, by `coerceToInScope`
 * (Req 6.4). Diagnosis never recommends an unimplemented technique.
 */
import { recommendTechnique, isPlateaued, TECHNIQUES } from '../techniqueEngine.js';

// `../../utils/tierDetection.js` and `./diagnosisTier2.js` (via apiTransport) read
// `import.meta.env`, so they are lazy-imported inside `diagnose()` — this keeps the
// pure helpers (`shouldDiagnose`, `buildReviewCta`) and this module loadable outside
// a Vite runtime (e.g. under `node --test`), matching the quiz/SR orchestrators.

/** Quiz score (0–1) at/above which no diagnosis is triggered (Req 6.1). */
export const DIAGNOSIS_SCORE_THRESHOLD = 0.7;

/**
 * Should a post-quiz diagnosis be shown? (Req 6.1)
 *
 * True when either signal of a struggling method is present:
 *   - the latest quiz score is below 70%, or
 *   - mastery has plateaued over 3+ attempts (|m[n] - m[n-2]| < 0.05).
 *
 * Pure and total: missing/garbage inputs simply fail their own check.
 *
 * @param {object} args
 * @param {number} [args.quizScore]       - latest quiz score in [0, 1]
 * @param {number[]} [args.masteryHistory] - mastery per attempt, oldest → newest
 * @returns {boolean}
 */
export function shouldDiagnose({ quizScore = null, masteryHistory = [] } = {}) {
  const lowScore =
    typeof quizScore === 'number' &&
    Number.isFinite(quizScore) &&
    quizScore < DIAGNOSIS_SCORE_THRESHOLD;
  return lowScore || isPlateaued(masteryHistory);
}

/**
 * Build the Review deep-link that pre-sets the recommended technique and the
 * current document (Req 6.5). Returns `null` when there is no technique to open
 * Review with (e.g. a "keep going" result).
 *
 * Shape matches the route added by Task 7/8:
 *   /student/document/:id/review?technique=<technique>
 *
 * @param {number|string} documentId
 * @param {string|null} technique - an in-scope technique key, or null
 * @returns {{ to: string, label: string, technique: string }|null}
 */
export function buildReviewCta(documentId, technique) {
  if (!technique || !TECHNIQUES[technique]) return null;
  return {
    to: `/student/document/${documentId}/review?technique=${encodeURIComponent(technique)}`,
    label: `Try ${TECHNIQUES[technique].name} in Review`,
    technique,
  };
}

/**
 * Diagnose a student's study method and recommend a technique.
 *
 * Resolves the tier per invocation (Req 8.1) and routes:
 *   - Cloud: `diagnosisTier2`; on ANY failure, catch and fall back to the
 *     Deterministic engine, relabelling the result "Offline mode" (Req 6.3, 8.2).
 *   - Edge/Deterministic: the pure `recommendTechnique` engine (Req 6.2).
 *
 * The returned object always carries the effective `tier`, its human `tierLabel`,
 * and a Review `cta` pre-set to the recommended technique (null for "keep")
 * (Req 6.5).
 *
 * @param {object} args
 * @param {number|string} args.documentId    - document the diagnosis is for (for the CTA)
 * @param {string|null} [args.currentHabit]   - the student's current method key
 * @param {number} [args.quizScore]           - latest quiz score in [0, 1]
 * @param {Array} [args.weakTopics]           - weak topics (labels or {topic})
 * @param {number[]} [args.masteryHistory]    - mastery per attempt, oldest → newest
 * @param {string|null} [args.topicType]      - optional topic-type hint for cloud
 * @param {string|null} [args.preference]     - manual tier override
 * @returns {Promise<{
 *   action: 'keep'|'switch',
 *   technique: string|null,
 *   reason: string,
 *   evidence: string|null,
 *   expectedImprovement: string|null,
 *   tier: string,
 *   tierLabel: string,
 *   cta: ({ to: string, label: string, technique: string }|null),
 * }>}
 */
export async function diagnose({
  documentId,
  currentHabit = null,
  quizScore = null,
  weakTopics = [],
  masteryHistory = [],
  topicType = null,
  preference = null,
} = {}) {
  // Deterministic recommendation is always computed: it's the Edge/Deterministic
  // result AND the cloud fallback, so there is never an error screen (Req 8.2).
  const deterministic = recommendTechnique({
    currentHabit,
    quizScore,
    weakTopics,
    masteryHistory,
  });

  const { resolveTier, TIER, TIER_LABEL } = await import('../../utils/tierDetection.js');
  const { tier } = await resolveTier({ feature: 'diagnosis', preference });

  // Cloud only enriches a *switch*; a "keep" needs no personalized analysis.
  if (tier === TIER.CLOUD && deterministic.action === 'switch') {
    try {
      const { diagnosisTier2 } = await import('./diagnosisTier2.js');
      const cloud = await diagnosisTier2({
        currentHabit,
        weakTopics,
        masteryHistory,
        topicType,
      });
      return finalize(cloud, cloud.tier, documentId, TIER_LABEL);
    } catch (error) {
      // Mid-flight cloud failure → Deterministic result, "Offline mode" (Req 8.2).
      console.error('[Diagnosis] Cloud tier failed, falling back to deterministic:', error);
      return finalize(
        { ...deterministic, expectedImprovement: null },
        TIER.DETERMINISTIC,
        documentId,
        TIER_LABEL,
      );
    }
  }

  // Edge/Deterministic path (or a cloud "keep"): use the pure engine result.
  const effectiveTier = tier === TIER.CLOUD ? TIER.DETERMINISTIC : tier;
  return finalize(
    { ...deterministic, expectedImprovement: null },
    effectiveTier,
    documentId,
    TIER_LABEL,
  );
}

/**
 * Attach the effective tier label and the Review CTA to a diagnosis result.
 * @param {object} result   - a diagnosis-shaped object (from engine or cloud)
 * @param {string} tier     - the effective tier that produced it
 * @param {number|string} documentId
 * @param {Record<string,string>} tierLabel - tier → human label map
 */
function finalize(result, tier, documentId, tierLabel = {}) {
  return {
    action: result.action,
    technique: result.technique ?? null,
    reason: result.reason,
    evidence: result.evidence ?? null,
    expectedImprovement: result.expectedImprovement ?? null,
    tier,
    tierLabel: tierLabel[tier] ?? tier,
    cta: buildReviewCta(documentId, result.technique ?? null),
  };
}
