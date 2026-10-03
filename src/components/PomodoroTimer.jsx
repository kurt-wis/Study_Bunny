import React, { useEffect, useRef } from 'react';
import usePomodoro, { PHASES } from '../hooks/usePomodoro.js';

/**
 * PomodoroTimer — a pure-client timer UI overlay (design.md §5.2, Req 2.1–2.6, 8.4).
 *
 * Renders the current phase, an mm:ss countdown, and the completed-cycle count,
 * with Start / Pause / Reset / Skip controls. All timer logic lives in the
 * already-tested `usePomodoro` reducer/hook — this component is presentation and
 * accessibility only.
 *
 * Accessibility (FEATURES.md §9 baseline):
 *   - Every control is a labelled <button> with a ≥48×48px touch target
 *     (`min-h-[48px] min-w-[48px]`) and a visible focus ring.
 *   - Phase changes are announced to screen readers through a `role="status"`
 *     `aria-live="polite"` region (Req 2.3), kept in sync with a ref so each
 *     transition produces exactly one announcement.
 *
 * Focus mode (Req 2.4, design §5.2 decision #1):
 *   - Optional, permission-based, and revocable. On opt-in it requests a Screen
 *     Wake Lock (`navigator.wakeLock`) where available — the honest web
 *     approximation of "phone focus." It degrades silently: if the API is
 *     missing or the request is rejected, the timer keeps running unchanged.
 *   - The permission is persisted/revoked through the hook
 *     (`setFocusPermission`), so a reload restores the choice (Req 2.5).
 *
 * Pomodoro has no cloud path and no tier gating (Req 2.1, 8.4), so no TierBadge
 * is shown here; it is a pure-client all-tiers feature.
 */

const PHASE_LABELS = {
  [PHASES.IDLE]: 'Ready',
  [PHASES.FOCUS]: 'Focus',
  [PHASES.SHORT_BREAK]: 'Short break',
  [PHASES.LONG_BREAK]: 'Long break',
};

const PHASE_ICONS = {
  [PHASES.IDLE]: '🐰',
  [PHASES.FOCUS]: '📚',
  [PHASES.SHORT_BREAK]: '☕',
  [PHASES.LONG_BREAK]: '🌙',
};

const PHASE_RING = {
  [PHASES.IDLE]: 'text-gray-600',
  [PHASES.FOCUS]: 'text-indigo-600',
  [PHASES.SHORT_BREAK]: 'text-emerald-600',
  [PHASES.LONG_BREAK]: 'text-violet-600',
};

/** Format milliseconds as mm:ss (never negative). */
export function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** Human-readable live-region message for a phase, used for screen readers. */
function announcementFor(phase) {
  switch (phase) {
    case PHASES.FOCUS:
      return 'Focus block started.';
    case PHASES.SHORT_BREAK:
      return 'Time for a short break.';
    case PHASES.LONG_BREAK:
      return 'Time for a long break.';
    case PHASES.IDLE:
    default:
      return 'Timer reset. Ready to start.';
  }
}

/** Shared button classes: ≥48px touch target + visible focus ring. */
const BTN_BASE =
  'inline-flex items-center justify-center gap-1 min-h-[48px] min-w-[48px] px-4 ' +
  'rounded-xl text-sm font-medium transition-colors focus:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed';

