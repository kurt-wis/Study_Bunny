import React, { useEffect, useState } from 'react';
import { getAccessCode, setAccessCode, disableCloud } from '../../utils/cloudSession.js';
import { apiHealthCheck } from '../../utils/apiTransport.js';
import { getSetting, setSetting } from '../../db/database.js';
import { invalidateHealthCache } from '../../utils/tierDetection.js';

/**
 * CloudAccessPanel — the one place a student turns Cloud AI on or off.
 * Needs consent plus the shared access code; no account or sign-in.
 */
export default function CloudAccessPanel() {
  const [available, setAvailable] = useState(null); // null = checking
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [savedCode, setSavedCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false); // saved settings read; controls stay disabled until then

  useEffect(() => {
    let active = true;
    Promise.all([getSetting('cloudConsent', false), getAccessCode()])
      .then(([enabled, stored]) => { if (active) { setConsent(Boolean(enabled)); setSavedCode(stored); setCode(stored); setLoaded(true); } })
      .catch(() => { if (active) setError('Could not read cloud preferences.'); });
    apiHealthCheck().then(ok => { if (active) setAvailable(ok); }).catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, []);

  async function changeConsent(value) {
    try { setError(''); setNotice(''); await setSetting('cloudConsent', value); setConsent(value); invalidateHealthCache(); }
    catch { setError('Could not save your cloud preference.'); }
  }

  async function saveCode(e) {
    e.preventDefault();
    try {
      setError('');
      await setAccessCode(code);
      setSavedCode(code.trim());
      invalidateHealthCache();
      setNotice(code.trim() ? 'Access code saved on this device.' : 'Access code removed.');
    } catch { setError('Could not save the access code.'); }
  }

  async function turnOff() {
    try { setError(''); await disableCloud(); setConsent(false); setCode(''); setSavedCode(''); invalidateHealthCache(); setNotice('Cloud AI is off. Everything keeps working offline.'); }
    catch { setError('Could not turn Cloud AI off.'); }
  }

  const ready = consent && Boolean(savedCode);

  return (
    <section className="sb-card p-[22px]" aria-labelledby="cloud-ai-title">
      <h2 id="cloud-ai-title" className="sb-display text-base">Optional Cloud AI</h2>
      <p className="text-sm sb-body mt-2 leading-relaxed">
        Your PDFs and study history stay in this browser. With Cloud AI on, the text taken from your notes, your questions and your
        explanations are sent through our server to an outside AI service to write better summaries, quizzes and feedback.
        Personal details we detect are removed first, but detection can miss names and other details, so check sensitive notes before using AI.
      </p>

      {available === false ? (
        <p className="text-sm sb-body mt-3">Cloud AI is not available on this site right now, so Study Bunny is using offline mode. All study tools still work.</p>
      ) : (
        <>
          <label className="flex items-start gap-3 py-3 min-h-[48px] text-sm">
            <input className="mt-1" type="checkbox" checked={consent} disabled={!loaded} onChange={e => changeConsent(e.target.checked)} />
            <span>Allow text from my notes to be sent to Cloud AI for summaries, quizzes, chat, explanations and note checking.</span>
          </label>
          <form onSubmit={saveCode} className="flex flex-wrap items-end gap-3">
            <label className="flex-1 basis-[220px] text-xs font-bold">
              Access code
              <input
                className="sb-input mt-1"
                style={{ minHeight: 48 }}
                type="password"
                value={code}
                disabled={!loaded}
                onChange={e => setCode(e.target.value)}
                autoComplete="off"
                maxLength={100}
                placeholder="Code from your teacher or team"
              />
            </label>
            <button type="submit" className="sb-btn" disabled={code.trim() === savedCode}>Save code</button>
            {(consent || savedCode) && <button type="button" className="sb-btn-ghost" onClick={turnOff}>Turn off Cloud AI</button>}
          </form>
          <p className="text-xs sb-muted mt-2" role="status">
            {available === null
              ? 'Checking whether Cloud AI is available…'
              : ready
                ? 'Cloud AI is on for this device. If the code is wrong or the daily limit is reached, Study Bunny falls back to offline mode.'
                : 'To use Cloud AI, tick the box and save the access code. Offline tools work without it.'}
          </p>
        </>
      )}
      {notice && <p role="status" className="text-sm mt-2" style={{ color: 'var(--sb-mint-ink)' }}>{notice}</p>}
      {error && <p role="alert" className="text-sm mt-2" style={{ color: 'var(--sb-coral-ink)' }}>{error}</p>}
    </section>
  );
}
