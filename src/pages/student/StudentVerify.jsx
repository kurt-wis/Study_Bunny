import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDocument, getVerificationReports, saveVerificationReport } from '../../db/database.js';
import { processDocument } from '../../utils/documentProcessor.js';
import { detectPersonalData, redactPersonalData } from '../../../cloud-api/src/lib/privacy.js';
import { buildVerificationInput, MAX_NOTE_CHARS, MAX_REFERENCE_CHARS } from '../../services/verification/core.js';
import { verifyNotes } from '../../services/verification/index.js';
import { cloudEnabled } from '../../utils/cloudSession.js';
import CloudAccessPanel from '../../components/shared/CloudAccessPanel.jsx';
import TierBadge from '../../components/shared/TierBadge.jsx';

const labels = { supported: 'Supported by reference', contradicted: 'Conflicts with reference', insufficient_evidence: 'Insufficient evidence' };
const colors = { supported: 'border-green-200 bg-green-50', contradicted: 'border-amber-200 bg-amber-50', insufficient_evidence: 'border-gray-200 bg-white' };

function Report({ report }) {
  return <section className="space-y-3" aria-label="Note checking results">
    <div className="flex justify-between items-center gap-3"><h2 className="font-bold text-lg">Checking results</h2><TierBadge tier={report.tier} /></div>
    <p className="text-sm text-gray-600">Checked {report.checkedCount} of {report.totalClaims} detected statements in your excerpt. Reference: {report.referenceTitle || 'Pasted reference'}. Conclusions describe agreement with this source, which may contain errors.</p>
    {report.notice && <p role="status" className="text-sm bg-amber-50 p-3 rounded-xl">{report.notice}</p>}
    {report.claims.map(row => <article key={row.claimId} className={`rounded-xl border p-4 ${colors[row.status]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{labels[row.status]}</p>
      <h3 className="font-semibold text-gray-800 mt-2 break-words">{row.text}</h3>
      <p className="text-sm text-gray-700 mt-2 break-words">{row.explanation}</p>
      {row.correction && <p className="text-sm text-gray-700 mt-2"><strong>Suggested correction:</strong> {row.correction}</p>}
      {row.citations.map((citation, i) => <details key={`${citation.chunkId}-${i}`} className="mt-3 text-sm">
        <summary className="cursor-pointer min-h-[48px] py-3 text-indigo-700">Evidence passage {citation.chunkId.replace('reference-', '')}</summary>
        <blockquote className="border-l-2 border-indigo-300 pl-3 whitespace-pre-wrap break-words">“{citation.quote}”</blockquote>
        <p className="text-xs text-gray-500 mt-2">Reference excerpt (surrounding context)</p>
        <p className="text-gray-600 whitespace-pre-wrap break-words">{report.references.find(r => r.chunkId === citation.chunkId)?.text}</p>
      </details>)}
    </article>)}
  </section>;
}

export default function StudentVerify() {
  const { id } = useParams();
  const docId = Number(id);
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [notes, setNotes] = useState('');
  const [reference, setReference] = useState('');
  const [referenceTitle, setReferenceTitle] = useState('Pasted reference');
  const [custom, setCustom] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [useCloud, setUseCloud] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const terms = useMemo(() => custom.split('\n').filter(t => t.trim()), [custom]);
  const cleanNotes = useMemo(() => redactPersonalData(notes, terms), [notes, terms]);
  const cleanReference = useMemo(() => redactPersonalData(reference, terms), [reference, terms]);
  const detections = useMemo(() => [...detectPersonalData(notes), ...detectPersonalData(reference)], [notes, reference]);
  const types = [...new Set(detections.map(d => d.type))];
  let preview;
  try { preview = buildVerificationInput(notes, reference, terms); } catch { preview = null; }

  useEffect(() => {
    let active = true;
    Promise.all([getDocument(docId), getVerificationReports(docId)]).then(([document, reports]) => {
      if (!active) return;
      if (!document) { navigate('/student', { replace: true }); return; }
      setDoc(document); setNotes(document.rawText ?? ''); setHistory(reports); setLoading(false);
    }).catch(() => { if (active) { setError('Could not load your notes.'); setLoading(false); } });
    return () => { active = false; };
  }, [docId, navigate]);
  useEffect(() => { setReviewed(false); }, [notes, reference, custom]);

  async function uploadReference(file) {
    if (!file || busy) return;
    setBusy(true); setError(''); setProgress('Reading reference PDF…');
    try {
      const parsed = await processDocument(file, p => setProgress(p.stage === 'extracting' ? `Reading reference page ${p.page} of ${p.pageCount}…` : 'Preparing reference…'));
      setReference(parsed.rawText); setReferenceTitle(parsed.title);
    } catch (e) { setError(e.message || 'Could not read reference PDF.'); }
    finally { setBusy(false); setProgress(''); }
  }
  async function check() {
    setBusy(true); setError(''); setResult(null); setProgress(useCloud ? 'Checking claims against your reference…' : 'Comparing statements locally…');
    try {
      if (useCloud && !await cloudEnabled()) throw new Error('Enable Cloud AI and sign in above before AI checking.');
      const report = { ...await verifyNotes({ notes, reference, customTerms: terms, useCloud, reviewed }), referenceTitle };
      setResult(report);
      try { await saveVerificationReport(docId, report); setHistory(await getVerificationReports(docId)); }
      catch { setError('Results are shown, but could not be saved on this device.'); }
    } catch (e) { setError(e.message || 'Could not check your notes.'); }
    finally { setBusy(false); setProgress(''); }
  }

  if (loading) return <p className="p-6" role="status">Loading notes…</p>;
  return <div className="min-h-screen bg-gray-50">
    <header className="bg-white border-b border-gray-200"><div className="max-w-2xl mx-auto px-4 py-3 flex gap-3 items-center">
      <button className="min-h-[48px] min-w-[48px] text-indigo-700" aria-label="Back to document" onClick={() => navigate(`/student/document/${docId}`)}>‹</button>
      <div className="min-w-0"><h1 className="font-bold text-xl">Check my notes</h1><p className="text-sm text-gray-500 truncate">{doc?.title}</p></div>
    </div></header>
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <p className="text-sm text-gray-600">Compare academic statements with a textbook excerpt or teacher-approved reference. Review the evidence before changing your notes. Checking uses the first 12 detected statements per run; shorten or replace the excerpt to check the rest.</p>
      <CloudAccessPanel />
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        <label className="block font-semibold text-sm">Notes excerpt
          <textarea rows={7} className="mt-2 w-full border border-gray-300 rounded-xl p-3 text-sm font-normal" value={notes} disabled={busy} onChange={e => setNotes(e.target.value)} />
          <span className="text-xs font-normal text-gray-600">{notes.length.toLocaleString()} / {MAX_NOTE_CHARS.toLocaleString()} characters. Edit here without changing your original document.</span>
        </label>
        <label className="block font-semibold text-sm">Reference PDF
          <input type="file" accept="application/pdf,.pdf" disabled={busy} className="block mt-2 w-full min-h-[48px] text-sm font-normal" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; uploadReference(file); }} />
        </label>
        <label className="block font-semibold text-sm">Reference text or excerpt
          <textarea rows={7} className="mt-2 w-full border border-gray-300 rounded-xl p-3 text-sm font-normal" value={reference} disabled={busy} onChange={e => { setReference(e.target.value); setReferenceTitle('Edited reference'); }} placeholder="Paste a trusted source or upload a text-based PDF above." />
          <span className="text-xs font-normal text-gray-600">{reference.length.toLocaleString()} / {MAX_REFERENCE_CHARS.toLocaleString()} characters. Reference uploads stay on this device.</span>
        </label>
      </section>
      <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-3" aria-label="Privacy review">
        <h2 className="font-semibold">Review personal details</h2>
        <p className="text-sm text-gray-600">Detected {detections.length} possible personal details{types.length ? ` (${types.join(', ')})` : ''}. Automatic detection covers emails, phone numbers, labelled student IDs, names, and addresses. It can miss unlabelled or unusual details.</p>
        <label className="block text-sm">Additional names or details to redact (one per line)
          <textarea rows={2} value={custom} disabled={busy} onChange={e => setCustom(e.target.value)} className="w-full mt-2 border border-gray-300 rounded-xl p-3" placeholder="Add any personal detail the detector missed." />
        </label>
        <details><summary className="cursor-pointer text-indigo-700 min-h-[48px] py-3">Preview redacted notes and reference</summary>
          <h3 className="font-semibold text-sm">Notes</h3><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm p-3 bg-gray-50 rounded-xl">{cleanNotes}</pre>
          <h3 className="font-semibold text-sm mt-3">Reference</h3><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm p-3 bg-gray-50 rounded-xl">{cleanReference}</pre>
        </details>
        <label className="flex gap-3 items-start text-sm min-h-[48px] py-3"><input type="checkbox" className="mt-1" checked={useCloud} disabled={busy} onChange={e => setUseCloud(e.target.checked)} /><span>Use AI to interpret claims against the reference. Without AI, checking recognizes matching wording only.</span></label>
        {useCloud && <label className="flex gap-3 items-start text-sm min-h-[48px] py-3"><input type="checkbox" className="mt-1" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} /><span>I reviewed the redacted previews and agree to send these claims and this reference excerpt to Cloud AI.</span></label>}
        {preview && <p className="text-sm text-gray-600">This run checks {preview.claims.length} of {preview.totalClaims} detected statements. The reference is split into {preview.references.length} evidence passages.</p>}
        <button disabled={busy || !preview || (useCloud && !reviewed)} onClick={check} className="w-full bg-indigo-600 text-white disabled:bg-gray-300 font-semibold rounded-xl py-3 min-h-[48px]">{busy ? 'Working…' : useCloud ? 'Check with AI' : 'Compare offline'}</button>
        {!preview && notes && reference && <p className="text-sm text-amber-800">Choose notes up to 16,000 characters and a reference up to 60,000 characters. Statements must be 12–1,200 characters long.</p>}
      </section>
      {progress && <p role="status" className="text-sm text-gray-600">{progress}</p>}
      {error && <p role="alert" className="text-sm bg-red-50 text-red-700 p-4 rounded-xl">{error}</p>}
      <p role="status" className="sr-only">{result ? `Checking complete. ${result.checkedCount} statements checked.` : ''}</p>
      {result && <Report report={result} />}
      {history.length > 0 && <details className="border-t border-gray-200 pt-4"><summary className="cursor-pointer min-h-[48px] font-semibold">Saved checks on this device ({history.length})</summary>
        <p className="text-xs text-gray-500 mb-3">Saved results refer to the excerpts used at the time; they are not updated when you edit notes or references.</p>
        {history.map(report => <details key={report.id} className="mb-3"><summary className="cursor-pointer min-h-[48px] text-sm text-indigo-700 py-3">{new Date(report.createdAt).toLocaleString('en-PH')} · {report.checkedCount} statements</summary><Report report={report} /></details>)}
      </details>}
    </main>
  </div>;
}
