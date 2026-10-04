import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { TECHNIQUES } from '../../services/techniqueEngine.js';
import {
  startSession,
  recordAnswer,
  previewIntervals,
  REVIEW_GRADES,
} from '../../services/spacedRepetition/index.js';
import { evaluateFeynman, FEYNMAN_SELF_RATINGS } from '../../services/feynman/index.js';
import { canonical } from '../../services/feynman/feynmanTier3.js';
import { tfidfSearch } from '../../utils/tfidf.js';
import {
  getAllDocuments,
  getDocument,
  getKnowledgeState,
  tagQuizSource,
  updateQuizScore,
  setSetting,
} from '../../db/database.js';
import { diagnose, shouldDiagnose } from '../../services/diagnosis/index.js';
import { playTone } from '../../utils/preferences.js';
import useStudyTimer from '../../hooks/useStudyTimer.js';
import Icon from '../../components/Icon.jsx';
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
  spaced_repetition: { icon: <Icon name="flip" />, bestFor: 'Best for remembering', blurb: 'Short flashcard reviews, spread over days.' },
  feynman: { icon: <Icon name="speak" />, bestFor: 'Best for understanding', blurb: 'Explain a topic in your own words, then compare with your notes.' },
  pomodoro: { icon: <Icon name="timer" />, bestFor: 'Best for focus', blurb: 'Flashcards with a 25-minute focus timer.' },
};

/** "Skip" choice on the technique step: a normal flashcard review, no technique. */
const FLASHCARDS = 'flashcards';

function techniqueLabel(key) {
  return key === FLASHCARDS ? 'Flashcards' : (TECHNIQUES[key]?.name ?? 'Review');
}

function tokensOf(list) {
  const out = new Set();
  for (const item of list ?? []) {
    for (const w of String(item).toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 3) out.add(canonical(w));
  }
  return out;
}

/** Text with covered key ideas marked green and missing ones underlined. */
function Highlighted({ text, covered, missing }) {
  const ok = tokensOf(covered);
  const miss = tokensOf(missing);
  return String(text ?? '').split(/([A-Za-z0-9]+)/).map((part, i) => {
    const key = canonical(part);
    if (ok.has(key)) return <mark key={i} className="sb-mark-ok">{part}</mark>;
    if (miss.has(key)) return <mark key={i} className="sb-mark-miss">{part}</mark>;
    return part;
  });
}

