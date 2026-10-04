import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyTips } from './studyTips.js';
import { buildAudioScript, estimateSeconds } from './audioScript.js';

const NOW = new Date(2026, 9, 6, 9, 0, 0);
const q = (score, total, daysAgo) => ({ score, questions: Array.from({ length: total }, () => ({})), createdAt: new Date(NOW.getTime() - daysAgo * 864e5) });

test('study tips: a new lesson starts with a quiz and never throws on empty input', () => {
  assert.deepEqual(buildStudyTips(), [{
    id: 'first-quiz',
    title: 'Start with a short quiz',
    text: 'Take one quiz before you read again. It shows what you already know, so you only study what you need.',
    action: { label: 'Take a quiz', to: '/student/document/undefined/quiz' },
  }]);
  const tips = buildStudyTips({ documentId: 3 });
  assert.equal(tips[0].action.to, '/student/document/3/quiz');
});

test('study tips: weakest topic, technique switch and due reviews come from stored progress', () => {
  const tips = buildStudyTips({
    documentId: 1,
    knowledgeState: {
      ribosomes: { mastery: 0.2, nextReviewDate: new Date(NOW.getTime() - 864e5) },
      nucleus: { mastery: 0.9, nextReviewDate: new Date(NOW.getTime() + 864e5) },
    },
    quizzes: [q(2, 5, 1)],
    now: NOW,
  });
  const ids = tips.map(t => t.id);
  assert.deepEqual(ids, ['weakest-topic', 'switch-technique', 'due-today']);
  assert.match(tips[0].title, /ribosomes/);
  assert.match(tips[0].action.to, /technique=feynman&topic=ribosomes/);
  assert.match(tips[2].title, /^1 topic is due/);
});

test('study tips: lesson content drives tips, capped at four', () => {
  const tips = buildStudyTips({
    documentId: 1,
    rawText: 'word '.repeat(2000),
    keyTopics: ['a', 'b', 'c', 'd', 'e', 'f'],
    knowledgeState: { a: { mastery: 0.95, nextReviewDate: new Date(NOW.getTime() + 864e5) } },
    quizzes: [q(5, 5, 2), q(5, 5, 1)],
    now: NOW,
  });
  assert.deepEqual(tips.map(t => t.id), ['long-lesson', 'many-terms', 'keep-fresh']);
  assert.ok(tips.length <= 4);
});

test('audio script: points, extra ideas, then a mini-quiz with a pause before each answer', () => {
  const lines = buildAudioScript({
    title: 'Cell Biology',
    content: {
      keyPoints: ['Mitochondria produce energy for the cell.', 'The nucleus stores DNA.'],
      keyConcepts: [
        { term: 'mitochondria', explanation: 'Mitochondria produce energy for the cell.' },
        { term: 'ribosomes', explanation: 'Ribosomes build proteins.' },
      ],
    },
  });
  const kinds = lines.map(l => l.kind);
  assert.equal(kinds[0], 'intro');
  assert.equal(kinds.filter(k => k === 'point').length, 2);
  assert.equal(kinds.filter(k => k === 'idea').length, 1); // the repeated line is not read twice
  assert.equal(kinds.filter(k => k === 'question').length, 2);
  assert.ok(lines.filter(l => l.kind === 'question').every(l => l.pauseAfterMs > 0));
  assert.equal(kinds[kinds.length - 1], 'outro');
  assert.ok(estimateSeconds(lines) > 10);
});

test('audio script: nothing to read yields an empty script', () => {
  assert.deepEqual(buildAudioScript(), []);
  assert.deepEqual(buildAudioScript({ content: { overview: '' } }), []);
});
