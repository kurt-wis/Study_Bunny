/**
 * BKT Engine — Bayesian Knowledge Tracing
 * Pure JS, zero dependencies, works 100% offline.
 * Parameters from PRD: pInit=0.3, pLearn=0.2, pSlip=0.1, pGuess=0.25
 */

const BKT_PARAMS = {
  pInit: 0.3,
  pLearn: 0.2,
  pSlip: 0.1,
  pGuess: 0.25,
};

/**
 * Update mastery probability after a student answers a question.
 *
 * @param {number} currentMastery - current mastery in [0.01, 0.99]
 * @param {boolean} isCorrect
 * @returns {number} updated mastery in [0.01, 0.99]
 */
export function updateMastery(currentMastery, isCorrect) {
  if (currentMastery < 0.01 || currentMastery > 0.99) {
    throw new Error(`currentMastery must be in [0.01, 0.99], got: ${currentMastery}`);
  }

  const { pLearn, pSlip, pGuess } = BKT_PARAMS;

  let pKnown;
  if (isCorrect) {
    // P(Known | Correct) = (1-pSlip)*P(Known) / ((1-pSlip)*P(Known) + pGuess*(1-P(Known)))
    const pCorrectAndKnown = (1 - pSlip) * currentMastery;
    const pCorrectAndNotKnown = pGuess * (1 - currentMastery);
    pKnown = pCorrectAndKnown / (pCorrectAndKnown + pCorrectAndNotKnown);
  } else {
    // P(Known | Wrong) = pSlip*P(Known) / (pSlip*P(Known) + (1-pGuess)*(1-P(Known)))
    const pWrongAndKnown = pSlip * currentMastery;
    const pWrongAndNotKnown = (1 - pGuess) * (1 - currentMastery);
    pKnown = pWrongAndKnown / (pWrongAndKnown + pWrongAndNotKnown);
  }

  // Apply learning update
  const updated = pKnown + (1 - pKnown) * pLearn;

  // Clamp to [0.01, 0.99]
  return Math.max(0.01, Math.min(0.99, updated));
}

/**
 * Get topics below the mastery threshold, sorted ascending by mastery.
 * Ties broken by ascending lexicographic topic name.
 *
 * @param {object} knowledgeState - { [topic]: { mastery: number } | number }
 * @param {number} threshold - mastery below this is "weak" (default 0.6)
 * @returns {{ topic: string, mastery: number }[]}
 */
export function getWeakTopics(knowledgeState, threshold = 0.6) {
  if (threshold < 0.01 || threshold > 0.99) {
    throw new Error(`threshold must be in [0.01, 0.99], got: ${threshold}`);
  }

  return Object.entries(knowledgeState)
    .map(([topic, state]) => ({
      topic,
      mastery: typeof state === 'object' ? (state.mastery ?? state) : state,
    }))
    .filter(({ mastery }) => mastery < threshold)
    .sort((a, b) => a.mastery - b.mastery || a.topic.localeCompare(b.topic));
}

/**
 * Return the initial mastery value for a new topic.
 * @returns {number}
 */
export function getInitialMastery() {
  return BKT_PARAMS.pInit;
}

/** Expose params for reference (read-only). */
export const BKT_PARAMS_READONLY = Object.freeze({ ...BKT_PARAMS });
