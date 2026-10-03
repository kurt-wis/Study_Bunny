/**
 * POST /api/quiz handler.
 *
 * Pipeline: methodGuard(POST) -> parseJsonBody -> validateQuiz (boundary,
 * default count 5) -> buildQuizPrompt -> invokeModel -> parseModelJson +
 * validateQuiz (model output must contain exactly `count` questions). On
 * parse/validate failure the model call is retried once, then a 502
 * UPSTREAM_ERROR is returned. Emits a content-free diagnostic line.
 */

import { jsonResponse, methodGuard, parseJsonBody } from '../lib/http.js';
import { ApiError, CODES, errorResponse } from '../lib/errors.js';
import { logDiagnostic } from '../lib/logger.js';
import { validateQuiz } from '../lib/validation.js';
import { buildQuizPrompt } from '../lib/promptBuilders.js';
import {
  parseModelJson,
  validateQuiz as validateQuizOutput,
} from '../lib/responseValidators.js';
import { invokeModel as realInvokeModel } from '../lib/bedrockClient.js';

/**
 * Build the quiz handler.
 *
 * @param {{ invokeModel: (args: { system?: string, messages: object[] }) => Promise<string> }} deps
 * @returns {(event: object) => Promise<{ statusCode: number, headers: object, body: string }>}
 */
export function makeHandler({ invokeModel }) {
  return async function handler(event) {
    const start = Date.now();
    let response;
    try {
      methodGuard(event, 'POST');
      const body = parseJsonBody(event);
      const input = validateQuiz(body);
      const prompt = buildQuizPrompt(input);

      let result;
      try {
        result = validateQuizOutput(parseModelJson(await invokeModel(prompt)), input.count);
      } catch {
        // One retry on bad model JSON before giving up.
        try {
          result = validateQuizOutput(parseModelJson(await invokeModel(prompt)), input.count);
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
    logDiagnostic({ handler: 'quiz', httpStatus: response.statusCode, latencyMs: Date.now() - start });
    return response;
  };
}

/** Wired handler for the Lambda entry point. */
export const handler = makeHandler({ invokeModel: realInvokeModel });
