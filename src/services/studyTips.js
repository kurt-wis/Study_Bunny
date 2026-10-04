/**
 * Study tips — short, personal recommendations for one lesson, worked out
 * offline from what is already on the device: the lesson's size and key terms,
 * per-topic mastery, what is due, and recent scores. Pure and total: no
 * network, never throws, at most four tips so they actually get read.
 */
import { recommendTechnique } from './techniqueEngine.js';

const WEAK = 0.6;
const MASTERED = 0.7;
const LONG_LESSON_WORDS = 1500;
const MANY_TERMS = 6;
const MAX_TIPS = 4;

function masteryOf(state) {
  const m = typeof state === 'object' && state !== null ? state.mastery : state;
  return typeof m === 'number' && Number.isFinite(m) ? m : 0;
}

function isDue(state, nowMs) {
  if (typeof state !== 'object' || state === null || state.nextReviewDate == null) return true;
  const t = new Date(state.nextReviewDate).getTime();
  return Number.isNaN(t) || t <= nowMs;
}

/**
 * @param {object} input
 * @param {number} input.documentId
 * @param {string} [input.rawText]            the lesson text
 * @param {string[]} [input.keyTopics]        key terms from the summary
 * @param {object} [input.knowledgeState]     { topic: { mastery, nextReviewDate } }
 * @param {Array}  [input.quizzes]            quiz/review records for this lesson
 * @param {string|null} [input.technique]     technique currently chosen
 * @param {Date}   [input.now]
 * @returns {Array<{ id: string, title: string, text: string, action?: { label: string, to: string } }>}
 */
export function buildStudyTips({
  documentId,
  rawText = '',
  keyTopics = [],
  knowledgeState = {},
  quizzes = [],
  technique = null,
  now = new Date(),
} = {}) {
  const base = `/student/document/${documentId}`;
  const tips = [];
  const topics = Object.entries(knowledgeState ?? {}).map(([topic, st]) => ({ topic, mastery: masteryOf(st), state: st }));
  const scored = (Array.isArray(quizzes) ? quizzes : [])
    .filter(q => typeof q?.score === 'number' && Array.isArray(q?.questions) && q.questions.length > 0)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const words = String(rawText ?? '').split(/\s+/).filter(Boolean).length;

  // 1. Nothing measured yet → start with a quiz.
  if (scored.length === 0) {
    tips.push({
      id: 'first-quiz',
      title: 'Start with a short quiz',
      text: 'Take one quiz before you read again. It shows what you already know, so you only study what you need.',
      action: { label: 'Take a quiz', to: `${base}/quiz` },
    });
  }

  // 2. Weakest topic → explain it in your own words.
  const weak = topics.filter(t => t.mastery < WEAK).sort((a, b) => a.mastery - b.mastery);
  if (weak.length > 0) {
    const w = weak[0];
    tips.push({
      id: 'weakest-topic',
      title: `Work on "${w.topic}" first`,
      text: `This is your weakest topic (${Math.round(w.mastery * 100)}%). Try to explain it in your own words, then check it against your notes.`,
      action: { label: 'Explain this topic', to: `${base}/review?technique=feynman&topic=${encodeURIComponent(w.topic)}` },
    });
  }

  // 3. Low or stuck scores → change how you study.
  if (scored.length > 0) {
    const history = scored.map(q => q.score / q.questions.length);
    const rec = recommendTechnique({
      currentHabit: technique,
      quizScore: history[history.length - 1],
      masteryHistory: history,
      weakTopics: weak.map(t => t.topic),
    });
    if (rec.action === 'switch' && rec.technique) {
      tips.push({
        id: 'switch-technique',
        title: 'Change how you study this lesson',
        text: rec.reason,
        action: { label: 'Start a review', to: `${base}/review?technique=${encodeURIComponent(rec.technique)}` },
      });
    }
  }

  // 4. Things due today → short flashcard review.
  const due = topics.filter(t => isDue(t.state, now.getTime())).length;
  if (due > 0 && scored.length > 0) {
    tips.push({
      id: 'due-today',
      title: `${due} topic${due === 1 ? ' is' : 's are'} due for review`,
      text: 'A few minutes of flashcards today keeps them in your memory longer than one long session later.',
      action: { label: 'Review with flashcards', to: `${base}/review?technique=spaced_repetition&start=1` },
    });
  }

  // 5. Lesson content: long lesson → focus blocks.
  if (words >= LONG_LESSON_WORDS) {
    tips.push({
      id: 'long-lesson',
      title: 'This is a long lesson. Study it in blocks',
      text: `It has about ${Math.round(words / 100) * 100} words. Study for 25 minutes, rest for 5, and do one part at a time.`,
      action: { label: 'Review with a focus timer', to: `${base}/review?technique=pomodoro` },
    });
  }

  // 6. Lesson content: many terms → flashcards.
  if ((keyTopics?.length ?? 0) >= MANY_TERMS) {
    tips.push({
      id: 'many-terms',
      title: 'Lots of terms to remember',
      text: `This lesson has ${keyTopics.length} key terms. Flashcards work better than re-reading for remembering terms.`,
      action: { label: 'Review with flashcards', to: `${base}/review?technique=spaced_repetition&start=1` },
    });
  }

  // 7. Everything mastered → keep it fresh.
  if (topics.length > 0 && topics.every(t => t.mastery >= MASTERED)) {
    tips.push({
      id: 'keep-fresh',
      title: 'You know this lesson well',
      text: 'Do a short review when topics come due so you do not forget it before the exam.',
    });
  }

  // De-duplicate identical actions (keep the first, more specific tip).
  const seen = new Set();
  return tips
    .filter(t => {
      const key = t.action?.to ?? t.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TIPS);
}
