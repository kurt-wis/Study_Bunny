/**
 * difficultyBuilder — derives difficulty instructions from a student's knowledge state.
 * Used to prime cloud (Tier 2) quiz generation with the right level and weak topic emphasis.
 */
import { getWeakTopics } from './bkt.js';

/**
 * Build a difficulty instruction object from the student's current knowledge state.
 *
 * @param {object} knowledgeState - { [topic]: { mastery: number } | number }
 * @returns {{ instruction: string, weakTopics: { topic: string, mastery: number }[], avgMastery: number }}
 */
export function buildDifficultyInstruction(knowledgeState) {
  const topics = Object.entries(knowledgeState);

  if (topics.length === 0) {
    return {
      instruction: "This is the student's first quiz. Focus on foundational concepts. Use basic recall and definition questions with simple language.",
      weakTopics: [],
      avgMastery: 0,
    };
  }

  // Compute average mastery (support both { mastery } objects and raw numbers)
  const masteryValues = topics.map(([, v]) =>
    typeof v === 'object' ? (v.mastery ?? v) : v
  );
  const avgMastery = masteryValues.reduce((sum, m) => sum + m, 0) / masteryValues.length;

  const weakTopics = getWeakTopics(knowledgeState);

  let instruction;
  if (avgMastery < 0.3) {
    instruction = 'Focus on foundational concepts. Use basic recall and definition questions. Use simple language.';
  } else if (avgMastery <= 0.7) {
    instruction = 'Mix foundational and application questions. 2 recall + 3 application. Include "why" and "how" questions.';
  } else {
    instruction = 'Focus on application and analysis. Use scenario-based questions. Ask students to compare, contrast, or predict.';
  }

  if (weakTopics.length > 0) {
    const topicNames = weakTopics.map(w => w.topic).join(', ');
    instruction += ` Pay special attention to these weak areas: ${topicNames}. At least 3 of 5 questions should cover these topics.`;
  }

  return { instruction, weakTopics, avgMastery };
}
