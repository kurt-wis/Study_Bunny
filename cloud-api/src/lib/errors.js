/**
 * Error primitives for the cloud-api handlers.
 *
 * Public error bodies are intentionally minimal: { error, code }. They never
 * carry stack traces, prompt text, chunk text, model output, or secrets.
 */

/** Stable machine-readable error codes exposed to the client. */
export const CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
});

/**
 * An error that maps cleanly onto an HTTP response.
 *
 * @property {number} status - HTTP status code.
 * @property {string} code - One of {@link CODES}.
 */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message - Safe, generic message. Must not contain content.
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Build a public error body. Only the generic message and code are exposed.
 *
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @returns {{ status: number, body: { error: string, code: string } }}
 */
export function errorResponse(status, code, message) {
  return { status, body: { error: message, code } };
}
