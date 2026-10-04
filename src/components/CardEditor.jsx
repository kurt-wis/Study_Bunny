import React, { useEffect, useMemo, useState } from 'react';
import { extractDefinitions } from '../ai/definitions.js';
import { updateDocumentItems } from '../db/database.js';
import Icon from './Icon.jsx';
import ErrorMessage from './shared/ErrorMessage.jsx';

let nextKey = 1;
const blankRow = () => ({ key: `new-${nextKey++}`, term: '', definition: '' });

/**
 * CardEditor — lets the student correct what Study Bunny pulled out of a
 * handout. Each card is a term and its meaning. Flashcards, the offline quiz
 * and the summary are built from this list, so fixing a card here fixes it
 * everywhere. Cards can be edited, removed or added, and "Reset" goes back to
 * the automatic list.
 */
export default function CardEditor({ doc, onSaved }) {
  const automatic = useMemo(() => extractDefinitions(doc?.lineText || doc?.rawText || ''), [doc?.lineText, doc?.rawText]);
  const edited = Array.isArray(doc?.items) && doc.items.length > 0;
  const starting = useMemo(
    () => (edited ? doc.items : automatic).map(d => ({ key: `row-${nextKey++}`, term: d.term, definition: d.definition })),
    [doc?.id, doc?.items, automatic, edited],
  );
  const [rows, setRows] = useState(starting);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { setRows(starting); }, [starting]);

  const valid = rows
    .map(r => ({ term: r.term.replace(/\s+/g, ' ').trim(), definition: r.definition.replace(/\s+/g, ' ').trim() }))
    .filter(r => r.term && r.definition);
  const incomplete = rows.filter(r => (r.term.trim() === '') !== (r.definition.trim() === '')).length;
  const changed = JSON.stringify(valid) !== JSON.stringify(starting.map(r => ({ term: r.term, definition: r.definition })));

  function update(key, field, value) {
    setNotice('');
    setRows(prev => prev.map(r => (r.key === key ? { ...r, [field]: value } : r)));
  }

  async function save() {
    setSaving(true); setError(''); setNotice('');
    try {
      await updateDocumentItems(doc.id, valid);
      setNotice(`Saved ${valid.length} card${valid.length === 1 ? '' : 's'}. Flashcards, quizzes and the summary now use your version.`);
      await onSaved?.();
    } catch {
      setError('Could not save your cards. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!confirm('Go back to the cards Study Bunny made automatically? Your edits to these cards will be lost.')) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await updateDocumentItems(doc.id, null);
      setNotice('Back to the automatic cards.');
      await onSaved?.();
    } catch {
      setError('Could not reset the cards. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="sb-h2">Cards from this module</h2>
        <p className="sb-sub mt-1">
          Study Bunny can get things wrong. Fix a term or its meaning, remove cards that should not be here, or add your own.
          Flashcards, offline quizzes and the summary are made from this list.
        </p>
        <p className="sb-chip mt-2">{edited ? 'Edited by you' : 'Made automatically'}</p>
      </div>

      {rows.length === 0 && (
        <div className="sb-card p-6 text-center">
          <p className="font-bold">No cards were found in this module</p>
          <p className="sb-sub mt-1">Add your own terms and meanings below. Until then, quizzes are made from the sentences in your notes.</p>
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <li key={row.key} className="sb-card p-4 sb-enter">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="sb-eyebrow text-[11px]">Card {i + 1}</span>
              <button
                type="button"
                className="sb-icon-btn"
                aria-label={`Remove card ${i + 1}${row.term ? `: ${row.term}` : ''}`}
                onClick={() => { setNotice(''); setRows(prev => prev.filter(r => r.key !== row.key)); }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
            <label className="block text-xs font-bold">
              Term
              <input
                className="sb-input mt-1"
                style={{ minHeight: 48 }}
                value={row.term}
                maxLength={80}
                onChange={e => update(row.key, 'term', e.target.value)}
                placeholder="For example: Mitochondria"
              />
            </label>
            <label className="block text-xs font-bold mt-3">
              Meaning
              <textarea
                className="sb-input mt-1"
                style={{ minHeight: 72, padding: '12px 16px' }}
                rows={2}
                value={row.definition}
                maxLength={300}
                onChange={e => update(row.key, 'definition', e.target.value)}
                placeholder="For example: the part of the cell that produces energy"
              />
            </label>
          </li>
        ))}
      </ol>

      <button type="button" className="sb-btn-ghost self-start" onClick={() => { setNotice(''); setRows(prev => [...prev, blankRow()]); }}>
        <Icon name="check" size={16} /> Add a card
      </button>

      {incomplete > 0 && (
        <p className="text-xs" style={{ color: 'var(--sb-amber-ink)' }}>
          {incomplete} card{incomplete === 1 ? ' is' : 's are'} missing a term or a meaning and will not be saved.
        </p>
      )}
      {notice && <p role="status" className="text-sm rounded-xl px-4 py-3" style={{ background: 'var(--sb-mint)', color: 'var(--sb-mint-ink)' }}>{notice}</p>}
      {error && <ErrorMessage message={error} />}

      <div className="flex flex-wrap gap-3 sticky bottom-[100px] lg:bottom-4 p-3 rounded-[18px]" style={{ background: 'var(--sb-surface)', border: '1px solid var(--sb-line)', boxShadow: 'var(--sb-shadow)' }}>
        <button type="button" className="sb-btn flex-1 basis-[180px]" disabled={!changed || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {edited && <button type="button" className="sb-btn-ghost" disabled={saving} onClick={reset}>Reset to automatic</button>}
      </div>
    </div>
  );
}
