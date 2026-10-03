/** POST /api/analyze-technique — recommend one supported learning technique. */
import { jsonResponse, methodGuard, parseJsonBody } from '../lib/http.js';
import { ApiError, CODES, errorResponse } from '../lib/errors.js';
import { logDiagnostic } from '../lib/logger.js';
import { validateTechniqueAnalysis } from '../lib/validation.js';
import { buildTechniqueAnalysisPrompt } from '../lib/promptBuilders.js';
import { parseModelJson, validateTechniqueAnalysis as validateOutput } from '../lib/responseValidators.js';
import { invokeModel as realInvokeModel } from '../lib/bedrockClient.js';

export function makeHandler({ invokeModel }) {
  return async function handler(event) {
    const start = Date.now();
    let response;
    try {
      methodGuard(event, 'POST');
      const input = validateTechniqueAnalysis(parseJsonBody(event));
      const prompt = buildTechniqueAnalysisPrompt(input);
      let result;
      try {
        result = validateOutput(parseModelJson(await invokeModel(prompt)));
      } catch {
        try {
          result = validateOutput(parseModelJson(await invokeModel(prompt)));
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
    logDiagnostic({ handler: 'analyze-technique', httpStatus: response.statusCode, latencyMs: Date.now() - start });
    return response;
  };
}

export const handler = makeHandler({ invokeModel: realInvokeModel });
