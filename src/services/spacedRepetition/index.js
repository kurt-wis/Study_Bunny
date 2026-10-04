/**
 * Spaced-Repetition orchestration (Req 4.1–4.5).
 *
 * This module wires the pure SM-2 scheduler (`./sm2.js`) and the BKT engine
 * (`../bkt.js`) into the existing quiz engine and Dexie repository. It owns:
 *
 *   - `getDueTopics`      — due-topic selection (re-exports the repository helper,
 *                           which already orders by due-ness then ascending mastery).
 *   - quality mapping     — `correctnessToQuality` (quiz) and `confidenceToQuality`
 *                           (review confidence rating) → SM-2 quality score.
 *   - `startSession`      — reuses `generateQuiz(documentId, { weakTopics })` so all
 *                           question generation and tier handling is shared.
 *   - `recordAnswer`      — after each answer runs BOTH `updateMastery` (BKT) and
 *                           `sm2` → `updateSchedule`, persisting mastery + schedule.
 *
 * Everything here is deterministic and works 100% offline (Req 4.1): SM-2 and BKT
 * are pure, and the only I/O is through the shared repository helpers.
 */
import { sm2 } from './sm2.js';
import { updateMastery, getInitialMastery } from '../bkt.js';
import {
  getDueTopics as repoGetDueTopics,
  getKnowledgeState,
  updateKnowledgeState,
  updateSchedule,
} from '../../db/database.js';

/**
 * Topics due for review, ordered most-overdue-first then weakest-mastery-first.
 * Thin wrapper over the repository helper (Task 1) so callers depend on the SR
 * module rather than reaching into the DB layer directly (Req 4.3, 9.2).
 *
 * @param {number} documentId
 * @param {Date} [now=new Date()]
 * @returns {Promise<{ topic: string, mastery: number, nextReviewDate: * }[]>}
 */
export function getDueTopics(documentId, now = new Date()) {
  return repoGetDueTopics(documentId, now);
}

/**
 * SM-2 quality scores. Per design §3 open-decision #2:
 *   quiz    → correctness maps to { correct: 5, wrong: 2 }
 *   review  → confidence rating maps to { got_it: 5, partial: 3, missed_it: 1 }
 */
export const QUALITY = Object.freeze({
  CORRECT: 5,
  WRONG: 2,
  GOT_IT: 5,
  PARTIAL: 3,
  MISSED_IT: 1,
});

/** Accepted confidence ratings (review session). */
export const CONFIDENCE_RATINGS = Object.freeze(['got_it', 'partial', 'missed_it']);

/**
 * Map a quiz answer's correctness to an SM-2 quality score.
 * Pure and total: any truthy `isCorrect` → 5, otherwise → 2.
 *
 * @param {boolean} isCorrect
 * @returns {number} SM-2 quality in {2, 5}
 */
export function correctnessToQuality(isCorrect) {
  return isCorrect ? QUALITY.CORRECT : QUALITY.WRONG;
}

/**
 * Map a review-session confidence rating to an SM-2 quality score.
 * Pure and total: unknown/garbage ratings fall back to the lowest grade so an
 * unrecognised input never inflates the schedule.
 *
 * @param {'got_it'|'partial'|'missed_it'|string} rating
 * @returns {number} SM-2 quality in {1, 3, 5}
 */
export function confidenceToQuality(rating) {
  switch (rating) {
    case 'got_it':
      return QUALITY.GOT_IT;
    case 'partial':
      return QUALITY.PARTIAL;
    case 'missed_it':
      return QUALITY.MISSED_IT;
    default:
      return QUALITY.MISSED_IT;
  }
}

/**
 * Derive the SM-2 `repetitions` streak from a persisted interval.
 *
 * `updateSchedule` persists only { interval, easeFactor, nextReviewDate }, so the
 * consecutive-success count isn't stored. SM-2's interval ladder is deterministic
 * (0 → 1 → 6 → round(prev * ease)), so we can recover the streak from the interval:
 *   interval 0  → reps 0 (never scheduled / relearning)
 *   interval 1  → reps 1 (first success, or just relearned)
 *   interval 6  → reps 2 (second success)
 *   otherwise   → reps 2 (any longer interval is a ×ease step, treated as >=2 so the
 *                 next success keeps multiplying rather than snapping back to 6)
 *
 * @param {number} interval
 * @returns {number}
 */
function repetitionsFromInterval(interval) {
  const i = typeof interval === 'number' && Number.isFinite(interval) ? interval : 0;
  if (i <= 0) return 0;
  if (i <= 1) return 1;
  return 2;
}

/**
 * Resolve the quality score for an answer from either a quiz correctness flag or a
 * review confidence rating. If a `confidence` rating is present it wins (review
 * sessions let the student self-grade); otherwise correctness is used (quiz).
 *
 * @param {{ isCorrect?: boolean, confidence?: string }} answer
 * @returns {number} SM-2 quality score
 */
