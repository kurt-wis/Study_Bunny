/**
 * Technique engine — registry + deterministic recommendation.
 *
 * Pure JS, zero dependencies, works 100% offline (Deterministic tier).
 *
 * Scope (Session Matrix CSV, authoritative): the ONLY buildable techniques are
 * Pomodoro, Feynman, and Spaced Repetition. The recommender's *output* is
 * therefore constrained to the two HIGH-effectiveness buildable techniques
 * (`feynman`, `spaced_repetition`) or "keep going" — it never names an
 * unimplemented technique (Req 6.4).
 *
 * Passive study habits (rereading, highlighting, …) are kept only as *diagnosis
 * inputs* — what a student reports they currently do — not as buildable
 * sessions. They inform the recommendation but are never recommended.
 *
 * Evidence tiers follow Dunlosky et al. (2013), "Improving Students' Learning
 * With Effective Learning Techniques," which rated practice testing and
 * distributed (spaced) practice as high-utility, and rereading/highlighting/
 * summarization as low-utility.
 */

/** Registry of the three in-scope, buildable techniques. */
export const TECHNIQUES = {
  pomodoro:          { name: 'Pomodoro', kind: 'timer', effectiveness: 'moderate' },
  feynman:           { name: 'Feynman', kind: 'explain', effectiveness: 'high' },
  spaced_repetition: { name: 'Spaced Repetition', kind: 'quiz', effectiveness: 'high' },
};

/**
 * Current-habit inputs for the pre-quiz survey. These are DIAGNOSIS INPUTS
 * ONLY — the recommender reads them to decide whether a student's current
 * method is weak, but it never recommends them (they are not buildable).
 *
 * `effectiveness` ratings reflect Dunlosky et al. (2013) utility assessments.
 */
export const CURRENT_HABITS = {
  rereading:    { name: 'Re-reading', effectiveness: 'low' },
  highlighting: { name: 'Highlighting / underlining', effectiveness: 'low' },
  summarizing:  { name: 'Summarizing', effectiveness: 'low' },
  flashcards:   { name: 'Flashcards', effectiveness: 'moderate' },
  pomodoro:     { name: 'Pomodoro', effectiveness: 'moderate' },
  feynman:      { name: 'Feynman', effectiveness: 'high' },
  spaced_repetition: { name: 'Spaced Repetition', effectiveness: 'high' },
};

/** The two HIGH-effectiveness techniques the engine is allowed to recommend. */
const HIGH_TECHNIQUES = ['feynman', 'spaced_repetition'];

/** Score at/above which the current method is working and should be kept. */
const KEEP_THRESHOLD = 0.7;

/** Plateau band: |mastery[n] - mastery[n-2]| < this over 3+ attempts (Req 6.1). */
const PLATEAU_EPSILON = 0.05;

/** Supporting evidence cited in every deterministic recommendation (Req 6.2). */
export const EVIDENCE = {
  feynman:
    'Explaining a concept in your own words (self-explanation / the Feynman ' +
    'technique) exposes gaps that passive review hides — a high-utility ' +
    'practice in Dunlosky et al. (2013).',
  spaced_repetition:
    'Spacing practice over time (distributed practice) and retrieval via ' +
    'quizzing (practice testing) are the two highest-utility techniques in ' +
    'Dunlosky et al. (2013).',
};

/**
 * Detect a mastery plateau: three or more attempts where the most recent point
 * has barely moved from two attempts earlier (per design: |m[n] - m[n-2]| < ε).
 *
 * @param {number[]} masteryHistory - mastery per attempt, oldest → newest
 * @returns {boolean}
 */
export function isPlateaued(masteryHistory) {
  if (!Array.isArray(masteryHistory) || masteryHistory.length < 3) return false;
  const n = masteryHistory.length - 1;
  return Math.abs(masteryHistory[n] - masteryHistory[n - 2]) < PLATEAU_EPSILON;
}

/**
 * Recommend a learning technique, or advise keeping the current method.
 *
 * Rules (Req 6.1, 6.2, 6.4):
 *   - quizScore >= 0.7 AND no plateau → KEEP (the method is working).
 *   - Otherwise (low score, plateau, or a low-effectiveness current habit) →
 *     recommend a HIGH-effectiveness buildable technique.
 *
 * The recommended technique is ALWAYS one of `feynman` / `spaced_repetition`,
 * never a passive habit and never an unimplemented technique. The current habit
 * (if it is already a high technique) is avoided so the student actually
 * switches methods.
 *
 * @param {object} args
 * @param {string} [args.currentHabit]       - the student's current method key
 * @param {number} [args.quizScore]          - latest quiz score in [0, 1]
 * @param {Array}  [args.weakTopics]         - weak topics (used to tailor advice)
 * @param {number[]} [args.masteryHistory]   - mastery per attempt, oldest → newest
 * @returns {{
 *   action: 'keep' | 'switch',
 *   technique: string | null,
 *   reason: string,
 *   evidence: string | null,
 * }}
 */
export function recommendTechnique({
  currentHabit = null,
  quizScore = null,
  weakTopics = [],
  masteryHistory = [],
} = {}) {
  const plateaued = isPlateaued(masteryHistory);
  const habit = CURRENT_HABITS[currentHabit] ?? null;
  const habitIsLowEffectiveness = habit != null && habit.effectiveness === 'low';
  const scoreIsHealthy = typeof quizScore === 'number' && quizScore >= KEEP_THRESHOLD;

  // KEEP: the method is working — healthy score, no plateau, and the current
  // habit is not a known-weak one.
  if (scoreIsHealthy && !plateaued && !habitIsLowEffectiveness) {
    return {
      action: 'keep',
      technique: null,
      reason:
        'Your current approach is working — your score is at or above 70% and ' +
        'mastery is still climbing. Keep going.',
      evidence: null,
    };
  }

  // SWITCH: pick a HIGH-effectiveness technique the student is not already using.
  const recommended =
    HIGH_TECHNIQUES.find(t => t !== currentHabit) ?? HIGH_TECHNIQUES[0];

  const triggers = [];
  if (typeof quizScore === 'number' && quizScore < KEEP_THRESHOLD) {
    triggers.push(`your last score was ${Math.round(quizScore * 100)}%`);
  }
  if (plateaued) triggers.push('mastery has plateaued over your last few attempts');
  if (habitIsLowEffectiveness) {
    triggers.push(`${habit.name.toLowerCase()} is a low-impact study method`);
  }
  const weakCount = Array.isArray(weakTopics) ? weakTopics.length : 0;

  const why = triggers.length
    ? `Because ${triggers.join(' and ')}, `
    : 'To make your study time count, ';
  const weakNote = weakCount
    ? ` Focus it on your ${weakCount} weak topic${weakCount === 1 ? '' : 's'}.`
    : '';

  return {
    action: 'switch',
    technique: recommended,
    reason:
      `${why}try ${TECHNIQUES[recommended].name} instead.${weakNote}`,
    evidence: EVIDENCE[recommended],
  };
}
