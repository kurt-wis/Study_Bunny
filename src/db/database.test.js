/**
 * Repository tests for the Dexie version 2 (learning techniques) upgrade.
 *
 * Runs under Node's built-in test runner with a fake IndexedDB so the real
 * `StudyBunnyDB` schema (including the version(1) → version(2) upgrade path) is
 * exercised exactly as it will be in the browser.
 *
 * Covers:
 *   - v1 documents + knowledgeState survive the v2 upgrade (Req 9.1, 4.6)
 *   - SM-2 fields (interval/easeFactor/nextReviewDate) are backfilled on existing rows
 *   - studyTechniques / feynmanAttempts round-trips (Req 1.5)
 *   - getDueTopics ordering + updateSchedule (Req 4.x)
 */
import 'fake-indexeddb/auto';
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import Dexie from 'dexie';

// Seed a *v1-only* database before the production module (which declares v2) is
// ever imported, so importing the module triggers the real upgrade.
async function seedV1Database() {
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
  const docId = await v1.documents.add({ title: 'Photosynthesis', createdAt: new Date('2024-01-01') });
  await v1.knowledgeState.add({ documentId: docId, topic: 'light reactions', mastery: 0.42, updatedAt: new Date('2024-01-02') });
  await v1.knowledgeState.add({ documentId: docId, topic: 'calvin cycle', mastery: 0.80, updatedAt: new Date('2024-01-03') });
  v1.close();
  return docId;
}

let repo;
let seededDocId;

before(async () => {
  seededDocId = await seedV1Database();
  // Import after seeding so the version(2) upgrade runs against v1 data.
  repo = await import('./database.js');
});

test('v1 documents survive the version 2 upgrade', async () => {
  const docs = await repo.getAllDocuments();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'Photosynthesis');
});

test('existing knowledgeState rows are preserved and backfilled with SM-2 fields', async () => {
  const state = await repo.getKnowledgeState(seededDocId);
  assert.ok(state['light reactions'], 'light reactions topic preserved');
  assert.equal(state['light reactions'].mastery, 0.42);
  assert.equal(state['calvin cycle'].mastery, 0.80);

  // Backfill is on the raw records; verify through the default export table.
  const rows = await repo.default.knowledgeState.where('documentId').equals(seededDocId).toArray();
  for (const r of rows) {
    assert.equal(r.interval, 0, 'interval backfilled to 0');
    assert.equal(r.easeFactor, 2.5, 'easeFactor backfilled to 2.5');
    assert.equal(r.nextReviewDate, null, 'nextReviewDate backfilled to null');
  }
});

test('setStudyTechnique upserts and getStudyTechnique reads it back', async () => {
  await repo.setStudyTechnique(seededDocId, 'feynman');
  let picked = await repo.getStudyTechnique(seededDocId);
  assert.equal(picked.technique, 'feynman');
  assert.equal(picked.documentId, seededDocId);

  // Upsert (not insert) on change.
  await repo.setStudyTechnique(seededDocId, 'spaced_repetition');
  const all = await repo.default.studyTechniques.where('documentId').equals(seededDocId).toArray();
  assert.equal(all.length, 1, 'technique selection stays a single row per document');
  picked = await repo.getStudyTechnique(seededDocId);
  assert.equal(picked.technique, 'spaced_repetition');
});

test('saveFeynmanAttempt persists and getFeynmanAttempts filters + orders', async () => {
  await repo.saveFeynmanAttempt({
    documentId: seededDocId, topic: 'light reactions',
    explanation: 'Light hits chlorophyll...', tier: 'deterministic',
    selfRating: 'partial', matchedKeywords: ['chlorophyll'], missedKeywords: ['photolysis'],
    createdAt: new Date('2024-02-01'),
  });
  await repo.saveFeynmanAttempt({
    documentId: seededDocId, topic: 'light reactions',
    explanation: 'Second, better attempt', tier: 'cloud', aiScore: 0.9,
    createdAt: new Date('2024-02-05'),
  });
  await repo.saveFeynmanAttempt({
    documentId: seededDocId, topic: 'calvin cycle',
    explanation: 'CO2 fixation', tier: 'deterministic',
    createdAt: new Date('2024-02-03'),
  });

  const forTopic = await repo.getFeynmanAttempts(seededDocId, 'light reactions');
  assert.equal(forTopic.length, 2, 'topic filter applied');
  assert.ok(new Date(forTopic[0].createdAt) <= new Date(forTopic[1].createdAt), 'ordered ascending by createdAt');
  assert.deepEqual(forTopic[0].matchedKeywords, ['chlorophyll']);

  const all = await repo.getFeynmanAttempts(seededDocId);
  assert.equal(all.length, 3, 'all attempts returned when topic omitted');
});

