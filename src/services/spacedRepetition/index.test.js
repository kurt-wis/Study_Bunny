/**
 * Tests for the Spaced-Repetition orchestrator (Req 4.1–4.5).
 *
 * Two layers are covered:
 *   1. Pure quality mapping — `correctnessToQuality`, `confidenceToQuality`,
 *      `qualityForAnswer`. These are pure/total, tested directly (no harness).
 *   2. Integration via the real Dexie repository under a fake IndexedDB:
 *      - `getDueTopics` ordering (most-overdue first, then ascending mastery)
 *      - `recordAnswer` runs BOTH BKT (mastery) and SM-2 (schedule) per answer
 *
 * `startSession` is intentionally not exercised here: it delegates question
 * generation to `generateQuiz` (its own tier/engine tests cover that), and the
 * SR-specific logic it adds — due-topic selection — is tested through
 * `getDueTopics` directly.
 */
import 'fake-indexeddb/auto';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

// ─── pure quality mapping (no DB) ───────────────────────────────────────────

test('correctnessToQuality: quiz correctness maps to {5, 2}', async () => {
  const { correctnessToQuality } = await import('./index.js');
  assert.equal(correctnessToQuality(true), 5);
  assert.equal(correctnessToQuality(false), 2);
});

test('confidenceToQuality: review rating maps to 5 / 3 / 1', async () => {
  const { confidenceToQuality } = await import('./index.js');
  assert.equal(confidenceToQuality('got_it'), 5);
  assert.equal(confidenceToQuality('partial'), 3);
  assert.equal(confidenceToQuality('missed_it'), 1);
});

test('confidenceToQuality is total: unknown ratings fall back to the lowest grade', async () => {
  const { confidenceToQuality } = await import('./index.js');
  assert.equal(confidenceToQuality('???'), 1);
  assert.equal(confidenceToQuality(undefined), 1);
  assert.equal(confidenceToQuality(null), 1);
});

test('qualityForAnswer: confidence (review) wins over correctness when present', async () => {
  const { qualityForAnswer } = await import('./index.js');
  // review path: confidence present → mapped regardless of isCorrect
  assert.equal(qualityForAnswer({ confidence: 'partial', isCorrect: true }), 3);
  assert.equal(qualityForAnswer({ confidence: 'got_it' }), 5);
  // quiz path: no confidence → correctness
  assert.equal(qualityForAnswer({ isCorrect: true }), 5);
  assert.equal(qualityForAnswer({ isCorrect: false }), 2);
  // empty/garbage → treated as a wrong quiz answer
  assert.equal(qualityForAnswer({}), 2);
  assert.equal(qualityForAnswer(), 2);
});

// ─── integration via the real repository (fake IndexedDB) ───────────────────

async function seedDatabase() {
  const v1 = new Dexie('StudyBunnyDB', { indexedDB, IDBKeyRange });
  v1.version(1).stores({
    documents: '++id, title, createdAt',
    summaries: '++id, documentId, tier, createdAt',
    quizzes: '++id, documentId, tier, createdAt',
    knowledgeState: '++id, documentId, topic, [documentId+topic]',
    chatHistory: '++id, documentId, timestamp',
    appSettings: 'key',
  });
  await v1.open();
  const docId = await v1.documents.add({ title: 'Cell Biology', createdAt: new Date('2024-01-01') });
  await v1.knowledgeState.add({ documentId: docId, topic: 'mitochondria', mastery: 0.30, updatedAt: new Date('2024-01-02') });
  await v1.knowledgeState.add({ documentId: docId, topic: 'ribosomes', mastery: 0.70, updatedAt: new Date('2024-01-02') });
  v1.close();
  return docId;
}

let sr;
let repo;
let docId;

before(async () => {
  docId = await seedDatabase();
  // Import after seeding so the real version(2) upgrade runs against v1 data.
  repo = await import('../../db/database.js');
  sr = await import('./index.js');
});

