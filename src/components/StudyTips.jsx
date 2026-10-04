import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildStudyTips } from '../services/studyTips.js';
import Icon from './Icon.jsx';

/**
 * StudyTips — up to four short, personal tips for this lesson, built offline
 * from the lesson's content and the student's own progress.
 */
export default function StudyTips({ documentId, rawText, keyTopics, knowledgeState, quizzes, technique }) {
  const tips = useMemo(
    () => buildStudyTips({ documentId, rawText, keyTopics, knowledgeState, quizzes, technique }),
    [documentId, rawText, keyTopics, knowledgeState, quizzes, technique],
  );
  if (tips.length === 0) return null;

  return (
    <section className="sb-card p-5" aria-labelledby="study-tips-title">
      <div className="flex items-center gap-3 mb-1">
        <span className="sb-tile" style={{ background: 'var(--sb-amber-bg)', color: 'var(--sb-amber-ink)' }}><Icon name="sparkle" /></span>
        <div>
          <h3 id="study-tips-title" className="font-bold">Study tips for this lesson</h3>
          <p className="sb-sub">Based on this lesson and how you have done so far.</p>
        </div>
      </div>
      <ol>
        {tips.map((tip, i) => (
          <li key={tip.id} className="sb-row flex flex-wrap items-center gap-3 py-3.5">
            <span className="sb-tile text-xs font-bold self-start" style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--sb-sky)', color: 'var(--sb-primary)' }}>{i + 1}</span>
            <div className="flex-1 basis-[220px] min-w-0">
              <div className="font-bold text-sm">{tip.title}</div>
              <p className="text-sm sb-body mt-0.5">{tip.text}</p>
            </div>
            {tip.action && <Link to={tip.action.to} className="sb-btn-soft">{tip.action.label}</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}
