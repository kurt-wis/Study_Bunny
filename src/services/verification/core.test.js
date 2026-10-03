import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractClaims, buildVerificationInput, verifyLocally } from './core.js';

test('offline matching is conservative about numbers, negations, and prefixes', () => {
  const notes = 'Water boils at 100 degrees Celsius. Water boils at 90 degrees Celsius. The Earth is round.';
  const input = buildVerificationInput(notes, 'Water boils at 100 degrees Celsius. It is false that the Earth is round.');
  assert.deepEqual(verifyLocally(input).claims.map(c => c.status), ['supported', 'insufficient_evidence', 'insufficient_evidence']);
});
test('sentence extraction retains decimal measurements', () => {
  assert.equal(extractClaims('The speed is 12.5 meters per second.')[0].text, 'The speed is 12.5 meters per second.');
});
test('reports disclose partial coverage and contain no manually redacted names', () => {
  const notes = Array.from({ length: 15 }, (_, i) => `Ana wrote statement number ${i + 1}.`).join(' ');
  const input = buildVerificationInput(notes, 'Ana wrote statement number 1.', ['Ana']);
  assert.equal(input.claims.length, 12); assert.equal(input.totalClaims, 15);
  assert.ok(!JSON.stringify(input).includes('Ana'));
});
test('input limits do not silently truncate large sources', () => {
  assert.throws(() => buildVerificationInput('x'.repeat(16001), 'Some reference statement.'), /16,000/);
  assert.throws(() => buildVerificationInput('A complete note statement.', 'x'.repeat(60001)), /60,000/);
  assert.throws(() => buildVerificationInput('Hi.', 'Some reference statement.'), /complete statement/);
});
