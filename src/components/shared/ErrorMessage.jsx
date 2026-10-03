import React from 'react';

export default function ErrorMessage({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col gap-2"
    >
      <div className="flex items-start gap-2">
        <span className="text-red-500 text-lg" aria-hidden="true">⚠️</span>
        <p className="text-red-700 text-sm">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="self-start text-red-600 text-sm font-medium underline hover:no-underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}
