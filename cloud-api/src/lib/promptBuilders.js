/**
 * Prompt builders. Each returns { system, messages } for invokeModel.
 *
 * Chunk text is injected verbatim as grounding context. Prompts embed the exact
 * expected JSON output schema so the model returns parseable JSON. No secrets
 * are ever placed in a prompt.
 */

/**
 * @param {Array<{ chunkId?: string, text: string, page?: number }>} chunks
 * @returns {string}
 */
function formatContext(chunks) {
  return chunks
    .map((c, i) => {
      const id = c.chunkId ?? `chunk-${i}`;
      const page = c.page ? ` (page ${c.page})` : '';
      return `[${id}]${page}\n${c.text}`;
    })
    .join('\n\n');
}

/**
 * @param {{ chunks: Array<{ text: string, page?: number }>, language?: string }} input
 * @returns {{ system: string, messages: Array<{ role: string, content: string }> }}
 */
export function buildSummarizePrompt(input) {
  const language = input.language ?? 'the language of the source text';
  const system = [
    'You are a study assistant for students.',
    `Summarize the provided notes in ${language}.`,
    'Use ONLY the provided context. Do not invent facts.',
    'Respond with a single JSON object and nothing else. The schema is:',
    '{"overview":string,"keyConcepts":[{"term":string,"explanation":string,"importance":string,"commonMistakes":string}],"studyOutline":[string]}',
  ].join(' ');
  const messages = [
    { role: 'user', content: `Context:\n${formatContext(input.chunks)}\n\nProduce the JSON summary now.` },
  ];
  return { system, messages };
}

/**
 * @param {{ chunks: Array<{ chunkId: string, text: string }>, weakTopics: string[], count: number }} input
 * @returns {{ system: string, messages: Array<{ role: string, content: string }> }}
 */
export function buildQuizPrompt(input) {
  const focus =
    input.weakTopics && input.weakTopics.length > 0
      ? `Prioritize these weak topics: ${input.weakTopics.join(', ')}.`
      : 'Cover the most important topics in the context.';
  const system = [
    'You are a quiz generator for students.',
    `Create exactly ${input.count} questions based ONLY on the provided context.`,
    'Prefer multiple-choice questions. Each multiple-choice question has 4 plausible options with one correct answer, and the explanation also clarifies why common distractors are wrong.',
    focus,
    'Respond with a single JSON object and nothing else. The schema is:',
    '{"questions":[{"id":string,"type":"multiple-choice","topic":string,"prompt":string,"options":[string],"answer":string,"explanation":string}]}',
  ].join(' ');
  const messages = [
    { role: 'user', content: `Context:\n${formatContext(input.chunks)}\n\nProduce the quiz JSON now.` },
  ];
  return { system, messages };
}

/**
 * @param {{ question: string, chunks: Array<{ chunkId: string, text: string, page?: number }> }} input
 * @returns {{ system: string, messages: Array<{ role: string, content: string }> }}
 */
export function buildChatPrompt(input) {
  const system = [
    'You are a study assistant answering questions about a student\'s notes.',
    'Answer ONLY using the provided context chunks. Never use outside knowledge.',
    'Cite the chunkId of every chunk you used in the citations array.',
    'If the context does not contain enough information to answer, set found to false, answer to null, and citations to an empty array.',
    'Respond with a single JSON object and nothing else. The schema is:',
    '{"found":boolean,"answer":string|null,"citations":[{"chunkId":string}]}',
  ].join(' ');
  const messages = [
    {
      role: 'user',
      content: `Context:\n${formatContext(input.chunks)}\n\nQuestion: ${input.question}\n\nProduce the answer JSON now.`,
    },
  ];
  return { system, messages };
}

/**
 * @param {{ gradeLevel: string, skill: string, groupSize: number, availableMaterials: string[], language: string }} input
 * @returns {{ system: string, messages: Array<{ role: string, content: string }> }}
 */
export function buildInterventionPrompt(input) {
  const system = [
    'You are an instructional coach designing a 30-minute small-group reading intervention.',
    'Use the anonymous group metadata only. Write content bilingually (English and Filipino).',
    'The plan must have exactly 3 activities and total about 30 minutes.',
    'Respond with a single JSON object and nothing else. The schema is:',
    '{"durationMinutes":30,"objective":string,"materials":[string],"activities":[{"title":string,"description":string,"durationMinutes":number}],"checkpoint":string}',
  ].join(' ');
  const messages = [
    {
      role: 'user',
      content: [
        `Grade level: ${input.gradeLevel}`,
        `Target skill: ${input.skill}`,
        `Group size: ${input.groupSize}`,
        `Available materials: ${input.availableMaterials.join(', ')}`,
        `Language: ${input.language}`,
        '',
        'Produce the intervention plan JSON now.',
      ].join('\n'),
    },
  ];
  return { system, messages };
}
