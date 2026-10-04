import test from 'node:test';
import assert from 'node:assert/strict';
import { splitChunks, normalizeRange, scopeDocument, mixQuestions, sampleEvenly, attributeQuestion } from './scope.js';

const doc = {
  rawText: 'Page one text.\n\nPage two text.\n\nPage three text.',
  lineText: 'Page one\ntext.\n\nPage two\ntext.\n\nPage three\ntext.',
  pages: ['Page one text.', 'Page two text.', 'Page three text.'],
  chunks: ['whole'],
  items: [{ term: 'two', definition: 'second' }, { term: 'zebra', definition: 'animal' }],
};

test('no range returns the module exactly as stored', () => {
  const s = scopeDocument(doc);
  assert.equal(s.rawText, doc.rawText);
  assert.equal(s.lineText, doc.lineText);
  assert.deepEqual(s.chunks, ['whole']);
  assert.equal(s.items, doc.items);
  assert.equal(s.range, null);
  assert.equal(scopeDocument(doc, { from: 1, to: 3 }).range, null, 'full range is the whole module');
});

test('older documents without lineText, chunks or pages still work', () => {
  const s = scopeDocument({ rawText: 'Only text.' }, { from: 1, to: 2 });
  assert.equal(s.lineText, 'Only text.');
  assert.deepEqual(s.chunks, ['Only text.']);
  assert.equal(s.items, null);
});

test('a page range narrows text, lines and cards', () => {
  const s = scopeDocument(doc, { from: 2, to: 2 });
  assert.equal(s.rawText, 'Page two text.');
  assert.equal(s.lineText, 'Page two\ntext.');
  assert.deepEqual(s.chunks, ['Page two text.']);
  assert.deepEqual(s.items, [{ term: 'two', definition: 'second' }]);
  assert.deepEqual(s.range, { from: 2, to: 2 });
});

test('ranges are clamped and reordered', () => {
  assert.deepEqual(normalizeRange({ from: 9, to: 2 }, 3), { from: 2, to: 3 });
  assert.deepEqual(normalizeRange({ from: '2' }, 3), { from: 2, to: 3 });
  assert.equal(normalizeRange({ from: 'x', to: 'y' }, 3), null);
  assert.equal(normalizeRange(null, 3), null);
});

test('an empty part is reported clearly', () => {
  assert.throws(() => scopeDocument({ ...doc, pages: ['a', '', 'c'] }, { from: 2, to: 2 }), /no readable text/);
});

test('splitChunks keeps all text and respects the size', () => {
  const text = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
  const chunks = splitChunks(text, 200);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length <= 230));
  assert.equal(chunks.join(' ').replace(/\s+/g, ' '), text);
  assert.deepEqual(splitChunks(''), []);
});

test('mixQuestions takes turns between modules and renumbers', () => {
  const a = [1, 2, 3].map(n => ({ type: 'fill_in_blank', documentId: 1, n })).concat([{ type: 'true_false', documentId: 1, n: 4 }]);
  const b = [{ type: 'fill_in_blank', documentId: 2, n: 1 }, { type: 'true_false', documentId: 2, n: 2 }];
  const mixed = mixQuestions([a, b], 5);
  assert.deepEqual(mixed.map(q => q.documentId), [1, 2, 1, 2, 1]);
  assert.deepEqual(mixed.map(q => q.id), [1, 2, 3, 4, 5]);
  assert.ok(mixed.some(q => q.type === 'true_false'));
  assert.equal(mixQuestions([[], b], 5).length, 2);
  assert.deepEqual(mixQuestions([], 5), []);
});

test('sampleEvenly and attributeQuestion', () => {
  assert.deepEqual(sampleEvenly([1, 2, 3, 4, 5, 6], 3), [1, 3, 5]);
  assert.deepEqual(sampleEvenly([1, 2], 3), [1, 2]);
  const sources = [{ documentId: 7, rawText: 'About plants.' }, { documentId: 9, rawText: 'About Jose Rizal.' }];
  assert.equal(attributeQuestion({ correct_answer: 'Jose Rizal', topic: 'history' }, sources), 9);
  assert.equal(attributeQuestion({ correct_answer: 'Nothing here', topic: '' }, sources), 7);
});
