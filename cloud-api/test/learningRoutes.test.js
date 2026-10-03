import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler as feynman } from '../src/handlers/feynman.js';
import { makeHandler as diagnosis } from '../src/handlers/analyzeTechnique.js';
const event = body => ({ requestContext: { http: { method: 'POST' } }, body: JSON.stringify(body) });
test('Feynman route accepts numeric frontend chunk IDs and returns coverage', async () => {
  const handler = feynman({ invokeModel: async () => JSON.stringify({ coverage: 0.8, covered: ['chlorophyll'], gaps: ['photolysis'], feedback: 'Review how water splits.' }) });
  const result = await handler(event({ explanation: 'Chlorophyll absorbs light.', topic: null, chunks: [{ chunkId: 0, text: 'Chlorophyll absorbs light.' }] }));
  assert.equal(result.statusCode, 200); assert.equal(JSON.parse(result.body).coverage, 0.8);
  assert.equal((await handler(event({ explanation: 'x', chunks: [null] }))).statusCode, 400);
});
test('diagnosis rejects recommendations outside the implemented techniques', async () => {
  const input = { currentHabit: 'feynman', weakTopics: ['plants'], masteryHistory: [0.4, 0.4], topicType: null };
  const handler = diagnosis({ invokeModel: async () => JSON.stringify({ recommended_technique: 'spaced_repetition', analysis: 'Repeat recall over time.', expected_improvement: 'Improve retention through repeated retrieval.' }) });
  assert.equal((await handler(event(input))).statusCode, 200);
  for (const currentHabit of ['rereading', 'highlighting', 'summarizing', 'flashcards']) {
    assert.equal((await handler(event({ ...input, currentHabit }))).statusCode, 200);
  }
  const invalid = diagnosis({ invokeModel: async () => JSON.stringify({ recommended_technique: 'pomodoro', analysis: 'Timer', expected_improvement: '100%' }) });
  assert.equal((await invalid(event(input))).statusCode, 502);
});
