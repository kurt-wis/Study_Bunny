import React from 'react';
import Icon from '../Icon.jsx';

/**
 * PageHeader — the shared top of every inner screen: an optional back button,
 * a small label, the page title, an optional item on the right, and optional
 * content underneath (for example tabs).
 */
export default function PageHeader({ eyebrow, title, onBack, backLabel = 'Back', right, children }) {
  return (
    <header className="max-w-[816px] mx-auto px-4 sm:px-8 pt-6 sb-enter">
      <div className="flex items-start gap-1">
        {onBack && (
          <button type="button" onClick={onBack} aria-label={backLabel} className="sb-icon-btn -ml-3">
            <Icon name="back" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          {eyebrow && <p className="sb-eyebrow truncate">{eyebrow}</p>}
          <h1 className="sb-title mt-1.5 break-words">{title}</h1>
        </div>
        {right}
      </div>
      {children}
    </header>
  );
}
