import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getDocument, getKnowledgeState, getQuizzesByDocument, getStudyTechnique, setStudyTechnique } from '../../db/database.js';
import { summarize } from '../../services/summarize/index.js';
import { TECHNIQUES } from '../../services/techniqueEngine.js';
import TierBadge from '../../components/shared/TierBadge.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Icon from '../../components/Icon.jsx';
import CardEditor from '../../components/CardEditor.jsx';
import AudioSummary from '../../components/AudioSummary.jsx';
import StudyTips from '../../components/StudyTips.jsx';
import LoadingSpinner from '../../components/shared/LoadingSpinner.jsx';
import ErrorMessage from '../../components/shared/ErrorMessage.jsx';

/** Plain names for what the upload clean-up removed. */
const CLEANUP_LABELS = {
  'form field': 'name, date and score fields',
  'blank to fill in': 'blank answer lines',
  'page number': 'page numbers',
  date: 'dates',
  noise: 'links, copyright and instructions',
  'header or footer': 'repeated headers and footers',
  'school name': 'school name',
};

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
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(['summary', 'cards', 'quiz', 'mastery'].includes(requestedTab) ? requestedTab : 'summary'); // summary | cards | quiz | mastery

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

  async function loadSummary(force = false) {
    setSummaryLoading(true);
    setError(null);
    try {
      const result = await summarize(docId, { force: force === true });
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
      <PageHeader eyebrow="Module" title={doc?.title} onBack={() => navigate('/student')} backLabel="Back">
        <div className="flex gap-1 p-1 mt-4 rounded-[14px]" style={{ background: 'var(--sb-chip)' }} role="tablist" aria-label="Module sections">
          {[
            { key: 'summary', label: 'Summary', icon: 'book' },
            { key: 'cards', label: 'Cards', icon: 'review' },
            { key: 'quiz', label: 'Quiz', icon: 'quiz' },
            { key: 'mastery', label: 'Mastery', icon: 'chart' },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center gap-2 rounded-[10px] text-sm font-bold transition-colors"
              style={activeTab === tab.key
                ? { background: 'var(--sb-surface)', color: 'var(--sb-primary)', boxShadow: '0 1px 3px rgba(27,43,68,0.12)' }
                : { color: 'var(--sb-muted)' }}
            >
              <Icon name={tab.icon} size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <main key={activeTab} className="max-w-[816px] mx-auto px-4 sm:px-8 py-5 sb-enter">
        <button onClick={() => navigate(`/student/document/${docId}/verify`)} className="sb-btn-ghost w-full mb-4">
          Check notes against a reference
        </button>
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

                {doc?.cleanup?.removed > 0 && (
                  <p className="flex items-start gap-2 text-xs sb-muted">
                    <Icon name="check" size={14} style={{ marginTop: 2, color: 'var(--sb-good)' }} />
                    <span>
                      Cleaned up before studying: removed {doc.cleanup.removed} line{doc.cleanup.removed === 1 ? '' : 's'} that {doc.cleanup.removed === 1 ? 'is' : 'are'} not
                      part of the lesson ({Object.keys(doc.cleanup.kinds ?? {}).map(k => CLEANUP_LABELS[k] ?? k).join(', ')}).
                    </span>
                  </p>
                )}

                {/* In short: at most three key points */}
                {(() => {
                  const c = summary.content ?? {};
                  const points = (Array.isArray(c.keyPoints) && c.keyPoints.length > 0
                    ? c.keyPoints
                    : (String(c.overview ?? '').match(/[^.!?]+[.!?]+/g) ?? [c.overview]).filter(Boolean)
                  ).slice(0, 3);
                  const ideas = (c.keyConcepts ?? []).filter(k => k.explanation && !/\(score:/.test(k.explanation)).slice(0, 8);
                  const topics = (c.keyTopics ?? []).slice(0, 6);
                  const outline = (c.studyOutline ?? []).slice(0, 5);
                  return (
                    <>
                      <section className="sb-card p-5" aria-labelledby="sum-short">
                        <h3 id="sum-short" className="sb-eyebrow mb-3">In short</h3>
                        <ol className="space-y-2.5">
                          {points.map((p, i) => (
                            <li key={i} className="flex gap-3 text-sm leading-relaxed">
                              <span className="sb-tile text-xs font-bold" style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--sb-sky)', color: 'var(--sb-primary)' }}>{i + 1}</span>
                              <span>{String(p).trim()}</span>
                            </li>
                          ))}
                        </ol>
                      </section>

                      {ideas.length > 0 && (
                        <section className="sb-card p-5" aria-labelledby="sum-ideas">
                          <h3 id="sum-ideas" className="sb-eyebrow mb-1">Key ideas</h3>
                          <dl>
                            {ideas.map((k, i) => (
                              <div key={i} className="sb-row py-3">
                                <dt className="font-bold text-sm capitalize">{k.term}</dt>
                                <dd className="text-sm sb-body mt-0.5">{k.explanation}</dd>
                                {k.importance && <dd className="text-xs sb-muted mt-1">Why it matters: {k.importance}</dd>}
                                {k.commonMistakes && <dd className="text-xs mt-1" style={{ color: 'var(--sb-amber-ink)' }}>Watch out: {k.commonMistakes}</dd>}
                              </div>
                            ))}
                          </dl>
                        </section>
                      )}

                      {outline.length > 0 && (
                        <section className="sb-card p-5" aria-labelledby="sum-order">
                          <h3 id="sum-order" className="sb-eyebrow mb-3">Study in this order</h3>
                          <ol className="space-y-2 text-sm">
                            {outline.map((t, i) => (
                              <li key={i} className="flex gap-3">
                                <span className="font-bold sb-muted">{i + 1}.</span>
                                <span className="capitalize">{t.name}</span>
                              </li>
                            ))}
                          </ol>
                        </section>
                      )}

                      {topics.length > 0 && (
                        <section aria-labelledby="sum-topics">
                          <h3 id="sum-topics" className="sr-only">Topics</h3>
                          <div className="flex flex-wrap gap-1.5">
                            {topics.map(topic => <span key={topic} className="sb-chip">{topic}</span>)}
                          </div>
                        </section>
                      )}
                    </>
                  );
                })()}

                {/* Listen: read-aloud script with a mini-quiz */}
                <AudioSummary title={doc?.title} content={summary.content} />

                {/* Personal study tips for this lesson */}
                <StudyTips
                  documentId={docId}
                  rawText={doc?.rawText}
                  keyTopics={summary.content?.keyTopics}
                  knowledgeState={knowledgeState}
                  quizzes={quizHistory}
                  technique={technique}
                />

                {/* Refresh button */}
                <button
                  onClick={() => loadSummary(true)}
                  className="w-full border border-gray-200 rounded-xl py-3 text-gray-500 hover:bg-gray-50 text-sm font-medium min-h-[48px]"
                >
                  Make a new summary
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
            <fieldset className="sb-card p-4">
              <legend className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
                Study Technique
              </legend>
              <p id="technique-help" className="text-xs text-gray-500 mb-3 px-1">
                Pick how you want to study. Tap again to go back to the plain quiz flow.
              </p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-describedby="technique-help">
                {[
                  { key: null, name: 'Plain Quiz', icon: <Icon name="quiz" size={15} />, desc: 'Standard flow' },
                  { key: 'pomodoro', name: TECHNIQUES.pomodoro.name, icon: <Icon name="timer" size={15} />, desc: 'Timed focus blocks' },
                  { key: 'feynman', name: TECHNIQUES.feynman.name, icon: <Icon name="speak" size={15} />, desc: 'Explain to learn' },
                  { key: 'spaced_repetition', name: TECHNIQUES.spaced_repetition.name, icon: <Icon name="flip" size={15} />, desc: 'Space it out' },
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
                        <span aria-hidden="true" className="inline-flex align-[-2px] mr-1.5">{opt.icon}</span>
                        {opt.name}
                        {selected && <Icon name="check" size={14} className="inline ml-1.5" />}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <button
              onClick={() => navigate(`/student/document/${docId}/quiz${technique ? `?technique=${encodeURIComponent(technique)}` : ''}`)}
              className="sb-btn w-full" style={{ minHeight: 56 }}
            >
              <Icon name="quiz" /> Start New Quiz
            </button>

            {/* Review + Dashboard entry links (Req 5.5, 7.1) */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate(`/student/document/${docId}/review${technique ? `?technique=${encodeURIComponent(technique)}` : ''}`)}
                className="sb-btn-ghost"
              >
                <Icon name="review" size={16} /> Review
              </button>
              <button
                onClick={() => navigate(`/student/document/${docId}/dashboard`)}
                className="sb-btn-ghost"
              >
                <Icon name="chart" size={16} /> Dashboard
              </button>
            </div>

            {/* Chat */}
            <button
              onClick={() => navigate(`/student/document/${docId}/chat`)}
              className="sb-btn-ghost w-full"
            >
              <Icon name="chat" size={16} /> Ask My Notes
            </button>

            {/* Quiz history */}
            {quizHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Quiz History</h3>
                <div className="space-y-2">
                  {quizHistory.slice(0, 5).map(quiz => (
                    <div key={quiz.id} className="sb-card p-4 flex items-center justify-between">
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

        {/* ── Cards Tab: fix what was generated ─────────────────────────── */}
        {activeTab === 'cards' && doc && (
          <CardEditor
            doc={doc}
            onSaved={async () => {
              setDoc(await getDocument(docId));
              setSummary(null); // rebuilt from the corrected cards on the next visit
            }}
          />
        )}

        {/* ── Mastery Tab ───────────────────────────────────────────────── */}
        {activeTab === 'mastery' && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-800">Topic Mastery</h2>
            {masteryTopics.length === 0 ? (
              <div className="sb-card p-8 text-center">
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
                    <div key={topic} className="sb-card p-4">
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
