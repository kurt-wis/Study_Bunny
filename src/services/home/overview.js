/**
 * Home overview — everything the Home and Profile screens show, derived locally
 * from what is already stored on the device (documents, per-topic knowledge
 * state, quiz/review records and the study-time log). The derivations are pure
 * so they can be unit-tested; `loadOverview` is the only function that reads
 * the database.
 */

/** BKT mastery at or above which a topic counts as mastered (matches the Mastery tab). */
export const MASTERED_THRESHOLD = 0.7;

/** Rough seconds per review card, used only for "about N minutes" estimates. */
const SECONDS_PER_CARD = 40;

const SET_COLORS = ['#D9603F', '#6A62D2', '#3B8A6A', '#1A7DB6', '#A8690F', '#B8497E'];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local-calendar day key, 'YYYY-MM-DD'. */
export function dayKey(value) {
  const d = toDate(value) ?? new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function shiftDay(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Current and best run of consecutive study days. The current streak still
 * counts if the last study day was yesterday (today is not over yet).
 */
export function computeStreak(activityDays, now = new Date()) {
  const days = activityDays instanceof Set ? activityDays : new Set(activityDays ?? []);
  let current = 0;
  let cursor = days.has(dayKey(now)) ? now : shiftDay(now, -1);
  while (days.has(dayKey(cursor))) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }
  let best = 0;
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    if (days.has(dayKey(shiftDay(start, -1)))) continue; // not the start of a run
    let run = 0;
    let c = start;
    while (days.has(dayKey(c))) {
      run += 1;
      c = shiftDay(c, 1);
    }
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current) };
}