test('updateSchedule writes SM-2 fields and getDueTopics orders by due-ness then mastery', async () => {
  const now = new Date('2024-03-10T00:00:00Z');
  // calvin cycle: due in the past (overdue). light reactions: left null (never scheduled).
  await repo.updateSchedule(seededDocId, 'calvin cycle', {
    interval: 6, easeFactor: 2.6, nextReviewDate: new Date('2024-03-01T00:00:00Z'),
  });

  const due = await repo.getDueTopics(seededDocId, now);
  const topics = due.map(d => d.topic);
  assert.ok(topics.includes('light reactions'), 'never-scheduled topic is due');
  assert.ok(topics.includes('calvin cycle'), 'overdue topic is due');
  // null (never scheduled) sorts earliest, so light reactions comes before the overdue one.
  assert.equal(topics[0], 'light reactions');

  // A topic scheduled in the future is NOT due.
  await repo.updateSchedule(seededDocId, 'light reactions', {
    interval: 1, easeFactor: 2.5, nextReviewDate: new Date('2024-04-01T00:00:00Z'),
  });
  const dueAfter = await repo.getDueTopics(seededDocId, now);
  assert.deepEqual(dueAfter.map(d => d.topic), ['calvin cycle'], 'future-scheduled topic excluded');
});

test('updateSchedule creates a scheduling row when no mastery row exists', async () => {
  const next = new Date('2024-05-01T00:00:00Z');
  await repo.updateSchedule(seededDocId, 'brand new topic', {
    interval: 1, easeFactor: 2.5, nextReviewDate: next,
  });
  const rows = await repo.default.knowledgeState
    .where('[documentId+topic]')
    .equals([seededDocId, 'brand new topic'])
    .toArray();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].interval, 1);
  assert.equal(rows[0].mastery, 0, 'mastery defaults to 0 for a schedule-only row');
});

test('version 3 preserves existing data and supports compound summary lookup', async () => {
  const summaryId = await repo.saveSummary({ documentId: seededDocId, tier: 'deterministic', content: 'Existing summary' });
  assert.equal((await repo.getSummary(seededDocId, 'deterministic')).id, summaryId);
  assert.equal((await repo.getDocument(seededDocId)).title, 'Photosynthesis');
  assert.equal(repo.default.verno, 3);
});

test('verification history is bounded, newest first, and cannot change ownership', async () => {
  const docId = await repo.saveDocument({ title: 'History', rawText: 'Notes', chunks: [], pages: ['Page one'] });
  assert.deepEqual((await repo.getDocument(docId)).pages, ['Page one']);
  for (let number = 1; number <= 25; number++) {
    await repo.saveVerificationReport(docId, { number, documentId: seededDocId, claims: [], references: [] });
  }
  const reports = await repo.getVerificationReports(docId);
  assert.equal(reports.length, 20);
  assert.deepEqual(new Set(reports.map(r => r.number)), new Set(Array.from({ length: 20 }, (_, i) => i + 6)));
  assert.ok(reports.every(r => r.documentId === docId));
  assert.ok(reports[0].createdAt >= reports.at(-1).createdAt);
});

test('document deletion cascades all study data and rejects stale verification saves', async () => {
  const docId = await repo.saveDocument({ title: 'Delete fixture', rawText: 'notes', chunks: [] });
  for (const table of ['summaries', 'quizzes', 'knowledgeState', 'chatHistory', 'studyTechniques', 'feynmanAttempts', 'verificationReports']) {
    await repo.default[table].add({ documentId: docId });
  }
  await repo.deleteDocument(docId);
  assert.equal(await repo.getDocument(docId), undefined);
  for (const table of ['summaries', 'quizzes', 'knowledgeState', 'chatHistory', 'studyTechniques', 'feynmanAttempts', 'verificationReports']) {
    assert.equal(await repo.default[table].where('documentId').equals(docId).count(), 0);
  }
  await assert.rejects(repo.saveVerificationReport(docId, { claims: [] }), /no longer exists/);
  assert.ok(await repo.getDocument(seededDocId), 'other documents remain intact');
});
