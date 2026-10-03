import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { finishSignIn } from '../utils/cloudSession.js';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    finishSignIn().then(() => { if (active) navigate('/student', { replace: true }); })
      .catch(() => { if (active) { window.history.replaceState({}, '', '/auth/callback'); setError(true); } });
    return () => { active = false; };
  }, [navigate]);
  return <main className="max-w-xl mx-auto p-6" role="status">
    <h1 className="font-bold text-xl">{error ? 'Sign-in could not be completed' : 'Completing sign-in…'}</h1>
    {error && <button className="min-h-[48px] mt-4 text-indigo-700" onClick={() => navigate('/student', { replace: true })}>Return to Study Bunny and try again</button>}
  </main>;
}
