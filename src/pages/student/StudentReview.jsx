import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { TECHNIQUES } from '../../services/techniqueEngine.js';
import {
  startSession,
  recordAnswer,
  CONFIDENCE_RATINGS,
} from '../../services/spacedRepetition/index.js';
import { evaluateFeynman, FEYNMAN_SELF_RATINGS } from '../../services/feynman/index.js';
import { tfidfSearch } from '../../utils/tfidf.js';
import {
  getAllDocuments,
  getDocument,
  getKnowledgeState,
  tagQuizSource,
  updateQuizScore,
} from '../../db/database.js';
import PomodoroTimer from '../../components/PomodoroTimer.jsx';
import TierBadge from '../../components/shared/TierBadge.jsx';
import LoadingSpinner from '../../components/shared/LoadingSpinner.jsx';
import ErrorMessage from '../../components/shared/ErrorMessage.jsx';

/**
 * StudentReview — the guided Review section (Req 5.1–5.5, design §6).
 *
 * One page, three steps:
 *   1. technique  — pick one of the three in-scope techniques, with any
 *                   recommendation (from the diagnosis CTA's `?technique=`)
 *                   highlighted (Req 5.1).
 *   2. document   — pick which document to review; each row surfaces its weak
 *                   topics (BKT mastery < 0.6) so the student can focus (Req 5.2).
 *   3. session    — a technique-specific session at the effective tier (Req 5.3):
 *                     • Spaced Repetition → the existing quiz engine via the SR
 *                       orchestrator, with a per-question confidence rating that
 *                       feeds SM-2 (Req 4.2, 4.4);
 *                     • Feynman → the "explain without looking" text-input flow
 *                       with a hide-then-reveal source passage, evaluated by the
 *                       Feynman service (coverage / gaps / matched passages +
 *                       self-rating) (Req 3.2, 3.3);
 *                     • Pomodoro → a timer overlay wrapping an SR quiz session
 *                       (Pomodoro is a modifier on a session, per the CSV).
 *
 * Results update BKT (and SM-2 for Spaced Repetition) and tag the session with
 * `source: 'review'` + the `technique` used (Req 5.4). The flow is reachable from
 * the post-quiz diagnosis CTA (via `?technique=`/`?topic=`) and the document's
 * top-level Review entry (Req 5.5).
 *
 * Conventions mirror StudentQuiz/StudentDocument: Tailwind, ≥48px targets,
 * labelled controls, `role="status"`/`aria-live` for async results, and an
 * effective-tier `TierBadge` sourced from the service result (never a preference).
 */

/** BKT mastery below which a topic counts as "weak" (Req 5.2, matches StudentQuiz). */
const WEAK_MASTERY_THRESHOLD = 0.6;

/** Only these three techniques are in scope for a guided Review session (Req 5.1). */
const REVIEW_TECHNIQUES = ['spaced_repetition', 'feynman', 'pomodoro'];

const TECHNIQUE_META = {
  spaced_repetition: { icon: '🔁', blurb: 'Resurface due topics and rate your confidence.' },
  feynman: { icon: '🗣️', blurb: 'Explain a topic from memory, then see the gaps.' },
  pomodoro: { icon: '⏱️', blurb: 'Review in a timed focus block.' },
};

const CONFIDENCE_LABELS = {
  got_it: { label: 'Got it', icon: '✅' },
  partial: { label: 'Partially', icon: '🤔' },
  missed_it: { label: 'Missed it', icon: '❌' },
};

const SELF_RATING_LABELS = {
  got_it: { label: 'Got it', icon: '✅' },
  partial: { label: 'Partially', icon: '🤔' },
  missed: { label: 'Missed it', icon: '❌' },
};

/** Pull the per-topic mastery out of a knowledgeState entry (object or bare number). */
function masteryOf(state) {
  return typeof state === 'object' && state !== null ? state.mastery : state;
}

