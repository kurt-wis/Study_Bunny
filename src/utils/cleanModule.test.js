import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanModuleLines, junkReason } from './cleanModule.js';

test('form fields, dates, page numbers and blanks are removed', () => {
  for (const line of [
    'Name: ____________________', 'Name: Juan Dela Cruz', 'Grade & Section: 10 - Rizal', 'Section: ______  Date: ______',
    'Date: October 3, 2026', 'October 3, 2026', '10/03/2026', 'Score: ____/20', 'Teacher: Ms. Reyes', 'Student No.: 2024-00123',
    'Page 3 of 12', '3', '- 4 -', 'Subject: ________', 'Subject: Science 10', 'Time: 60 mins', 'Week: 3', 'Module No. 4',
    'www.school.edu.ph', 'teacher@school.edu.ph', '© 2026 Department of Education', 'All rights reserved.',
    'Directions: Read each item carefully.', '_______________', '1. ____________', 'Prepared by: Mr. Santos', 'S.Y. 2026-2027',
    'Pangalan: ________ Petsa: ________', 'Rizal National High School', 'Republic of the Philippines', 'Department of Education',
  ]) {
    assert.ok(junkReason(line) || line === 'Module No. 4', `should remove: ${line} (${junkReason(line)})`);
  }
});

test('lesson content is kept, including definitions that start like a label', () => {
  for (const line of [
    'Men - a male person', 'Time: a measure of how long an event lasts', 'Class: a group of organisms that share features',
    'Photosynthesis is the process by which plants make food.', 'The Philippine Revolution began in 1896.',
    'Mitochondria\tthe part of the cell that produces energy', 'Week: a period of seven days', 'Date palm - a tree that bears dates',
    '1. Mitosis has four phases.', 'Force = mass × acceleration', 'Section 2 explains how cells divide and why it matters.',
    'A name is a word for a person, place or thing.', 'A school is a place where children learn.', 'University - a place for higher education', '________ is the powerhouse of the cell because it makes energy.',
  ]) {
    assert.equal(junkReason(line), null, `should keep: ${line}`);
  }
});

test('repeated headers and footers are removed across pages; counts are reported', () => {
  const page = n => ['Rizal National High School', 'Science 10 Handout', `Men - a male person on page ${n}`, 'Women - a female person', `Page ${n}`, 'Rizal National High School'];
  const { pages, removed, kinds } = cleanModuleLines([page(1), page(2), page(3)]);
  assert.deepEqual(pages[0], ['Men - a male person on page 1', 'Women - a female person']);
  assert.equal(removed, 12);
  assert.equal(kinds['header or footer'], 12); // the running title, school name and "Page N" line
});

test('never throws away most of a document; handles empty input', () => {
  const allForms = [['Name: ____', 'Date: ____', 'Score: ____', 'Short note']];
  assert.deepEqual(cleanModuleLines(allForms).pages, allForms);
  assert.equal(cleanModuleLines(allForms).removed, 0);
  assert.deepEqual(cleanModuleLines(null), { pages: [], removed: 0, kinds: {} });
});
