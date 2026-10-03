/**
 * Test-only Bedrock stub. Returns an invokeModel({ system, messages }) that
 * resolves canned raw-text JSON per endpoint, with modes to simulate unparsable
 * output and thrown upstream errors. No network, no AWS SDK import.
 */

const CANNED = {
  summarize: JSON.stringify({
    overview: 'A short overview of the notes.',
    keyConcepts: [
      { term: 'Term A', explanation: 'Explains A.', importance: 'Matters because A.', commonMistakes: 'Mixing A with B.' },
    ],
    studyOutline: ['Review A', 'Practice A'],
  }),
  quiz: JSON.stringify({
    questions: Array.from({ length: 5 }, (_, i) => ({
      id: `q${i + 1}`,
      type: 'multiple-choice',
      topic: `Topic ${i + 1}`,
      prompt: `Question ${i + 1}?`,
      options: ['A', 'B', 'C', 'D'],
      answer: 'A',
      explanation: 'A is correct; the others are distractors.',
    })),
  }),
  chat: JSON.stringify({
    found: true,
    answer: 'The grounded answer.',
    citations: [{ chunkId: 'chunk-0' }],
  }),
  intervention: JSON.stringify({
    durationMinutes: 30,
    objective: 'Objective text.',
    materials: ['Paper', 'Pencils'],
    activities: [
      { title: 'Warm-up', description: 'Do the warm-up.', durationMinutes: 8 },
      { title: 'Practice', description: 'Do the practice.', durationMinutes: 14 },
      { title: 'Check', description: 'Do the check.', durationMinutes: 8 },
    ],
    checkpoint: 'Checkpoint text.',
  }),
};

/**
 * Create a stub invokeModel.
 *
 * @param {object} [options]
 * @param {keyof typeof CANNED} [options.endpoint='chat'] - Which canned payload to return.
 * @param {string} [options.raw] - Override the exact raw text returned.
 * @param {'unparsable'|'throw'|null} [options.mode=null] - Failure simulation.
 * @param {string[]} [options.sequence] - Successive raw strings returned per call (for retry tests).
 * @returns {{ invokeModel: Function, calls: object[] }}
 */
export function makeFakeBedrock(options = {}) {
  const { endpoint = 'chat', raw, mode = null, sequence } = options;
  const calls = [];
  let callIndex = 0;

  async function invokeModel({ system, messages }) {
    calls.push({ system, messages });
    if (mode === 'throw') {
      throw new Error('simulated upstream failure');
    }
    if (Array.isArray(sequence)) {
      const value = sequence[Math.min(callIndex, sequence.length - 1)];
      callIndex += 1;
      return value;
    }
    if (mode === 'unparsable') {
      return 'this is not json {';
    }
    if (typeof raw === 'string') {
      return raw;
    }
    return CANNED[endpoint] ?? CANNED.chat;
  }

  return { invokeModel, calls };
}
