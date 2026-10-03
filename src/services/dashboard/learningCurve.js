/**
 * Dashboard data derivation — pure, local, network-free (Req 7.1–7.4).
 *
 * The Dashboard reads all `quizzes` for a document and turns them into:
 *   - a learning curve: one point per attempt, ordered by time, carrying the
 *     attempt's fractional mastery (score / question count), the technique that
 *     produced it, and its source (plain `quiz` vs guided `review`) (Req 7.1);
 *   - the inflection point: the first attempt whose technique differs from the
 *     first attempt's technique — i.e. where the student first switched methods
 *     (Req 7.2, v5 §8.4 algorithm, used verbatim);
 *   - a per-technique effectiveness comparison: the average mastery *gain* per
 *     session, grouped by technique (Req 7.3).
 *
 * Everything here is a pure function of the persisted quiz records: no Dexie, no
 * network, no React. That keeps it unit-testable under `node --test` and makes
 * the Dashboard component a thin renderer over the derived shapes.
 *
 * ── Quiz record shape (from `src/db/database.js`) ────────────────────────────
 *   { id, documentId, tier, questions: [...], score: number|null,
 *     completedAt, createdAt, source?: 'quiz'|'review', technique?: string|null }
 *
 * `score` is the count of correct answers; the fractional mastery for the
 * attempt is `score / questions.length`. Records without a completed score are
 * not plottable and are skipped.
 */

/** Techniques are color/label-coded on the curve (Req 7.2). `null` = plain quiz. */
export const CURVE_SERIES = {
  plain: { key: 'plain', label: 'Plain quiz', color: '#6366f1' },      // indigo-500
  pomodoro: { key: 'pomodoro', label: 'Pomodoro', color: '#f59e0b' },  // amber-500
  feynman: { key: 'feynman', label: 'Feynman', color: '#10b981' },     // emerald-500
  spaced_repetition: { key: 'spaced_repetition', label: 'Spaced Repetition', color: '#8b5cf6' }, // violet-500
};

/** Resolve a quiz record's technique to a known curve series key. */
export function seriesKeyFor(technique) {
  return technique && CURVE_SERIES[technique] ? technique : 'plain';
}

/** Human label for a technique key (`null`/unknown → "Plain quiz"). */
export function seriesLabelFor(technique) {
  return CURVE_SERIES[seriesKeyFor(technique)].label;
}

/** Color for a technique key (`null`/unknown → plain color). */
export function seriesColorFor(technique) {
  return CURVE_SERIES[seriesKeyFor(technique)].color;
}

