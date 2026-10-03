/**
 * usePomodoro — a Pomodoro timer as a pure reducer state machine plus a thin
 * React hook that drives it with `setInterval` and persists/restores state via
 * the shared appSettings repository (Req 2.1–2.7).
 *
 * Design (design.md §5.2, Session Matrix CSV):
 *   - Pure client, available at ALL tiers, no network dependency (Req 2.1).
 *   - Phases cycle idle → focus → break → focus …, default 25-minute focus /
 *     5-minute short break, configurable. A longer break is given after every
 *     `cyclesPerLongBreak` completed focus blocks (Req 2.2).
 *   - start / pause / reset controls; tick decrements remaining time; a phase
 *     that reaches zero transitions to the next phase (Req 2.2, 2.3).
 *   - State `{ phase, remainingMs, cycleCount, running, updatedAt }` persists to
 *     `appSettings['pomodoro.state']` so a reload restores the session, and the
 *     focus-mode permission to `appSettings['pomodoro.focusPermission']`
 *     (Req 2.4, 2.5).
 *   - Pomodoro is optional — nothing here forces its use (Req 2.6).
 *
 * The reducer (`pomodoroReducer`) is a PURE, total function exported separately
 * from the hook so it can be unit-tested with no React involvement. It never
 * mutates its input and never throws on valid state.
 */
import { useEffect, useReducer, useRef, useCallback, useState } from 'react';
import { getSetting, setSetting } from '../db/database.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export const MS_PER_MINUTE = 60 * 1000;

/** Timer phases. `idle` is the pre-start / fully-reset resting state. */
export const PHASES = Object.freeze({
  IDLE: 'idle',
  FOCUS: 'focus',
  SHORT_BREAK: 'short_break',
  LONG_BREAK: 'long_break',
});

/** Persistence keys in the shared appSettings store (design.md §5 data model). */
export const POMODORO_STATE_KEY = 'pomodoro.state';
export const POMODORO_FOCUS_PERMISSION_KEY = 'pomodoro.focusPermission';

/** Default, configurable durations and cadence (design.md §5.2: 25 / 5 min). */
export const DEFAULT_CONFIG = Object.freeze({
  focusMs: 25 * MS_PER_MINUTE,
  shortBreakMs: 5 * MS_PER_MINUTE,
  longBreakMs: 15 * MS_PER_MINUTE,
  cyclesPerLongBreak: 4,
});

