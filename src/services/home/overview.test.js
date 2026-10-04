import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStreak, dayKey, deriveOverview, formatDuration, relativeDay, setCode } from './overview.js';

const NOW = new Date(2026, 9, 6, 9, 0, 0); // Tue 6 Oct 2026, local time
const daysAgo = n => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n, 8, 0, 0);

test('dayKey uses the local calendar day', () => {
  assert.equal(dayKey(NOW), '2026-10-06');
});

test('computeStreak counts consecutive days and tolerates "not yet today"', () => {
  const days = new Set([1, 2, 3].map(n => dayKey(daysAgo(n))));
  assert.deepEqual(computeStreak(days, NOW), { current: 3, best: 3 });
  days.add(dayKey(NOW));
  assert.deepEqual(computeStreak(days, NOW), { current: 4, best: 4 });
});

test('computeStreak resets after a missed day but remembers the best run', () => {
  const days = new Set([3, 4, 5, 6, 7].map(n => dayKey(daysAgo(n))));
  days.add(dayKey(NOW));
  assert.deepEqual(computeStreak(days, NOW), { current: 1, best: 5 });
  assert.deepEqual(computeStreak(new Set(), NOW), { current: 0, best: 0 });
});

test('small formatters', () => {
  assert.equal(setCode('Cell Biology'), 'CB');
  assert.equal(setCode('statistics'), 'ST');
  assert.equal(setCode(''), 'SB');
  assert.equal(formatDuration(3 * 3600 + 42 * 60), '3h 42m');
  assert.equal(formatDuration(0), '0m');
  assert.equal(relativeDay(daysAgo(2), NOW), '2 days ago');
  assert.equal(relativeDay(NOW, NOW), 'today');
});

test('deriveOverview: due cards, mastery, curve and plan come from stored records', () => {
  const documents = [
    { id: 1, title: 'Cell Biology', chunks: ['a', 'b'], createdAt: daysAgo(20) },
    { id: 2, title: 'Statistics', chunks: ['a'], createdAt: daysAgo(10) },
  ];
  const knowledge = [
    { documentId: 1, topic: 'mitochondria', mastery: 0.9, updatedAt: daysAgo(1), nextReviewDate: daysAgo(-3) },
    { documentId: 1, topic: 'ribosomes', mastery: 0.5, updatedAt: daysAgo(2), nextReviewDate: daysAgo(1) },
    { documentId: 2, topic: 'variance', mastery: 0.2, updatedAt: daysAgo(9), nextReviewDate: null },
    { documentId: 99, topic: 'orphan', mastery: 0.9, updatedAt: daysAgo(1), nextReviewDate: null },
  ];
  const questions = n => Array.from({ length: n }, () => ({}));
  const quizzes = [
    { documentId: 1, questions: questions(5), score: 2, createdAt: daysAgo(2), completedAt: daysAgo(2) },
    { documentId: 1, questions: questions(5), score: 4, createdAt: daysAgo(1), completedAt: daysAgo(1), source: 'review' },
    { documentId: 2, questions: questions(5), score: null, createdAt: daysAgo(1), completedAt: null },
  ];
  const o = deriveOverview({ documents, knowledge, quizzes, studyLog: { [dayKey(daysAgo(1))]: 600, '2026-01-01': 60 }, now: NOW });

  assert.equal(o.due, 2);
  assert.equal(o.mastered, 1);
  assert.equal(o.masteredThisWeek, 1);
  assert.equal(o.sets[0].masteryPct, 70);
  assert.equal(o.sets[1].masteryPct, 20);
  assert.deepEqual(o.curve.map(p => p.pct), [40, 80]);
  assert.equal(o.curveDelta, 40);
  assert.equal(o.strongest.title, 'Cell Biology');
  assert.equal(o.streak.current, 2);
  assert.equal(o.weekSeconds, 600);
  assert.equal(o.totalSeconds, 660);
  assert.equal(o.plan[0].to, '/student/review');
  assert.equal(o.plan[1].to, '/student/document/2/quiz');
});

test('deriveOverview: an empty device yields an empty, non-throwing overview', () => {
  const o = deriveOverview({ now: NOW });
  assert.equal(o.due, 0);
  assert.deepEqual(o.sets, []);
  assert.deepEqual(o.plan, []);
  assert.equal(o.curveDelta, null);
  assert.equal(o.since, null);
});
