import { buildVerificationInput, verifyLocally } from './core.js';

export async function verifyNotes({ notes, reference, customTerms = [], useCloud = false, reviewed = false }) {
  const input = buildVerificationInput(notes, reference, customTerms);
  let result;
  if (useCloud) {
    if (!reviewed) throw new Error('Review the redacted text and confirm before AI checking.');
    const { apiPost } = await import('../../utils/apiTransport.js');
    try {
      result = await apiPost('/api/verify-notes', {
        claims: input.claims, references: input.references, consent: true,
      }, 28000);
      const { validateVerification } = await import('../../../cloud-api/src/lib/verification.js');
      result = { ...validateVerification(result, input), tier: 'cloud' };
    } catch {
      result = { ...verifyLocally(input), notice: 'AI checking was unavailable. These are offline comparisons; unmatched claims remain unverified.' };
    }
  } else result = verifyLocally(input);
  return { ...result, references: input.references, checkedCount: input.claims.length, totalClaims: input.totalClaims };
}
