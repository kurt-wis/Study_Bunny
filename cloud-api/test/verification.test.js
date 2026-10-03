import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler } from '../src/handlers/verifyNotes.js';
import { validateVerificationInput, validateVerification } from '../src/lib/verification.js';
import { parseJsonBody } from '../src/lib/http.js';
import { detectPersonalData, redactPersonalData, sanitizePayload } from '../src/lib/privacy.js';

const input = { claims: [{ claimId: 'claim-1', text: 'Water boils at 90 degrees Celsius at sea level.' }],
  references: [{ chunkId: 'reference-1', text: 'At sea level, pure water boils at 100 degrees Celsius.' }], consent: true };
const response = { claims: [{ claimId: 'claim-1', status: 'contradicted', explanation: 'The stated temperature differs from the reference.',
  correction: 'Water boils at 100 degrees Celsius at sea level.', citations: [{ chunkId: 'reference-1', quote: 'pure water boils at 100 degrees Celsius' }] }] };
const event = body => ({ requestContext: { http: { method: 'POST' } }, body: JSON.stringify(body) });

test('redaction removes contact details, labelled names and IDs, and custom literal terms', () => {
  const source = 'Name: Juan Dela Cruz\nStudent ID: 2024-0123\njuan@example.com +63 917 123 4567\nWater boils at 100 degrees.';
  const redacted = redactPersonalData(source);
  assert.equal(detectPersonalData(source).length, 4);
  for (const secret of ['Juan', '2024-0123', 'juan@example.com', '917']) assert.ok(!redacted.includes(secret));
  assert.ok(redacted.includes('Water boils at 100'));
  assert.equal(redactPersonalData('Ana (Jr.) wrote this.', ['Ana (Jr.)']), '[REDACTED] wrote this.');
  assert.deepEqual(sanitizePayload({ chunks: [{ chunkId: 'reference-1', text: 'Email: ana@example.org' }] }),
    { chunks: [{ chunkId: 'reference-1', text: 'Email: [REDACTED]' }] });
});

test('verification preserves input claims and accepts exact evidence from the selected source', () => {
  const validated = validateVerification(response, validateVerificationInput(input));
  assert.equal(validated.claims[0].status, 'contradicted');
  assert.equal(validated.claims[0].text, input.claims[0].text);
  assert.equal(validated.claims[0].citations.length, 1);
});

test('fabricated quotes or reference IDs cannot establish a verdict or correction', () => {
  for (const citation of [{ chunkId: 'reference-99', quote: 'pure water boils at 100 degrees Celsius' },
    { chunkId: 'reference-1', quote: 'Water always boils at 50 degrees Celsius' },
    { chunkId: 'reference-1', quote: 'PURE water boils at 100 degrees Celsius' }]) {
    const row = validateVerification({ claims: [{ ...response.claims[0], citations: [citation] }] }, input).claims[0];
    assert.equal(row.status, 'insufficient_evidence'); assert.equal(row.correction, null); assert.deepEqual(row.citations, []);
  }
});

test('duplicate, invented, missing claim IDs and invalid status are rejected', () => {
  for (const output of [{ claims: [] }, { claims: [{ ...response.claims[0], claimId: 'invented' }] },
    { claims: [{ ...response.claims[0], status: 'true' }] }]) assert.throws(() => validateVerification(output, input));
  const two = { ...input, claims: [...input.claims, { claimId: 'claim-2', text: 'An unrelated complete statement.' }] };
  assert.throws(() => validateVerification({ claims: [response.claims[0], response.claims[0]] }, two));
});

test('strict input rejects no consent, excess text, identity metadata, duplicates and empty references', () => {
  for (const bad of [{ ...input, consent: false }, { ...input, studentName: 'PRIVATE' }, { ...input, references: [] },
    { ...input, claims: [{ claimId: 'claim-1', text: 'x'.repeat(1201) }] },
    { ...input, references: [...input.references, ...input.references] }]) assert.throws(() => validateVerificationInput(bad));
  assert.throws(() => parseJsonBody({ body: 'x'.repeat(100001) }), e => e.status === 413);
});

test('handler validates, retries bad JSON once, and never leaks upstream content', async () => {
  let calls = 0;
  const handler = makeHandler({ invokeModel: async () => ++calls === 1 ? 'bad JSON' : JSON.stringify(response) });
  assert.equal((await handler(event(input))).statusCode, 200); assert.equal(calls, 2);
  const failing = makeHandler({ invokeModel: async () => { throw new Error('PRIVATE_SOURCE_TEXT'); } });
  const result = await failing(event(input));
  assert.equal(result.statusCode, 502); assert.ok(!result.body.includes('PRIVATE_SOURCE_TEXT'));
  assert.equal((await handler(event({ ...input, consent: false }))).statusCode, 400);
});
