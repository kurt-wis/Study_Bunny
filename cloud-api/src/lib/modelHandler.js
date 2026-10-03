import { jsonResponse, methodGuard, parseJsonBody } from './http.js';
import { ApiError, CODES, errorResponse } from './errors.js';
import { logDiagnostic } from './logger.js';
import { enforceQuota } from './quota.js';
import { parseModelJson } from './responseValidators.js';

export function makeModelHandler({ name, validateInput, buildPrompt, validateOutput, invokeModel }) {
  return async event => {
    const start = Date.now();
    let response;
    try {
      methodGuard(event, 'POST');
      const input = validateInput(parseJsonBody(event));
      await enforceQuota(event);
      const prompt = buildPrompt(input);
      let result;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = validateOutput(parseModelJson(await invokeModel(prompt)), input);
          break;
        } catch {
          if (attempt === 1) throw new ApiError(502, CODES.UPSTREAM_ERROR, 'Upstream model error');
        }
      }
      response = jsonResponse(200, result);
    } catch (error) {
      const { status, body } = error instanceof ApiError
        ? errorResponse(error.status, error.code, error.message)
        : errorResponse(502, CODES.UPSTREAM_ERROR, 'Upstream model error');
      response = jsonResponse(status, body);
    }
    logDiagnostic({ handler: name, httpStatus: response.statusCode, latencyMs: Date.now() - start });
    return response;
  };
}
