/**
 * Unit tests for the technique engine recommendation (Req 6.1, 6.2, 6.4).
 *
 * Runs under Node's built-in test runner (`node --test`). Pure functions, no
 * database or network, so no fake-indexeddb harness is needed.
 *
 * Covers:
 *   - keep branch (healthy score, no plateau)
 *   - plateau branch (|mastery[n] - mastery[n-2]| < 0.05 over 3+ attempts)
 *   - low-effectiveness current-habit branch
 *   - output is ONLY ever 'feynman', 'spaced_repetition', or keep (no unbuilt
 *     technique, no passive habit) across a wide input sweep
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TECHNIQUES,
  CURRENT_HABITS,
  recommendTechnique,
  isPlateaued,
} from './techniqueEngine.js';

const IN_SCOPE = ['feynman', 'spaced_repetition'];

// ─── Registry shape ─────────────────────────────────────────────────────────

test('registry holds exactly the three in-scope techniques with CSV effectiveness', () => {
  assert.deepEqual(Object.keys(TECHNIQUES).sort(), ['feynman', 'pomodoro', 'spaced_repetition']);
  assert.equal(TECHNIQUES.pomodoro.effectiveness, 'moderate');
  assert.equal(TECHNIQUES.feynman.effectiveness, 'high');
  assert.equal(TECHNIQUES.spaced_repetition.effectiveness, 'high');
  assert.equal(TECHNIQUES.pomodoro.kind, 'timer');
  assert.equal(TECHNIQUES.feynman.kind, 'explain');
  assert.equal(TECHNIQUES.spaced_repetition.kind, 'quiz');
});

test('passive habits exist as diagnosis inputs only', () => {
  assert.equal(CURRENT_HABITS.rereading.effectiveness, 'low');
  assert.equal(CURRENT_HABITS.highlighting.effectiveness, 'low');
  // The three buildable techniques are NOT present in the registry as timers/etc only;
  // passive habits like rereading never appear in the buildable TECHNIQUES registry.
  assert.equal(TECHNIQUES.rereading, undefined);
  assert.equal(TECHNIQUES.highlighting, undefined);
});

// ─── isPlateaued ────────────────────────────────────────────────────────────

test('isPlateaued detects a flat mastery curve over 3+ attempts', () => {
  assert.equal(isPlateaued([0.40, 0.42, 0.41]), true, '|0.41 - 0.40| = 0.01 < 0.05');
  assert.equal(isPlateaued([0.20, 0.50, 0.70]), false, 'clearly improving');
  assert.equal(isPlateaued([0.40, 0.60]), false, 'needs 3+ attempts');
  assert.equal(isPlateaued([]), false);
  assert.equal(isPlateaued(undefined), false);
});

// ─── keep branch ────────────────────────────────────────────────────────────

test('keep: healthy score with no plateau returns action=keep and no technique', () => {
  const rec = recommendTechnique({
    currentHabit: 'spaced_repetition',
    quizScore: 0.85,
    weakTopics: [],
    masteryHistory: [0.3, 0.5, 0.75],
  });
  assert.equal(rec.action, 'keep');
  assert.equal(rec.technique, null);
  assert.equal(rec.evidence, null);
});

test('keep: boundary score of exactly 0.7 keeps the method', () => {
  const rec = recommendTechnique({ quizScore: 0.7, masteryHistory: [0.2, 0.4, 0.7] });
  assert.equal(rec.action, 'keep');
});

// ─── plateau branch ─────────────────────────────────────────────────────────

test('plateau: a stalled curve switches even when the score is healthy', () => {
  const rec = recommendTechnique({
    currentHabit: 'pomodoro',
    quizScore: 0.9, // high score, but...
    masteryHistory: [0.80, 0.81, 0.80], // plateaued
  });
  assert.equal(rec.action, 'switch');
  assert.ok(IN_SCOPE.includes(rec.technique));
  assert.ok(/plateau/i.test(rec.reason));
  assert.ok(rec.evidence && /Dunlosky/.test(rec.evidence));
});

// ─── low-effectiveness current-habit branch ─────────────────────────────────

test('low-effectiveness habit: rereading is switched away from a HIGH technique', () => {
  const rec = recommendTechnique({
    currentHabit: 'rereading',
    quizScore: 0.95, // even with a great score, a low-impact habit is flagged
    masteryHistory: [0.5, 0.6, 0.7],
  });
  assert.equal(rec.action, 'switch');
  assert.ok(IN_SCOPE.includes(rec.technique));
  assert.ok(rec.evidence && /Dunlosky/.test(rec.evidence));
});

test('low score switches and tailors advice to weak topic count', () => {
  const rec = recommendTechnique({
    currentHabit: 'highlighting',
    quizScore: 0.4,
    weakTopics: ['mitosis', 'meiosis'],
  });
  assert.equal(rec.action, 'switch');
  assert.ok(IN_SCOPE.includes(rec.technique));
  assert.ok(/2 weak topics/.test(rec.reason));
});

// ─── avoid recommending the current method ──────────────────────────────────

test('does not recommend the technique the student is already using', () => {
  const recFeynman = recommendTechnique({ currentHabit: 'feynman', quizScore: 0.3 });
  assert.equal(recFeynman.technique, 'spaced_repetition');

  const recSR = recommendTechnique({ currentHabit: 'spaced_repetition', quizScore: 0.3 });
  assert.equal(recSR.technique, 'feynman');
});

// ─── in-scope-only output sweep (Req 6.4) ───────────────────────────────────

test('output is ONLY ever feynman, spaced_repetition, or keep across a wide sweep', () => {
  const habits = [null, 'rereading', 'highlighting', 'summarizing', 'flashcards',
    'pomodoro', 'feynman', 'spaced_repetition', 'practice_test', 'interleaved', 'unknown'];
  const scores = [null, 0, 0.3, 0.5, 0.69, 0.7, 0.85, 1];
  const histories = [[], [0.5], [0.4, 0.5], [0.4, 0.42, 0.41], [0.2, 0.5, 0.8]];

  for (const currentHabit of habits) {
    for (const quizScore of scores) {
      for (const masteryHistory of histories) {
        const rec = recommendTechnique({
          currentHabit,
          quizScore,
          weakTopics: [],
          masteryHistory,
        });
        if (rec.action === 'keep') {
          assert.equal(rec.technique, null, `keep must carry no technique (${currentHabit}/${quizScore})`);
        } else {
          assert.equal(rec.action, 'switch');
          assert.ok(
            IN_SCOPE.includes(rec.technique),
            `recommended ${rec.technique} is out of scope (${currentHabit}/${quizScore})`,
          );
          assert.notEqual(rec.technique, 'pomodoro', 'never recommends the moderate technique');
        }
      }
    }
  }
});

test('empty/no-arg call is total and in-scope', () => {
  const rec = recommendTechnique();
  assert.ok(['keep', 'switch'].includes(rec.action));
  if (rec.action === 'switch') assert.ok(IN_SCOPE.includes(rec.technique));
});