/** Format a Date (or date-ish) as a short, locale-friendly day label. */
function formatDue(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StudentReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const docId = parseInt(id, 10);

  // Deep-link params carried from the diagnosis CTA and the weak-topic links
  // (Req 5.5, 6.5, and StudentQuiz's Feynman prompt): a pre-set technique and an
  // optional topic to zero in on.
  const techniqueParam = searchParams.get('technique');
  const topicParam = searchParams.get('topic');
  const presetTechnique =
    techniqueParam && REVIEW_TECHNIQUES.includes(techniqueParam) ? techniqueParam : null;

  // ── Stepper state ──────────────────────────────────────────────────────────
  // technique → document → session. A valid `?technique=` skips step 1.
  const [step, setStep] = useState(presetTechnique ? 'document' : 'technique');
  const [technique, setTechnique] = useState(presetTechnique);
  const [selectedDocId, setSelectedDocId] = useState(Number.isNaN(docId) ? null : docId);

  const [docs, setDocs] = useState([]);
  const [weakByDoc, setWeakByDoc] = useState({}); // documentId → [{topic, mastery}]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Load the document list + each document's weak topics (Req 5.1, 5.2) ──────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await getAllDocuments();
        const weakEntries = await Promise.all(
          all.map(async d => {
            const ks = await getKnowledgeState(d.id);
            const weak = Object.entries(ks)
              .map(([topic, s]) => ({ topic, mastery: masteryOf(s) }))
              .filter(t => typeof t.mastery === 'number' && t.mastery < WEAK_MASTERY_THRESHOLD)
              .sort((a, b) => a.mastery - b.mastery);
            return [d.id, weak];
          }),
        );
        if (cancelled) return;
        setDocs(all);
        setWeakByDoc(Object.fromEntries(weakEntries));
      } catch {
        if (!cancelled) setError('Failed to load your documents for review.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function pickTechnique(key) {
    setTechnique(key);
    setStep('document');
  }

  function pickDocument(chosenId) {
    setSelectedDocId(chosenId);
    setStep('session');
  }

  function backToDocument() {
    setStep('document');
  }

  function backToTechnique() {
    // When a technique was pre-set from the CTA there's no step 1 to return to;
    // go back to the document instead so the student is never stranded.
    setStep(presetTechnique ? 'document' : 'technique');
  }

  const headerBackTarget = Number.isNaN(docId) ? '/student' : `/student/document/${docId}`;

  // ── Header (shared across steps) ─────────────────────────────────────────────
  const header = (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
        <button
          onClick={() => {
            if (step === 'session') backToDocument();
            else if (step === 'document' && !presetTechnique) backToTechnique();
            else navigate(headerBackTarget);
          }}
          className="text-gray-500 hover:text-gray-700 text-xl min-h-[48px] min-w-[48px] flex items-center justify-center"
          aria-label="Back"
        >
          ‹
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-800">Review</h1>
          {technique && (
            <p className="text-xs text-gray-500 truncate">
              {TECHNIQUE_META[technique]?.icon} {TECHNIQUES[technique]?.name}
            </p>
          )}
        </div>
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {header}
        <main className="max-w-2xl mx-auto px-4 py-8">
          <LoadingSpinner message="Loading your review..." />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {header}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {error && <div className="mb-4"><ErrorMessage message={error} /></div>}

        {/* ── Step 1: technique pick (recommendation highlighted) (Req 5.1) ──── */}
        {step === 'technique' && (
          <TechniqueStep recommended={presetTechnique} onPick={pickTechnique} />
        )}

        {/* ── Step 2: document pick with weak topics (Req 5.1, 5.2) ──────────── */}
        {step === 'document' && (
          <DocumentStep
            docs={docs}
            weakByDoc={weakByDoc}
            defaultDocId={Number.isNaN(docId) ? null : docId}
            onPick={pickDocument}
          />
        )}

        {/* ── Step 3: technique-specific session (Req 5.3, 5.4) ──────────────── */}
        {step === 'session' && selectedDocId != null && (
          <ReviewSession
            key={`${technique}-${selectedDocId}`}
            documentId={selectedDocId}
            technique={technique}
            initialTopic={topicParam}
            weakTopics={weakByDoc[selectedDocId] ?? []}
            onExit={() => navigate(`/student/document/${selectedDocId}`)}
            onDashboard={() => navigate(`/student/document/${selectedDocId}/dashboard`)}
          />
        )}
      </main>
    </div>
  );
}

