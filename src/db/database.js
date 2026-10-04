/**
 * LocalRepository — shared Dexie database for Study Bunny (student mode).
 * ALL features must use this module; no separate Dexie instances.
 * Schema changes must be additive and versioned.
 */
import Dexie from 'dexie';

const db = new Dexie('StudyBunnyDB');

// Version 1 — student-mode schema
db.version(1).stores({
  documents: '++id, title, createdAt',
  summaries: '++id, documentId, tier, createdAt',
  quizzes: '++id, documentId, tier, createdAt',
  knowledgeState: '++id, documentId, topic, [documentId+topic]',
  chatHistory: '++id, documentId, timestamp',

  // App-wide settings
  appSettings: 'key',
});

// Version 2 — learning techniques (additive only).
// No v1 store or index is renamed or removed. New stores for the technique picker
// and Feynman attempts; an additive `nextReviewDate` index on knowledgeState for
// Spaced Repetition due-topic lookups.
db.version(2).stores({
  // unchanged v1 stores kept verbatim
  documents: '++id, title, createdAt',
  summaries: '++id, documentId, tier, createdAt',
  quizzes: '++id, documentId, tier, createdAt',
  knowledgeState: '++id, documentId, topic, [documentId+topic], nextReviewDate',
  chatHistory: '++id, documentId, timestamp',
  appSettings: 'key',
  // new stores
  studyTechniques: '++id, documentId, [documentId]', // selected technique per document
  feynmanAttempts: '++id, documentId, topic, createdAt',
}).upgrade(async tx => {
  // Backfill SM-2 fields on existing knowledgeState rows (idempotent, additive).
  await tx.table('knowledgeState').toCollection().modify(r => {
    if (r.interval === undefined) r.interval = 0;
    if (r.easeFactor === undefined) r.easeFactor = 2.5;
    if (r.nextReviewDate === undefined) r.nextReviewDate = null;
  });
});

// Version 3 preserves all existing records, adds verification history and the
// summary index previously queried via an exception-based fallback.
db.version(3).stores({
  summaries: '++id, documentId, tier, [documentId+tier], createdAt',
  verificationReports: '++id, documentId, createdAt',
});

export default db;

// ─── Documents ───────────────────────────────────────────────────────────────

export async function saveDocument({ title, rawText, chunks, pages = [], lineText = null, cleanup = null, createdAt }) {
  // `lineText` is the same text with the handout's line breaks kept (used to
  // find "term - meaning" lines). Older documents do not have it.
  // `cleanup` records how many non-lesson lines were removed at upload.
  return db.documents.add({ title, rawText, chunks, pages, lineText, cleanup, createdAt: createdAt ?? new Date() });
}

/**
 * Save the student's corrected cards (term + meaning) for a document, or pass
 * null to go back to the automatic ones. Cached summaries are dropped so the
 * next summary is rebuilt from the corrected cards.
 */
export async function updateDocumentItems(documentId, items) {
  const clean = Array.isArray(items)
    ? items
      .map(i => ({ term: String(i?.term ?? '').replace(/\s+/g, ' ').trim(), definition: String(i?.definition ?? '').replace(/\s+/g, ' ').trim() }))
      .filter(i => i.term && i.definition)
    : null;
  await db.transaction('rw', [db.documents, db.summaries], async () => {
    await db.documents.update(documentId, { items: clean && clean.length > 0 ? clean : null, itemsEditedAt: clean ? new Date() : null });
    await db.summaries.where('documentId').equals(documentId).delete();
  });
}

export async function getDocument(documentId) {
  return db.documents.get(documentId);
}

export async function getAllDocuments() {
  return db.documents.orderBy('createdAt').reverse().toArray();
}

export async function deleteDocument(documentId) {
  await db.transaction('rw', [db.documents, db.summaries, db.quizzes, db.knowledgeState, db.chatHistory, db.studyTechniques, db.feynmanAttempts, db.verificationReports], async () => {
    await db.documents.delete(documentId);
    await db.summaries.where('documentId').equals(documentId).delete();
    await db.quizzes.where('documentId').equals(documentId).delete();
    await db.knowledgeState.where('documentId').equals(documentId).delete();
    await db.chatHistory.where('documentId').equals(documentId).delete();
    await db.studyTechniques.where('documentId').equals(documentId).delete();
    await db.feynmanAttempts.where('documentId').equals(documentId).delete();
    await db.verificationReports.where('documentId').equals(documentId).delete();
  });
}