export function qualityForAnswer(answer = {}) {
  if (answer.grade != null) return gradeToQuality(answer.grade);
  if (answer.confidence != null) return confidenceToQuality(answer.confidence);
  return correctnessToQuality(Boolean(answer.isCorrect));
}

/**
 * Start a Spaced-Repetition session.
 *
 * Reuses the existing quiz engine so tier resolution, cloud fallback, and question
 * generation are shared (Req 4.3, 8.x). Due topics (ordered by SM-2 due-ness then
 * BKT mastery) are passed through as `weakTopics` for the generator to focus on.
 *
 * @param {number} documentId
 * @param {{ now?: Date, preference?: string }} [opts]
 * @returns {Promise<{ tier: string, questions: object[], quizId: number, dueTopics: object[] }>}
 */
export async function startSession(documentId, opts = {}) {
  const now = opts.now ?? new Date();
  const dueTopics = await getDueTopics(documentId, now);
  const weakTopics = dueTopics.map(t => t.topic);

  // Lazy-import the quiz engine so this module (and its pure/DB-only helpers) can
  // load outside a Vite runtime; the quiz engine transitively reads import.meta.env.
  const { generateQuiz } = await import('../quiz/index.js');
  const quiz = await generateQuiz(documentId, {
    weakTopics,
    preference: opts.preference ?? null,
  });

  return { ...quiz, dueTopics };
}

/**
 * Record one answer for a topic: update BKT mastery AND the SM-2 schedule.
 *
 * Runs both updates per answer (Req 4.2): BKT drives the mastery estimate while
 * SM-2 drives the review schedule. A `confidence` rating (review) maps to the SM-2
 * quality score; otherwise the quiz correctness flag is used. BKT mastery always
 * follows the binary correctness signal (confidence doesn't change "did they get
 * it right"), defaulting an unknown rating to incorrect.
 *
 * @param {number} documentId
 * @param {string} topic
 * @param {{ isCorrect?: boolean, confidence?: string }} answer
 * @param {Date} [now=new Date()]
 * @returns {Promise<{ topic: string, mastery: number, quality: number, interval: number, easeFactor: number, nextReviewDate: Date }>}
 */
export async function recordAnswer(documentId, topic, answer = {}, now = new Date()) {
  // Current persisted state for this topic (mastery + schedule).
  const state = await getKnowledgeState(documentId);
  const current = state[topic] ?? {};

  // ── BKT mastery update (binary correctness signal) ──
  const isCorrect = answer.grade != null
    ? gradeIsRecalled(answer.grade)
    : answer.confidence != null
      ? answer.confidence === 'got_it'
      : Boolean(answer.isCorrect);
  const currentMastery = clampMastery(
    typeof current.mastery === 'number' ? current.mastery : getInitialMastery(),
  );
  const mastery = updateMastery(currentMastery, isCorrect);
  await updateKnowledgeState(documentId, topic, mastery);

  // ── SM-2 schedule update ──
  const quality = qualityForAnswer(answer);
  const next = sm2(
    {
      interval: current.interval,
      easeFactor: current.easeFactor,
      repetitions: repetitionsFromInterval(current.interval),
    },
    quality,
    now,
  );
  await updateSchedule(documentId, topic, {
    interval: next.interval,
    easeFactor: next.easeFactor,
    nextReviewDate: next.nextReviewDate,
  });

  return {
    topic,
    mastery,
    quality,
    interval: next.interval,
    easeFactor: next.easeFactor,
    nextReviewDate: next.nextReviewDate,
  };
}

/** Clamp a mastery value into BKT's required [0.01, 0.99] range. */
function clampMastery(m) {
  if (!Number.isFinite(m)) return getInitialMastery();
  return Math.max(0.01, Math.min(0.99, m));
}

/* ── Flashcard grades (Again / Hard / Good / Easy) ─────────────────────────── */

/** The four flashcard grades shown under a revealed review card, easiest last. */
export const REVIEW_GRADES = Object.freeze(['again', 'hard', 'good', 'easy']);

/** SM-2 quality score for each flashcard grade. */
const GRADE_QUALITY = Object.freeze({ again: 1, hard: 3, good: 4, easy: 5 });

/** Map a flashcard grade to an SM-2 quality score (unknown → lowest). */
export function gradeToQuality(grade) {
  return GRADE_QUALITY[grade] ?? GRADE_QUALITY.again;
}

/** Whether a grade counts as a successful recall for BKT mastery. */
export function gradeIsRecalled(grade) {
  return grade === 'good' || grade === 'easy';
}

/**
 * Preview the interval (in days) each grade would schedule for a topic, so the
 * review card can show honest "next in N days" hints before the student rates.
 * Pure: reads only the topic's current schedule state.
 */
export function previewIntervals(state = {}, now = new Date()) {
  const base = {
    interval: state?.interval,
    easeFactor: state?.easeFactor,
    repetitions: repetitionsFromInterval(state?.interval),
  };
  const out = {};
  for (const grade of REVIEW_GRADES) {
    out[grade] = sm2(base, gradeToQuality(grade), now).interval;
  }
  return out;
}
