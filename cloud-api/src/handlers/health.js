/**
 * GET /api/health handler.
 *
 * Returns 200 { status: 'ok' } for GET, 405 for any other method. Emits a
 * content-free diagnostic line per invocation.
 */

import { jsonResponse, methodGuard } from '../lib/http.js';
import { ApiError, errorResponse } from '../lib/errors.js';
import { logDiagnostic } from '../lib/logger.js';

/**
 * Build the health handler.
 *
 * @returns {(event: object) => Promise<{ statusCode: number, headers: object, body: string }>}
 */
export function makeHandler() {
  return async function handler(event) {
    const start = Date.now();
    let response;
    try {
      methodGuard(event, 'GET');
      response = jsonResponse(200, { status: 'ok' });
    } catch (err) {
      if (err instanceof ApiError) {
        const { status, body } = errorResponse(err.status, err.code, err.message);
        response = jsonResponse(status, body);
      } else {
        const { status, body } = errorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
        response = jsonResponse(status, body);
      }
    }
    logDiagnostic({ handler: 'health', httpStatus: response.statusCode, latencyMs: Date.now() - start });
    return response;
  };
}

/** Wired handler for the deployed function. */
export const handler = makeHandler();
