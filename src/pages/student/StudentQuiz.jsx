import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { generateQuiz } from '../../services/quiz/index.js';
import { getDocument, updateKnowledgeState, getKnowledgeState, updateQuizScore, getSetting, setSetting } from '../../db/database.js';
import { updateMastery, getInitialMastery } from '../../services/bkt.js';
import { diagnose, shouldDiagnose } from '../../services/diagnosis/index.js';
import { playTone } from '../../utils/preferences.js';
import useStudyTimer from '../../hooks/useStudyTimer.js';
import PomodoroTimer from '../../components/PomodoroTimer.jsx';
import TierBadge from '../../components/shared/TierBadge.jsx';
import LoadingSpinner from '../../components/shared/LoadingSpinner.jsx';
import ErrorMessage from '../../components/shared/ErrorMessage.jsx';
import Icon from '../../components/Icon.jsx';

/** BKT mastery below which a topic counts as "weak" (design §6, Req 5.2). */
const WEAK_MASTERY_THRESHOLD = 0.6;

const LETTERS = 'ABCDEFGH';

/**
 * "How do you usually study this?" — asked once per document before the first
 * quiz. `diagnosisKey` is the habit name the technique engine understands; it
 * uses the answer to spot low-impact habits such as re-reading.
 */
const STUDY_HABITS = [
  { key: 'rereading', label: 'Re-reading my notes', diagnosisKey: 'rereading' },
  { key: 'highlighting', label: 'Highlighting key parts', diagnosisKey: 'highlighting' },
  { key: 'summarizing', label: 'Writing summaries', diagnosisKey: 'summarizing' },
  { key: 'flashcards', label: 'Flashcards', diagnosisKey: 'flashcards' },
  { key: 'practice_testing', label: 'Practice tests or quizzes', diagnosisKey: 'spaced_repetition' },
  { key: 'teaching', label: 'Explaining it to someone', diagnosisKey: 'feynman' },
  { key: 'group_study', label: 'Group study', diagnosisKey: null },
  { key: 'videos', label: 'Watching video lessons', diagnosisKey: null },
];

function masteryLabel(m) {
  return m < 0.4 ? 'Needs work' : m < 0.7 ? 'Learning' : 'Mastered';
}

