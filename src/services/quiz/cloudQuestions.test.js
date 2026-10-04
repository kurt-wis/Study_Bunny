import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCloudQuestion, normalizeCloudQuiz } from './cloudQuestions.js';

test('a "multiple-choice" question becomes multiple_choice with its options', () => {
  const q = normalizeCloudQuestion({ id: '1', type: 'multiple-choice', topic: 'Sourcing', prompt: 'What is the primary difference between procurement and purchasing?', options: ['Scope', 'Price', 'Speed', 'Colour'], answer: 'Scope', explanation: 'Procurement is broader.' });
  assert.equal(q.type, 'multiple_choice');
  assert.deepEqual(q.options, ['Scope', 'Price', 'Speed', 'Colour']);
  assert.equal(q.correct_answer, 'Scope');
});

test('the type label is ignored: options decide', () => {
  for (const type of ['mcq', 'true_false', 'whatever', undefined]) {
    assert.equal(normalizeCloudQuestion({ type, prompt: 'Q?', options: ['a', 'b', 'c'], answer: 'b' }).type, 'multiple_choice');
  }
});

test('a letter answer is resolved to the option text', () => {
  assert.equal(normalizeCloudQuestion({ prompt: 'Q?', options: ['One', 'Two', 'Three', 'Four'], answer: 'B' }).correct_answer, 'Two');
  assert.equal(normalizeCloudQuestion({ prompt: 'Q?', options: ['One', 'Two', 'Three', 'Four'], answer: 'c)' }).correct_answer, 'Three');
});

test('labelled options are unlabelled and still matched', () => {
  const q = normalizeCloudQuestion({ prompt: 'Q?', options: ['A. One', 'B. Two', 'C. Three'], answer: 'B. Two' });
  assert.deepEqual(q.options, ['One', 'Two', 'Three']);
  assert.equal(q.correct_answer, 'Two');
  assert.equal(normalizeCloudQuestion({ prompt: 'Q?', options: ['A. One', 'B. Two', 'C. Three'], answer: 'C' }).correct_answer, 'Three');
});

test('answer matching ignores case', () => {
  assert.equal(normalizeCloudQuestion({ prompt: 'Q?', options: ['Alpha', 'Beta'], answer: 'beta' }).correct_answer, 'Beta');
});

test('true/false questions keep working', () => {
  const a = normalizeCloudQuestion({ prompt: 'Water is wet.', options: ['true', 'false'], answer: 'true' });
  assert.equal(a.type, 'true_false');
  assert.deepEqual(a.options, ['True', 'False']);
  assert.equal(a.correct_answer, 'True');
  const b = normalizeCloudQuestion({ prompt: 'Water is dry.', answer: 'False' });
  assert.equal(b.type, 'true_false');
  assert.equal(b.correct_answer, 'False');
});

test('no options means a typed answer', () => {
  const q = normalizeCloudQuestion({ prompt: 'Capital of France?', answer: 'Paris' });
  assert.equal(q.type, 'fill_in_blank');
  assert.deepEqual(q.acceptable_answers, ['Paris']);
});

test('unanswerable questions are dropped and ids renumbered', () => {
  const out = normalizeCloudQuiz([
    { prompt: 'Q1?', options: ['a', 'b'], answer: 'z' },
    { prompt: '', options: ['a', 'b'], answer: 'a' },
    null,
    { prompt: 'Q4?', options: ['a', 'b', 'c'], answer: 'a' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 1);
  assert.equal(out[0].question, 'Q4?');
  assert.deepEqual(normalizeCloudQuiz(undefined), []);
});
