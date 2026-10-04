import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { getSetting } from '../../db/database.js';
import { loadOverview } from '../../services/home/overview.js';
import LoadingSpinner from '../../components/shared/LoadingSpinner.jsx';
import Icon from '../../components/Icon.jsx';

/**
 * StudyRedirect — the Review and Quiz entries in the workspace menu are not
 * tied to one document, so this picks the best study set and sends the student
 * straight into a session:
 *   • review → the set with the most cards due (then the last one opened);
 *   • quiz   → the last set opened (then the most recent upload).
 */
export default function StudyRedirect({ mode }) {
  const [target, setTarget] = useState(undefined); // undefined = loading, null = no sets

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [overview, lastId] = await Promise.all([loadOverview(), getSetting('lastDocumentId', null)]);
        if (cancelled) return;
        const sets = overview.sets;
        if (sets.length === 0) { setTarget(null); return; }
        const last = sets.find(s => s.id === lastId) ?? null;
        let pick = last ?? sets[0];
        if (mode === 'review') {
          const mostDue = sets.reduce((a, b) => (b.due > a.due ? b : a));
          if (mostDue.due > 0) pick = mostDue;
        }
        setTarget(pick.id);
      } catch {
        if (!cancelled) setTarget(null);
      }
    })();
    return () => { cancelled = true; };
  }, [mode]);

  if (target === undefined) {
    return <div className="px-4 py-16"><LoadingSpinner message="Finding your study set..." /></div>;
  }

  if (target === null) {
    return (
      <main className="max-w-xl mx-auto px-4 py-16 text-center">
        <span className="sb-tile mx-auto mb-4" style={{ background: 'var(--sb-sky)', color: 'var(--sb-primary)' }}>
          <Icon name={mode === 'review' ? 'review' : 'quiz'} />
        </span>
        <h1 className="sb-title mb-2">{mode === 'review' ? 'Nothing to review yet' : 'No quiz yet'}</h1>
        <p className="sb-body mb-6">
          Add a PDF of your notes on Home and Study Bunny will turn it into {mode === 'review' ? 'review cards' : 'quizzes'}.
        </p>
        <Link to="/student" className="sb-btn">Go to Home <Icon name="arrow" /></Link>
      </main>
    );
  }

  const to = mode === 'review'
    ? `/student/document/${target}/review?technique=spaced_repetition&start=1`
    : `/student/document/${target}/quiz`;
  return <Navigate to={to} replace />;
}
