import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDefinitions, blankedDefinition, acceptableAnswers } from './definitions.js';

test('glossary lines with dashes and colons become term/definition pairs', () => {
  const defs = extractDefinitions('Gender Terms\nMen - a male person\nWomen – a female person\n• Child: a young person below the age of puberty\n3. Adult - a person who is fully grown');
  assert.deepEqual(defs.map(d => d.term), ['Men', 'Women', 'Child', 'Adult']);
  assert.equal(defs[0].definition, 'a male person');
  assert.equal(blankedDefinition(defs[0]), '________ - a male person');
  assert.equal(blankedDefinition(defs[2]), '________: a young person below the age of puberty');
  assert.equal(defs[0].source, 'Men - a male person');
});

test('works when the PDF text lost its line breaks', () => {
  const defs = extractDefinitions('Men - a male person Women - a female person Child - a young human being');
  assert.deepEqual(defs.map(d => [d.term, d.definition]), [
    ['Men', 'a male person'], ['Women', 'a female person'], ['Child', 'a young human being'],
  ]);
});

test('sentence definitions: is / refers to / means', () => {
  const defs = extractDefinitions('Photosynthesis is the process by which plants make food from sunlight. It is green. Osmosis refers to the movement of water across a membrane. This means nothing here.');
  assert.deepEqual(defs.map(d => d.term), ['Photosynthesis', 'Osmosis']);
  assert.equal(blankedDefinition(defs[0]), '________ is the process by which plants make food from sunlight.');
});

test('wrapped lines continue a definition; hyphenated words and junk are ignored', () => {
  const defs = extractDefinitions('Well-being is important\nMitosis - the division of a cell\ninto two identical cells\nPage 3\nNote: read this again later');
  assert.deepEqual(defs.map(d => d.term), ['Mitosis']);
  assert.equal(defs[0].definition, 'the division of a cell into two identical cells');
  assert.deepEqual(extractDefinitions(''), []);
  assert.deepEqual(extractDefinitions(null), []);
});

test('acceptable answers include simple variants', () => {
  const a = acceptableAnswers('Deoxyribonucleic acid (DNA)');
  assert.ok(a.includes('DNA'));
  assert.ok(a.includes('Deoxyribonucleic acid'));
  assert.ok(acceptableAnswers('Men').includes('Men'));
  assert.ok(acceptableAnswers('The Nucleus').includes('Nucleus'));
});

test('table rows and two-column glossaries (tab between cells)', () => {
  const defs = extractDefinitions('Term\tDefinition\n1\tMitosis\tdivision of a cell into two identical cells\nMeiosis\tcell division that makes four sex cells\nOsmosis\tmovement of water across a membrane');
  assert.deepEqual(defs.map(d => d.term), ['Mitosis', 'Meiosis', 'Osmosis']);
  assert.equal(blankedDefinition(defs[1]), '________ - cell division that makes four sex cells');
});

test('term on one line with its meaning on the next, when the handout repeats that shape', () => {
  const defs = extractDefinitions('Cell Parts\nNucleus\nthe control centre of the cell that stores DNA\nRibosome\na tiny structure that builds proteins\nCell Wall:\na stiff outer layer that protects plant cells');
  assert.deepEqual(defs.map(d => d.term), ['Nucleus', 'Ribosome', 'Cell Wall']);
  assert.equal(defs[0].definition, 'the control centre of the cell that stores DNA');
  assert.deepEqual(extractDefinitions('Introduction\nthis chapter talks about many different things in detail\nand it goes on for a while without defining anything.'), []);
});

test('a sentence with a dash is not read as a term and its meaning', () => {
  const found = extractDefinitions([
    'Jose Rizal achieved - academic excellence and was a staunch critic of the government during his time.',
    'The reforms were - widely debated in the colony.',
    'Propaganda Movement - a campaign for reforms led by Filipino expatriates',
    'La Solidaridad - the newspaper of the reform movement',
    'Lessons Learned - what the group took away from the campaign',
  ].join('\n'));
  const terms = found.map(d => d.term);
  assert.ok(!terms.includes('Jose Rizal achieved'));
  assert.ok(!terms.some(t => /were$/.test(t)));
  assert.ok(terms.includes('Propaganda Movement'));
  assert.ok(terms.includes('La Solidaridad'));
  assert.ok(terms.includes('Lessons Learned'), 'capitalised headings are kept');
});
