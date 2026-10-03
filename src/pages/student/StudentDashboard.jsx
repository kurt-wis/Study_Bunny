import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDocument, getKnowledgeState, getQuizzesByDocument } from '../../db/database.js';
import { deriveDashboard, seriesLabelFor } from '../../services/dashboard/learningCurve.js';
import LearningCurve from '../../components/LearningCurve.jsx';
import LoadingSpinner from '../../components/shared/LoadingSpinner.jsx';
import ErrorMessage from '../../components/shared/ErrorMessage.jsx';

/**
 * StudentDashboard — the learning-curve Dashboard for a document (Req 7.1–7.4,
 * design §7).
 *
 * Reads the document's quiz/review records and current per-topic mastery, then
 * renders three sections, all derived purely and locally:
 *
 *   1. Learning curve (Req 7.1, 7.2) — mastery per attempt over time via the
 *      pure <LearningCurve> SVG chart, color/label-coded by technique with the
 *      first technique-switch marked as an inflection point.
 *   2. Per-topic mastery bars (Req 7.3) — current BKT mastery, reusing the exact
 *      StudentDocument "Mastery" tab thresholds/markup (<0.4 red "Needs work",
 *      <0.7 yellow "Learning", else green "Mastered"), with text labels so the
 *      status is never color-only.
 *   3. Per-technique effectiveness (Req 7.3) — average mastery gain per session
 *      by technique, plus a source attribution (plain quiz vs guided review).
 *
 * When there isn't enough data to plot a curve, the page shows an encouraging
 * empty state rather than an error (Req 7.4). Conventions mirror the other
 * student screens: header with back button, max-w-2xl layout, Tailwind, ≥48px
 * targets, and `aria-live` on the async content region.
 */

/** Pull per-topic mastery out of a knowledgeState entry (object or bare number). */
function masteryOf(state) {
  return typeof state === 'object' && state !== null ? state.mastery : state;
}