// ─── Summaries ────────────────────────────────────────────────────────────────

export async function saveSummary({ documentId, tier, content, format, createdAt }) {
  return db.summaries.add({ documentId, tier, content, format, createdAt: createdAt ?? new Date() });
}

export async function getSummary(documentId, tier) {
  return db.summaries
    .where('[documentId+tier]')
    .equals([documentId, tier])
    .first()
    .catch(() =>
      // Fallback if compound index isn't ready
      db.summaries.where('documentId').equals(documentId).and(s => s.tier === tier).first()
    );
}

// ─── Quizzes ──────────────────────────────────────────────────────────────────

export async function saveQuiz({ documentId, tier, questions, score, completedAt, createdAt }) {
  return db.quizzes.add({
    documentId, tier, questions,
    score: score ?? null,
    completedAt: completedAt ?? null,
    createdAt: createdAt ?? new Date(),
  });
}

export async function getQuizzesByDocument(documentId) {
  return db.quizzes.where('documentId').equals(documentId).reverse().sortBy('createdAt');
}

export async function updateQuizScore(quizId, score) {
  return db.quizzes.update(quizId, { score, completedAt: new Date() });
}

/**
 * Tag a quiz record with how it was produced (additive, record-shape only).
 *
 * `source` distinguishes a plain quiz (`'quiz'`) from one run inside the guided
 * Review flow (`'review'`), and `technique` records which learning technique
 * drove it. Both are optional, feature-owned fields on the existing `quizzes`
 * store (design §"Data model") — no index or store contract changes — so the
 * Dashboard can later color/attribute the learning curve by source + technique.
 * Written by the Review orchestrator after a session's quiz record exists.
 *
 * @param {number} quizId
 * @param {{ source?: 'quiz'|'review', technique?: string|null }} tags
 * @returns {Promise<number>}
 */
export async function tagQuizSource(quizId, { source, technique = null } = {}) {
  return db.quizzes.update(quizId, { source: source ?? 'quiz', technique });
}

// ─── Knowledge State (BKT) ────────────────────────────────────────────────────

export async function getKnowledgeState(documentId) {
  const records = await db.knowledgeState.where('documentId').equals(documentId).toArray();
  const state = {};
  for (const r of records) {
    // Expose BKT mastery plus the additive SM-2 schedule fields (undefined on
    // pre-upgrade rows). Existing consumers read only `.mastery`; the extra
    // fields are additive and let the Spaced-Repetition engine read a topic's
    // schedule through the same helper.
    state[r.topic] = {
      mastery: r.mastery,
      updatedAt: r.updatedAt,
      interval: r.interval,
      easeFactor: r.easeFactor,
      nextReviewDate: r.nextReviewDate,
    };
  }
  return state;
}

export async function updateKnowledgeState(documentId, topic, mastery) {
  const existing = await db.knowledgeState
    .where('[documentId+topic]')
    .equals([documentId, topic])
    .first()
    .catch(() => db.knowledgeState.where('documentId').equals(documentId).and(r => r.topic === topic).first());

  if (existing) {
    return db.knowledgeState.update(existing.id, { mastery, updatedAt: new Date() });
  } else {
    return db.knowledgeState.add({ documentId, topic, mastery, updatedAt: new Date() });
  }
}

// ─── Study Techniques ─────────────────────────────────────────────────────────

export async function getStudyTechnique(documentId) {
  return db.studyTechniques.where('documentId').equals(documentId).first();
}

export async function setStudyTechnique(documentId, technique) {
  const existing = await db.studyTechniques.where('documentId').equals(documentId).first();
  if (existing) {
    return db.studyTechniques.update(existing.id, { technique, setAt: new Date() });
  }
  return db.studyTechniques.add({ documentId, technique, setAt: new Date() });
}

// ─── Feynman Attempts ─────────────────────────────────────────────────────────

export async function saveFeynmanAttempt(attempt) {
  const {
    documentId, topic, prompt, explanation, tier,
    selfRating, aiScore, matchedKeywords, missedKeywords, createdAt,
  } = attempt;
  return db.feynmanAttempts.add({
    documentId, topic,
    prompt: prompt ?? null,
    explanation: explanation ?? '',
    tier: tier ?? null,
    selfRating: selfRating ?? null,
    aiScore: aiScore ?? null,
    matchedKeywords: matchedKeywords ?? [],
    missedKeywords: missedKeywords ?? [],
    createdAt: createdAt ?? new Date(),
  });
}

