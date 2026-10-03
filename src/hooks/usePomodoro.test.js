/**
 * Unit tests for the PURE Pomodoro reducer (Req 2.1–2.7).
 *
 * Runs under Node's built-in test runner (`node --test`). The reducer is pure
 * and total — no React, no database, no timers — so these tests exercise it
 * directly. React rendering and persistence wiring are intentionally NOT tested
 * here (that is the hook's concern, covered by behavior tests later).
 *
 * Covers:
 *   - start / pause / reset transitions
 *   - tick decrement (remaining time counts down)
 *   - phase transitions on reaching zero (focus → break → focus)
 *   - a long break every N completed focus cycles
 *   - cycle counting
 *   - immutability (reducer never mutates its input)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pomodoroReducer,
  initialState,
  normalizeConfig,
  toPersistedState,
  PHASES,
  DEFAULT_CONFIG,
  MS_PER_MINUTE,
} from './usePomodoro.js';

const NOW = 1_700_000_000_000; // fixed reference for deterministic updatedAt

// A small, round config keeps phase-boundary math obvious in the tests.
const CFG = {
  focusMs: 3000,
  shortBreakMs: 1000,
  longBreakMs: 2000,
  cyclesPerLongBreak: 2,
};

/** Build a running focus state at a known remaining time. */
function runningFocus(remainingMs, cfg = CFG) {
  return pomodoroReducer(
    { ...initialState(cfg), running: true, phase: PHASES.FOCUS, remainingMs },
    { type: 'TICK', ms: 0 },
    NOW,
  );
}

// ─── Initial state ────────────────────────────────────────────────────────────

test('initialState: idle, not running, full focus block queued, zero cycles', () => {
  const s = initialState(CFG);
  assert.equal(s.phase, PHASES.IDLE);
  assert.equal(s.running, false);
  assert.equal(s.remainingMs, CFG.focusMs);
  assert.equal(s.cycleCount, 0);
});

test('initialState with no config uses the 25/5 defaults', () => {
  const s = initialState();
  assert.equal(s.remainingMs, DEFAULT_CONFIG.focusMs);
  assert.equal(DEFAULT_CONFIG.focusMs, 25 * MS_PER_MINUTE);
  assert.equal(DEFAULT_CONFIG.shortBreakMs, 5 * MS_PER_MINUTE);
});

// ─── start / pause / reset ──────────────────────────────────────────────────

test('START from idle begins a running focus block at full duration', () => {
  const s = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW);
  assert.equal(s.phase, PHASES.FOCUS);
  assert.equal(s.running, true);
  assert.equal(s.remainingMs, CFG.focusMs);
  assert.equal(s.updatedAt, NOW);
});

test('START while already running is a no-op (same reference back)', () => {
  const running = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW);
  const again = pomodoroReducer(running, { type: 'START' }, NOW + 1);
  assert.equal(again, running);
});

test('PAUSE stops a running timer but preserves phase and remaining time', () => {
  const started = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW);
  const ticked = pomodoroReducer(started, { type: 'TICK', ms: 1000 }, NOW);
  const paused = pomodoroReducer(ticked, { type: 'PAUSE' }, NOW);
  assert.equal(paused.running, false);
  assert.equal(paused.phase, PHASES.FOCUS);
  assert.equal(paused.remainingMs, CFG.focusMs - 1000);
});

test('START after PAUSE resumes the same phase without resetting remaining time', () => {
  const started = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW);
  const ticked = pomodoroReducer(started, { type: 'TICK', ms: 1000 }, NOW);
  const paused = pomodoroReducer(ticked, { type: 'PAUSE' }, NOW);
  const resumed = pomodoroReducer(paused, { type: 'START' }, NOW);
  assert.equal(resumed.running, true);
  assert.equal(resumed.phase, PHASES.FOCUS);
  assert.equal(resumed.remainingMs, CFG.focusMs - 1000);
});

test('PAUSE while not running is a no-op', () => {
  const idle = initialState(CFG);
  assert.equal(pomodoroReducer(idle, { type: 'PAUSE' }, NOW), idle);
});

test('RESET returns to idle, clears cycles, and re-queues a full focus block', () => {
  // Advance a few phases to accumulate cycles, then reset.
  let s = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW);
  s = pomodoroReducer(s, { type: 'SKIP' }, NOW); // focus → short break, cycle 1
  s = pomodoroReducer(s, { type: 'SKIP' }, NOW); // break → focus
  const reset = pomodoroReducer(s, { type: 'RESET' }, NOW);
  assert.equal(reset.phase, PHASES.IDLE);
  assert.equal(reset.running, false);
  assert.equal(reset.cycleCount, 0);
  assert.equal(reset.remainingMs, CFG.focusMs);
});

