/**
 * HTTP helpers for API Gateway HTTP API (payload format 2.0) proxy integration.
 */

import { ApiError, CODES } from './errors.js';

/**
 * Build an API Gateway HTTP API proxy response.
 *
 * The Access-Control-Allow-Origin header is sourced from process.env.ALLOWED_ORIGIN
 * unless an explicit origin is supplied in opts.
 *
 * @param {number} statusCode
 * @param {object} bodyObj - Serialized to JSON as the response body.
 * @param {{ origin?: string }} [opts]
 * @returns {{ statusCode: number, headers: Record<string,string>, body: string }}
 */
export function jsonResponse(statusCode, bodyObj, opts = {}) {
  const origin = opts.origin ?? process.env.ALLOWED_ORIGIN ?? '';
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
    },
    body: JSON.stringify(bodyObj),
  };
}

/**
 * Resolve the HTTP method from an API Gateway HTTP API (v2) or REST (v1) event.
 *
 * @param {object} event
 * @returns {string} upper-cased HTTP method, or '' if unknown.
 */
export function getMethod(event) {
  const method =
    event?.requestContext?.http?.method ?? // HTTP API payload v2
    event?.httpMethod ?? // REST API / payload v1
    '';
  return String(method).toUpperCase();
}

/**
 * Assert the request uses the allowed method, otherwise throw a 405 ApiError.
 *
 * @param {object} event
 * @param {string} allowedMethod - e.g. 'GET' or 'POST'.
 */
export function methodGuard(event, allowedMethod) {
  const method = getMethod(event);
  if (method !== allowedMethod.toUpperCase()) {
    throw new ApiError(405, CODES.METHOD_NOT_ALLOWED, 'Method not allowed');
  }
}

/**
 * Safely parse a JSON request body from an API Gateway event.
 * Malformed JSON throws a 400 VALIDATION_ERROR (generic message, no content leaked).
 *
 * @param {object} event
 * @returns {object} parsed body (empty object when no body present).
 */
export function parseJsonBody(event) {
  const raw = event?.body;
  if (raw === undefined || raw === null || raw === '') return {};
  const text = event?.isBase64Encoded
    ? Buffer.from(raw, 'base64').toString('utf8')
    : raw;
  if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) {
    throw new ApiError(413, CODES.PAYLOAD_TOO_LARGE, 'Request body is too large');
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiError(400, CODES.VALIDATION_ERROR, 'Request body must be a JSON object');
    }
    return parsed;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, CODES.VALIDATION_ERROR, 'Malformed JSON request body');
  }
}
