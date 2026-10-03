import React, { useEffect, useState } from 'react';
import { cloudConfigured, getAccessToken, signIn, signOut } from '../../utils/cloudSession.js';
import { getSetting, setSetting } from '../../db/database.js';
import { invalidateHealthCache } from '../../utils/tierDetection.js';

export default function CloudAccessPanel() {
  const [signedIn, setSignedIn] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([getAccessToken(), getSetting('cloudConsent', false)])
      .then(([token, enabled]) => { if (active) { setSignedIn(Boolean(token)); setConsent(Boolean(enabled)); } })
      .catch(() => { if (active) setError('Could not read cloud preferences.'); });
    return () => { active = false; };
  }, []);
  async function act(action) {
    try { setError(''); await action(); } catch { setError('Could not connect to sign-in. Please try again.'); }
  }
  async function changeConsent(value) {
    try { await setSetting('cloudConsent', value); setConsent(value); invalidateHealthCache(); }
    catch { setError('Could not save your cloud preference.'); }
  }
  return <section className="bg-white rounded-xl border border-gray-200 p-4 mb-5" aria-label="Cloud AI preferences">
    <h2 className="font-semibold text-gray-800">Optional Cloud AI</h2>
    <p className="text-sm text-gray-600 mt-2">Your PDFs and study history stay in this browser. With Cloud AI enabled, extracted text, questions, and explanations are sent to Amazon Bedrock through our API. Detected personal details are redacted automatically; detection can miss names and other details. Review sensitive notes before using AI.</p>
    {!cloudConfigured ? <p className="text-sm text-gray-600 mt-3">This deployment uses offline mode. AI checking becomes available when cloud access is configured.</p>
      : <>
        <label className="flex items-start gap-3 py-3 min-h-[48px] text-sm">
          <input className="mt-1" type="checkbox" checked={consent} onChange={e => changeConsent(e.target.checked)} />
          <span>Allow extracted study text to be sent to Cloud AI for summaries, quizzes, chat, explanations, and note checking.</span>
        </label>
        <button className="min-h-[48px] px-4 rounded-xl bg-indigo-600 text-white disabled:opacity-50" disabled={!signedIn && !consent}
          onClick={() => act(signedIn ? signOut : signIn)}>{signedIn ? 'Sign out of Cloud AI' : 'Sign in to Cloud AI'}</button>
        <p className="text-xs text-gray-500 mt-2">Offline tools remain available without an account. This device stores your notes locally; clearing browser data removes them.</p>
      </>}
    {error && <p role="alert" className="text-sm text-red-700 mt-2">{error}</p>}
  </section>;
}
