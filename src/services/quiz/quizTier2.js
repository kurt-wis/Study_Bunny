/**
 * Tier 2 Quiz Generation — Cloud AI (Amazon Bedrock via Lambda).
 */
import { apiPost } from '../../utils/apiTransport.js';
import { buildDifficultyInstruction } from '../difficultyBuilder.js';

/**
 * Generate cloud-AI quiz questions.
 *
 * @param {string[]} chunks - document chunks
 * @param {object} knowledgeState
 * @returns {Promise<{ tier: string, questions: object[] }>}
 */
export async function quizTier2(chunks, knowledgeState = {}) {
  const { weakTopics } = buildDifficultyInstruction(knowledgeState);

  const payload = {
    chunks: chunks.map((text, i) => ({ chunkId: `chunk-${i}`, text })),
    weakTopics: weakTopics.map(w => w.topic),
    count: 5,
  };

  const response = await apiPost('/api/quiz', payload);

  return {
    tier: 'cloud',
    questions: (response.questions ?? []).map((q, i) => ({
      id: i + 1,
      type: q.type ?? 'mcq',
      topic: q.topic ?? '',
      question: q.prompt ?? q.question ?? '',
      options: q.options ?? null,
      correct_answer: q.answer ?? q.correct_answer ?? '',
      explanation: q.explanation ?? '',
      difficulty: 'standard',
    })),
  };
}
