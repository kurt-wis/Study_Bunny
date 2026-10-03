import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyNotes } from './index.js';
const input = { notes: 'Water boils at 100 degrees Celsius.', reference: 'Water boils at 100 degrees Celsius.' };

test('verification runs locally without cloud permission and excludes redacted identity-only lines', async () => {
  const report = await verifyNotes({ ...input, notes: 'Name: Ana Santos\nEmail: ana@example.org\n' + input.notes });
  assert.equal(report.tier, 'deterministic');
  assert.equal(report.checkedCount, 1);
  assert.equal(report.claims[0].status, 'supported');
  assert.ok(!JSON.stringify(report).includes('ana@example.org'));
});
test('AI checking requires review before considering a cloud request', async () => {
  await assert.rejects(verifyNotes({ ...input, useCloud: true }), /Review the redacted text/);
});
test('unconfigured AI visibly falls back locally and never initiates network transmission', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected network'); };
  try {
    const report = await verifyNotes({ ...input, useCloud: true, reviewed: true });
    assert.equal(report.tier, 'deterministic');
    assert.match(report.notice, /unavailable/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previous; }
});
