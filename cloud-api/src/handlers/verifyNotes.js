import { makeModelHandler } from '../lib/modelHandler.js';
import { validateVerificationInput, validateVerification, buildVerificationPrompt } from '../lib/verification.js';
import { invokeModel as realInvokeModel } from '../lib/bedrockClient.js';

export function makeHandler({ invokeModel }) {
  return makeModelHandler({ name: 'verify-notes', validateInput: validateVerificationInput,
    buildPrompt: buildVerificationPrompt, validateOutput: validateVerification, invokeModel });
}
export const handler = makeHandler({ invokeModel: realInvokeModel });