/** Coerce a value to a finite, non-negative number, else `fallback`. */
function toNonNegative(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

/** Merge a partial config with the defaults, clamping to sane values. */
export function normalizeConfig(config = {}) {
  const c = config || {};
  return {
    focusMs: toNonNegative(c.focusMs, DEFAULT_CONFIG.focusMs),
    shortBreakMs: toNonNegative(c.shortBreakMs, DEFAULT_CONFIG.shortBreakMs),
    longBreakMs: toNonNegative(c.longBreakMs, DEFAULT_CONFIG.longBreakMs),
    cyclesPerLongBreak: Math.max(
      1,
      Math.trunc(toNonNegative(c.cyclesPerLongBreak, DEFAULT_CONFIG.cyclesPerLongBreak)),
    ),
  };
}

/** Duration (ms) of a phase under a given config. */
function durationForPhase(phase, config) {
  switch (phase) {
    case PHASES.FOCUS:
      return config.focusMs;
    case PHASES.SHORT_BREAK:
      return config.shortBreakMs;
    case PHASES.LONG_BREAK:
      return config.longBreakMs;
    default:
      // idle has no running duration; treat as a focus-length block when started.
      return config.focusMs;
  }
}

/**
 * The resting/initial machine state. `cycleCount` counts completed focus blocks.
 */
export function initialState(config = {}) {
  const c = normalizeConfig(config);
  return {
    phase: PHASES.IDLE,
    remainingMs: c.focusMs,
    cycleCount: 0,
    running: false,
    config: c,
    updatedAt: null,
  };
}

/**
 * Decide the phase that follows a completed phase.
 *
 * A finished FOCUS block increments the completed-cycle count; if that count is
 * a multiple of `cyclesPerLongBreak`, the next phase is a long break, otherwise
 * a short break. Any finished break returns to FOCUS. Returns the next phase
 * plus the updated cycle count.
 */
function nextPhaseAfter(phase, cycleCount, config) {
  if (phase === PHASES.FOCUS) {
    const completed = cycleCount + 1;
    const isLong = completed % config.cyclesPerLongBreak === 0;
    return {
      phase: isLong ? PHASES.LONG_BREAK : PHASES.SHORT_BREAK,
      cycleCount: completed,
    };
  }
  // From any break (or idle), the next working phase is focus.
  return { phase: PHASES.FOCUS, cycleCount };
}

// ─── Pure reducer (unit-testable without React) ──────────────────────────────

/**
 * Pure Pomodoro state machine.
 *
 * Actions:
 *   - { type: 'START' }            idle/paused → running the current phase. From
 *                                  idle it begins a focus block.
 *   - { type: 'PAUSE' }            running → paused (remaining time preserved).
 *   - { type: 'RESET' }            back to idle with a full focus block queued;
 *                                  cycle count cleared.
 *   - { type: 'TICK', ms }         decrement remaining time by `ms` (default one
 *                                  second). On reaching zero, transition to the
 *                                  next phase (full duration) and stay running.
 *   - { type: 'SKIP' }             immediately end the current phase and advance
 *                                  to the next (same transition rules as TICK-to-zero).
 *   - { type: 'CONFIGURE', config } merge new durations; resets the current
 *                                  phase's remaining time to the new duration
 *                                  when idle/paused.
 *   - { type: 'RESTORE', state }   adopt a persisted state (clamped/validated).
 *
 * Pure and total: returns a new object, never mutates `state`, never throws on
 * a well-formed state. `now` is injectable for deterministic `updatedAt`.
 *
 * @param {object} state
 * @param {object} action
 * @param {number} [now=Date.now()] - reference time for `updatedAt`
 * @returns {object} next state
 */
export function pomodoroReducer(state, action, now = Date.now()) {
  const config = state.config || DEFAULT_CONFIG;
  const stamp = (next) => ({ ...next, updatedAt: now });

  switch (action.type) {
    case 'START': {
      if (state.running) return state;
      // From idle, begin a fresh focus block; from a pause, resume as-is.
      if (state.phase === PHASES.IDLE) {
        return stamp({
          ...state,
          phase: PHASES.FOCUS,
          remainingMs: durationForPhase(PHASES.FOCUS, config),
          running: true,
        });
      }
      return stamp({ ...state, running: true });
    }

    case 'PAUSE': {
      if (!state.running) return state;
      return stamp({ ...state, running: false });
    }

    case 'RESET': {
      return stamp({
        ...state,
        phase: PHASES.IDLE,
        remainingMs: durationForPhase(PHASES.FOCUS, config),
        cycleCount: 0,
        running: false,
      });
    }

    case 'TICK': {
      if (!state.running) return state;
      const step = toNonNegative(action.ms, 1000);
      const remaining = state.remainingMs - step;
      if (remaining > 0) {
        return stamp({ ...state, remainingMs: remaining });
      }
      // Phase complete → advance to the next phase, keep running.
      const { phase, cycleCount } = nextPhaseAfter(state.phase, state.cycleCount, config);
      return stamp({
        ...state,
        phase,
        cycleCount,
        remainingMs: durationForPhase(phase, config),
        running: true,
      });
    }

    case 'SKIP': {
      const { phase, cycleCount } = nextPhaseAfter(state.phase, state.cycleCount, config);
      return stamp({
        ...state,
        phase,
        cycleCount,
        remainingMs: durationForPhase(phase, config),
        running: state.running,
      });
    }

    case 'CONFIGURE': {
      const merged = normalizeConfig({ ...config, ...action.config });
      // When idle or paused, reset the current phase's remaining time to the new
      // duration so a configuration change takes effect immediately. While
      // running, keep the current countdown and apply the new config next phase.
      const resetRemaining = !state.running;
      return stamp({
        ...state,
        config: merged,
        remainingMs: resetRemaining
          ? durationForPhase(state.phase === PHASES.IDLE ? PHASES.FOCUS : state.phase, merged)
          : state.remainingMs,
      });
    }

    case 'RESTORE': {
      const restored = action.state || {};
      const merged = normalizeConfig(restored.config || config);
      const validPhase = Object.values(PHASES).includes(restored.phase)
        ? restored.phase
        : PHASES.IDLE;
      return {
        phase: validPhase,
        remainingMs: toNonNegative(restored.remainingMs, durationForPhase(validPhase, merged)),
        cycleCount: Math.max(0, Math.trunc(toNonNegative(restored.cycleCount, 0))),
        running: Boolean(restored.running),
        config: merged,
        updatedAt: restored.updatedAt ?? null,
      };
    }

    default:
      return state;
  }
}

/** Pick the persistable slice of state (design.md §5 shape). */
export function toPersistedState(state) {
  return {
    phase: state.phase,
    remainingMs: state.remainingMs,
    cycleCount: state.cycleCount,
    running: state.running,
    config: state.config,
    updatedAt: state.updatedAt,
  };
}

// ─── React hook ──────────────────────────────────────────────────────────────

/**
 * React hook wrapping the Pomodoro reducer.
 *
 * - Ticks once per second via `setInterval` while `running`; the interval is
 *   cleared on pause, reset-to-idle, and unmount.
 * - Restores persisted state from `appSettings['pomodoro.state']` on mount and
 *   persists on every meaningful change (and on unmount).
 * - Exposes the focus-mode permission from `appSettings['pomodoro.focusPermission']`
 *   with a revocable setter (Req 2.4, 2.5). The timer works regardless of it.
 *
 * @param {object} [options]
 * @param {object} [options.config]   - duration overrides (focusMs, shortBreakMs, …)
 * @param {number} [options.tickMs=1000] - tick granularity
 * @param {boolean} [options.persist=true] - persist/restore via appSettings
 */
export function usePomodoro(options = {}) {
  const { config, tickMs = 1000, persist = true } = options;

  const [state, dispatch] = useReducer(
    pomodoroReducer,
    config,
    initialState,
  );

  const intervalRef = useRef(null);
  const restoredRef = useRef(false);
  const [focusPermission, setFocusPermissionState] = useState(false);

  // ── Restore persisted state once on mount ──────────────────────────────────
  useEffect(() => {
    if (!persist) {
      restoredRef.current = true;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const saved = await getSetting(POMODORO_STATE_KEY, null);
        if (!cancelled && saved) {
          dispatch({ type: 'RESTORE', state: saved });
        }
      } catch {
        // Persistence is best-effort; a missing/corrupt record just starts fresh.
      } finally {
        if (!cancelled) restoredRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persist]);

  // ── Drive the countdown while running ───────────────────────────────────────
  useEffect(() => {
    if (!state.running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return undefined;
    }
    intervalRef.current = setInterval(() => {
      dispatch({ type: 'TICK', ms: tickMs });
    }, tickMs);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.running, tickMs]);

  // ── Persist on change and on unmount ────────────────────────────────────────
  useEffect(() => {
    if (!persist || !restoredRef.current) return;
    // Fire-and-forget; persistence must never block the UI.
    setSetting(POMODORO_STATE_KEY, toPersistedState(state)).catch(() => {});
  }, [persist, state.phase, state.remainingMs, state.cycleCount, state.running, state.config]);

  // ── Load the focus-mode permission on mount ─────────────────────────────────
  useEffect(() => {
    if (!persist) return;
    let cancelled = false;
    (async () => {
      try {
        const granted = await getSetting(POMODORO_FOCUS_PERMISSION_KEY, false);
        if (!cancelled) setFocusPermissionState(Boolean(granted));
      } catch {
        if (!cancelled) setFocusPermissionState(false);
      }
    })();
    return () => { cancelled = true; };
  }, [persist]);

  // ── Control callbacks ───────────────────────────────────────────────────────
  const start = useCallback(() => dispatch({ type: 'START' }), []);
  const pause = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);
  const skip = useCallback(() => dispatch({ type: 'SKIP' }), []);
  const configure = useCallback(
    (next) => dispatch({ type: 'CONFIGURE', config: next }),
    [],
  );

  /** Grant or revoke the optional focus-mode permission (persisted, revocable). */
  const setFocusPermission = useCallback(
    async (granted) => {
      setFocusPermissionState(Boolean(granted));
      if (persist) {
        try {
          await setSetting(POMODORO_FOCUS_PERMISSION_KEY, Boolean(granted));
        } catch {
          // Best-effort; the timer keeps working without the permission.
        }
      }
    },
    [persist],
  );

  return {
    // state
    phase: state.phase,
    remainingMs: state.remainingMs,
    cycleCount: state.cycleCount,
    running: state.running,
    config: state.config,
    isFocusPermissionGranted: focusPermission,
    // controls
    start,
    pause,
    reset,
    skip,
    configure,
    setFocusPermission,
  };
}

export default usePomodoro;