// ─── tick decrement ───────────────────────────────────────────────────────────

test('TICK decrements remaining time while running', () => {
  const started = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW);
  const ticked = pomodoroReducer(started, { type: 'TICK', ms: 1000 }, NOW);
  assert.equal(ticked.remainingMs, CFG.focusMs - 1000);
  assert.equal(ticked.phase, PHASES.FOCUS);
  assert.equal(ticked.running, true);
});

test('TICK while paused is a no-op', () => {
  const paused = { ...initialState(CFG), running: false, phase: PHASES.FOCUS, remainingMs: 2000 };
  assert.equal(pomodoroReducer(paused, { type: 'TICK', ms: 1000 }, NOW), paused);
});

test('TICK defaults to a 1s step when ms is omitted', () => {
  const s = runningFocus(2000);
  const ticked = pomodoroReducer(s, { type: 'TICK' }, NOW);
  assert.equal(ticked.remainingMs, 1000);
});

// ─── phase transitions on reaching zero ─────────────────────────────────────

test('focus → short break when the focus block reaches zero (cycle counted)', () => {
  const nearEnd = runningFocus(1000);
  const transitioned = pomodoroReducer(nearEnd, { type: 'TICK', ms: 1000 }, NOW);
  assert.equal(transitioned.phase, PHASES.SHORT_BREAK);
  assert.equal(transitioned.cycleCount, 1, 'one focus block completed');
  assert.equal(transitioned.remainingMs, CFG.shortBreakMs, 'break starts at full duration');
  assert.equal(transitioned.running, true, 'keeps running into the break');
});

test('break → focus when the break reaches zero (cycle count unchanged)', () => {
  // Complete a focus block to land in a short break at cycle 1.
  const breakState = pomodoroReducer(runningFocus(1000), { type: 'TICK', ms: 1000 }, NOW);
  assert.equal(breakState.phase, PHASES.SHORT_BREAK);
  // Run the break to zero.
  const backToFocus = pomodoroReducer(
    { ...breakState, remainingMs: 1000 },
    { type: 'TICK', ms: 1000 },
    NOW,
  );
  assert.equal(backToFocus.phase, PHASES.FOCUS);
  assert.equal(backToFocus.cycleCount, 1, 'cycle count unchanged across a break');
  assert.equal(backToFocus.remainingMs, CFG.focusMs);
});

test('overshooting a tick past zero still transitions exactly once', () => {
  const nearEnd = runningFocus(500);
  const transitioned = pomodoroReducer(nearEnd, { type: 'TICK', ms: 5000 }, NOW);
  assert.equal(transitioned.phase, PHASES.SHORT_BREAK);
  assert.equal(transitioned.remainingMs, CFG.shortBreakMs);
});

// ─── long break every N cycles ──────────────────────────────────────────────

test('a long break is scheduled after every N completed focus cycles', () => {
  // CFG.cyclesPerLongBreak = 2. Walk two full focus→break rounds via SKIP.
  let s = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW); // focus, cycle 0

  s = pomodoroReducer(s, { type: 'SKIP' }, NOW); // focus → SHORT break, cycle 1
  assert.equal(s.phase, PHASES.SHORT_BREAK);
  assert.equal(s.cycleCount, 1);

  s = pomodoroReducer(s, { type: 'SKIP' }, NOW); // break → focus, cycle 1
  assert.equal(s.phase, PHASES.FOCUS);

  s = pomodoroReducer(s, { type: 'SKIP' }, NOW); // focus → LONG break, cycle 2
  assert.equal(s.phase, PHASES.LONG_BREAK, 'second completed focus cycle yields a long break');
  assert.equal(s.cycleCount, 2);
  assert.equal(s.remainingMs, CFG.longBreakMs);

  s = pomodoroReducer(s, { type: 'SKIP' }, NOW); // long break → focus, cycle 2
  assert.equal(s.phase, PHASES.FOCUS);
  assert.equal(s.cycleCount, 2);
});

