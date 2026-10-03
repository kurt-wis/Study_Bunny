import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { generateQuiz } from '../../services/quiz/index.js';
import { startSession } from '../../services/spacedRepetition/index.js';
import { getKnowledgeState, getQuizzesByDocument, getFeynmanAttempts, updateQuizScore } from '../../db/database.js';
import { recordAnswer } from '../../services/spacedRepetition/index.js';
import { diagnose, shouldDiagnose } from '../../services/diagnosis/index.js';
import PomodoroTimer from '../../components/PomodoroTimer.jsx';
import TierBadge from '../../components/shared/TierBadge.jsx';
import LoadingSpinner from '../../components/shared/LoadingSpinner.jsx';
import ErrorMessage from '../../components/shared/ErrorMessage.jsx';

/** BKT mastery below which a topic counts as "weak" (design §6, Req 5.2). */
const WEAK_MASTERY_THRESHOLD = 0.6;

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
  const [savingAnswer, setSavingAnswer] = useState(false);
  const resultHeadingRef = useRef(null);
  const recordedIndexesRef = useRef(new Set());

  useEffect(() => {
    loadQuiz();
  }, [docId]);

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
      const result = technique === 'spaced_repetition'
        ? await startSession(docId, { technique })
        : await generateQuiz(docId, { technique });
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
    recordedIndexesRef.current = new Set();
    await loadQuiz();
  }

  const currentQ = quiz?.questions?.[currentIndex];
  const totalQ = quiz?.questions?.length ?? 0;

  function handleAnswer(answer) {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [currentIndex]: answer }));
  }

  function isCorrect(question, answer) {
    if (!answer) return false;
    if (question.type === 'fill_in_blank') {
      const acceptable = question.acceptable_answers ?? [question.correct_answer];
      return acceptable.some(a => a.toLowerCase() === answer.toLowerCase().trim());
    }
    return answer === question.correct_answer;
  }

  function isChoiceQuestion(question) {
    return question?.type === 'true_false' || question?.type === 'multiple_choice';
  }

  async function handleSubmitAnswer() {
    if (currentQ.type === 'fill_in_blank') {
      const answer = inputValue.trim();
      if (!answer) return;
      setAnswers(prev => ({ ...prev, [currentIndex]: answer }));
      setInputValue('');
    }
    if (isChoiceQuestion(currentQ) && !answers[currentIndex]) return;
    setSubmitted(true);
  }

  async function handleNext() {
    if (savingAnswer || !currentQ) return;
    setSavingAnswer(true);
    setError(null);
    try {
      if (!recordedIndexesRef.current.has(currentIndex)) {
        await recordAnswer(docId, currentQ.topic || 'general', {
          isCorrect: isCorrect(currentQ, answers[currentIndex]),
        });
        recordedIndexesRef.current.add(currentIndex);
      }
      if (currentIndex < totalQ - 1) {
        setCurrentIndex(prev => prev + 1);
        setSubmitted(false);
        setInputValue('');
      } else {
        await finishQuiz();
      }
    } catch {
      setError('Could not save this answer. Check your device storage and try again.');
    } finally {
      setSavingAnswer(false);
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
      const topic = q.topic || 'general';
      const state = ks[topic];
      const mastery = typeof state === 'object' && state !== null ? state.mastery : state;
      updatedMastery[topic] = typeof mastery === 'number' ? mastery : 0;
    }

    setScore(finalScore);
    const topicNames = Object.keys(updatedMastery);
    const masteryAfter = topicNames.length
      ? topicNames.reduce((sum, topic) => sum + updatedMastery[topic], 0) / topicNames.length
      : quiz.masteryBefore ?? 0;
    if (quiz.quizId) {
      await updateQuizScore(quiz.quizId, finalScore, {
        masteryBefore: quiz.masteryBefore,
        masteryAfter,
      });
    }

    // Weak topics for the Feynman "explain this topic" prompt (Req 3.1).
    const weak = Object.entries(updatedMastery)
      .filter(([, m]) => m < WEAK_MASTERY_THRESHOLD)
      .sort((a, b) => a[1] - b[1])
      .map(([topic]) => topic);
    setWeakTopics(weak);

    // Post-quiz technique diagnosis (Req 6.1–6.5). Only shown below 70% or on a
    // mastery plateau (Req 6.1). The orchestrator resolves the tier and never
    // throws — it falls back to the deterministic engine on any cloud failure —
    // so a failure here must never block the results screen.
    const fractionalScore = totalQ > 0 ? finalScore / totalQ : 0;
    const [previousQuizzes, previousFeynmanAttempts] = await Promise.all([
      getQuizzesByDocument(docId),
      getFeynmanAttempts(docId),
    ]);
    const priorMasteryAttempts = [
      ...previousQuizzes
        .filter(record => record.id !== quiz.quizId && Number.isFinite(record.masteryAfter))
        .map(record => ({ masteryAfter: record.masteryAfter, createdAt: record.createdAt })),
      ...previousFeynmanAttempts
        .filter(record => Number.isFinite(record.masteryAfter))
        .map(record => ({ masteryAfter: record.masteryAfter, createdAt: record.createdAt })),
    ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const masteryHistory = priorMasteryAttempts
      .slice(-2)
      .map(record => record.masteryAfter)
      .concat(masteryAfter);
    if (shouldDiagnose({ quizScore: fractionalScore, masteryHistory })) {
      try {
        const result = await diagnose({
          documentId: docId,
          currentHabit: technique || null,
          quizScore: fractionalScore,
          weakTopics: weak,
          masteryHistory,
        });
        setDiagnosis(result);
      } catch {
        setDiagnosis(null);
      }
    }

    setShowResult(true);
  }

  if (loading) return <div className="p-6"><LoadingSpinner message="Generating quiz..." /></div>;

  if (!quiz?.questions?.length) {
    const nothingDue = technique === 'spaced_repetition' && !error;
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
            <button onClick={() => navigate(`/student/document/${docId}`)} aria-label="Back to document" className="text-gray-500 hover:text-gray-700 text-xl min-h-[48px] min-w-[48px] flex items-center justify-center">‹</button>
            <h1 className="font-bold text-lg">{nothingDue ? 'All caught up' : 'Quiz unavailable'}</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="text-5xl mb-3" aria-hidden="true">{nothingDue ? '🌱' : '📚'}</div>
            <p className="text-gray-700">
              {nothingDue
                ? 'There are no topics due for spaced review right now. You can take a regular quiz or come back when a topic is due.'
                : 'No questions were generated. Please try again.'}
            </p>
            {error && <div className="mt-4"><ErrorMessage message={error} /></div>}
            <div className="mt-5 space-y-3">
              {technique === 'spaced_repetition' && (
                <button onClick={() => navigate(`/student/document/${docId}/quiz`)} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl min-h-[48px]">
                  Take a regular quiz now
                </button>
              )}
              {!nothingDue && (
                <button onClick={loadQuiz} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl min-h-[48px]">
                  Try again
                </button>
              )}
              <button onClick={() => navigate(`/student/document/${docId}`)} className="w-full border border-gray-200 text-gray-600 font-medium py-3 rounded-xl min-h-[48px]">
                Back to document
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (showResult) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
            <button onClick={() => navigate(`/student/document/${docId}`)} aria-label="Back to document" className="text-gray-500 hover:text-gray-700 text-xl min-h-[48px] min-w-[48px] flex items-center justify-center">‹</button>
            <h1 className="font-bold text-lg">Quiz Results</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl p-8 shadow-md text-center mb-6" role="status" aria-live="polite">
            <div className="text-6xl mb-4" aria-hidden="true">{score >= 4 ? '🎉' : score >= 3 ? '👍' : '📚'}</div>
            <h2
              ref={resultHeadingRef}
              tabIndex={-1}
              className="text-4xl font-bold text-indigo-700 mb-2 outline-none"
            >
              {score}/{totalQ}
            </h2>
            <div className="text-gray-500">
              {score >= 4 ? 'Excellent work!' : score >= 3 ? 'Good job!' : 'Keep studying!'}
            </div>
            <div className="mt-3">
              <TierBadge tier={quiz.tier} />
            </div>
          </div>

          {/* Question review */}
          <div className="space-y-3">
            {quiz.questions.map((q, i) => {
              const ans = answers[i];
              const correct = isCorrect(q, ans);
              return (
                <div key={i} className={`bg-white rounded-xl p-4 border-l-4 ${correct ? 'border-green-400' : 'border-red-400'} shadow-sm`}>
                  <div className="text-sm font-medium text-gray-700 mb-1">{q.question}</div>
                  <div className="text-sm mt-1">
                    <span className="text-gray-500">Your answer: </span>
                    <span className={correct ? 'text-green-600 font-medium' : 'text-red-600'}>{ans || '(no answer)'}</span>
                  </div>
                  {!correct && (
                    <div className="text-sm mt-0.5">
                      <span className="text-gray-500">Correct: </span>
                      <span className="text-green-600 font-medium">{q.correct_answer}</span>
                    </div>
                  )}
                  {q.explanation && (
                    <div className="text-xs text-gray-500 mt-1 italic">{q.explanation}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Post-quiz technique diagnosis (Req 6.1–6.5) ───────────────── */}
          {diagnosis && (
            <div
              className="mt-6 bg-white rounded-2xl p-5 border-2 border-amber-200 shadow-sm"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-gray-800">
                  <span aria-hidden="true" className="mr-1">💡</span>
                  Study tip
                </h3>
                <TierBadge tier={diagnosis.tier} />
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{diagnosis.reason}</p>
              {diagnosis.evidence && (
                <p className="text-xs text-gray-500 mt-2 italic">{diagnosis.evidence}</p>
              )}
              {diagnosis.expectedImprovement && (
                <p className="text-xs text-indigo-600 mt-2">{diagnosis.expectedImprovement}</p>
              )}
              {/* CTA → Review pre-set to the recommended technique (Req 6.5) */}
              {diagnosis.cta && (
                <Link
                  to={diagnosis.cta.to}
                  className="mt-4 w-full inline-flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl min-h-[48px] transition-colors"
                >
                  {diagnosis.cta.label} →
                </Link>
              )}
            </div>
          )}

          {/* ── Feynman "explain this topic" prompt for weak topics (Req 3.1) ─ */}
          {weakTopics.length > 0 && (
            <div className="mt-4 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-1">
                <span aria-hidden="true" className="mr-1">🗣️</span>
                Explain it to lock it in
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                Try explaining a weak topic in your own words — it exposes gaps a quiz can miss.
              </p>
              <div className="flex flex-wrap gap-2">
                {weakTopics.slice(0, 5).map(topic => (
                  <Link
                    key={topic}
                    to={`/student/document/${docId}/review?technique=feynman&topic=${encodeURIComponent(topic)}`}
                    className="inline-flex items-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm px-3 py-2 rounded-xl min-h-[48px] transition-colors"
                  >
                    Explain “{topic}”
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button
              onClick={restartQuiz}
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl min-h-[48px]"
            >
              Take Another Quiz
            </button>
            <button
              onClick={() => navigate(`/student/document/${docId}?tab=mastery`)}
              className="w-full border border-gray-200 text-gray-600 font-medium py-3 rounded-xl min-h-[48px]"
            >
              View Mastery
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate(`/student/document/${docId}`)} aria-label="Back to document" className="text-gray-500 hover:text-gray-700 text-xl min-h-[48px] min-w-[48px] flex items-center justify-center">‹</button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-800">Question {currentIndex + 1}/{totalQ}</span>
              {quiz && <TierBadge tier={quiz.tier} />}
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${((currentIndex + (submitted ? 1 : 0)) / totalQ) * 100}%` }}
              />
            </div>
          </div>
          {/* Optional Pomodoro overlay toggle (Req 2.2, 2.6). Only when the
              student chose Pomodoro for this document; the quiz works without it. */}
          {pomodoroEnabled && (
            <button
              type="button"
              onClick={() => setShowPomodoro(v => !v)}
              aria-pressed={showPomodoro}
              aria-label={showPomodoro ? 'Hide focus timer' : 'Show focus timer'}
              className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 text-xl shrink-0"
            >
              ⏱️
            </button>
          )}
        </div>
      </header>

      {error && <div className="max-w-2xl mx-auto px-4 pt-4"><ErrorMessage message={error} /></div>}

      {currentQ && (
        <main className="max-w-2xl mx-auto px-4 py-6">
          {/* Optional Pomodoro timer overlay (Req 2.1–2.6). Pure client, all
              tiers, no network. The quiz logic below is unchanged by it. */}
          {pomodoroEnabled && showPomodoro && (
            <PomodoroTimer className="mb-4" />
          )}

          {/* Difficulty / topic badge */}
          <div className="flex gap-2 mb-4">
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
              {currentQ.type === 'fill_in_blank' ? '✏️ Fill in blank' : currentQ.type === 'multiple_choice' ? '🔘 Multiple choice' : '✓✗ True/False'}
            </span>
            {currentQ.difficulty === 'review' && (
              <span className="text-xs bg-amber-100 text-amber-600 px-2 py-1 rounded-full">🔁 Review topic</span>
            )}
          </div>

          <fieldset className="border-0 p-0 m-0">
          {/* Question */}
          <legend className="bg-white rounded-2xl p-6 shadow-md mb-4 w-full">
            <p className="text-gray-800 text-lg leading-relaxed whitespace-pre-line">{currentQ.question}</p>
          </legend>

          {/* Choice options (Bedrock multiple choice and deterministic T/F). */}
          {isChoiceQuestion(currentQ) && (
            <div className="space-y-3" role="group" aria-label="Answer options">
              {(currentQ.options ?? ['True', 'False']).map(option => {
                const selected = answers[currentIndex] === option;
                const correct = submitted && option === currentQ.correct_answer;
                const wrong = submitted && selected && option !== currentQ.correct_answer;
                return (
                  <button
                    key={option}
                    onClick={() => !submitted && handleAnswer(option)}
                    className={`w-full p-4 rounded-xl border-2 text-left font-medium text-lg transition-all min-h-[56px] ${
                      wrong ? 'border-red-400 bg-red-50 text-red-700' :
                      correct ? 'border-green-400 bg-green-50 text-green-700' :
                      selected ? 'border-indigo-400 bg-indigo-50 text-indigo-700' :
                      'border-gray-200 bg-white hover:border-indigo-200 text-gray-700'
                    }`}
                    aria-pressed={selected}
                    disabled={submitted}
                  >
                    {option}
                    {submitted && correct && <span className="ml-2">✓</span>}
                    {submitted && wrong && <span className="ml-2">✗</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Fill-in-blank input */}
          {currentQ.type === 'fill_in_blank' && !submitted && (
            <div className="space-y-3">
              <label htmlFor="fill-in-blank-answer" className="sr-only">Your answer</label>
              <input
                id="fill-in-blank-answer"
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmitAnswer()}
                placeholder="Type your answer..."
                className="w-full border-2 border-gray-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-lg outline-none min-h-[56px]"
                autoFocus
              />
              <button
                onClick={handleSubmitAnswer}
                disabled={!inputValue.trim()}
                className="w-full bg-indigo-600 disabled:bg-gray-200 text-white disabled:text-gray-400 font-bold py-3 rounded-xl min-h-[48px] transition-colors"
              >
                Submit Answer
              </button>
            </div>
          )}

          {/* Fill-in-blank result */}
          {currentQ.type === 'fill_in_blank' && submitted && (
            <div role="status" aria-live="polite" className={`rounded-xl p-4 ${isCorrect(currentQ, answers[currentIndex]) ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="font-semibold text-sm">
                {isCorrect(currentQ, answers[currentIndex]) ? '✅ Correct!' : '❌ Incorrect'}
              </div>
              {!isCorrect(currentQ, answers[currentIndex]) && (
                <div className="text-sm mt-1">Answer: <span className="font-bold">{currentQ.correct_answer}</span></div>
              )}
              {currentQ.explanation && <div className="text-gray-500 text-xs mt-1">{currentQ.explanation}</div>}
            </div>
          )}

          {/* T/F result */}
          {isChoiceQuestion(currentQ) && submitted && answers[currentIndex] && (
            <div role="status" aria-live="polite" className={`rounded-xl p-4 mt-3 ${isCorrect(currentQ, answers[currentIndex]) ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="font-semibold text-sm">
                {isCorrect(currentQ, answers[currentIndex]) ? '✅ Correct!' : '❌ Incorrect'}
              </div>
              {currentQ.explanation && <div className="text-gray-500 text-xs mt-1">{currentQ.explanation}</div>}
            </div>
          )}

          </fieldset>

          {/* Next button (only if answered) */}
          {submitted && (
            <button
              onClick={handleNext}
              disabled={savingAnswer}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold py-4 rounded-xl mt-4 min-h-[56px] text-lg transition-colors"
            >
              {savingAnswer ? 'Saving…' : currentIndex < totalQ - 1 ? 'Next Question →' : 'See Results →'}
            </button>
          )}

          {/* Confirm a selected choice. */}
          {isChoiceQuestion(currentQ) && !submitted && answers[currentIndex] && (
            <button
              onClick={() => setSubmitted(true)}
              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl mt-4 min-h-[48px]"
            >
              Confirm Answer
            </button>
          )}
        </main>
      )}
    </div>
  );
}
