/**
 * Quiz orchestrator — routes to correct tier, saves results.
 */
import { resolveTier, TIER } from '../../utils/tierDetection.js';
import { quizTier3 } from './quizTier3.js';
import { saveQuiz, getDocument, getKnowledgeState } from '../../db/database.js';
import { getInitialMastery } from '../bkt.js';

/**
 * Generate a quiz for a document.
 *
 * @param {number} documentId
 * @param {{ preference?: string, weakTopics?: string[], technique?: string|null }} opts
 * @returns {Promise<{ tier: string, questions: object[], quizId: number }>}
 */
export async function generateQuiz(documentId, opts = {}) {
  const { tier } = await resolveTier({ feature: 'quiz', preference: opts.preference ?? null });

  const doc = await getDocument(documentId);
  if (!doc) throw new Error('Document not found');

  const knowledgeState = await getKnowledgeState(documentId);
  let result;

  if (tier === TIER.CLOUD) {
    try {
      const { quizTier2 } = await import('./quizTier2.js');
      result = await quizTier2(doc.chunks ?? [doc.rawText], knowledgeState, opts.weakTopics ?? []);
    } catch (error) {
      console.error('[Quiz] Cloud tier failed, falling back to deterministic:', error);
      result = await quizTier3(doc.rawText, knowledgeState, opts.weakTopics ?? []);
    }
  } else if (tier === TIER.EDGE) {
    try {
      const { quizTier1 } = await import('./quizTier1.js');
      result = await quizTier1(doc.rawText, knowledgeState);
    } catch (error) {
      console.error('[Quiz] Edge tier failed, falling back to deterministic:', error);
      result = await quizTier3(doc.rawText, knowledgeState);
    }
  } else {
    result = await quizTier3(doc.rawText, knowledgeState, opts.weakTopics ?? []);
  }

  // Save quiz record
  const questionTopics = [...new Set((result.questions ?? []).map(q => q.topic || 'general'))];
  const masteryBefore = questionTopics.length
    ? questionTopics.reduce((sum, topic) => {
      const entry = knowledgeState[topic];
      const mastery = typeof entry === 'object' && entry !== null ? entry.mastery : entry;
      return sum + (typeof mastery === 'number' ? mastery : getInitialMastery());
    }, 0) / questionTopics.length
    : getInitialMastery();

  const quizId = await saveQuiz({
    documentId,
    tier: result.tier,
    questions: result.questions,
    score: null,
    completedAt: null,
    createdAt: new Date(),
    masteryBefore,
    technique: opts.technique ?? null,
    source: 'quiz',
  });

  return { ...result, quizId };
}
