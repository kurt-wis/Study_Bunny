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
export async function quizTier2(chunks, knowledgeState = {}, preferredTopics = []) {
  const { weakTopics } = buildDifficultyInstruction(knowledgeState);

  const payload = {
    chunks: chunks.map((text, i) => ({ chunkId: `chunk-${i}`, text })),
    weakTopics: [...new Set([
      ...(Array.isArray(preferredTopics) ? preferredTopics : []),
      ...weakTopics.map(w => w.topic),
    ])].slice(0, 20),
    count: 5,
  };

  const response = await apiPost('/api/quiz', payload);

  return {
    tier: 'cloud',
    questions: (response.questions ?? []).map((q, i) => ({
      id: i + 1,
      type: ['multiple-choice', 'multiple_choice', 'multipleChoice', 'mcq'].includes(q.type)
        ? 'multiple_choice'
        : q.type === 'true_false' ? 'true_false'
          : q.type === 'fill_in_blank' ? 'fill_in_blank'
            : Array.isArray(q.options) && q.options.length ? 'multiple_choice' : 'fill_in_blank',
      topic: q.topic ?? '',
      question: q.prompt ?? q.question ?? '',
      options: q.options ?? null,
      correct_answer: q.answer ?? q.correct_answer ?? '',
      explanation: q.explanation ?? '',
      difficulty: 'standard',
    })),
  };
}
