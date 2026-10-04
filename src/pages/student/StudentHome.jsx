import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { saveDocument, deleteDocument, setSetting } from '../../db/database.js';
import { processDocument } from '../../utils/documentProcessor.js';
import { isPptxFile, isLegacyPptFile } from '../../utils/pptxExtractor.js';
import { loadOverview, formatDuration, relativeDay } from '../../services/home/overview.js';
import { maybeRemind } from '../../utils/preferences.js';
import { usePrefs } from '../../context/Prefs.jsx';
import LoadingSpinner from '../../components/shared/LoadingSpinner.jsx';
import ErrorMessage from '../../components/shared/ErrorMessage.jsx';
import MasteryCurve from '../../components/MasteryCurve.jsx';
import Icon, { BunnyScene } from '../../components/Icon.jsx';

function greetingFor(date) {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function StudentHome() {
  const navigate = useNavigate();
  const { prefs, ready } = usePrefs();
  const fileInputRef = useRef(null);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const now = new Date();

  useEffect(() => {
    refresh();
  }, []);

  // Study reminders: at most one local nudge per day, only when enabled.
  useEffect(() => {
    if (ready && prefs.reminders && overview) {
      maybeRemind(overview.due, overview.todayKey).catch(() => {});
    }
  }, [ready, prefs.reminders, overview]);

  async function refresh() {
    setLoading(true);
    try {
      setOverview(await loadOverview());
    } catch (err) {
      setError('Could not load documents. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(file) {
    if (uploading) return;
    if (file && isLegacyPptFile(file)) {
      setError('Old .ppt files cannot be read. In PowerPoint, choose Save As and pick .pptx or PDF, then upload that file.');
      return;
    }
    if (!file || !(file.type === 'application/pdf' || isPptxFile(file))) {
      setError('Please upload a PDF or PowerPoint (.pptx) file.');
      return;
    }
    setError(null);
    setUploading(true);
    setProgress('Starting…');
    try {
      const unit = isPptxFile(file) ? 'slide' : 'page';
      const { title, rawText, chunks, pages, lineText, cleanup, extraction, sourceType } = await processDocument(file, (p) => {
        if (p.stage === 'extracting') {
          setProgress(`Extracting ${unit} ${p.page} of ${p.pageCount}…`);
        } else if (p.stage === 'chunking') {
          setProgress('Removing names, dates and page numbers…');
        } else if (p.stage === 'done') {
          setProgress('Saving…');
        }
      });
      const docId = await saveDocument({ title, rawText, chunks, pages, lineText, cleanup, extraction, sourceType, createdAt: new Date() });
      await setSetting('lastDocumentId', docId);
      navigate(`/student/document/${docId}`);
    } catch (err) {
      setError(err.message || 'Failed to process this file. Please try another one.');
      setProgress(null);
    } finally {
      setUploading(false);
    }
  }

  function onFileInput(e) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function onDelete(set) {
    if (!confirm('Delete this document and all its study data?')) return;
    await deleteDocument(set.id);
    await refresh();
  }

  async function openSet(id) {
    await setSetting('lastDocumentId', id).catch(() => {});
    navigate(`/student/document/${id}`);
  }

  const firstName = prefs.name?.trim().split(/\s+/)[0];
  const sets = overview?.sets ?? [];
  const due = overview?.due ?? 0;
  const hasSets = sets.length > 0;

  // The daily-goal card adapts to what is actually on the device.
  const goal = !hasSets
    ? {
        title: 'Start with your notes',
        text: 'Upload a PDF or PowerPoint and Study Bunny turns it into review cards and quizzes, right on this device.',
        cta: <a href="#add-notes" className="sb-btn">Add your notes <Icon name="arrow" /></a>,
      }
    : due > 0
      ? {
          title: 'Keep your momentum going',
          text: `You have ${due} card${due === 1 ? '' : 's'} due today. A quick ${overview.dueMinutes}-minute review will keep your learning streak alive.`,
          cta: <Link to="/student/review" className="sb-btn">Start review <Icon name="arrow" /></Link>,
        }
      : {
          title: 'You are all caught up',
          text: 'No cards are due right now. A short quiz will keep things fresh and surface what to review next.',
          cta: <Link to="/student/quiz" className="sb-btn">Take a quiz <Icon name="arrow" /></Link>,
        };

  const stats = overview && [
    {
      icon: 'flame', tint: 'var(--sb-coral-bg)', ink: 'var(--sb-coral-ink)',
      value: `${overview.streak.current} day${overview.streak.current === 1 ? '' : 's'}`,
      label: 'Current streak', chip: `Best: ${overview.streak.best}`,
    },
    {
      icon: 'clock', tint: 'var(--sb-violet-bg)', ink: 'var(--sb-violet)',
      value: formatDuration(overview.weekSeconds), label: 'Study time', chip: 'This week',
    },
    {
      icon: 'check', tint: 'var(--sb-mint)', ink: 'var(--sb-mint-ink)',
      value: String(overview.mastered), label: 'Topics mastered',
      chip: overview.masteredThisWeek > 0 ? `+${overview.masteredThisWeek} this week` : 'This week: 0',
    },
  ];

  return (
    <main className="max-w-[1140px] mx-auto px-4 sm:px-8 lg:px-[52px] py-8 lg:py-10 flex flex-col gap-5 sb-stagger">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="sb-eyebrow">{now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="sb-title mt-1.5">{greetingFor(now)}{firstName ? `, ${firstName}` : ''}</h1>
        </div>
        <Link
          to="/student/profile"
          className="sb-icon-btn"
          style={{ background: 'var(--sb-surface)', border: '1px solid var(--sb-line)' }}
          aria-label={due > 0 ? `Reminders and settings, ${due} cards due` : 'Reminders and settings'}
        >
          <Icon name="bell" />
        </Link>
      </header>

      {/* Daily goal */}
      <section
        className="relative overflow-hidden rounded-[28px] px-6 py-8 sm:px-10 sm:py-9 flex flex-wrap items-center justify-between gap-6"
        style={{ background: 'var(--sb-sky)' }}
        aria-labelledby="daily-goal"
      >
        <div className="flex-1 basis-[320px] max-w-[520px]">
          <span className="sb-pill sb-eyebrow text-[11px]" style={{ background: 'var(--sb-surface)', color: 'var(--sb-primary)', letterSpacing: '0.12em' }}>
            <Icon name="sparkle" size={14} /> Daily goal
          </span>
          <h2 id="daily-goal" className="sb-display text-[28px] leading-tight mt-4 mb-2.5" style={{ letterSpacing: '-0.02em' }}>{goal.title}</h2>
          <p className="sb-body leading-relaxed mb-5">{goal.text}</p>
          {goal.cta}
        </div>
        <BunnyScene className="w-[130px] sm:w-[150px] h-auto mx-auto sm:mx-4 sb-float" />
      </section>

      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}

      {loading ? (
        <LoadingSpinner message="Loading documents..." />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.map(s => (
              <div key={s.label} className="sb-card flex items-center gap-3.5 p-[18px]">
                <span className="sb-tile" style={{ background: s.tint, color: s.ink }}><Icon name={s.icon} /></span>
                <div className="flex-1 min-w-0">
                  <div className="sb-display text-[19px]">{s.value}</div>
                  <div className="sb-sub">{s.label}</div>
                </div>
                <span className="sb-chip self-end">{s.chip}</span>
              </div>
            ))}
          </div>

          {/* Continue learning */}
          <section aria-labelledby="continue-learning">
            <h2 id="continue-learning" className="sb-h2 mt-3">Continue learning</h2>
            <p className="sb-sub mb-3.5">Pick up where you left off</p>
            {hasSets ? (
              <div className="sb-card overflow-hidden">
                {sets.map(set => (
                  <div key={set.id} className="sb-row flex items-center gap-2 pr-2">
                    <button type="button" onClick={() => openSet(set.id)} className="flex-1 min-w-0 flex items-center gap-4 px-[18px] py-3.5 text-left">
                      <span className="sb-tile sb-display text-xs text-white" style={{ background: set.color }}>{set.code}</span>
                      <span className="min-w-0 md:w-[240px] md:flex-none flex-1">
                        <span className="block font-bold truncate">{set.title}</span>
                        <span className="block text-xs sb-muted truncate">
                          {set.topics > 0 ? `${set.topics} topic${set.topics === 1 ? '' : 's'}` : `${set.sections} section${set.sections === 1 ? '' : 's'}`}
                          {' · '}
                          {set.lastReviewed ? `Reviewed ${relativeDay(set.lastReviewed)}` : 'Not studied yet'}
                        </span>
                      </span>
                      <span className="hidden md:block flex-1 sb-progress" aria-hidden="true">
                        <span style={{ width: `${set.masteryPct}%`, background: set.color }} />
                      </span>
                      <span className="text-xs font-bold sb-body w-10 text-right" aria-label={`${set.masteryPct} percent mastery`}>{set.masteryPct}%</span>
                      <Icon name="chevron" size={18} className="sb-muted" />
                    </button>
                    <button type="button" onClick={() => onDelete(set)} className="sb-icon-btn" aria-label={`Delete ${set.title}`}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sb-card px-6 py-10 text-center">
                <span className="sb-tile mx-auto mb-3" style={{ background: 'var(--sb-sky)', color: 'var(--sb-primary)' }}><Icon name="book" /></span>
                <p className="font-bold">No documents yet</p>
                <p className="sb-sub mt-1">Upload a PDF or PowerPoint to get started</p>
              </div>
            )}
          </section>

          {/* Add notes */}
          <section id="add-notes" aria-labelledby="add-notes-title">
            <h2 id="add-notes-title" className="sb-h2 mt-3">Add notes</h2>
            <p className="sb-sub mb-3.5">PDF and PowerPoint (.pptx) files are read and stored on this device. Text inside pictures or scanned pages cannot be read.</p>
            <div
              className="rounded-[18px] px-6 py-8 text-center transition-colors"
              style={{
                border: `2px dashed ${dragOver ? 'var(--sb-accent)' : 'var(--sb-line)'}`,
                background: dragOver ? 'var(--sb-sky-soft)' : 'var(--sb-surface)',
              }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              {uploading ? (
                <div>
                  <LoadingSpinner message="Processing your file..." />
                  <p role="status" aria-live="polite" className="sb-sub mt-3">{progress}</p>
                </div>
              ) : (
                <>
                  <p className="font-bold mb-1">Drop your PDF or PowerPoint here</p>
                  <p className="sb-sub mb-4">or choose a file from this device</p>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="sb-btn">
                    <Icon name="upload" />
                    Upload file
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                    onChange={onFileInput}
                    className="hidden"
                    aria-label="Choose PDF or PowerPoint file"
                  />
                </>
              )}
            </div>
          </section>

          {/* Today's plan + learning curve */}
          {hasSets && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <section aria-labelledby="todays-plan">
                <h2 id="todays-plan" className="sb-h2 mt-3">Today’s plan</h2>
                <p className="sb-sub mb-3.5">Built from what is due and what needs work</p>
                <div className="sb-card">
                  {overview.plan.map(item => (
                    <div key={item.key} className="sb-row flex items-center gap-3.5 p-[18px]">
                      <span
                        className="sb-tile"
                        style={{ width: 34, height: 34, borderRadius: 10, background: item.done ? 'var(--sb-mint)' : 'var(--sb-chip)', color: item.done ? 'var(--sb-mint-ink)' : 'var(--sb-body)' }}
                      >
                        <Icon name={item.done ? 'check' : item.kind === 'review' ? 'review' : 'quiz'} size={16} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{item.title}</div>
                        <div className="text-xs sb-muted">{item.detail}</div>
                      </div>
                      {item.done ? (
                        <span className="text-xs sb-muted whitespace-nowrap">
                          {item.time.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      ) : (
                        <Link to={item.to} className="sb-btn-soft" aria-label={`Start ${item.title}`}>Start</Link>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="sb-card p-[22px] lg:mt-3" aria-labelledby="learning-curve">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="sb-pill sb-eyebrow text-[11px]" style={{ background: 'var(--sb-sky)', color: 'var(--sb-primary)' }}>Learning curve</span>
                    <h3 id="learning-curve" className="sb-display text-[17px] mt-3">
                      {overview.curve.length === 0
                        ? 'Your curve starts with your first quiz'
                        : overview.curveDelta == null
                          ? 'One session down'
                          : overview.curveDelta > 0
                            ? 'Your mastery is climbing'
                            : overview.curveDelta < 0
                              ? 'A dip — review will bring it back'
                              : 'Holding steady'}
                    </h3>
                    <p className="text-xs sb-muted mb-2">
                      {overview.curve.length === 0
                        ? 'Each finished quiz or review adds a point here.'
                        : `Based on your last ${overview.curve.length} study session${overview.curve.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  {overview.curveDelta != null && (
                    <div className="rounded-xl px-3 py-2 text-center" style={{ background: 'var(--sb-sky)', color: 'var(--sb-primary)' }}>
                      <div className="sb-display text-[15px]">{overview.curveDelta > 0 ? '+' : ''}{overview.curveDelta}%</div>
                      <div className="text-[10px]">over these sessions</div>
                    </div>
                  )}
                </div>
                {overview.curve.length > 0 && <MasteryCurve points={overview.curve} />}
                {overview.curve.length >= 2 && (overview.curveDelta <= 0 || overview.curve[overview.curve.length - 1].pct < 70) && (
                  <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: 'var(--sb-amber-bg)', color: 'var(--sb-amber-ink)' }}>
                    <div className="font-bold">Your scores are not going up yet.</div>
                    <Link
                      to={`/student/document/${overview.curve[overview.curve.length - 1].documentId}/dashboard`}
                      className="inline-flex items-center gap-1.5 font-bold underline"
                      style={{ color: 'inherit' }}
                    >
                      See another technique to try <Icon name="arrow" size={14} />
                    </Link>
                  </div>
                )}
                {overview.strongest && (
                  <div className="flex items-center gap-3 mt-4 p-3 rounded-xl" style={{ background: 'var(--sb-sky-soft)' }}>
                    <span className="sb-tile" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--sb-surface)', color: 'var(--sb-primary)' }}><Icon name="sparkle" size={16} /></span>
                    <div className="flex-1 min-w-0 text-xs">
                      <div className="font-bold truncate">Strongest set: {overview.strongest.title}</div>
                      {overview.weakest && overview.weakest.id !== overview.strongest.id && (
                        <div className="sb-muted truncate">{overview.weakest.title} needs the most work.</div>
                      )}
                    </div>
                    <span className="sb-display text-[17px]" style={{ color: 'var(--sb-primary)' }}>{overview.strongest.masteryPct}%</span>
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