export default function StudentQuiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const docId = parseInt(id, 10);

  // Technique chosen on the document screen and carried through the URL. Only
  // `pomodoro` changes this screen (an optional overlay); any technique is still
  // just a plain quiz here (Req 2.6). Defaults to the plain flow (Req 1.3).
  const technique = searchParams.get('technique');
  const pomodoroEnabled = technique === 'pomodoro';

  const [quiz, setQuiz] = useState(null);
  const [docTitle, setDocTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [score, setScore] = useState(0);
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null); // post-quiz technique diagnosis (Req 6.1)
  const [weakTopics, setWeakTopics] = useState([]); // topics below the weak threshold (Req 3.1)
  const [topicMastery, setTopicMastery] = useState([]); // [topic, mastery] after this quiz
  const [habit, setHabit] = useState(undefined); // undefined = loading, null = not asked yet
  const [habitChoice, setHabitChoice] = useState(null);
  const resultHeadingRef = useRef(null);
  const habitSettingKey = `studyHabit:${docId}`;
  const showSurvey = habit === null;

  useStudyTimer(!loading && !showResult && !showSurvey);

  useEffect(() => {
    loadQuiz();
    getDocument(docId).then(d => setDocTitle(d?.title ?? '')).catch(() => {});
    if (!Number.isNaN(docId)) setSetting('lastDocumentId', docId).catch(() => {});
    getSetting(habitSettingKey, null).then(saved => setHabit(saved ?? null)).catch(() => setHabit('skipped'));
  }, [docId]);

  /** Save the survey answer (or "skipped") so it is asked only once per document. */
  async function answerSurvey(value) {
    setHabit(value);
    try { await setSetting(habitSettingKey, value); } catch { /* the quiz still starts */ }
  }

  // When Pomodoro is the chosen technique, surface the timer by default so the
  // student can start a focus block right away. Still fully optional (Req 2.6).
  useEffect(() => {
    if (pomodoroEnabled) setShowPomodoro(true);
  }, [pomodoroEnabled]);

  // Move focus to the results score so screen-reader users are notified that
  // new content appeared when the quiz completes.
  useEffect(() => {
    if (showResult) resultHeadingRef.current?.focus();
  }, [showResult]);

  async function loadQuiz() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateQuiz(docId);
      setQuiz(result);
    } catch (err) {
      setError(err.message || 'Failed to generate quiz.');
    } finally {
      setLoading(false);
    }
  }

  /** Reset the per-attempt state and generate a fresh quiz (Take Another Quiz). */
  async function restartQuiz() {
    setCurrentIndex(0);
    setAnswers({});
    setSubmitted(false);
    setShowResult(false);
    setInputValue('');
    setScore(0);
    setDiagnosis(null);
    setWeakTopics([]);
    setTopicMastery([]);
    await loadQuiz();
  }

  const currentQ = quiz?.questions?.[currentIndex];
  const totalQ = quiz?.questions?.length ?? 0;

  function isCorrect(question, answer) {
    if (!answer) return false;
    if (question.type === 'fill_in_blank') {
      const acceptable = question.acceptable_answers ?? [question.correct_answer];
      return acceptable.some(a => a.toLowerCase() === answer.toLowerCase().trim());
    }
    return answer === question.correct_answer;
  }

  /** Choosing an option answers the question straight away and shows feedback. */
  function chooseOption(option) {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [currentIndex]: option }));
    setSubmitted(true);
    playTone(isCorrect(currentQ, option) ? 'correct' : 'wrong');
  }

  function handleSubmitAnswer() {
    const answer = inputValue.trim();
    if (!answer) return;
    setAnswers(prev => ({ ...prev, [currentIndex]: answer }));
    setInputValue('');
    setSubmitted(true);
    playTone(isCorrect(currentQ, answer) ? 'correct' : 'wrong');
  }

  async function handleNext() {
    if (currentIndex < totalQ - 1) {
      setCurrentIndex(prev => prev + 1);
      setSubmitted(false);
      setInputValue('');
    } else {
      // Quiz complete — compute score and update BKT
      await finishQuiz();
    }
  }

  async function finishQuiz() {
    const questions = quiz.questions;
    const ks = await getKnowledgeState(docId);

    let finalScore = 0;
    // Track the per-topic mastery after this quiz so we can surface weak topics
    // (Req 3.1) and feed diagnosis (Req 6.1).
    const updatedMastery = {};
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const answer = answers[i];
      const correct = isCorrect(q, answer);
      if (correct) finalScore++;

      // Update BKT mastery for this topic
      const topic = q.topic || 'general';
      const prior = topic in updatedMastery
        ? updatedMastery[topic]
        : (typeof ks[topic] === 'object'
            ? (ks[topic].mastery ?? getInitialMastery())
            : (ks[topic] ?? getInitialMastery()));
      const newMastery = updateMastery(
        Math.max(0.01, Math.min(0.99, prior)),
        correct
      );
      updatedMastery[topic] = newMastery;
      await updateKnowledgeState(docId, topic, newMastery);
    }

    setScore(finalScore);
    if (quiz.quizId) {
      await updateQuizScore(quiz.quizId, finalScore);
    }

    // Weak topics for the Feynman "explain this topic" prompt (Req 3.1).
    const weak = Object.entries(updatedMastery)
      .filter(([, m]) => m < WEAK_MASTERY_THRESHOLD)
      .sort((a, b) => a[1] - b[1])
      .map(([topic]) => topic);
    setWeakTopics(weak);
    setTopicMastery(Object.entries(updatedMastery).sort((a, b) => a[1] - b[1]));

    // Post-quiz technique diagnosis (Req 6.1–6.5). Only shown below 70% or on a
    // mastery plateau (Req 6.1). The orchestrator resolves the tier and never
    // throws — it falls back to the deterministic engine on any cloud failure —
    // so a failure here must never block the results screen.
    const fractionalScore = totalQ > 0 ? finalScore / totalQ : 0;
    if (shouldDiagnose({ quizScore: fractionalScore })) {
      try {
        const result = await diagnose({
          documentId: docId,
          // The chosen technique wins; otherwise use the habit from the survey.
          currentHabit: technique || STUDY_HABITS.find(h => h.key === habit)?.diagnosisKey || null,
          quizScore: fractionalScore,
          weakTopics: weak,
        });
        setDiagnosis(result);
      } catch {
        setDiagnosis(null);
      }
    }

    playTone('done');
    setShowResult(true);
  }

  const backButton = (
    <button
      type="button"
      onClick={() => navigate(`/student/document/${docId}`)}
      aria-label="Back to document"
      className="sb-icon-btn -ml-3"
    >
      <Icon name="back" />
    </button>
  );

  if (habit === undefined) return <div className="p-6"><LoadingSpinner message="Loading..." /></div>;

  // ── Pre-quiz study habit survey (first quiz on this document) ──────────────
  if (showSurvey) {
    return (
      <main className="max-w-[640px] mx-auto px-4 sm:px-8 py-8 lg:py-10 flex flex-col gap-5 sb-enter">
        <header className="flex items-start gap-1">
          {backButton}
          <div className="min-w-0">
            <p className="sb-eyebrow truncate">Before we start{docTitle ? ` · ${docTitle}` : ''}</p>
            <h1 className="sb-title mt-1.5">How do you usually study this?</h1>
            <p className="sb-sub mt-1">Pick the one you use most. We use it to suggest a better way if your score is low.</p>
          </div>
        </header>
        <fieldset className="border-0 p-0 m-0 min-w-0">
          <legend className="sr-only">How you usually study</legend>
          <div className="flex flex-col gap-2.5">
            {STUDY_HABITS.map(h => (
              <label key={h.key} className="sb-option cursor-pointer" data-state={habitChoice === h.key ? 'correct' : undefined}>
                <input
                  type="radio"
                  name="study-habit"
                  value={h.key}
                  checked={habitChoice === h.key}
                  onChange={() => setHabitChoice(h.key)}
                  style={{ width: 20, height: 20, flex: 'none' }}
                />
                <span className="flex-1">{h.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="sb-btn flex-1 basis-[200px]" disabled={!habitChoice} onClick={() => answerSurvey(habitChoice)}>
            Start quiz <Icon name="arrow" />
          </button>
          <button type="button" className="sb-btn-ghost" onClick={() => answerSurvey('skipped')}>Skip</button>
        </div>
      </main>
    );
  }

  if (loading) return <div className="p-6"><LoadingSpinner message="Generating quiz..." /></div>;

  if (showResult) {
    const ratio = totalQ > 0 ? score / totalQ : 0;
    return (
      <main className="max-w-[860px] mx-auto px-4 sm:px-8 py-8 lg:py-10 flex flex-col gap-5 sb-enter">
        <header className="flex items-start gap-1">
          {backButton}
          <div className="min-w-0">
            <p className="sb-eyebrow truncate">Quick quiz{docTitle ? ` · ${docTitle}` : ''}</p>
            <h1 className="sb-title mt-1.5">Quiz results</h1>
          </div>
        </header>

        <section className="sb-card rounded-3xl px-6 py-9 text-center" role="status" aria-live="polite">
          <h2 ref={resultHeadingRef} tabIndex={-1} className="sb-display text-[44px] leading-none outline-none" style={{ color: 'var(--sb-primary)' }}>
            {score}/{totalQ}
          </h2>
          <p className="sb-body mt-3">
            {ratio >= 0.8 ? 'Excellent work!' : ratio >= 0.6 ? 'Good job!' : 'Keep studying — every attempt counts.'}
          </p>
          <div className="mt-3"><TierBadge tier={quiz.tier} /></div>
        </section>

        {/* Topic mastery after this quiz */}
        {topicMastery.length > 0 && (
          <section className="sb-card p-5" aria-labelledby="quiz-mastery">
            <h3 id="quiz-mastery" className="sb-display text-base mb-3">Topic mastery</h3>
            <div className="flex flex-col gap-3">
              {topicMastery.map(([topic, m]) => {
                const pct = Math.round(m * 100);
                return (
                  <div key={topic}>
                    <div className="flex items-center justify-between gap-3 text-sm mb-1">
                      <span className="font-bold truncate">{topic}</span>
                      <span className="sb-muted shrink-0">{pct}% · {masteryLabel(m)}</span>
                    </div>
                    <div className="sb-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${topic}: ${pct} percent, ${masteryLabel(m)}`}>
                      <span style={{ width: `${pct}%`, background: m < 0.4 ? 'var(--sb-coral)' : m < 0.7 ? '#B7791F' : 'var(--sb-good)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Question review */}
        <section className="sb-card overflow-hidden" aria-label="Question review">
          {quiz.questions.map((q, i) => {
            const ans = answers[i];
            const correct = isCorrect(q, ans);
            return (
              <div key={i} className="sb-row flex gap-3.5 p-[18px]">
                <span
                  className="sb-tile"
                  style={{ width: 30, height: 30, borderRadius: 8, background: correct ? 'var(--sb-good)' : 'var(--sb-coral)', color: '#FFFFFF' }}
                >
                  <Icon name={correct ? 'check' : 'x'} size={16} />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-bold whitespace-pre-line">{q.question}</p>
                  <p className="mt-1 sb-body">
                    <span className="sb-muted">Your answer: </span>{ans || '(no answer)'} — {correct ? 'correct' : 'incorrect'}
                  </p>
                  {!correct && (
                    <p className="mt-0.5 sb-body"><span className="sb-muted">Correct: </span><span className="font-bold">{q.correct_answer}</span></p>
                  )}
                  {q.explanation && <p className="text-xs sb-muted mt-1">{q.explanation}</p>}
                </div>
              </div>
            );
          })}
        </section>

        {/* ── Post-quiz technique diagnosis (Req 6.1–6.5) ───────────────── */}
        {diagnosis && (
          <section className="rounded-[18px] p-5" style={{ background: 'var(--sb-amber-bg)' }} role="status" aria-live="polite">
            <div className="flex items-center justify-between mb-2">
              <h3 className="sb-display text-base" style={{ color: 'var(--sb-amber-ink)' }}>Study tip</h3>
              <TierBadge tier={diagnosis.tier} />
            </div>
            <p className="text-sm sb-ink leading-relaxed">{diagnosis.reason}</p>
            {diagnosis.evidence && <p className="text-xs sb-body mt-2">{diagnosis.evidence}</p>}
            {diagnosis.expectedImprovement && <p className="text-xs sb-body mt-2">{diagnosis.expectedImprovement}</p>}
            {/* CTA → Review pre-set to the recommended technique (Req 6.5) */}
            {diagnosis.cta && (
              <Link to={diagnosis.cta.to} className="sb-btn mt-4 w-full">
                {diagnosis.cta.label} <Icon name="arrow" />
              </Link>
            )}
          </section>
        )}

        {/* ── Feynman "explain this topic" prompt for weak topics (Req 3.1) ─ */}
        {weakTopics.length > 0 && (
          <section className="sb-card p-5">
            <h3 className="sb-display text-base">Explain it to lock it in</h3>
            <p className="sb-sub mb-3">
              Try explaining a weak topic in your own words — it exposes gaps a quiz can miss.
            </p>
            <div className="flex flex-wrap gap-2">
              {weakTopics.slice(0, 5).map(topic => (
                <Link
                  key={topic}
                  to={`/student/document/${docId}/review?technique=feynman&topic=${encodeURIComponent(topic)}`}
                  className="sb-btn-ghost"
                >
                  Explain “{topic}”
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={restartQuiz} className="sb-btn flex-1 basis-[200px]">Take Another Quiz</button>
          <button type="button" onClick={() => navigate(`/student/document/${docId}?tab=mastery`)} className="sb-btn-ghost flex-1 basis-[200px]">
            View Mastery
          </button>
        </div>
      </main>
    );
  }

  const answer = answers[currentIndex];
  const answeredCorrectly = submitted && currentQ ? isCorrect(currentQ, answer) : false;
  const options = currentQ?.options ?? ['True', 'False'];
  const progressPct = totalQ > 0 ? ((currentIndex + (submitted ? 1 : 0)) / totalQ) * 100 : 0;

  return (
    <main className="max-w-[860px] mx-auto px-4 sm:px-8 py-8 lg:py-10 flex flex-col gap-5 sb-enter">
      <header className="flex items-start gap-1">
        {backButton}
        <div className="flex-1 min-w-0">
          <p className="sb-eyebrow truncate">Quick quiz{docTitle ? ` · ${docTitle}` : ''}</p>
          <h1 className="sb-title mt-1.5">Test your understanding</h1>
        </div>
        {/* Optional Pomodoro overlay toggle (Req 2.2, 2.6). Only when the
            student chose Pomodoro for this document; the quiz works without it. */}
        {pomodoroEnabled && (
          <button
            type="button"
            onClick={() => setShowPomodoro(v => !v)}
            aria-pressed={showPomodoro}
            aria-label={showPomodoro ? 'Hide focus timer' : 'Show focus timer'}
            className="sb-icon-btn"
          >
            <Icon name="timer" />
          </button>
        )}
        {totalQ > 0 && (
          <span className="sb-counter" aria-label={`Question ${currentIndex + 1} of ${totalQ}`}>{currentIndex + 1} / {totalQ}</span>
        )}
      </header>

      <div className="sb-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPct)} aria-label="Quiz progress">
        <span style={{ width: `${progressPct}%` }} />
      </div>

      {error && <ErrorMessage message={error} onRetry={loadQuiz} />}

      {currentQ && (
        <>
          {/* Optional Pomodoro timer overlay (Req 2.1–2.6). Pure client, all
              tiers, no network. The quiz logic below is unchanged by it. */}
          {pomodoroEnabled && showPomodoro && <PomodoroTimer />}

          <section key={currentIndex} className="sb-card rounded-3xl px-5 py-7 sm:px-9 sm:py-8 sb-enter">
            <div className="flex items-center justify-between gap-3">
              <span className="sb-eyebrow text-[11px]" style={{ color: 'var(--sb-primary)', letterSpacing: '0.12em' }}>Question {currentIndex + 1}</span>
              <span className="flex flex-wrap justify-end gap-1.5">
                {currentQ.difficulty === 'review' && (
                  <span className="sb-chip" style={{ background: 'var(--sb-amber-bg)', color: 'var(--sb-amber-ink)' }}>Review topic</span>
                )}
                <span className="sb-chip">{currentQ.type === 'fill_in_blank' ? 'Fill in the blank' : 'True or false'}</span>
              </span>
            </div>

            <fieldset className="border-0 p-0 m-0 min-w-0">
              <legend className="sb-display text-[21px] leading-snug mt-5 mb-6 p-0 whitespace-pre-line" style={{ letterSpacing: '-0.01em' }}>
                {currentQ.question}
              </legend>

              {/* Choice options: tapping one answers immediately */}
              {currentQ.type === 'true_false' && (
                <div className="flex flex-col gap-2.5">
                  {options.map((option, i) => {
                    const selected = answer === option;
                    const state = !submitted
                      ? undefined
                      : option === currentQ.correct_answer
                        ? 'correct'
                        : selected ? 'wrong' : 'dim';
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => chooseOption(option)}
                        className="sb-option"
                        data-state={state}
                        aria-pressed={selected}
                        disabled={submitted}
                      >
                        <span className="sb-letter" aria-hidden="true">{LETTERS[i] ?? i + 1}</span>
                        <span className="flex-1">{option}</span>
                        {state === 'correct' && <Icon name="check" style={{ color: 'var(--sb-good)' }} />}
                        {state === 'correct' && <span className="sr-only">Correct answer</span>}
                        {state === 'wrong' && <span className="sr-only">Your answer, incorrect</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Fill-in-blank input */}
              {currentQ.type === 'fill_in_blank' && !submitted && (
                <div className="flex flex-wrap gap-3">
                  <label htmlFor="fill-in-blank-answer" className="sr-only">Your answer</label>
                  <input
                    id="fill-in-blank-answer"
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmitAnswer()}
                    placeholder="Type your answer..."
                    className="sb-input flex-1 basis-[240px]"
                    autoFocus
                  />
                  <button type="button" onClick={handleSubmitAnswer} disabled={!inputValue.trim()} className="sb-btn" style={{ minHeight: 56 }}>
                    Submit Answer
                  </button>
                </div>
              )}
              {currentQ.type === 'fill_in_blank' && submitted && (
                <div className="sb-option" data-state={answeredCorrectly ? 'correct' : 'wrong'}>
                  <span className="sb-letter"><Icon name={answeredCorrectly ? 'check' : 'x'} size={16} /></span>
                  <span className="flex-1"><span className="sr-only">Your answer: </span>{answer}</span>
                </div>
              )}
            </fieldset>

            {/* Feedback */}
            {submitted && (
              <div
                role="status"
                aria-live="polite"
                className="flex gap-3.5 mt-5 px-[18px] py-4 rounded-[14px]"
                style={{ background: answeredCorrectly ? 'var(--sb-mint)' : 'var(--sb-warn-bg)' }}
              >
                <span
                  className="sb-tile"
                  style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--sb-surface)', color: answeredCorrectly ? 'var(--sb-good)' : 'var(--sb-amber-ink)' }}
                >
                  <Icon name={answeredCorrectly ? 'check' : 'book'} size={16} />
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-sm">{answeredCorrectly ? 'That’s correct' : 'Not quite — keep learning'}</div>
                  {!answeredCorrectly && currentQ.type === 'fill_in_blank' && (
                    <div className="text-sm sb-body">Answer: <span className="font-bold">{currentQ.correct_answer}</span></div>
                  )}
                  {currentQ.explanation && <div className="text-xs sb-body leading-relaxed mt-0.5">{currentQ.explanation}</div>}
                  {quiz.tier === 'deterministic' && (
                    <Link to={`/student/document/${docId}?tab=cards`} className="inline-flex items-center text-xs font-bold underline" style={{ color: 'var(--sb-primary)' }}>
                      Is this question wrong? Fix the card
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-xs sb-muted">
              <Icon name="shield" size={16} />
              Questions come from your notes
              <TierBadge tier={quiz.tier} />
            </span>
            <button type="button" onClick={handleNext} disabled={!submitted} className="sb-btn ml-auto">
              {currentIndex < totalQ - 1 ? 'Next question' : 'See results'}
              <Icon name="arrow" />
            </button>
          </div>
        </>
      )}
    </main>
  );
}