/** Milliseconds for a date-ish value, or null if it isn't a usable date. */
function timeOf(value) {
  if (value == null) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Count of questions in a quiz record, defensive against odd shapes. */
function questionCount(quiz) {
  return Array.isArray(quiz?.questions) ? quiz.questions.length : 0;
}

/**
 * Build the learning-curve points from a document's quiz records.
 *
 * Only completed, plottable attempts are kept (a numeric `score` and at least
 * one question). Points are ordered oldest → newest by `createdAt` (falling back
 * to `completedAt`), each carrying its 0–1 `mastery`, the resolved technique
 * series, and its source. `attempt` is a 1-based index into the ordered series.
 *
 * @param {Array<object>} quizzes - raw quiz records (any order)
 * @returns {Array<{
 *   attempt: number,
 *   mastery: number,
 *   score: number,
 *   total: number,
 *   technique: string,     // resolved series key ('plain' | technique)
 *   source: 'quiz'|'review',
 *   createdAt: Date|null,
 *   label: string,         // accessible per-point text label
 * }>}
 */
export function buildCurvePoints(quizzes) {
  if (!Array.isArray(quizzes)) return [];

  const plottable = quizzes
    .map(q => {
      const total = questionCount(q);
      const score = typeof q?.score === 'number' ? q.score : null;
      const t = timeOf(q?.createdAt) ?? timeOf(q?.completedAt);
      if (score == null || total <= 0) return null;
      return {
        _time: t ?? 0,
        mastery: Math.max(0, Math.min(1, score / total)),
        score,
        total,
        technique: seriesKeyFor(q?.technique),
        source: q?.source === 'review' ? 'review' : 'quiz',
        createdAt: t != null ? new Date(t) : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a._time - b._time);

  return plottable.map((p, i) => {
    const pct = Math.round(p.mastery * 100);
    const when = p.createdAt
      ? p.createdAt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
      : null;
    const srcLabel = p.source === 'review' ? 'review' : 'quiz';
    const label =
      `Attempt ${i + 1}: ${pct}% ` +
      `(${p.score}/${p.total}) via ${seriesLabelFor(p.technique)} ${srcLabel}` +
      (when ? `, ${when}` : '');
    return {
      attempt: i + 1,
      mastery: p.mastery,
      score: p.score,
      total: p.total,
      technique: p.technique,
      source: p.source,
      createdAt: p.createdAt,
      label,
    };
  });
}

/**
 * Find the inflection point: the 1-based attempt index where the technique first
 * changes from the first attempt's technique (Req 7.2, v5 §8.4). Returns `null`
 * when there is no switch (fewer than two techniques across the curve), so the
 * marker is only drawn when a switch actually happened.
 *
 * @param {Array<{attempt:number, technique:string}>} points - ordered curve points
 * @returns {{ attempt: number, from: string, to: string } | null}
 */
export function findInflection(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const first = points[0].technique;
  for (let i = 1; i < points.length; i++) {
    if (points[i].technique !== first) {
      return { attempt: points[i].attempt, from: first, to: points[i].technique };
    }
  }
  return null;
}

/** Distinct technique series present across the ordered points, in first-seen order. */
export function techniquesInCurve(points) {
  if (!Array.isArray(points)) return [];
  const seen = [];
  for (const p of points) {
    if (!seen.includes(p.technique)) seen.push(p.technique);
  }
  return seen;
}

/**
 * Per-technique effectiveness: average mastery *gain per session*, grouped by
 * technique (Req 7.3). The gain for an attempt is its mastery minus the previous
 * attempt's mastery (the first attempt has no prior, so it contributes 0 gain but
 * still counts as a session). Techniques are returned sorted by descending
 * average gain so the most effective method surfaces first.
 *
 * @param {Array<{mastery:number, technique:string}>} points - ordered curve points
 * @returns {Array<{
 *   technique: string,  // series key
 *   label: string,
 *   color: string,
 *   sessions: number,
 *   avgGain: number,    // average per-session mastery change in [-1, 1]
 * }>}
 */
export function techniqueEffectiveness(points) {
  if (!Array.isArray(points) || points.length === 0) return [];

  const groups = new Map(); // technique → { gainSum, sessions }
  let prevMastery = null;
  for (const p of points) {
    const gain = prevMastery == null ? 0 : p.mastery - prevMastery;
    const g = groups.get(p.technique) ?? { gainSum: 0, sessions: 0 };
    g.gainSum += gain;
    g.sessions += 1;
    groups.set(p.technique, g);
    prevMastery = p.mastery;
  }

  return Array.from(groups.entries())
    .map(([technique, { gainSum, sessions }]) => ({
      technique,
      label: seriesLabelFor(technique),
      color: seriesColorFor(technique),
      sessions,
      avgGain: sessions > 0 ? gainSum / sessions : 0,
    }))
    .sort((a, b) => b.avgGain - a.avgGain);
}

/**
 * Source attribution: how many plottable attempts came from a plain quiz vs the
 * guided Review flow (Req 7.3 — "source attribution quiz vs review").
 *
 * @param {Array<{source:'quiz'|'review'}>} points - ordered curve points
 * @returns {{ quiz: number, review: number, total: number }}
 */
export function sourceAttribution(points) {
  const result = { quiz: 0, review: 0, total: 0 };
  if (!Array.isArray(points)) return result;
  for (const p of points) {
    if (p.source === 'review') result.review += 1;
    else result.quiz += 1;
    result.total += 1;
  }
  return result;
}

/**
 * One-shot derivation of everything the Dashboard renders from raw quiz records.
 * Pure and total — never throws on odd input, returns empty-but-valid shapes so
 * the component can show its encouraging empty state (Req 7.4).
 *
 * @param {Array<object>} quizzes
 * @returns {{
 *   points: ReturnType<typeof buildCurvePoints>,
 *   inflection: ReturnType<typeof findInflection>,
 *   techniques: string[],
 *   effectiveness: ReturnType<typeof techniqueEffectiveness>,
 *   attribution: ReturnType<typeof sourceAttribution>,
 *   hasData: boolean,
 * }}
 */
export function deriveDashboard(quizzes) {
  const points = buildCurvePoints(quizzes);
  return {
    points,
    inflection: findInflection(points),
    techniques: techniquesInCurve(points),
    effectiveness: techniqueEffectiveness(points),
    attribution: sourceAttribution(points),
    hasData: points.length > 0,
  };
}
