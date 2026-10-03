import React from 'react';

export default function LoadingSpinner({ message = 'Loading...', size = 'md' }) {
  const sizes = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-12 w-12' };
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8" role="status" aria-live="polite">
      <div
        className={`${sizes[size]} animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600`}
        aria-hidden="true"
      />
      <p className="text-gray-500 text-sm">{message}</p>
    </div>
  );
}