export async function getFeynmanAttempts(documentId, topic) {
  const collection = db.feynmanAttempts.where('documentId').equals(documentId);
  const records = topic != null
    ? await collection.and(a => a.topic === topic).toArray()
    : await collection.toArray();
  return records.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

// ─── Spaced Repetition schedule (SM-2) ──────────────────────────────────────────

export async function getDueTopics(documentId, now = new Date()) {
  const records = await db.knowledgeState.where('documentId').equals(documentId).toArray();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const due = records.filter(r => {
    // null / never scheduled is always due.
    if (r.nextReviewDate == null) return true;
    return new Date(r.nextReviewDate).getTime() <= nowMs;
  });
  due.sort((a, b) => {
    // Most overdue first: null (never scheduled) sorts earliest.
    const aDue = a.nextReviewDate == null ? -Infinity : new Date(a.nextReviewDate).getTime();
    const bDue = b.nextReviewDate == null ? -Infinity : new Date(b.nextReviewDate).getTime();
    if (aDue !== bDue) return aDue - bDue;
    // Then ascending mastery (weakest first).
    return (a.mastery ?? 0) - (b.mastery ?? 0);
  });
  return due.map(r => ({ topic: r.topic, mastery: r.mastery, nextReviewDate: r.nextReviewDate }));
}

export async function updateSchedule(documentId, topic, { interval, easeFactor, nextReviewDate }) {
  const existing = await db.knowledgeState
    .where('[documentId+topic]')
    .equals([documentId, topic])
    .first()
    .catch(() => db.knowledgeState.where('documentId').equals(documentId).and(r => r.topic === topic).first());

  if (existing) {
    return db.knowledgeState.update(existing.id, { interval, easeFactor, nextReviewDate });
  }
  // No mastery row yet: create a scheduling-only row; BKT fills mastery later.
  return db.knowledgeState.add({
    documentId, topic, mastery: 0, updatedAt: new Date(),
    interval, easeFactor, nextReviewDate,
  });
}

// ─── Chat History ─────────────────────────────────────────────────────────────

export async function saveChatMessage({ documentId, role, content, citations, tier }) {
  return db.chatHistory.add({ documentId, role, content, citations: citations ?? [], tier, timestamp: new Date() });
}

export async function getChatHistory(documentId) {
  return db.chatHistory.where('documentId').equals(documentId).sortBy('timestamp');
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export async function getSetting(key, defaultValue = null) {
  const record = await db.appSettings.get(key);
  return record?.value ?? defaultValue;
}

export async function setSetting(key, value) {
  return db.appSettings.put({ key, value });
}

export async function saveVerificationReport(documentId, report) {
  return db.transaction('rw', [db.documents, db.verificationReports], async () => {
    if (!await db.documents.get(documentId)) throw new Error('Document no longer exists');
    const id = await db.verificationReports.add({ ...report, documentId, createdAt: new Date() });
    const older = await db.verificationReports.where('documentId').equals(documentId).reverse().sortBy('id');
    await db.verificationReports.bulkDelete(older.slice(20).map(r => r.id));
    return id;
  });
}

export async function getVerificationReports(documentId) {
  const rows = await db.verificationReports.where('documentId').equals(documentId).sortBy('createdAt');
  return rows.reverse();
}

// ── Whole-device data (Profile → Data & privacy) ─────────────────────────────

/** Every knowledge-state row across all documents (Home overview). */
export async function getAllKnowledgeRecords() {
  return db.knowledgeState.toArray();
}

/** Every quiz/review record across all documents (Home overview). */
export async function getAllQuizzes() {
  return db.quizzes.toArray();
}

/** A plain-object snapshot of everything stored on this device, for export. */
export async function exportAllData() {
  const tables = {};
  for (const table of db.tables) {
    tables[table.name] = await table.toArray();
  }
  // The Cloud AI access code is a shared secret, not study data: leave it out.
  tables.appSettings = (tables.appSettings ?? []).filter(row => row.key !== 'cloudAccessCode');
  return { app: 'Study Bunny', exportedAt: new Date().toISOString(), schemaVersion: db.verno, tables };
}

/** Permanently remove all documents, progress and settings from this device. */
export async function clearAllData() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
  });
}