test('SKIP advances phases without needing to run the clock down', () => {
  const started = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW);
  const skipped = pomodoroReducer(started, { type: 'SKIP' }, NOW);
  assert.equal(skipped.phase, PHASES.SHORT_BREAK);
  assert.equal(skipped.cycleCount, 1);
});

// ─── cycle counting across many rounds ──────────────────────────────────────

test('cycle count increments once per completed focus block only', () => {
  let s = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW);
  const focusCompletions = 5;
  let seenFocusEnds = 0;
  // Alternate focus/break completions; count only focus ends.
  while (seenFocusEnds < focusCompletions) {
    const before = s.phase;
    s = pomodoroReducer(s, { type: 'SKIP' }, NOW);
    if (before === PHASES.FOCUS) seenFocusEnds += 1;
  }
  assert.equal(s.cycleCount, focusCompletions);
});

// ─── CONFIGURE ────────────────────────────────────────────────────────────────

test('CONFIGURE while idle applies the new focus duration immediately', () => {
  const s = pomodoroReducer(
    initialState(CFG),
    { type: 'CONFIGURE', config: { focusMs: 9000 } },
    NOW,
  );
  assert.equal(s.config.focusMs, 9000);
  assert.equal(s.remainingMs, 9000, 'idle re-queues the new focus duration');
});

test('CONFIGURE while running keeps the current countdown', () => {
  const started = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW);
  const ticked = pomodoroReducer(started, { type: 'TICK', ms: 1000 }, NOW);
  const reconfigured = pomodoroReducer(
    ticked,
    { type: 'CONFIGURE', config: { focusMs: 9000 } },
    NOW,
  );
  assert.equal(reconfigured.remainingMs, CFG.focusMs - 1000, 'running countdown untouched');
  assert.equal(reconfigured.config.focusMs, 9000, 'new config stored for next phase');
});

// ─── RESTORE ──────────────────────────────────────────────────────────────────

test('RESTORE adopts a well-formed persisted state', () => {
  const persisted = {
    phase: PHASES.SHORT_BREAK,
    remainingMs: 750,
    cycleCount: 3,
    running: false,
    config: CFG,
    updatedAt: NOW,
  };
  const s = pomodoroReducer(initialState(CFG), { type: 'RESTORE', state: persisted }, NOW + 1);
  assert.equal(s.phase, PHASES.SHORT_BREAK);
  assert.equal(s.remainingMs, 750);
  assert.equal(s.cycleCount, 3);
  assert.equal(s.running, false);
});

test('RESTORE is defensive against a corrupt phase / negative values', () => {
  const s = pomodoroReducer(
    initialState(CFG),
    { type: 'RESTORE', state: { phase: 'garbage', remainingMs: -5, cycleCount: -2, config: CFG } },
    NOW,
  );
  assert.equal(s.phase, PHASES.IDLE, 'unknown phase falls back to idle');
  assert.equal(s.remainingMs, CFG.focusMs, 'negative remaining falls back to the phase duration');
  assert.equal(s.cycleCount, 0, 'negative cycle count clamped to zero');
});

// ─── helpers / immutability ─────────────────────────────────────────────────

test('normalizeConfig clamps bad values to defaults and keeps cyclesPerLongBreak >= 1', () => {
  const c = normalizeConfig({ focusMs: -1, shortBreakMs: 'x', cyclesPerLongBreak: 0 });
  assert.equal(c.focusMs, DEFAULT_CONFIG.focusMs);
  assert.equal(c.shortBreakMs, DEFAULT_CONFIG.shortBreakMs);
  assert.equal(c.cyclesPerLongBreak, 1);
});

test('toPersistedState exposes exactly the persistable shape', () => {
  const started = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW);
  const p = toPersistedState(started);
  assert.deepEqual(Object.keys(p).sort(), ['config', 'cycleCount', 'phase', 'remainingMs', 'running', 'updatedAt']);
});

test('the reducer never mutates its input state', () => {
  const base = pomodoroReducer(initialState(CFG), { type: 'START' }, NOW);
  const snapshot = JSON.parse(JSON.stringify(base));
  pomodoroReducer(base, { type: 'TICK', ms: 1000 }, NOW);
  pomodoroReducer(base, { type: 'PAUSE' }, NOW);
  pomodoroReducer(base, { type: 'SKIP' }, NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(base)), snapshot, 'input left unchanged');
});

test('an unknown action returns the same state reference', () => {
  const s = initialState(CFG);
  assert.equal(pomodoroReducer(s, { type: 'NOPE' }, NOW), s);
});
