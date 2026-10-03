/**
 * POST /api/chat handler.
 *
 * Pipeline: methodGuard(POST) -> parseJsonBody -> validateChat (boundary) ->
 * buildChatPrompt -> invokeModel -> parseModelJson + validateChat (model
 * output), passing the request chunkId set so hallucinated citations are
 * stripped (R4.3). Answerable requests return 200 {found:true, answer,
 * citations:[{chunkId}]}; insufficient context returns the canonical
 * {found:false, answer:null, citations:[]} (R4.2). On parse failure the model
 * call is retried once, then a 502 UPSTREAM_ERROR is returned. Emits a
 * content-free diagnostic line.
 */

import { jsonResponse, methodGuard, parseJsonBody } from '../lib/http.js';
import { ApiError, CODES, errorResponse } from '../lib/errors.js';
import { logDiagnostic } from '../lib/logger.js';
import { validateChat } from '../lib/validation.js';
import { buildChatPrompt } from '../lib/promptBuilders.js';
import {
  parseModelJson,
  validateChat as validateChatOutput,
} from '../lib/responseValidators.js';
import { invokeModel as realInvokeModel } from '../lib/bedrockClient.js';

/**
 * Build the chat handler.
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
      const input = validateChat(body);
      const prompt = buildChatPrompt(input);
      const allowedChunkIds = new Set(input.chunks.map((c) => c.chunkId));

      let result;
      try {
        result = validateChatOutput(parseModelJson(await invokeModel(prompt)), allowedChunkIds);
      } catch {
        // One retry on bad model JSON before giving up.
        try {
          result = validateChatOutput(parseModelJson(await invokeModel(prompt)), allowedChunkIds);
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
    logDiagnostic({ handler: 'chat', httpStatus: response.statusCode, latencyMs: Date.now() - start });
    return response;
  };
}

/** Wired handler for the Lambda entry point. */
export const handler = makeHandler({ invokeModel: realInvokeModel });