export default function StudentDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const docId = parseInt(id, 10);

  const [doc, setDoc] = useState(null);
  const [knowledgeState, setKnowledgeState] = useState({});
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [docData, ks, quizRecords] = await Promise.all([
          getDocument(docId),
          getKnowledgeState(docId),
          getQuizzesByDocument(docId),
        ]);
        if (cancelled) return;
        if (!docData) {
          navigate('/student');
          return;
        }
        setDoc(docData);
        setKnowledgeState(ks);
        setQuizzes(quizRecords);
      } catch {
        if (!cancelled) setError('Failed to load your dashboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  // All curve / effectiveness / attribution derivation is pure and local.
  const dashboard = useMemo(() => deriveDashboard(quizzes), [quizzes]);

  // Current per-topic mastery bars — weakest first, matching the Mastery tab.
  const masteryTopics = useMemo(
    () =>
      Object.entries(knowledgeState).sort(
        (a, b) => (masteryOf(a[1]) ?? 0) - (masteryOf(b[1]) ?? 0),
      ),
    [knowledgeState],
  );

  const header = (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
        <button
          onClick={() => navigate(`/student/document/${docId}`)}
          className="text-gray-500 hover:text-gray-700 text-xl min-h-[48px] min-w-[48px] flex items-center justify-center"
          aria-label="Back to document"
        >
          ‹
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-800 truncate">Dashboard</h1>
          {doc?.title && <p className="text-xs text-gray-500 truncate">{doc.title}</p>}
        </div>
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {header}
        <main className="max-w-2xl mx-auto px-4 py-8">
          <LoadingSpinner message="Loading your dashboard..." />
        </main>
      </div>
    );
  }

  const { points, inflection, effectiveness, attribution, hasData } = dashboard;

  return (
    <div className="min-h-screen bg-gray-50">
      {header}
      <main className="max-w-2xl mx-auto px-4 py-6" aria-live="polite">
        {error && <div className="mb-4"><ErrorMessage message={error} /></div>}

        {/* ── Section 1: learning curve (Req 7.1, 7.2) ─────────────────────── */}
        <section className="space-y-3">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">Learning curve</h2>
            <p className="text-sm text-gray-500">
              Your mastery per attempt over time{inflection ? ', color-coded by technique.' : '.'}
            </p>
          </div>

          {hasData ? (
            <LearningCurve points={points} />
          ) : (
            // Encouraging empty state — never an error (Req 7.4).
            <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 shadow-sm">
              <div className="text-5xl mb-3" aria-hidden="true">🌱</div>
              <h3 className="font-bold text-gray-800 mb-1">Your curve starts with your first quiz</h3>
              <p className="text-gray-500 text-sm">
                Take a quiz or run a review session and your learning curve will grow here —
                one point per attempt.
              </p>
              <button
                onClick={() => navigate(`/student/document/${docId}/quiz`)}
                className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl min-h-[48px] transition-colors"
              >
                ✏️ Take a quiz
              </button>
            </div>
          )}
        </section>

        {/* ── Section 2: current per-topic mastery (Req 7.3) ───────────────── */}
        <section className="space-y-3 mt-8">
          <h2 className="font-bold text-gray-800 text-lg">Topic mastery</h2>
          {masteryTopics.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center border border-gray-100">
              <div className="text-4xl mb-2" aria-hidden="true">📊</div>
              <p className="text-gray-500 text-sm">No mastery data yet — take a quiz to start tracking.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {masteryTopics.map(([topic, state]) => {
                const mastery = masteryOf(state) ?? 0;
                const pct = Math.round(mastery * 100);
                // Thresholds + markup reused verbatim from the StudentDocument
                // Mastery tab so the two views agree (Req 7.3).
                const color = mastery < 0.4 ? 'bg-red-400' : mastery < 0.7 ? 'bg-yellow-400' : 'bg-green-500';
                const label = mastery < 0.4 ? 'Needs work' : mastery < 0.7 ? 'Learning' : 'Mastered';
                return (
                  <div key={topic} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 truncate">{topic}</span>
                      <span className="text-sm text-gray-500 shrink-0 ml-2">{pct}% · {label}</span>
                    </div>
                    <div
                      className="h-2 bg-gray-100 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${topic}: ${pct} percent, ${label}`}
                    >
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Section 3: per-technique effectiveness + attribution (Req 7.3) ─ */}
        <section className="space-y-3 mt-8">
          <h2 className="font-bold text-gray-800 text-lg">What's working</h2>
          {hasData ? (
            <>
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Average mastery gain per session
                </h3>
                <div className="space-y-3">
                  {effectiveness.map(e => {
                    const gainPts = Math.round(e.avgGain * 100);
                    const sign = gainPts > 0 ? '+' : '';
                    // Bar width maps |gain| onto 0–100% of a half-track; direction
                    // is also stated in text so it is never color-only.
                    const width = Math.min(100, Math.abs(gainPts) * 2);
                    const positive = gainPts >= 0;
                    return (
                      <div key={e.technique}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700 inline-flex items-center gap-1.5">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: e.color }}
                              aria-hidden="true"
                            />
                            {e.label}
                          </span>
                          <span className="text-sm text-gray-500 shrink-0 ml-2">
                            {sign}{gainPts} pts · {e.sessions} session{e.sessions === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${positive ? 'bg-green-500' : 'bg-red-400'}`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Gain is how much your mastery moved on average each session with that technique.
                </p>
              </div>

              {/* Source attribution: plain quiz vs guided review */}
              <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Where your attempts came from
                </h3>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-800">{attribution.quiz}</span> from plain
                  quizzes and{' '}
                  <span className="font-semibold text-gray-800">{attribution.review}</span> from guided
                  review{attribution.review === 1 ? '' : 's'} — {attribution.total} attempt
                  {attribution.total === 1 ? '' : 's'} in all.
                </p>
              </div>

              {inflection && (
                <p className="text-xs text-gray-500 px-1">
                  You switched from {seriesLabelFor(inflection.from)} to{' '}
                  {seriesLabelFor(inflection.to)} at attempt {inflection.attempt}; the dashed line on
                  the curve marks the change.
                </p>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl p-6 text-center border border-gray-100">
              <p className="text-gray-500 text-sm">
                Once you've studied with a few techniques, you'll see which one moves your mastery most.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
