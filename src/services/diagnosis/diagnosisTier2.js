/**
 * Technique diagnosis — Cloud tier (Req 6.3, 8.2, 8.4).
 *
 * Posts the diagnosis inputs to `/api/analyze-technique` and shapes the model's
 * reply into the same diagnosis object the Deterministic engine produces, so the
 * tier router (`./index.js`) can swap between them transparently.
 *
 * Privacy (Req 6.3, INTEGRATION.md §3.2): only the current habit key, weak-topic
 * labels, mastery history, and an optional topic-type are sent — never the PDF,
 * filename, or any identity.
 *
 * Scope guard (Req 6.4): the model is free-form, so `recommended_technique` is
 * validated against the three in-scope technique keys. An out-of-scope or missing
 * value is coerced to the closest in-scope HIGH technique rather than trusted, so
 * a stray model response can never surface an unimplemented technique.
 */
import { TECHNIQUES, EVIDENCE } from '../techniqueEngine.js';

// `../../utils/apiTransport.js` reads `import.meta.env`, so `apiPost` is lazy-imported
// inside `diagnosisTier2()`. This keeps the pure `coerceToInScope` validator (and this
// module) loadable outside a Vite runtime (e.g. under `node --test`).

/** The only technique keys a diagnosis is ever allowed to recommend. */
export const IN_SCOPE_TECHNIQUES = Object.freeze(['feynman', 'spaced_repetition']);

/**
 * Coerce a model-supplied technique key into the in-scope set.
 *
 * - `feynman` / `spaced_repetition` pass through unchanged.
 * - `pomodoro` (in registry but a moderate timer, never a diagnosis output) and
 *   any out-of-scope / unknown value are coerced to a HIGH technique, avoiding
 *   the student's current habit when possible so they actually switch methods.
 *
 * @param {string} technique      - raw `recommended_technique` from the model
 * @param {string|null} currentHabit - the student's current method key
 * @returns {string} an in-scope technique key (`feynman` | `spaced_repetition`)
 */
export function coerceToInScope(technique, currentHabit = null) {
  if (IN_SCOPE_TECHNIQUES.includes(technique)) return technique;
  // Prefer a HIGH technique the student is not already using.
  return IN_SCOPE_TECHNIQUES.find(t => t !== currentHabit) ?? IN_SCOPE_TECHNIQUES[0];
}

/**
 * Run a cloud technique diagnosis.
 *
 * Resolves to a diagnosis object matching the Deterministic shape, with
 * `action: 'switch'` (the cloud path is only invoked when a diagnosis has been
 * triggered, i.e. the current method is not working) and `tier: 'cloud'`.
 *
 * Throws on any transport/validation failure so the orchestrator can fall back
 * to the Deterministic engine (Req 8.2).
 *
 * @param {object} args
 * @param {string|null} args.currentHabit
 * @param {Array<string|{topic:string}>} [args.weakTopics]
 * @param {number[]} [args.masteryHistory]
 * @param {string|null} [args.topicType]
 * @returns {Promise<{
 *   action: 'switch',
 *   technique: string,
 *   reason: string,
 *   evidence: string|null,
 *   expectedImprovement: string|null,
 *   tier: 'cloud',
 * }>}
 */
export async function diagnosisTier2({
  currentHabit = null,
  weakTopics = [],
  masteryHistory = [],
  topicType = null,
} = {}) {
  // Chunks/metadata only — labels, not source text, and no identity (Req 6.3).
  const weakTopicLabels = (Array.isArray(weakTopics) ? weakTopics : [])
    .map(t => (typeof t === 'string' ? t : t?.topic))
    .filter(Boolean);

  const payload = {
    currentHabit: currentHabit ?? null,
    weakTopics: weakTopicLabels,
    masteryHistory: Array.isArray(masteryHistory) ? masteryHistory : [],
    topicType: topicType ?? null,
  };

  const { apiPost } = await import('../../utils/apiTransport.js');
  const res = await apiPost('/api/analyze-technique', payload);

  // Validate + coerce the model's technique to the in-scope set (Req 6.4).
  const technique = coerceToInScope(res?.recommended_technique, currentHabit);

  // Prefer the model's prose; fall back to the engine's cited evidence so the
  // recommendation is never left without supporting rationale (Req 6.2).
  const reason =
    typeof res?.analysis === 'string' && res.analysis.trim()
      ? res.analysis.trim()
      : `Try ${TECHNIQUES[technique].name} for your weak topics.`;
  const evidence =
    typeof res?.evidence === 'string' && res.evidence.trim()
      ? res.evidence.trim()
      : (EVIDENCE[technique] ?? null);
  const expectedImprovement =
    typeof res?.expected_improvement === 'string' && res.expected_improvement.trim()
      ? res.expected_improvement.trim()
      : null;

  return {
    action: 'switch',
    technique,
    reason,
    evidence,
    expectedImprovement,
    tier: 'cloud',
  };
}
