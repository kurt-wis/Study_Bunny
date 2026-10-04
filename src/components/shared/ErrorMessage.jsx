import React from 'react';
import Icon from '../Icon.jsx';

export default function ErrorMessage({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="rounded-[14px] p-4 flex flex-col gap-2 sb-shake"
      style={{ background: 'var(--sb-coral-bg)', color: 'var(--sb-coral-ink)' }}
    >
      <div className="flex items-start gap-2.5">
        <Icon name="alert" size={18} style={{ marginTop: 1 }} />
        <p className="text-sm">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="self-start text-sm font-bold underline hover:no-underline" style={{ color: 'inherit' }}>
          Try again
        </button>
      )}
    </div>
  );
}
