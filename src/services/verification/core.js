import { redactPersonalData } from '../../../cloud-api/src/lib/privacy.js';

export const MAX_CLAIMS = 12;
export const MAX_NOTE_CHARS = 16000;
export const MAX_REFERENCE_CHARS = 60000;
const normalize = text => text.replace(/\s+/g, ' ').trim().toLowerCase();

export function extractClaims(text) {
  const value = String(text ?? '');
  const sentences = typeof Intl.Segmenter === 'function'
    ? value.split(/\n+/).flatMap(line => [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(line)].map(s => s.segment))
    : value.match(/[^.!?\n]+(?:[.!?]+|$)/g) ?? [];
  return [...new Set(sentences.map(s => s.trim()).filter(s => s.replace(/\[REDACTED\]/g, '').trim().length >= 12))]
    .map((text, i) => ({ claimId: `claim-${i + 1}`, text }));
}

export function referenceChunks(text) {
  if (!text?.trim()) throw new Error('Add reference text before checking your notes.');
  if (text.length > MAX_REFERENCE_CHARS) throw new Error('Reference exceeds 60,000 characters. Select a shorter excerpt.');
  return text.match(/[\s\S]{1,2500}/g).map((text, i) => ({ chunkId: `reference-${i + 1}`, text }));
}

export function buildVerificationInput(notes, reference, customTerms = []) {
  if (notes.length > MAX_NOTE_CHARS) throw new Error('Notes exceed 16,000 characters. Select a shorter excerpt.');
  const cleanNotes = redactPersonalData(notes, customTerms);
  const cleanReference = redactPersonalData(reference, customTerms);
  const allClaims = extractClaims(cleanNotes);
  if (!allClaims.length) throw new Error('Add at least one complete statement to check.');
  if (allClaims.slice(0, MAX_CLAIMS).some(c => c.text.length > 1200)) {
    throw new Error('A statement exceeds 1,200 characters. Split it into shorter sentences.');
  }
  return {
    claims: allClaims.slice(0, MAX_CLAIMS), references: referenceChunks(cleanReference),
    totalClaims: allClaims.length, cleanNotes, cleanReference,
  };
}

export function verifyLocally({ claims, references }) {
  return { tier: 'deterministic', claims: claims.map(claim => {
    const match = references.find(ref => extractClaims(ref.text).some(sentence => normalize(sentence.text) === normalize(claim.text)));
    return {
      ...claim, status: match ? 'supported' : 'insufficient_evidence',
      explanation: match
        ? 'The same wording appears in your reference. This checks agreement, not the accuracy of the reference itself.'
        : 'Offline checking cannot establish whether this statement is correct. Review the reference or use AI checking.',
      correction: null,
      citations: match ? [{ chunkId: match.chunkId, quote: matchingQuote(match.text, claim.text) }] : [],
    };
  }) };
}

function matchingQuote(text, claim) {
  const position = text.toLowerCase().indexOf(claim.toLowerCase());
  return position >= 0 ? text.slice(position, position + claim.length) : text;
}
