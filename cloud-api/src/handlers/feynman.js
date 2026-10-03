/** POST /api/feynman — compare an explanation with anonymous note chunks. */
import { jsonResponse, methodGuard, parseJsonBody } from '../lib/http.js';
import { ApiError, CODES, errorResponse } from '../lib/errors.js';
import { logDiagnostic } from '../lib/logger.js';
import { validateFeynman } from '../lib/validation.js';
import { buildFeynmanPrompt } from '../lib/promptBuilders.js';
import { parseModelJson, validateFeynman as validateFeynmanOutput } from '../lib/responseValidators.js';
import { invokeModel as realInvokeModel } from '../lib/bedrockClient.js';

export function makeHandler({ invokeModel }) {
  return async function handler(event) {
    const start = Date.now();
    let response;
    try {
      methodGuard(event, 'POST');
      const input = validateFeynman(parseJsonBody(event));
      const prompt = buildFeynmanPrompt(input);
      let result;
      try {
        result = validateFeynmanOutput(parseModelJson(await invokeModel(prompt)));
      } catch {
        try {
          result = validateFeynmanOutput(parseModelJson(await invokeModel(prompt)));
        } catch {
          throw new ApiError(502, CODES.UPSTREAM_ERROR, 'Upstream model error');
        }
      }
      response = jsonResponse(200, result);
    } catch (err) {
      if (err instanceof ApiError) {
        const { status, body } = errorResponse(err.status, err.code, err.message);
        response = jsonResponse(status, body);
      } else {
        const { status, body } = errorResponse(502, CODES.UPSTREAM_ERROR, 'Upstream model error');
        response = jsonResponse(status, body);
      }
    }
    logDiagnostic({ handler: 'feynman', httpStatus: response.statusCode, latencyMs: Date.now() - start });
    return response;
  };
}

export const handler = makeHandler({ invokeModel: realInvokeModel });
