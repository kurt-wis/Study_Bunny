/**
 * Quiz orchestrator — routes to correct tier, saves results.
 */
import { resolveTier, TIER } from '../../utils/tierDetection.js';
import { quizTier3 } from './quizTier3.js';
import { saveQuiz, getDocument, getKnowledgeState } from '../../db/database.js';
import { scopeDocument, mixQuestions, sampleEvenly, attributeQuestion } from './scope.js';

const QUIZ_LENGTH = 5;
/** Most text sections sent to the cloud for a quiz that combines modules. */
const MAX_COMBINED_CHUNKS = 40;

/**
 * Generate a quiz for a document.
 *
 * @param {number} documentId  the module the quiz is saved under
 * @param {{ preference?: string, documentIds?: number[], pageRange?: { from?: number, to?: number } }} opts
 *   `documentIds` — more modules to mix into the same quiz (the first one is always `documentId`).
 *   `pageRange`   — quiz only these pages/slides; used when a single module is chosen.
 * @returns {Promise<{ tier: string, questions: object[], quizId: number, documentIds: number[] }>}
 */
export async function generateQuiz(documentId, opts = {}) {
  const { tier } = await resolveTier({ feature: 'quiz', preference: opts.preference ?? null });

  const ids = [...new Set([documentId, ...(Array.isArray(opts.documentIds) ? opts.documentIds : [])])]
    .filter(id => Number.isInteger(id));

  const sources = [];
  for (const id of ids) {
    const doc = await getDocument(id);
    if (!doc) {
      if (id === documentId) throw new Error('Document not found');
      continue; // a module deleted since it was picked: quiz the rest
    }
    const scope = scopeDocument(doc, ids.length === 1 ? opts.pageRange ?? null : null);
    sources.push({ documentId: id, ...scope, knowledgeState: await getKnowledgeState(id) });
  }
  if (sources.length === 0) throw new Error('Document not found');

  const result = sources.length === 1
    ? await singleQuiz(sources[0], tier)
    : await combinedQuiz(sources, tier);

  // Save quiz record
  const quizId = await saveQuiz({
    documentId,
    tier: result.tier,
    questions: result.questions,
    score: null,
    completedAt: null,
    createdAt: new Date(),
  });

  return { ...result, quizId, documentIds: sources.map(s => s.documentId) };
}

function deterministic(source) {
  return quizTier3(source.lineText || source.rawText, source.knowledgeState, { items: source.items });
}

async function singleQuiz(source, tier) {
  if (tier === TIER.CLOUD) {
    try {
      const { quizTier2 } = await import('./quizTier2.js');
      return await quizTier2(source.chunks ?? [source.rawText], source.knowledgeState);
    } catch (error) {
      console.error('[Quiz] Cloud tier failed, falling back to deterministic:', error);
      return deterministic(source);
    }
  }
  if (tier === TIER.EDGE) {
    try {
      const { quizTier1 } = await import('./quizTier1.js');
      return await quizTier1(source.rawText, source.knowledgeState);
    } catch (error) {
      console.error('[Quiz] Edge tier failed, falling back to deterministic:', error);
      return deterministic(source);
    }
  }
  return deterministic(source);
}

/** One quiz from several modules; every question remembers its module. */
async function combinedQuiz(sources, tier) {
  if (tier === TIER.CLOUD) {
    try {
      const { quizTier2 } = await import('./quizTier2.js');
      const perModule = Math.max(1, Math.floor(MAX_COMBINED_CHUNKS / sources.length));
      const chunks = sources.flatMap(s => sampleEvenly((s.chunks ?? [s.rawText]).filter(Boolean), perModule));
      const knowledgeState = Object.assign({}, ...sources.map(s => s.knowledgeState));
      const result = await quizTier2(chunks, knowledgeState);
      return {
        ...result,
        questions: result.questions.map(q => ({ ...q, documentId: attributeQuestion(q, sources) })),
      };
    } catch (error) {
      console.error('[Quiz] Cloud tier failed, falling back to deterministic:', error);
    }
  }
  const lists = [];
  for (const source of sources) {
    const { questions } = await deterministic(source);
    lists.push(questions.map(q => ({ ...q, documentId: source.documentId })));
  }
  return { tier: 'deterministic', questions: mixQuestions(lists, QUIZ_LENGTH) };
}