export default function PomodoroTimer({ config, persist = true, className = '' }) {
  const {
    phase,
    remainingMs,
    cycleCount,
    running,
    isFocusPermissionGranted,
    start,
    pause,
    reset,
    skip,
    setFocusPermission,
  } = usePomodoro({ config, persist });

  // ── Live-region phase announcements (Req 2.3) ──────────────────────────────
  // Announce only on an actual phase change so screen readers aren't spammed on
  // every re-render.
  const [announcement, setAnnouncement] = React.useState('');
  const lastPhaseRef = useRef(phase);
  useEffect(() => {
    if (lastPhaseRef.current !== phase) {
      lastPhaseRef.current = phase;
      setAnnouncement(announcementFor(phase));
    }
  }, [phase]);

  // ── Optional, revocable wake-lock focus mode (Req 2.4), degrades silently ──
  const wakeLockRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function releaseLock() {
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (lock) {
        try {
          await lock.release();
        } catch {
          // Releasing is best-effort; ignore failures.
        }
      }
    }

    async function acquireLock() {
      // Only hold a wake lock while actively running a timer with permission.
      if (!isFocusPermissionGranted || !running) {
        await releaseLock();
        return;
      }
      // Feature-detect; absence must never block the timer.
      if (typeof navigator === 'undefined' || !navigator.wakeLock) return;
      if (wakeLockRef.current) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          try {
            await lock.release();
          } catch {
            /* ignore */
          }
          return;
        }
        wakeLockRef.current = lock;
        // The browser may drop the lock (e.g. tab hidden); clear our ref so it
        // can be re-acquired, without surfacing anything to the user.
        lock.addEventListener?.('release', () => {
          wakeLockRef.current = null;
        });
      } catch {
        // Permission rejected or unsupported — degrade silently.
      }
    }

    acquireLock();
    return () => {
      cancelled = true;
      releaseLock();
    };
  }, [isFocusPermissionGranted, running]);

  const toggleFocusMode = () => {
    // Revocable: flip the persisted permission (Req 2.4, 2.5).
    setFocusPermission(!isFocusPermissionGranted);
  };

  const phaseLabel = PHASE_LABELS[phase] ?? 'Timer';
  const phaseIcon = PHASE_ICONS[phase] ?? '⏱️';
  const timeText = formatRemaining(remainingMs);
  const isIdle = phase === PHASES.IDLE;

  return (
    <section
      className={`bg-white border border-gray-200 rounded-2xl p-5 flex flex-col items-center gap-4 ${className}`}
      aria-label="Pomodoro timer"
    >
      {/* Phase + cycle count */}
      <div className="flex flex-col items-center gap-1">
        <span
          className={`inline-flex items-center gap-2 text-sm font-semibold ${PHASE_RING[phase] ?? 'text-gray-600'}`}
        >
          <span aria-hidden="true">{phaseIcon}</span>
          {phaseLabel}
        </span>
        <span className="text-xs text-gray-500">
          {cycleCount === 1 ? '1 focus block done' : `${cycleCount} focus blocks done`}
        </span>
      </div>

      {/* Countdown — the time is the accessible status value */}
      <div
        className="font-mono tabular-nums text-5xl font-bold text-gray-800 tracking-tight"
        aria-label={`${timeText} remaining in ${phaseLabel.toLowerCase()}`}
      >
        {timeText}
      </div>

      {/* Controls — each ≥48px, labelled, with visible focus */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {running ? (
          <button
            type="button"
            onClick={pause}
            className={`${BTN_BASE} bg-amber-100 text-amber-800 hover:bg-amber-200`}
            aria-label="Pause timer"
          >
            <span aria-hidden="true">⏸</span>
            Pause
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className={`${BTN_BASE} bg-indigo-600 text-white hover:bg-indigo-700`}
            aria-label={isIdle ? 'Start timer' : 'Resume timer'}
          >
            <span aria-hidden="true">▶</span>
            {isIdle ? 'Start' : 'Resume'}
          </button>
        )}

        <button
          type="button"
          onClick={reset}
          disabled={isIdle && !running && cycleCount === 0}
          className={`${BTN_BASE} bg-gray-100 text-gray-700 hover:bg-gray-200`}
          aria-label="Reset timer"
        >
          <span aria-hidden="true">↺</span>
          Reset
        </button>

        <button
          type="button"
          onClick={skip}
          disabled={isIdle}
          className={`${BTN_BASE} bg-gray-100 text-gray-700 hover:bg-gray-200`}
          aria-label="Skip to next phase"
        >
          <span aria-hidden="true">⏭</span>
          Skip
        </button>
      </div>

      {/* Optional, revocable focus mode (keeps a screen wake lock while running) */}
      <button
        type="button"
        onClick={toggleFocusMode}
        aria-pressed={isFocusPermissionGranted}
        className={`${BTN_BASE} w-full ${
          isFocusPermissionGranted
            ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
        }`}
        aria-label={
          isFocusPermissionGranted
            ? 'Focus mode on. Turn off to let the screen sleep.'
            : 'Focus mode off. Turn on to keep the screen awake while studying.'
        }
      >
        <span aria-hidden="true">{isFocusPermissionGranted ? '🔒' : '🔓'}</span>
        Focus mode: {isFocusPermissionGranted ? 'On' : 'Off'}
      </button>

      {/* Screen-reader-only live region for phase transitions (Req 2.3) */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </section>
  );
}
