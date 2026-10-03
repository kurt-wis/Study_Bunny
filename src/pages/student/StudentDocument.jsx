import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDocument, getKnowledgeState, getQuizzesByDocument, getStudyTechnique, setStudyTechnique } from '../../db/database.js';
import { summarize } from '../../services/summarize/index.js';
import { TECHNIQUES } from '../../services/techniqueEngine.js';
import TierBadge from '../../components/shared/TierBadge.jsx';
import LoadingSpinner from '../../components/shared/LoadingSpinner.jsx';
import ErrorMessage from '../../components/shared/ErrorMessage.jsx';

export default function StudentDocument() {
  const { id } = useParams();
  const navigate = useNavigate();
  const docId = parseInt(id, 10);

  const [doc, setDoc] = useState(null);
  const [summary, setSummary] = useState(null);
  const [knowledgeState, setKnowledgeState] = useState({});
  const [quizHistory, setQuizHistory] = useState([]);
  const [technique, setTechnique] = useState(null); // selected technique key or null (plain flow)
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('summary'); // summary | quiz | mastery

  useEffect(() => {
    loadData();
  }, [docId]);

  async function loadData() {
    setLoading(true);
    try {
      const [docData, ks, quizzes, techRecord] = await Promise.all([
        getDocument(docId),
        getKnowledgeState(docId),
        getQuizzesByDocument(docId),
        getStudyTechnique(docId),
      ]);
      if (!docData) { navigate('/student'); return; }
      setDoc(docData);
      setKnowledgeState(ks);
      setQuizHistory(quizzes);
      // Restore the previously-selected technique for this document (Req 1.2).
      // Absence means the plain quiz/review flow (Req 1.3).
      setTechnique(techRecord?.technique ?? null);
    } catch (err) {
      setError('Failed to load document data.');
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    setSummaryLoading(true);
    setError(null);
    try {
      const result = await summarize(docId);
      setSummary(result);
    } catch (err) {
      setError(err.message || 'Failed to generate summary.');
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    if (!loading && doc && activeTab === 'summary' && !summary) {
      loadSummary();
    }
  }, [loading, doc, activeTab]);

  // Select / change / clear the technique for this document. Persisted keyed by
  // documentId and reused on the next visit (Req 1.2, 1.4). Picking the same
  // technique again clears it, returning to the plain flow (Req 1.3). Only the
  // forward-looking selection changes; past session records are untouched (Req 1.4).
  async function selectTechnique(key) {
    const next = technique === key ? null : key;
    setTechnique(next);
    try {
      await setStudyTechnique(docId, next);
    } catch {
      // Persistence is best-effort; the in-memory selection still drives this session.
    }
  }

  const masteryTopics = Object.entries(knowledgeState).sort((a, b) => {
    const ma = typeof a[1] === 'object' ? a[1].mastery : a[1];
    const mb = typeof b[1] === 'object' ? b[1].mastery : b[1];
    return ma - mb;
  });

  if (loading) return <div className="p-6"><LoadingSpinner message="Loading document..." /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/student')} className="text-gray-500 hover:text-gray-700 text-xl min-h-[48px] min-w-[48px] flex items-center justify-center" aria-label="Back">‹</button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-800 truncate">{doc?.title}</h1>
          </div>
        </div>
        {/* Tab bar */}
        <div className="max-w-2xl mx-auto px-4 flex gap-0 border-t border-gray-100">
          {[
            { key: 'summary', label: '📋 Summary' },
            { key: 'quiz', label: '✏️ Quiz' },
            { key: 'mastery', label: '📊 Mastery' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {error && <ErrorMessage message={error} onRetry={() => { setError(null); if (activeTab === 'summary') loadSummary(); }} />}

        {/* ── Summary Tab ─────────────────────────────────────────────── */}
        {activeTab === 'summary' && (
          <div className="space-y-4" aria-live="polite">
            {summaryLoading ? (
              <LoadingSpinner message="Generating summary..." />
            ) : summary ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-800">Summary</h2>
                  <TierBadge tier={summary.tier} />
                </div>

                {/* Overview */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Overview</h3>
                  <p className="text-gray-700 leading-relaxed text-sm">{summary.content.overview}</p>
                </div>

                {/* Key Topics */}
                {summary.content.keyTopics?.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Key Topics</h3>
                    <div className="flex flex-wrap gap-2">
                      {summary.content.keyTopics.map(topic => (
                        <span key={topic} className="bg-indigo-50 text-indigo-700 text-sm px-3 py-1 rounded-full">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Concepts (cloud) */}
                {summary.content.keyConcepts?.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Key Concepts</h3>
                    <div className="space-y-3">
                      {summary.content.keyConcepts.map((c, i) => (
                        <div key={i} className="border-l-2 border-indigo-200 pl-3">
                          <div className="font-semibold text-gray-800 text-sm">{c.term}</div>
                          <div className="text-gray-500 text-sm mt-0.5">{c.explanation}</div>
                          {c.importance && <div className="text-gray-500 text-xs mt-0.5">💡 {c.importance}</div>}
                          {c.commonMistakes && <div className="text-amber-600 text-xs mt-0.5">⚠️ {c.commonMistakes}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Study Outline */}
                {summary.content.studyOutline?.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Study Outline</h3>
                    <div className="space-y-2">
                      {summary.content.studyOutline.map((topic, i) => (
                        <div key={i}>
                          <div className="font-semibold text-gray-700 text-sm">📌 {topic.name}</div>
                          {topic.keywords?.length > 0 && (
                            <div className="text-gray-500 text-xs mt-0.5 ml-4">
                              {topic.keywords.join(' · ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Refresh button */}
                <button
                  onClick={loadSummary}
                  className="w-full border border-gray-200 rounded-xl py-3 text-gray-500 hover:bg-gray-50 text-sm font-medium min-h-[48px]"
                >
                  🔄 Regenerate Summary
                </button>
              </>
            ) : null}
          </div>
        )}

        {/* ── Quiz Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'quiz' && (
          <div className="space-y-4">
            {/* Technique picker — the three in-scope techniques plus the default
                plain flow (Req 1.1). The selection persists per document (Req 1.2)
                and defaults to the plain flow when none is chosen (Req 1.3). */}
            <fieldset className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <legend className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
                Study Technique
              </legend>
              <p id="technique-help" className="text-xs text-gray-500 mb-3 px-1">
                Pick how you want to study. Tap again to go back to the plain quiz flow.
              </p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-describedby="technique-help">
                {[
                  { key: null, name: 'Plain Quiz', icon: '📝', desc: 'Standard flow' },
                  { key: 'pomodoro', name: TECHNIQUES.pomodoro.name, icon: '⏱️', desc: 'Timed focus blocks' },
                  { key: 'feynman', name: TECHNIQUES.feynman.name, icon: '🗣️', desc: 'Explain to learn' },
                  { key: 'spaced_repetition', name: TECHNIQUES.spaced_repetition.name, icon: '🔁', desc: 'Space it out' },
                ].map(opt => {
                  const selected = technique === opt.key;
                  return (
                    <button
                      key={opt.key ?? 'plain'}
                      type="button"
                      onClick={() => selectTechnique(opt.key)}
                      aria-pressed={selected}
                      className={`text-left p-3 rounded-xl border-2 transition-all min-h-[48px] ${
                        selected
                          ? 'border-indigo-400 bg-indigo-50'
                          : 'border-gray-200 bg-white hover:border-indigo-200'
                      }`}
                    >
                      <div className={`text-sm font-semibold ${selected ? 'text-indigo-700' : 'text-gray-700'}`}>
                        <span aria-hidden="true" className="mr-1">{opt.icon}</span>
                        {opt.name}
                        {selected && <span className="ml-1" aria-hidden="true">✓</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <button
              onClick={() => navigate(`/student/document/${docId}/quiz${technique ? `?technique=${encodeURIComponent(technique)}` : ''}`)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-colors min-h-[56px] text-lg"
            >
              ✏️ Start New Quiz
            </button>

            {/* Review + Dashboard entry links (Req 5.5, 7.1) */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate(`/student/document/${docId}/review${technique ? `?technique=${encodeURIComponent(technique)}` : ''}`)}
                className="bg-white border-2 border-indigo-200 hover:border-indigo-400 text-indigo-700 font-semibold py-3 rounded-2xl transition-colors min-h-[48px]"
              >
                🎯 Review
              </button>
              <button
                onClick={() => navigate(`/student/document/${docId}/dashboard`)}
                className="bg-white border-2 border-indigo-200 hover:border-indigo-400 text-indigo-700 font-semibold py-3 rounded-2xl transition-colors min-h-[48px]"
              >
                📈 Dashboard
              </button>
            </div>

            {/* Chat */}
            <button
              onClick={() => navigate(`/student/document/${docId}/chat`)}
              className="w-full bg-white border-2 border-indigo-200 hover:border-indigo-400 text-indigo-700 font-semibold py-3 rounded-2xl transition-colors min-h-[48px]"
            >
              💬 Ask My Notes
            </button>

            {/* Quiz history */}
            {quizHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Quiz History</h3>
                <div className="space-y-2">
                  {quizHistory.slice(0, 5).map(quiz => (
                    <div key={quiz.id} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-700">
                          {quiz.score !== null ? `Score: ${quiz.score}/5` : 'Not completed'}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {new Date(quiz.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      <TierBadge tier={quiz.tier} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Mastery Tab ───────────────────────────────────────────────── */}
        {activeTab === 'mastery' && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-800">Topic Mastery</h2>
            {masteryTopics.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center border border-gray-100">
                <div className="text-4xl mb-3">📊</div>
                <p className="text-gray-500">No mastery data yet</p>
                <p className="text-gray-500 text-sm mt-1">Take a quiz to start tracking your progress</p>
              </div>
            ) : (
              <div className="space-y-3">
                {masteryTopics.map(([topic, state]) => {
                  const mastery = typeof state === 'object' ? state.mastery : state;
                  const pct = Math.round(mastery * 100);
                  const color = mastery < 0.4 ? 'bg-red-400' : mastery < 0.7 ? 'bg-yellow-400' : 'bg-green-500';
                  const label = mastery < 0.4 ? 'Needs work' : mastery < 0.7 ? 'Learning' : 'Mastered';
                  return (
                    <div key={topic} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 truncate">{topic}</span>
                        <span className="text-sm text-gray-500 shrink-0 ml-2">{pct}% · {label}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
