/**
 * Tier 2 Quiz Generation — Cloud AI (the hosted model behind this site's /api routes).
 */
import { apiPost } from '../../utils/apiTransport.js';
import { buildDifficultyInstruction } from '../difficultyBuilder.js';
import { normalizeCloudQuiz } from './cloudQuestions.js';

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

  // The model labels and formats its questions loosely; make every one a shape
  // the quiz screen can show and answer.
  const questions = normalizeCloudQuiz(response.questions);
  if (questions.length === 0) throw new Error('Cloud quiz returned no usable questions');

  return { tier: 'cloud', questions };
}
