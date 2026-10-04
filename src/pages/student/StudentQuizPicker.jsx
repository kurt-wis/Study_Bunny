import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAllDocuments, getSetting } from '../../db/database.js';
import { loadOverview } from '../../services/home/overview.js';
import LoadingSpinner from '../../components/shared/LoadingSpinner.jsx';
import Icon from '../../components/Icon.jsx';

/**
 * StudentQuizPicker — the Quiz entry in the workspace menu. Instead of jumping
 * straight into a quiz on the last module opened, the student chooses:
 *   • which module to be quizzed on (the last one opened is pre-selected);
 *   • several modules, to mix their questions into one quiz;
 *   • for a single module, optionally only some of its pages or slides.
 */
export default function StudentQuizPicker() {
  const navigate = useNavigate();
  const [sets, setSets] = useState(undefined); // undefined = loading
  const [selected, setSelected] = useState([]);
  const [part, setPart] = useState('all'); // 'all' | 'range'
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('1');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [overview, documents, lastId] = await Promise.all([loadOverview(), getAllDocuments(), getSetting('lastDocumentId', null)]);
        if (cancelled) return;
        const info = new Map(documents.map(d => [d.id, d]));
        const list = overview.sets.map(s => ({
          ...s,
          pageCount: Array.isArray(info.get(s.id)?.pages) ? info.get(s.id).pages.length : 0,
          unit: info.get(s.id)?.sourceType === 'pptx' ? 'slide' : 'page',
        }));
        setSets(list);
        const first = list.find(s => s.id === lastId) ?? list[0];
        if (first) setSelected([first.id]);
      } catch {
        if (!cancelled) setSets([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const only = sets && selected.length === 1 ? sets.find(s => s.id === selected[0]) : null;
  const canPickPart = Boolean(only && only.pageCount > 1);

  // Whenever the chosen module changes, go back to "whole module".
  useEffect(() => {
    setPart('all');
    setFrom('1');
    setTo(String(only?.pageCount || 1));
  }, [only?.id, only?.pageCount]);

  if (sets === undefined) {
    return <div className="px-4 py-16"><LoadingSpinner message="Loading your modules..." /></div>;
  }

  if (sets.length === 0) {
    return (
      <main className="max-w-xl mx-auto px-4 py-16 text-center">
        <span className="sb-tile mx-auto mb-4" style={{ background: 'var(--sb-sky)', color: 'var(--sb-primary)' }}>
          <Icon name="quiz" />
        </span>
        <h1 className="sb-title mb-2">No quiz yet</h1>
        <p className="sb-body mb-6">Add your notes on Home and Study Bunny will turn them into quizzes.</p>
        <Link to="/student" className="sb-btn">Go to Home <Icon name="arrow" /></Link>
      </main>
    );
  }

  function toggle(id) {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  const fromNum = parseInt(from, 10);
  const toNum = parseInt(to, 10);
  const rangeValid = !canPickPart || part === 'all'
    || (Number.isInteger(fromNum) && Number.isInteger(toNum) && fromNum >= 1 && toNum <= only.pageCount && fromNum <= toNum);
  const canStart = selected.length > 0 && rangeValid;

  function start() {
    if (!canStart) return;
    // Keep the order shown on screen; the first module is where the quiz is saved.
    const ids = sets.filter(s => selected.includes(s.id)).map(s => s.id);
    const params = new URLSearchParams();
    if (ids.length > 1) params.set('docs', ids.join(','));
    if (ids.length === 1 && canPickPart && part === 'range' && !(fromNum === 1 && toNum === only.pageCount)) {
      params.set('from', String(fromNum));
      params.set('to', String(toNum));
    }
    const query = params.toString();
    navigate(`/student/document/${ids[0]}/quiz${query ? `?${query}` : ''}`);
  }

  const unit = only?.unit ?? 'page';
  const Unit = unit === 'slide' ? 'Slides' : 'Pages';

  return (
    <main className="max-w-[640px] mx-auto px-4 sm:px-8 py-8 lg:py-10 flex flex-col gap-5 sb-enter">
      <header>
        <p className="sb-eyebrow">Quick quiz</p>
        <h1 className="sb-title mt-1.5">What do you want to be quizzed on?</h1>
        <p className="sb-sub mt-1">Choose one module, or tick several to mix them into one quiz.</p>
      </header>

      <fieldset className="border-0 p-0 m-0 min-w-0">
        <legend className="sr-only">Modules to quiz</legend>
        <div className="flex flex-col gap-2.5">
          {sets.map(set => {
            const checked = selected.includes(set.id);
            return (
              <label key={set.id} className="sb-option cursor-pointer" data-state={checked ? 'correct' : undefined}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(set.id)}
                  style={{ width: 20, height: 20, flex: 'none' }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{set.title}</span>
                  <span className="block text-xs sb-muted truncate">
                    {set.pageCount > 0 ? `${set.pageCount} ${set.unit}${set.pageCount === 1 ? '' : 's'} · ` : ''}
                    {set.topics > 0 ? `${set.masteryPct}% mastery` : 'Not studied yet'}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {canPickPart && (
        <fieldset className="sb-card p-5 m-0 min-w-0">
          <legend className="sr-only">Which part of the module</legend>
          <p className="font-bold mb-3">Which part?</p>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 cursor-pointer min-h-[32px]">
              <input type="radio" name="quiz-part" checked={part === 'all'} onChange={() => setPart('all')} style={{ width: 20, height: 20, flex: 'none' }} />
              <span>The whole module</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer min-h-[32px]">
              <input type="radio" name="quiz-part" checked={part === 'range'} onChange={() => setPart('range')} style={{ width: 20, height: 20, flex: 'none' }} />
              <span>Only some {unit}s</span>
            </label>
            {part === 'range' && (
              <div className="flex flex-wrap items-center gap-3 pl-8">
                <label className="flex items-center gap-2 text-sm">
                  {Unit} from
                  <input
                    type="number" inputMode="numeric" min={1} max={only.pageCount} value={from}
                    onChange={e => setFrom(e.target.value)}
                    className="sb-input" style={{ width: 88 }}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  to
                  <input
                    type="number" inputMode="numeric" min={1} max={only.pageCount} value={to}
                    onChange={e => setTo(e.target.value)}
                    className="sb-input" style={{ width: 88 }}
                  />
                </label>
                <span className="text-xs sb-muted">of {only.pageCount}</span>
              </div>
            )}
            {part === 'range' && !rangeValid && (
              <p role="alert" className="text-sm pl-8" style={{ color: 'var(--sb-coral-ink)' }}>
                Enter {unit} numbers between 1 and {only.pageCount}, with the first not after the last.
              </p>
            )}
          </div>
        </fieldset>
      )}

      {selected.length > 1 && (
        <p className="sb-sub" role="status">
          Questions will be mixed from {selected.length} modules. Each answer still counts toward its own module’s mastery.
        </p>
      )}

      <button type="button" className="sb-btn" disabled={!canStart} onClick={start}>
        {selected.length === 0 ? 'Choose a module' : 'Start quiz'} <Icon name="arrow" />
      </button>
    </main>
  );
}