const SELF_RATING_LABELS = {
  got_it: { label: 'Got it', icon: null },
  partial: { label: 'Partially', icon: null },
  missed: { label: 'Missed it', icon: null },
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
  const autoStart = searchParams.get('start') === '1' && presetTechnique != null && !Number.isNaN(docId);
  const [step, setStep] = useState(autoStart ? 'session' : presetTechnique ? 'document' : 'technique');
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
    setSetting('lastDocumentId', chosenId).catch(() => {});
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
    <header className="max-w-[816px] mx-auto px-4 sm:px-8 pt-6 flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          if (step === 'session') backToDocument();
          else if (step === 'document' && !presetTechnique) backToTechnique();
          else navigate(headerBackTarget);
        }}
        className="sb-icon-btn -ml-3"
        aria-label="Back"
      >
        <Icon name="back" />
      </button>
      <p className="sb-eyebrow truncate">
        Review{technique ? ` · ${techniqueLabel(technique)}` : ''}
      </p>
    </header>
  );

  if (loading) {
    return (
      <div>
        {header}
        <main className="max-w-2xl mx-auto px-4 py-8">
          <LoadingSpinner message="Loading your review..." />
        </main>
      </div>
    );
  }

  return (
    <div>
      {header}
      <main key={step} className="max-w-[816px] mx-auto px-4 sm:px-8 pt-3 pb-8 sb-enter">
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
            techniqueLabel={techniqueLabel(technique)}
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
    <div className="flex flex-col gap-4">
      <header>
        <p className="sb-eyebrow">Step 1 of 2</p>
        <h1 className="sb-title mt-1.5">How do you want to review?</h1>
        <p className="sb-sub mt-1">Pick one way to study. Next, you will choose the module or handout.</p>
      </header>
      <div className="grid gap-3" role="group" aria-label="Review techniques">
        {REVIEW_TECHNIQUES.map(key => {
          const meta = TECHNIQUE_META[key];
          const isRecommended = recommended === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              className="sb-card flex items-center gap-4 p-4 text-left"
              style={isRecommended ? { borderColor: 'var(--sb-accent)', background: 'var(--sb-sky-soft)' } : undefined}
            >
              <span className="sb-tile" style={{ background: 'var(--sb-sky)', color: 'var(--sb-primary)' }} aria-hidden="true">{meta.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{TECHNIQUES[key].name}</span>
                  <span className="sb-chip">{meta.bestFor}</span>
                  {isRecommended && <span className="sb-chip" style={{ background: 'var(--sb-amber-bg)', color: 'var(--sb-amber-ink)' }}>Suggested for you</span>}
                </span>
                <span className="block sb-sub mt-0.5">{meta.blurb}</span>
              </span>
              <Icon name="chevron" size={18} className="sb-muted" />
            </button>
          );
        })}
      </div>
      <div className="sb-card flex flex-wrap items-center gap-3 p-4" style={{ background: 'var(--sb-surface-soft)' }}>
        <div className="flex-1 basis-[220px]">
          <div className="font-bold">Not sure?</div>
          <p className="sb-sub">Skip this and do a normal review with flashcards.</p>
        </div>
        <button type="button" onClick={() => onPick(FLASHCARDS)} className="sb-btn-ghost">Skip, use flashcards</button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Step 2: module / handout ───────────────────── */

function DocumentStep({ docs, weakByDoc, defaultDocId, onPick, techniqueLabel }) {
  if (docs.length === 0) {
    return (
      <div className="sb-card rounded-3xl px-6 py-10 text-center">
        <h2 className="sb-display text-[21px] mb-1">No modules yet</h2>
        <p className="sb-sub">Upload a module or handout on Home first, then come back to review.</p>
        <Link to="/student" className="sb-btn mt-5">Go to Home</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="sb-eyebrow">Step 2 of 2 · {techniqueLabel}</p>
        <h1 className="sb-title mt-1.5">Which module or handout?</h1>
        <p className="sb-sub mt-1">Topics you are still weak in are shown under each one.</p>
      </header>
      <div className="grid gap-3">
        {docs.map(d => {
          const weak = weakByDoc[d.id] ?? [];
          const isDefault = d.id === defaultDocId;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onPick(d.id)}
              className="sb-card p-4 text-left"
              style={isDefault ? { borderColor: 'var(--sb-accent)' } : undefined}
            >
              <span className="flex items-center gap-2">
                <span className="font-bold truncate">{d.title}</span>
                {isDefault && <span className="sb-chip ml-auto shrink-0">Current</span>}
              </span>
              {weak.length > 0 ? (
                <span className="flex flex-wrap gap-1.5 mt-2" aria-label="Weak topics">
                  {weak.slice(0, 4).map(t => (
                    <span key={t.topic} className="sb-chip" style={{ background: 'var(--sb-coral-bg)', color: 'var(--sb-coral-ink)' }}>
                      {t.topic} · {Math.round(t.mastery * 100)}%
                    </span>
                  ))}
                  {weak.length > 4 && <span className="text-xs sb-muted py-1">+{weak.length - 4} more</span>}
                </span>
              ) : (
                <span className="block text-xs sb-muted mt-1">No weak topics yet. Review to stay sharp.</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── "Try another technique" suggestion, shown when a session went poorly ──── */

function TechniqueSuggestion({ suggestion }) {
  if (!suggestion || suggestion.action !== 'switch') return null;
  return (
    <section className="rounded-[18px] p-5" style={{ background: 'var(--sb-amber-bg)' }} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="sb-display text-base" style={{ color: 'var(--sb-amber-ink)' }}>Try a different way to study</h3>
        <TierBadge tier={suggestion.tier} />
      </div>
      <p className="text-sm sb-ink leading-relaxed">{suggestion.reason}</p>
      {suggestion.evidence && <p className="text-xs sb-body mt-2">{suggestion.evidence}</p>}
      {suggestion.expectedImprovement && <p className="text-xs sb-body mt-2">{suggestion.expectedImprovement}</p>}
      {suggestion.cta && (
        <Link to={suggestion.cta.to} reloadDocument className="sb-btn mt-4 w-full">
          {suggestion.cta.label} <Icon name="arrow" />
        </Link>
      )}
    </section>
  );
}

/* ───────────────────────────── Step 3: session ───────────────────────────── */

function ReviewSession({ documentId, technique, initialTopic, weakTopics, onExit, onDashboard }) {
  // Pomodoro is a *modifier*: it wraps an underlying session (defaults to the
  // Spaced-Repetition quiz) in the timer overlay (design §6).
  // Flashcards (the skip choice) and Spaced Repetition share the flashcard session.
  const underlying = technique === 'feynman' ? 'feynman' : 'spaced_repetition';
  const withPomodoro = technique === 'pomodoro';

  return (
    <div className="space-y-4">
      {withPomodoro && <PomodoroTimer className="mb-2" />}
      {underlying === 'spaced_repetition' ? (
        <SpacedRepetitionSession
          documentId={documentId}
          technique={technique === FLASHCARDS ? null : technique}
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

/* ── Spaced Repetition review session (flashcards + Again/Hard/Good/Easy) ──── */

const GRADE_META = {
  again: { label: 'Again', dot: '#C9563F' },
  hard: { label: 'Hard', dot: '#B7791F' },
  good: { label: 'Good', dot: '#3B8A6A' },
  easy: { label: 'Easy', dot: '#5B53C6' },
};

function intervalLabel(days) {
  if (!Number.isFinite(days)) return '';
  return days === 1 ? '1 day' : `${days} days`;
}

function SpacedRepetitionSession({ documentId, technique, onExit, onDashboard }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null); // { tier, questions, quizId, dueTopics }
  const [docTitle, setDocTitle] = useState('');
  const [knowledge, setKnowledge] = useState({}); // topic → schedule state, for interval previews
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false); // answer side showing
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState([]); // per-card { topic, grade, isCorrect, nextReviewDate }
  const [finished, setFinished] = useState(false);
  const [suggestion, setSuggestion] = useState(null); // another technique to try
  const resultHeadingRef = useRef(null);

  useStudyTimer(!loading && !finished);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, ks, d] = await Promise.all([
          startSession(documentId),
          getKnowledgeState(documentId),
          getDocument(documentId),
        ]);
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
        setKnowledge(ks);
        setDocTitle(d?.title ?? '');
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
  const topic = currentQ?.topic || 'general';
  const intervals = useMemo(() => previewIntervals(knowledge[topic] ?? {}), [knowledge, topic]);

  function flip() {
    setFlipped(f => !f);
    playTone('flip');
  }

  async function rate(grade) {
    if (saving || !currentQ) return;
    setSaving(true);
    // Update BKT mastery AND the SM-2 schedule for this topic (Req 4.2, 4.4):
    // the grade drives the SM-2 quality score; Good/Easy count as recalled.
    let schedule = null;
    try {
      schedule = await recordAnswer(documentId, topic, { grade });
      setKnowledge(prev => ({
        ...prev,
        [topic]: { ...(prev[topic] ?? {}), interval: schedule.interval, easeFactor: schedule.easeFactor },
      }));
    } catch {
      /* persistence is best-effort; still advance the session */
    }
    const isCorrect = grade === 'good' || grade === 'easy';
    playTone(isCorrect ? 'correct' : 'wrong');
    const nextResults = [...results, { topic, grade, isCorrect, nextReviewDate: schedule?.nextReviewDate ?? null }];
    setResults(nextResults);
    setFlipped(false);
    if (index < total - 1) {
      setIndex(i => i + 1);
    } else {
      // Score the session so it shows up on the learning curve.
      if (session.quizId != null) {
        try {
          await updateQuizScore(session.quizId, nextResults.filter(r => r.isCorrect).length);
        } catch {
          /* the summary below still shows */
        }
      }
      // If this way of studying is not working, suggest another technique.
      const ratio = nextResults.filter(r => r.isCorrect).length / total;
      if (shouldDiagnose({ quizScore: ratio })) {
        try {
          setSuggestion(await diagnose({
            documentId,
            currentHabit: technique ?? 'flashcards',
            quizScore: ratio,
            weakTopics: [...new Set(nextResults.filter(r => !r.isCorrect).map(r => r.topic))],
          }));
        } catch {
          setSuggestion(null);
        }
      }
      playTone('done');
      setFinished(true);
    }
    setSaving(false);
  }

  // Keyboard: Space flips the card, 1–4 rate it once the answer is showing.
  useEffect(() => {
    if (loading || finished || total === 0) return undefined;
    function onKey(e) {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        flip();
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        rate(REVIEW_GRADES[Number(e.key) - 1]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loading) return <LoadingSpinner message="Finding your due topics..." />;
  if (error) return <ErrorMessage message={error} onRetry={onExit} />;

  if (total === 0) {
    return (
      <div className="sb-card rounded-3xl px-6 py-10 text-center" role="status">
        <h2 className="sb-display text-[21px] mb-1">Nothing due right now</h2>
        <p className="sb-sub">
          You’re all caught up on spaced repetition for this document. Check back later.
        </p>
        <button type="button" onClick={onExit} className="sb-btn mt-5">Back to document</button>
      </div>
    );
  }

  // ── Results summary (Req 4.5: next due dates + per-topic recap) ────────────
  if (finished) {
    const recalled = results.filter(r => r.isCorrect).length;
    return (
      <div className="flex flex-col gap-5">
        <header>
          <p className="sb-eyebrow truncate">{docTitle || 'Review'}</p>
          <h1 className="sb-title mt-1.5">Review complete</h1>
        </header>
        <section className="sb-card rounded-3xl px-6 py-9 text-center" role="status" aria-live="polite">
          <h2 ref={resultHeadingRef} tabIndex={-1} className="sb-display text-[44px] leading-none outline-none" style={{ color: 'var(--sb-primary)' }}>
            {recalled}/{total}
          </h2>
          <p className="sb-body mt-3">cards recalled (rated Good or Easy)</p>
          <div className="mt-3"><TierBadge tier={session.tier} /></div>
        </section>

        {/* Next due dates for the topics reviewed (Req 4.5) */}
        <section className="sb-card overflow-hidden" aria-labelledby="next-review">
          <h3 id="next-review" className="sb-display text-base px-[18px] pt-[18px] pb-2">Next review</h3>
          {results.map((r, i) => (
            <div key={i} className="sb-row flex items-center gap-3 px-[18px] py-3 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: GRADE_META[r.grade].dot }} aria-hidden="true" />
              <span className="flex-1 min-w-0 truncate">{r.topic}</span>
              <span className="sb-chip">{GRADE_META[r.grade].label}</span>
              <span className="sb-muted shrink-0">
                {formatDue(r.nextReviewDate) ? `Due ${formatDue(r.nextReviewDate)}` : 'Scheduled'}
              </span>
            </div>
          ))}
        </section>

        <TechniqueSuggestion suggestion={suggestion} />

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onDashboard} className="sb-btn flex-1 basis-[200px]">
            <Icon name="chart" /> See my learning curve
          </button>
          <button type="button" onClick={onExit} className="sb-btn-ghost flex-1 basis-[200px]">Back to document</button>
        </div>
      </div>
    );
  }

  // ── Active card ─────────────────────────────────────────────────────────────
  const remaining = total - index;
  const minutes = Math.max(1, Math.round((remaining * 40) / 60));
  const isTrueFalse = currentQ.type === 'true_false';

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="sb-eyebrow truncate">{docTitle || 'Review'}</p>
          <h1 className="sb-title mt-1.5">Daily review</h1>
        </div>
        <span className="sb-counter" aria-label={`Card ${index + 1} of ${total}`}>{index + 1} of {total}</span>
      </header>

      <div className="sb-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index + 1} aria-label="Review progress">
        <span style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-1 text-xs sb-muted">
        <span className="flex items-center gap-2"><Icon name="clock" size={16} /> About {minutes} minute{minutes === 1 ? '' : 's'}</span>
        <span className="flex items-center gap-2"><Icon name="sparkle" size={16} /> Spaced repetition</span>
        <TierBadge tier={session.tier} />
      </div>

      <button
        type="button"
        onClick={flip}
        className="sb-flashcard"
        data-side={flipped ? 'answer' : 'question'}
        aria-label={flipped ? 'Answer side. Flip back to the question' : 'Question side. Flip to reveal the answer'}
      >
        <span className="sb-eyebrow text-[11px] absolute top-[26px] left-7" style={{ position: 'absolute', letterSpacing: '0.14em' }}>
          {flipped ? 'Answer' : 'Question'}
        </span>
        {flipped ? (
          <>
            <span className="sb-pill" style={{ background: 'var(--sb-mint)', color: 'var(--sb-mint-ink)' }}>{topic}</span>
            <span className="sb-display text-[24px] sm:text-[27px] leading-snug max-w-[600px]" style={{ letterSpacing: '-0.02em' }}>
              {currentQ.correct_answer}
            </span>
            {currentQ.explanation && (
              <span className="sb-body text-sm leading-relaxed max-w-[560px]">{currentQ.explanation}</span>
            )}
          </>
        ) : (
          <>
            {/* The topic is often the answer itself, so it only appears on the answer side. */}
            <span className="sb-pill" style={{ background: 'var(--sb-coral-bg)', color: 'var(--sb-coral-ink)' }}>{isTrueFalse ? 'True or false' : 'Recall'}</span>
            <span className="sb-display text-[22px] sm:text-[27px] leading-snug max-w-[600px] whitespace-pre-line" style={{ letterSpacing: '-0.02em' }}>
              {currentQ.question}
            </span>
            <span className="flex items-center gap-2 text-xs sb-muted">
              <Icon name="flip" size={16} />
              {isTrueFalse ? 'True or false? Decide, then tap the card to reveal' : 'Recall the answer, then tap the card to reveal'}
            </span>
          </>
        )}
      </button>

      {flipped && (
        <p className="text-center text-xs sb-muted -mt-2">
          Something wrong with this card?{' '}
          <Link to={`/student/document/${documentId}?tab=cards`} className="font-bold underline" style={{ color: 'var(--sb-primary)' }}>Fix it</Link>
        </p>
      )}

      {/* Live region so the revealed answer is announced */}
      <p className="sr-only" role="status" aria-live="polite">
        {flipped ? `Answer: ${currentQ.correct_answer}. ${currentQ.explanation ?? ''}` : ''}
      </p>

      {flipped ? (
        <fieldset className="border-0 p-0 m-0 min-w-0" disabled={saving}>
          <legend className="w-full text-center text-[13px] sb-muted mb-3">How well did you know this?</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {REVIEW_GRADES.map((grade, i) => (
              <button
                key={grade}
                type="button"
                onClick={() => rate(grade)}
                className="sb-card flex flex-col items-center justify-center gap-1 py-2.5"
                style={{ borderRadius: 14, minHeight: 68 }}
                aria-label={`${GRADE_META[grade].label}: review again in ${intervalLabel(intervals[grade])}`}
                aria-keyshortcuts={String(i + 1)}
              >
                <span className="font-bold text-sm">{GRADE_META[grade].label}</span>
                <span className="w-[9px] h-[9px] rounded-full" style={{ background: GRADE_META[grade].dot }} aria-hidden="true" />
                <span className="text-[11px] sb-muted">{intervalLabel(intervals[grade])}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <button type="button" onClick={flip} className="sb-btn self-center px-11">Show answer</button>
      )}

      <p className="text-center text-xs sb-muted">
        Press space to flip{flipped ? ', 1–4 to rate' : ''} · Your answer is saved on this device
      </p>
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

  // ── Result view: your explanation side by side with what the notes say ──────
  if (result) {
    const covered = Array.isArray(result.matchedKeywords) ? result.matchedKeywords : [];
    const missing = Array.isArray(result.missedKeywords) ? result.missedKeywords : [];
    const totalIdeas = covered.length + missing.length;
    const coveragePct = Math.round((result.coverage ?? 0) * 100);
    const notesText = result.sourceText || result.matchedPassages?.[0]?.text || sourcePassage || '';
    const verdict = coveragePct >= 70
      ? 'Great. You explained the main idea.'
      : coveragePct >= 40
        ? 'Good start. A few key ideas are missing.'
        : 'Not yet. Read what your notes say, then try again.';
    return (
      <div className="flex flex-col gap-4">
        <section ref={resultRef} tabIndex={-1} className="sb-card rounded-3xl p-6 outline-none" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="sb-display text-[21px]">How you did</h2>
            <TierBadge tier={result.tier} />
          </div>
          <p className="font-bold">{verdict}</p>
          <p className="sb-sub mb-2">
            {totalIdeas > 0 ? `You covered ${covered.length} of ${totalIdeas} key ideas.` : `Your explanation matched ${coveragePct}% of the notes.`}
          </p>
          <div className="sb-progress" aria-hidden="true">
            <span style={{ width: `${coveragePct}%`, background: coveragePct >= 70 ? 'var(--sb-good)' : coveragePct >= 40 ? '#B7791F' : 'var(--sb-coral)' }} />
          </div>
          {result.feedback && <p className="text-sm sb-body leading-relaxed mt-4">{result.feedback}</p>}
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="sb-card p-5" aria-labelledby="feynman-yours">
            <h3 id="feynman-yours" className="sb-eyebrow mb-2">What you wrote</h3>
            <p className="text-sm leading-relaxed whitespace-pre-line">
              <Highlighted text={explanation} covered={covered} missing={[]} />
            </p>
          </section>
          <section className="sb-card p-5" aria-labelledby="feynman-notes" style={{ background: 'var(--sb-surface-soft)' }}>
            <h3 id="feynman-notes" className="sb-eyebrow mb-2">What your notes say</h3>
            {notesText ? (
              <p className="text-sm leading-relaxed">
                <Highlighted text={notesText} covered={covered} missing={missing} />
              </p>
            ) : (
              <p className="sb-sub">No matching passage was found in your notes for this topic.</p>
            )}
          </section>
        </div>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs sb-muted">
          <span><mark className="sb-mark-ok">Green</mark> = you covered this</span>
          <span><mark className="sb-mark-miss">Underlined</mark> = missing from your explanation</span>
        </p>

        {missing.length > 0 && (
          <section className="sb-card p-5">
            <h3 className="font-bold">Add these next time</h3>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {missing.slice(0, 8).map(k => (
                <span key={k} className="sb-chip" style={{ background: 'var(--sb-amber-bg)', color: 'var(--sb-amber-ink)' }}>{k}</span>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={restart} className="sb-btn flex-1 basis-[180px]">Try again</button>
          <button type="button" onClick={onDashboard} className="sb-btn-ghost flex-1 basis-[180px]"><Icon name="chart" /> See my learning curve</button>
          <button type="button" onClick={onExit} className="sb-btn-ghost flex-1 basis-[180px]">Back to document</button>
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