/** Two-letter tile code for a study set ("Cell Biology" → "CB"). */
export function setCode(title) {
  const words = String(title || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'SB';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function setColor(index) {
  return SET_COLORS[Math.abs(index) % SET_COLORS.length];
}

/** "today" / "yesterday" / "N days ago" for a past date. */
export function relativeDay(value, now = new Date()) {
  const d = toDate(value);
  if (!d) return null;
  const diff = Math.round((shiftDay(now, 0) - shiftDay(d, 0)) / MS_PER_DAY);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff} days ago`;
}

/** "3h 42m" / "18m" / "0m" from seconds. */
export function formatDuration(seconds) {
  const minutes = Math.round(Math.max(0, seconds || 0) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function estimateMinutes(cards) {
  return Math.max(1, Math.round((cards * SECONDS_PER_CARD) / 60));
}

function isDue(record, nowMs) {
  if (record.nextReviewDate == null) return true;
  const t = toDate(record.nextReviewDate);
  return !t || t.getTime() <= nowMs;
}

function isCompleted(quiz) {
  return typeof quiz?.score === 'number' && Array.isArray(quiz?.questions) && quiz.questions.length > 0;
}

/**
 * Pure derivation of the Home/Profile overview.
 *
 * @param {object} input
 * @param {Array} input.documents        document rows ({ id, title, chunks, createdAt })
 * @param {Array} input.knowledge        knowledgeState rows
 * @param {Array} input.quizzes          quiz/review rows
 * @param {object} input.studyLog        { 'YYYY-MM-DD': seconds }
 * @param {Date}   [input.now]
 */
export function deriveOverview({ documents = [], knowledge = [], quizzes = [], studyLog = {}, now = new Date() } = {}) {
  const nowMs = now.getTime();
  const weekAgoMs = nowMs - 7 * MS_PER_DAY;
  const todayKey = dayKey(now);
  const titleById = new Map(documents.map(d => [d.id, d.title]));

  // ── Per-set progress ───────────────────────────────────────────────────────
  const byDoc = new Map();
  for (const r of knowledge) {
    if (!titleById.has(r.documentId)) continue;
    const list = byDoc.get(r.documentId) ?? [];
    list.push(r);
    byDoc.set(r.documentId, list);
  }
  const lastQuizByDoc = new Map();
  for (const q of quizzes) {
    const t = toDate(q.completedAt) ?? (isCompleted(q) ? toDate(q.createdAt) : null);
    if (!t) continue;
    const prev = lastQuizByDoc.get(q.documentId);
    if (!prev || t > prev) lastQuizByDoc.set(q.documentId, t);
  }

  const sets = documents.map((doc, index) => {
    const records = byDoc.get(doc.id) ?? [];
    const masteries = records.map(r => (typeof r.mastery === 'number' ? r.mastery : 0));
    const mastery = masteries.length ? masteries.reduce((a, b) => a + b, 0) / masteries.length : 0;
    const lastTopic = records.reduce((latest, r) => {
      const t = toDate(r.updatedAt);
      return t && (!latest || t > latest) ? t : latest;
    }, null);
    const lastQuiz = lastQuizByDoc.get(doc.id) ?? null;
    const lastReviewed = lastTopic && lastQuiz ? (lastTopic > lastQuiz ? lastTopic : lastQuiz) : (lastTopic ?? lastQuiz);
    return {
      id: doc.id,
      title: doc.title,
      code: setCode(doc.title),
      color: setColor(index),
      topics: records.length,
      sections: Array.isArray(doc.chunks) ? doc.chunks.length : 0,
      due: records.filter(r => isDue(r, nowMs)).length,
      masteryPct: Math.round(mastery * 100),
      lastReviewed,
      createdAt: toDate(doc.createdAt),
    };
  });

  const tracked = knowledge.filter(r => titleById.has(r.documentId));
  const due = sets.reduce((sum, s) => sum + s.due, 0);
  const mastered = tracked.filter(r => (r.mastery ?? 0) >= MASTERED_THRESHOLD).length;
  const masteredThisWeek = tracked.filter(r => {
    const t = toDate(r.updatedAt);
    return (r.mastery ?? 0) >= MASTERED_THRESHOLD && t && t.getTime() >= weekAgoMs;
  }).length;

  // ── Activity: streak + study time ──────────────────────────────────────────
  const activityDays = new Set();
  for (const q of quizzes) {
    const t = toDate(q.completedAt);
    if (t) activityDays.add(dayKey(t));
  }
  for (const [key, seconds] of Object.entries(studyLog ?? {})) {
    if (seconds > 0) activityDays.add(key);
  }
  const streak = computeStreak(activityDays, now);

  let weekSeconds = 0;
  let totalSeconds = 0;
  for (const [key, seconds] of Object.entries(studyLog ?? {})) {
    const s = Number(seconds) || 0;
    totalSeconds += s;
    const [y, m, d] = key.split('-').map(Number);
    if (new Date(y, m - 1, d).getTime() >= shiftDay(now, -6).getTime()) weekSeconds += s;
  }

  // ── Learning curve: the last 7 completed sessions across every set ─────────
  const completed = quizzes
    .filter(isCompleted)
    .map(q => ({
      when: toDate(q.completedAt) ?? toDate(q.createdAt) ?? new Date(0),
      pct: Math.round(Math.max(0, Math.min(1, q.score / q.questions.length)) * 100),
      score: q.score,
      total: q.questions.length,
      source: q.source === 'review' ? 'review' : 'quiz',
      documentId: q.documentId,
      title: titleById.get(q.documentId) ?? 'Deleted notes',
    }))
    .sort((a, b) => a.when - b.when);
  const curve = completed.slice(-7);
  const curveDelta = curve.length >= 2 ? curve[curve.length - 1].pct - curve[0].pct : null;

  const withProgress = sets.filter(s => s.topics > 0);
  const strongest = withProgress.length
    ? withProgress.reduce((a, b) => (b.masteryPct > a.masteryPct ? b : a))
    : null;
  const weakest = withProgress.length
    ? withProgress.reduce((a, b) => (b.masteryPct < a.masteryPct ? b : a))
    : null;

  // ── Today's plan ───────────────────────────────────────────────────────────
  const plan = [];
  for (const s of completed.filter(c => dayKey(c.when) === todayKey).slice(-2)) {
    plan.push({
      key: `done-${s.when.getTime()}`,
      kind: s.source,
      title: s.source === 'review' ? `Review · ${s.title}` : `${s.title} quiz`,
      detail: `${s.score}/${s.total} · Complete`,
      done: true,
      time: s.when,
    });
  }
  if (due > 0) {
    plan.push({
      key: 'review-due',
      kind: 'review',
      title: 'Review due cards',
      detail: `${due} card${due === 1 ? '' : 's'} · ${estimateMinutes(due)} min`,
      to: '/student/review',
    });
  }
  const quizTarget = weakest ?? sets[0] ?? null;
  if (quizTarget) {
    plan.push({
      key: `quiz-${quizTarget.id}`,
      kind: 'quiz',
      title: `${quizTarget.title} quiz`,
      detail: weakest ? `Weakest set · ${quizTarget.masteryPct}% mastery` : 'First quiz for these notes',
      to: `/student/document/${quizTarget.id}/quiz`,
    });
  }

  const firstDates = [
    ...documents.map(d => toDate(d.createdAt)),
    ...completed.map(c => c.when),
  ].filter(Boolean);
  const since = firstDates.length ? new Date(Math.min(...firstDates.map(d => d.getTime()))) : null;

  return {
    sets,
    due,
    dueMinutes: estimateMinutes(due),
    mastered,
    masteredThisWeek,
    streak,
    weekSeconds,
    totalSeconds,
    curve,
    curveDelta,
    strongest,
    weakest,
    plan,
    since,
    todayKey,
  };
}

/** Read everything from the device database and derive the overview. */
export async function loadOverview(now = new Date()) {
  const db = await import('../../db/database.js');
  const [documents, knowledge, quizzes, studyLog] = await Promise.all([
    db.getAllDocuments(),
    db.getAllKnowledgeRecords(),
    db.getAllQuizzes(),
    db.getSetting('studyLog', {}),
  ]);
  return { ...deriveOverview({ documents, knowledge, quizzes, studyLog, now }), documents };
}
