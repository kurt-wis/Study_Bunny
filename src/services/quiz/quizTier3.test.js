import test from 'node:test';
import assert from 'node:assert/strict';
import { quizTier3, definitionQuestions } from './quizTier3.js';
import { summarizeTier3 } from '../summarize/summarizeTier3.js';
import { extractDefinitions } from '../../ai/definitions.js';

const HANDOUT = 'Men - a male person\nWomen - a female person\nChild - a young human being\nAdult - a person who is fully grown\nElder - an old and respected person\nInfant - a very young baby';

test('glossary handout: blanks hide the term, not a random keyword', async () => {
  const { tier, questions } = await quizTier3(HANDOUT, {});
  assert.equal(tier, 'deterministic');
  assert.equal(questions.length, 5);
  const blanks = questions.filter(q => q.type === 'fill_in_blank');
  assert.equal(blanks.length, 3);
  for (const q of blanks) {
    assert.match(q.question, /^Fill in the blank:\n\n________ - /);
    assert.ok(HANDOUT.includes(`${q.correct_answer} - ${q.question.split('________ - ')[1]}`));
    assert.ok(q.acceptable_answers.includes(q.correct_answer));
    assert.equal(q.topic, q.correct_answer);
  }
  assert.equal(questions.filter(q => q.type === 'true_false').length, 2);
});

test('true/false: false statements use another term\'s meaning and say what the notes say', () => {
  const defs = extractDefinitions(HANDOUT);
  const questions = definitionQuestions(defs, {}, () => 0.5);
  for (const q of questions.filter(x => x.type === 'true_false')) {
    const statement = q.question.split('\n\n')[1];
    assert.equal(HANDOUT.split('\n').includes(statement), q.correct_answer === 'True');
    if (q.correct_answer === 'False') assert.match(q.explanation, /Your notes say: "/);
  }
});

test('weak terms are asked first; short glossaries still give five questions', async () => {
  const defs = extractDefinitions(HANDOUT);
  const q = definitionQuestions(defs, { Infant: { mastery: 0.1 }, Men: { mastery: 0.95 } }, () => 0.5);
  assert.equal(q[0].topic, 'Infant');
  assert.equal(q[0].difficulty, 'review');
  assert.ok(!q.some(x => x.topic === 'Men'));
  const short = await quizTier3('Men - a male person\nWomen - a female person', {});
  assert.equal(short.questions.length, 4); // 2 blanks + 2 true/false is all two terms allow
});

test('plain prose still uses the keyword quiz', async () => {
  const { questions } = await quizTier3('Mitochondria produce energy for the cell through cellular respiration. The nucleus stores the genetic material of the cell as DNA. Ribosomes synthesize proteins from amino acids in the cytoplasm.', {});
  assert.ok(questions.length >= 3);
  assert.ok(questions.every(x => !/________ - /.test(x.question)));
});

test('glossary summary lists terms with their meanings', async () => {
  const { content } = await summarizeTier3(HANDOUT);
  assert.equal(content.version, 3);
  assert.equal(content.keyPoints[0], 'This handout explains 6 terms.');
  assert.deepEqual(content.keyConcepts[0], { term: 'Men', explanation: 'A male person', importance: '', commonMistakes: '' });
  assert.equal(content.keyConcepts.length, 6);
  assert.deepEqual(content.studyOutline.map(o => o.name), ['Men, Women, Child, Adult', 'Elder, Infant']);
});

test('prose quiz: one short blank per sentence, answers come from that sentence, quizzes vary', async () => {
  const { proseQuestions } = await import('./quizTier3.js');
  const notes = 'Mitochondria produce energy for the cell through cellular respiration. The nucleus stores the genetic material of the cell as DNA. Ribosomes synthesize proteins from amino acids in the cytoplasm. The cell membrane controls what enters and leaves the cell. Chloroplasts capture sunlight to make glucose during photosynthesis. The Golgi apparatus packages proteins for transport out of the cell. Lysosomes break down waste material using digestive enzymes.';
  const a = proseQuestions(notes, {}, () => 0.1);
  assert.equal(a.length, 5);
  for (const q of a.filter(x => x.type === 'fill_in_blank')) {
    const blanked = q.question.split('\n\n')[1];
    assert.equal((blanked.match(/________/g) || []).length, 1);
    assert.ok(q.correct_answer.split(' ').length <= 3, `answer too long: ${q.correct_answer}`);
    assert.ok(notes.includes(blanked.replace('________', q.correct_answer)));
  }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const b = proseQuestions(notes, {}, rnd);
  assert.notDeepEqual(a.map(q => q.question), b.map(q => q.question));
  assert.deepEqual(proseQuestions('', {}), []);
});

test('cards corrected by the student replace the automatic ones in quiz and summary', async () => {
  const items = [{ term: 'Man', definition: 'an adult male person' }, { term: 'Woman', definition: 'an adult female person' }];
  const { questions } = await quizTier3(HANDOUT, {}, { items });
  assert.ok(questions.every(q => ['Man', 'Woman'].includes(q.topic)));
  assert.ok(questions.some(q => q.question.includes('________ - an adult male person') || q.question.includes('________ - an adult female person')));
  const { content } = await summarizeTier3(HANDOUT, { items });
  assert.deepEqual(content.keyConcepts.map(k => k.term), ['Man', 'Woman']);
  // an empty or missing list falls back to the automatic cards
  assert.equal((await quizTier3(HANDOUT, {}, { items: [] })).questions.length, 5);
});