test('getDueTopics: never-scheduled topics are due and sort before future ones', async () => {
  const now = new Date('2024-03-10T00:00:00Z');

  // Both start null (never scheduled) → both due. Sorted by ascending mastery.
  let due = await sr.getDueTopics(docId, now);
  assert.deepEqual(due.map(d => d.topic), ['mitochondria', 'ribosomes'],
    'null-scheduled topics ordered by ascending mastery (0.30 before 0.70)');

  // Push ribosomes into the future → no longer due.
  await repo.updateSchedule(docId, 'ribosomes', {
    interval: 10, easeFactor: 2.5, nextReviewDate: new Date('2024-04-01T00:00:00Z'),
  });
  due = await sr.getDueTopics(docId, now);
  assert.deepEqual(due.map(d => d.topic), ['mitochondria'], 'future-scheduled topic excluded');
});

test('getDueTopics: among due topics, more-overdue sorts before less-overdue', async () => {
  const now = new Date('2024-03-10T00:00:00Z');
  // mitochondria overdue by ~9 days, make a second overdue topic less overdue.
  await repo.updateSchedule(docId, 'mitochondria', {
    interval: 1, easeFactor: 2.5, nextReviewDate: new Date('2024-03-01T00:00:00Z'),
  });
  await repo.updateSchedule(docId, 'ribosomes', {
    interval: 1, easeFactor: 2.5, nextReviewDate: new Date('2024-03-08T00:00:00Z'),
  });
  const due = await sr.getDueTopics(docId, now);
  assert.deepEqual(due.map(d => d.topic), ['mitochondria', 'ribosomes'],
    'most-overdue (earliest nextReviewDate) comes first');
});

test('recordAnswer (quiz, correct): raises BKT mastery AND advances the SM-2 schedule', async () => {
  const now = new Date('2024-03-10T00:00:00Z');
  const before = (await repo.getKnowledgeState(docId))['ribosomes'].mastery;

  const result = await sr.recordAnswer(docId, 'ribosomes', { isCorrect: true }, now);

  // BKT: a correct answer increases mastery.
  assert.ok(result.mastery > before, 'mastery increased on a correct answer');
  // SM-2: quality 5 (correct) → schedule written forward from `now`.
  assert.equal(result.quality, 5);
  assert.ok(result.nextReviewDate.getTime() > now.getTime(), 'nextReviewDate scheduled in the future');

  // Persisted through the repository.
  const row = (await repo.getKnowledgeState(docId))['ribosomes'];
  assert.equal(row.mastery, result.mastery, 'mastery persisted');
  assert.equal(row.interval, result.interval, 'interval persisted');
  assert.deepEqual(new Date(row.nextReviewDate), result.nextReviewDate, 'nextReviewDate persisted');
});

test('recordAnswer (quiz, wrong): lowers mastery and relearns (quality 2 → interval 1)', async () => {
  const now = new Date('2024-03-10T00:00:00Z');
  const before = (await repo.getKnowledgeState(docId))['mitochondria'].mastery;

  const result = await sr.recordAnswer(docId, 'mitochondria', { isCorrect: false }, now);

  assert.ok(result.mastery < before, 'mastery decreased on a wrong answer');
  assert.equal(result.quality, 2);
  assert.equal(result.interval, 1, 'quality < 3 relearns to a 1-day interval');
});

test('recordAnswer (review, confidence): feeds the confidence rating into SM-2 quality', async () => {
  const now = new Date('2024-03-10T00:00:00Z');

  const partial = await sr.recordAnswer(docId, 'ribosomes', { confidence: 'partial' }, now);
  assert.equal(partial.quality, 3, 'partial → quality 3');

  const missed = await sr.recordAnswer(docId, 'ribosomes', { confidence: 'missed_it' }, now);
  assert.equal(missed.quality, 1, 'missed_it → quality 1');
  assert.equal(missed.interval, 1, 'a missed review relearns');
});

test('recordAnswer creates a knowledgeState row for a brand-new topic', async () => {
  const now = new Date('2024-03-10T00:00:00Z');
  const result = await sr.recordAnswer(docId, 'golgi apparatus', { isCorrect: true }, now);
  assert.ok(result.mastery > 0, 'new topic gets a mastery estimate');
  const row = (await repo.getKnowledgeState(docId))['golgi apparatus'];
  assert.ok(row, 'new topic persisted to knowledgeState');
  assert.equal(row.interval, 1, 'first successful review schedules 1 day');
});
