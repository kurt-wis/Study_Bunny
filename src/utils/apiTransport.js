/**
 * ApiTransport — shared HTTP client for cloud API calls.
 * The client never holds or transmits AWS credentials.
 * The API_BASE_URL is a deployment config value, not a secret.
 */

import { sanitizePayload } from '../../cloud-api/src/lib/privacy.js';
import { cloudEnabled, getAccessToken } from './cloudSession.js';

const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = 28_000;

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * POST JSON to a cloud endpoint.
 * Throws ApiError on non-2xx responses.
 * Throws TimeoutError if request exceeds timeout.
 *
 * @param {string} path - e.g. '/api/summarize'
 * @param {object} body - payload to send as JSON
 * @param {number} [timeoutMs]
 * @returns {Promise<object>} parsed JSON response
 */
export async function apiPost(path, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!await cloudEnabled()) throw new ApiError('Enable Cloud AI and sign in first.', 401);
  const token = await getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(sanitizePayload(body)),
      signal: controller.signal,
    });

    if (!res.ok) {
      let message = `API error ${res.status}`;
      try {
        const err = await res.json();
        if (err?.error) message = err.error;
      } catch { /* ignore parse errors */ }
      throw new ApiError(message, res.status);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out', 408);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/health — lightweight availability check.
 * Returns true only for a successful JSON liveness response.
 */
export async function apiHealthCheck(timeoutMs = 5_000) {
  if (!API_BASE_URL) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal });
    return res.ok && (await res.json()).status === 'ok';
  } catch {
    clearTimeout(timer);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