/* ───────────────────────────── Step 1: technique ──────────────────────────── */

function TechniqueStep({ recommended, onPick }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-gray-800 text-lg">Pick a technique</h2>
        <p className="text-sm text-gray-500">
          Choose how you want to review. We’ll tailor the session to it.
        </p>
      </div>
      <div className="grid gap-3" role="group" aria-label="Review techniques">
        {REVIEW_TECHNIQUES.map(key => {
          const meta = TECHNIQUE_META[key];
          const isRecommended = recommended === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              className={`text-left p-4 rounded-2xl border-2 transition-all min-h-[48px] ${
                isRecommended
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-gray-200 bg-white hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">{meta.icon}</span>
                <span className="font-semibold text-gray-800">{TECHNIQUES[key].name}</span>
                {isRecommended && (
                  <span className="ml-auto text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                    ★ Recommended
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">{meta.blurb}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────────── Step 2: document ──────────────────────────── */

function DocumentStep({ docs, weakByDoc, defaultDocId, onPick }) {
  if (docs.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 shadow-sm">
        <div className="text-5xl mb-3" aria-hidden="true">📄</div>
        <h2 className="font-bold text-gray-800 mb-1">No documents yet</h2>
        <p className="text-gray-500 text-sm">
          Upload some notes and take a quiz first, then come back to review.
        </p>
        <Link
          to="/student"
          className="mt-4 inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl min-h-[48px] transition-colors"
        >
          Go to my documents
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-gray-800 text-lg">Pick a document</h2>
        <p className="text-sm text-gray-500">Weak topics (below 60% mastery) are shown so you can focus.</p>
      </div>
      <div className="space-y-3">
        {docs.map(d => {
          const weak = weakByDoc[d.id] ?? [];
          const isDefault = d.id === defaultDocId;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onPick(d.id)}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-all min-h-[48px] ${
                isDefault
                  ? 'border-indigo-300 bg-indigo-50/40'
                  : 'border-gray-200 bg-white hover:border-indigo-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800 truncate">{d.title}</span>
                {isDefault && (
                  <span className="ml-auto shrink-0 text-xs text-indigo-600 font-medium">Current</span>
                )}
              </div>
              {weak.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2" aria-label="Weak topics">
                  {weak.slice(0, 4).map(t => (
                    <span
                      key={t.topic}
                      className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-full"
                    >
                      {t.topic} · {Math.round(t.mastery * 100)}%
                    </span>
                  ))}
                  {weak.length > 4 && (
                    <span className="text-xs text-gray-500 px-1 py-1">+{weak.length - 4} more</span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500 mt-1">No weak topics — review to stay sharp.</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────────── Step 3: session ───────────────────────────── */

function ReviewSession({ documentId, technique, initialTopic, weakTopics, onExit, onDashboard }) {
  // Pomodoro is a *modifier*: it wraps an underlying session (defaults to the
  // Spaced-Repetition quiz) in the timer overlay (design §6).
  const underlying = technique === 'pomodoro' ? 'spaced_repetition' : technique;
  const withPomodoro = technique === 'pomodoro';

  return (
    <div className="space-y-4">
      {withPomodoro && <PomodoroTimer className="mb-2" />}
      {underlying === 'spaced_repetition' ? (
        <SpacedRepetitionSession
          documentId={documentId}
          technique={technique}
          onExit={onExit}
          onDashboard={onDashboard}
        />
      ) : (
        <FeynmanSession
          documentId={documentId}
          initialTopic={initialTopic}
          weakTopics={weakTopics}
          onExit={onExit}
          onDashboard={onDashboard}
        />
      )}
    </div>
  );
}

/* ── Spaced Repetition review session (quiz-shaped + confidence) ───────────── */

function SpacedRepetitionSession({ documentId, technique, onExit, onDashboard }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null); // { tier, questions, quizId, dueTopics }
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false); // answer shown for current Q
  const [inputValue, setInputValue] = useState('');
  const [confidence, setConfidence] = useState(null); // current Q confidence rating
  const [results, setResults] = useState([]); // per-question { topic, isCorrect, nextReviewDate }
  const [finished, setFinished] = useState(false);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const resultHeadingRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const s = await startSession(documentId);
        if (cancelled) return;
        // Tag the session's quiz record as review-sourced for the Dashboard (Req 5.4).
        if (s.quizId != null) {
          try {
            await tagQuizSource(s.quizId, { source: 'review', technique });
          } catch {
            /* best-effort tagging; the session still runs */
          }
        }
        setSession(s);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to start the review session.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, technique]);

  useEffect(() => {
    if (finished) resultHeadingRef.current?.focus();
  }, [finished]);

  const questions = session?.questions ?? [];
  const total = questions.length;
  const currentQ = questions[index];

  function checkCorrect(q, answer) {
    if (!answer) return false;
    if (q.type === 'fill_in_blank') {
      const acceptable = q.acceptable_answers ?? [q.correct_answer];
      return acceptable.some(a => String(a).toLowerCase() === String(answer).toLowerCase().trim());
    }
    return answer === q.correct_answer;
  }

  const [selected, setSelected] = useState(null); // current T/F selection

  function reveal() {
    setRevealed(true);
  }

  async function commitAndNext() {
    if (savingAnswer) return;
    setSavingAnswer(true);
    const q = currentQ;
    const answer = q.type === 'fill_in_blank' ? inputValue.trim() : selected;
    const isCorrect = checkCorrect(q, answer);
    const topic = q.topic || 'general';

    // Update BKT mastery AND the SM-2 schedule for this topic (Req 4.2, 4.4).
    // The confidence rating (when given) drives the SM-2 quality score; BKT
    // always follows the binary correctness signal.
    let schedule = null;
    try {
      schedule = await recordAnswer(
        documentId,
        topic,
        { isCorrect, ...(confidence != null ? { confidence } : {}) },
      );
    } catch {
      setError('Could not save this review answer. Check your device storage and try again.');
      setSavingAnswer(false);
      return;
    }

    const nextResults = [
      ...results,
      { topic, isCorrect, confidence, nextReviewDate: schedule?.nextReviewDate ?? null },
    ];
    setResults(nextResults);

    // Reset per-question state and advance (or finish).
    setRevealed(false);
    setInputValue('');
    setConfidence(null);
    setSelected(null);
    if (index < total - 1) {
      setIndex(i => i + 1);
    } else {
      try {
        const correctCount = nextResults.filter(r => r.isCorrect).length;
        const state = await getKnowledgeState(documentId);
        const topics = [...new Set(nextResults.map(r => r.topic))];
        const masteryAfter = topics.length
          ? topics.reduce((sum, name) => sum + (state[name]?.mastery ?? 0), 0) / topics.length
          : session.masteryBefore;
        if (session.quizId != null) {
          await updateQuizScore(session.quizId, correctCount, {
            masteryBefore: session.masteryBefore,
            masteryAfter,
          });
        }
      } catch {
        setError('Your answers are saved, but the session summary could not be updated.');
      }
      setFinished(true);
    }
    setSavingAnswer(false);
  }

  if (loading) return <LoadingSpinner message="Finding your due topics..." />;
  if (error) return <ErrorMessage message={error} onRetry={onExit} />;

  if (total === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 shadow-sm" role="status">
        <div className="text-5xl mb-3" aria-hidden="true">🎉</div>
        <h2 className="font-bold text-gray-800 mb-1">Nothing due right now</h2>
        <p className="text-gray-500 text-sm">
          You’re all caught up on spaced repetition for this document. Check back later.
        </p>
        <button
          onClick={onExit}
          className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl min-h-[48px] transition-colors"
        >
          Back to document
        </button>
      </div>
    );
  }

  // ── Results summary (Req 4.5: next due dates + per-topic recap) ────────────
  if (finished) {
    const correctCount = results.filter(r => r.isCorrect).length;
    return (
      <div className="space-y-4">
        <div
          className="bg-white rounded-2xl p-8 shadow-md text-center"
          role="status"
          aria-live="polite"
        >
          <div className="text-6xl mb-3" aria-hidden="true">
            {correctCount >= total * 0.8 ? '🎉' : correctCount >= total * 0.5 ? '👍' : '📚'}
          </div>
          <h2
            ref={resultHeadingRef}
            tabIndex={-1}
            className="text-3xl font-bold text-indigo-700 mb-1 outline-none"
          >
            {correctCount}/{total}
          </h2>
          <p className="text-gray-500">Review complete</p>
          <div className="mt-3">
            <TierBadge tier={session.tier} />
          </div>
        </div>

        {/* Next due dates for the topics reviewed (Req 4.5) */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">Next review</h3>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 truncate">
                  {r.isCorrect ? '✅' : '❌'} {r.topic}
                </span>
                <span className="text-gray-500 shrink-0 ml-2">
                  {formatDue(r.nextReviewDate) ? `Due ${formatDue(r.nextReviewDate)}` : 'Scheduled'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={onDashboard}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl min-h-[48px] transition-colors"
          >
            📈 See my learning curve
          </button>
          <button
            onClick={onExit}
            className="w-full border border-gray-200 text-gray-600 font-medium py-3 rounded-xl min-h-[48px]"
          >
            Back to document
          </button>
        </div>
      </div>
    );
  }

  // ── Active question ─────────────────────────────────────────────────────────
  const answered =
    currentQ.type === 'fill_in_blank' ? inputValue.trim().length > 0 : selected != null;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-800">Topic {index + 1}/{total}</span>
        <TierBadge tier={session.tier} />
        {currentQ.topic && (
          <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
            🔁 {currentQ.topic}
          </span>
        )}
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${(index / total) * 100}%` }}
        />
      </div>

      <fieldset className="border-0 p-0 m-0">
        <legend className="bg-white rounded-2xl p-6 shadow-md mb-4 w-full">
          <p className="text-gray-800 text-lg leading-relaxed whitespace-pre-line">{currentQ.question}</p>
        </legend>

        {/* True/False options */}
        {currentQ.type === 'true_false' && (
          <div className="space-y-3">
            {(currentQ.options ?? ['True', 'False']).map(option => {
              const isSel = selected === option;
              const correct = revealed && option === currentQ.correct_answer;
              const wrong = revealed && isSel && option !== currentQ.correct_answer;
              return (
                <button
                  key={option}
                  onClick={() => !revealed && setSelected(option)}
                  disabled={revealed}
                  aria-pressed={isSel}
                  className={`w-full p-4 rounded-xl border-2 text-left font-medium text-lg transition-all min-h-[56px] ${
                    wrong ? 'border-red-400 bg-red-50 text-red-700' :
                    correct ? 'border-green-400 bg-green-50 text-green-700' :
                    isSel ? 'border-indigo-400 bg-indigo-50 text-indigo-700' :
                    'border-gray-200 bg-white hover:border-indigo-200 text-gray-700'
                  }`}
                >
                  {option}
                  {revealed && correct && <span className="ml-2">✓</span>}
                  {revealed && wrong && <span className="ml-2">✗</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Fill-in-blank input */}
        {currentQ.type === 'fill_in_blank' && !revealed && (
          <div className="space-y-3">
            <label htmlFor="sr-answer" className="sr-only">Your answer</label>
            <input
              id="sr-answer"
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && answered && reveal()}
              placeholder="Type your answer..."
              className="w-full border-2 border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-lg outline-none min-h-[56px]"
              autoFocus
            />
          </div>
        )}

        {/* Revealed answer + explanation */}
        {revealed && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl p-4 mt-3 ${
              checkCorrect(currentQ, currentQ.type === 'fill_in_blank' ? inputValue : selected)
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="font-semibold text-sm">
              {checkCorrect(currentQ, currentQ.type === 'fill_in_blank' ? inputValue : selected)
                ? '✅ Correct!'
                : '❌ Not quite'}
            </div>
            {currentQ.type === 'fill_in_blank' && (
              <div className="text-sm mt-1">
                Answer: <span className="font-bold">{currentQ.correct_answer}</span>
              </div>
            )}
            {currentQ.explanation && (
              <div className="text-gray-500 text-xs mt-1">{currentQ.explanation}</div>
            )}
          </div>
        )}
      </fieldset>

      {/* Reveal control (check the answer before self-rating confidence) */}
      {!revealed && (
        <button
          onClick={reveal}
          disabled={!answered}
          className="w-full bg-indigo-600 disabled:bg-gray-200 text-white disabled:text-gray-400 font-bold py-3 rounded-xl min-h-[48px] transition-colors"
        >
          Check answer
        </button>
      )}

      {/* Confidence rating → SM-2 quality score (Req 4.4) */}
      {revealed && (
        <fieldset className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <legend className="text-sm font-semibold text-gray-600 px-1">How confident were you?</legend>
          <p className="text-xs text-gray-500 mb-3 px-1">
            This tunes when we’ll resurface this topic.
          </p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Confidence rating">
            {CONFIDENCE_RATINGS.map(rating => {
              const meta = CONFIDENCE_LABELS[rating];
              const isSel = confidence === rating;
              return (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setConfidence(rating)}
                  aria-pressed={isSel}
                  className={`p-3 rounded-xl border-2 text-sm font-medium transition-all min-h-[48px] ${
                    isSel
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white hover:border-indigo-200 text-gray-700'
                  }`}
                >
                  <span aria-hidden="true" className="mr-1">{meta.icon}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {revealed && (
        <button
          onClick={commitAndNext}
          disabled={savingAnswer || confidence == null}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl min-h-[56px] text-lg transition-colors"
        >
          {savingAnswer ? 'Saving…' : index < total - 1 ? 'Next topic →' : 'See results →'}
        </button>
      )}
    </div>
  );
}

/* ── Feynman review session (explain-without-looking, hide-then-reveal) ────── */

function FeynmanSession({ documentId, initialTopic, weakTopics, onExit, onDashboard }) {
  // Topic selection: a `?topic=` deep-link (from the post-quiz weak-topic links)
  // wins; otherwise the student picks from this document's weak topics.
  const [topic, setTopic] = useState(initialTopic || null);
  const [doc, setDoc] = useState(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docError, setDocError] = useState(null);

  const [explanation, setExplanation] = useState('');
  const [peeked, setPeeked] = useState(false); // hide-then-reveal source passage
  const [selfRating, setSelfRating] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState(null);
  const [evalError, setEvalError] = useState(null);
  const resultRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingDoc(true);
      setDocError(null);
      try {
        const d = await getDocument(documentId);
        if (!cancelled) setDoc(d);
      } catch {
        if (!cancelled) setDocError('Failed to load the document.');
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  // The source passage to hide-then-reveal: the chunk most relevant to the topic
  // (Req 3.2). Computed locally from the stored chunks — nothing leaves the device.
  const sourcePassage = useMemo(() => {
    if (!doc || !topic) return null;
    const chunks = Array.isArray(doc.chunks) && doc.chunks.length > 0
      ? doc.chunks
      : (typeof doc.rawText === 'string' ? [doc.rawText] : []);
    const hits = tfidfSearch(topic, chunks, 1);
    return hits.length > 0 ? hits[0].text : null;
  }, [doc, topic]);

  async function submit() {
    if (!explanation.trim()) return;
    setEvaluating(true);
    setEvalError(null);
    try {
      // The Feynman service resolves the tier, runs cloud-or-deterministic with
      // mid-flight fallback, persists the attempt, and updates BKT (Req 3.3–3.6).
      const r = await evaluateFeynman({
        documentId,
        topic,
        explanation: explanation.trim(),
        prompt: topic ? `Explain "${topic}" in your own words` : 'Explain this topic in your own words',
        selfRating,
      });
      setResult(r);
    } catch (err) {
      setEvalError(err.message || 'Could not evaluate your explanation. Please try again.');
    } finally {
      setEvaluating(false);
    }
  }

  function restart() {
    setExplanation('');
    setPeeked(false);
    setSelfRating(null);
    setResult(null);
    setEvalError(null);
  }

  if (loadingDoc) return <LoadingSpinner message="Loading the topic..." />;
  if (docError) return <ErrorMessage message={docError} onRetry={onExit} />;

  // ── Topic picker (when no `?topic=` was supplied) ───────────────────────────
  if (!topic) {
    const options = weakTopics.length > 0 ? weakTopics : [];
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-bold text-gray-800 text-lg">Which topic will you explain?</h2>
          <p className="text-sm text-gray-500">Pick a weak topic to explain from memory.</p>
        </div>
        {options.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 shadow-sm">
            <div className="text-5xl mb-3" aria-hidden="true">🎉</div>
            <p className="text-gray-500 text-sm">
              No weak topics here. Take a quiz to surface topics worth explaining.
            </p>
            <button
              onClick={onExit}
              className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl min-h-[48px] transition-colors"
            >
              Back to document
            </button>
          </div>
        ) : (
          <div className="space-y-2" role="group" aria-label="Weak topics">
            {options.map(t => (
              <button
                key={t.topic}
                type="button"
                onClick={() => setTopic(t.topic)}
                className="w-full text-left p-4 rounded-2xl border-2 border-gray-200 bg-white hover:border-indigo-300 transition-all min-h-[48px] flex items-center justify-between"
              >
                <span className="font-medium text-gray-800 truncate">{t.topic}</span>
                <span className="text-xs text-red-600 shrink-0 ml-2">{Math.round(t.mastery * 100)}%</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Result view (coverage / gaps / matched passages + self-rating) ──────────
  if (result) {
    const coveragePct = Math.round((result.coverage ?? 0) * 100);
    return (
      <div className="space-y-4">
        <div
          ref={resultRef}
          tabIndex={-1}
          className="bg-white rounded-2xl p-6 shadow-md outline-none"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800 text-lg">
              <span aria-hidden="true" className="mr-1">🗣️</span>
              Your explanation
            </h2>
            <TierBadge tier={result.tier} />
          </div>

          {/* Coverage meter */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600">Topic coverage</span>
              <span className="font-semibold text-gray-800">{coveragePct}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  coveragePct >= 70 ? 'bg-green-500' : coveragePct >= 40 ? 'bg-yellow-400' : 'bg-red-400'
                }`}
                style={{ width: `${coveragePct}%` }}
              />
            </div>
          </div>

          {/* AI feedback (cloud tier only) */}
          {result.feedback && (
            <p className="text-sm text-gray-700 leading-relaxed mb-3">{result.feedback}</p>
          )}

          {/* Covered key terms */}
          {Array.isArray(result.matchedKeywords) && result.matchedKeywords.length > 0 && (
            <div className="mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                ✅ You covered
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {result.matchedKeywords.map(k => (
                  <span key={k} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full">{k}</span>
                ))}
              </div>
            </div>
          )}

          {/* Possible gaps */}
          {Array.isArray(result.missedKeywords) && result.missedKeywords.length > 0 && (
            <div className="mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                🔍 Possible gaps
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {result.missedKeywords.map(k => (
                  <span key={k} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full">{k}</span>
                ))}
              </div>
            </div>
          )}

          {/* Matched source passages */}
          {Array.isArray(result.matchedPassages) && result.matchedPassages.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                📄 From your notes
              </h3>
              <div className="space-y-2">
                {result.matchedPassages.map((p, i) => (
                  <blockquote
                    key={i}
                    className="text-sm text-gray-600 border-l-2 border-indigo-200 pl-3 italic"
                  >
                    {p.text}
                  </blockquote>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={restart}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl min-h-[48px] transition-colors"
          >
            Explain again
          </button>
          <button
            onClick={onDashboard}
            className="w-full border border-gray-200 text-gray-600 font-medium py-3 rounded-xl min-h-[48px]"
          >
            📈 See my learning curve
          </button>
          <button
            onClick={onExit}
            className="w-full text-gray-500 font-medium py-3 rounded-xl min-h-[48px]"
          >
            Back to document
          </button>
        </div>
      </div>
    );
  }

  // ── Explain view (hide-then-reveal source + explanation input) ──────────────
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <h2 className="font-bold text-gray-800">
          Explain <span className="text-indigo-700">“{topic}”</span> without looking
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Write it in your own words, as if teaching a friend. Explaining from memory
          exposes gaps a quiz can miss.
        </p>
      </div>

      {/* Hide-then-reveal source passage (Req 3.2) */}
      {sourcePassage && (
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-600">Source passage</h3>
            <button
              type="button"
              onClick={() => setPeeked(p => !p)}
              aria-expanded={peeked}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium min-h-[48px] px-2"
            >
              {peeked ? 'Hide' : 'Peek'}
            </button>
          </div>
          {peeked ? (
            <blockquote className="text-sm text-gray-600 border-l-2 border-indigo-200 pl-3 italic mt-2">
              {sourcePassage}
            </blockquote>
          ) : (
            <p className="text-xs text-gray-500 mt-2">
              Hidden on purpose — try explaining first, then peek to check yourself.
            </p>
          )}
        </div>
      )}

      {/* Explanation input */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <label htmlFor="feynman-explanation" className="text-sm font-semibold text-gray-600">
          Your explanation
        </label>
        <textarea
          id="feynman-explanation"
          value={explanation}
          onChange={e => setExplanation(e.target.value)}
          rows={6}
          placeholder={`Explain ${topic} in your own words...`}
          className="w-full mt-2 border-2 border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-base outline-none resize-y min-h-[120px]"
        />
      </div>

      {/* Optional self-rating (Got it / Partially / Missed it) (Req 3.3) */}
      <fieldset className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <legend className="text-sm font-semibold text-gray-600 px-1">How well did you explain it?</legend>
        <p className="text-xs text-gray-500 mb-3 px-1">Optional — your honest self-rating guides mastery.</p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Self rating">
          {FEYNMAN_SELF_RATINGS.map(rating => {
            const meta = SELF_RATING_LABELS[rating];
            const isSel = selfRating === rating;
            return (
              <button
                key={rating}
                type="button"
                onClick={() => setSelfRating(isSel ? null : rating)}
                aria-pressed={isSel}
                className={`p-3 rounded-xl border-2 text-sm font-medium transition-all min-h-[48px] ${
                  isSel
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white hover:border-indigo-200 text-gray-700'
                }`}
              >
                <span aria-hidden="true" className="mr-1">{meta.icon}</span>
                {meta.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {evalError && <ErrorMessage message={evalError} />}

      <button
        onClick={submit}
        disabled={!explanation.trim() || evaluating}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl min-h-[56px] text-lg transition-colors"
      >
        {evaluating ? 'Evaluating…' : 'Check my explanation'}
      </button>
    </div>
  );
}
