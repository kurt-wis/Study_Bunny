/**
 * ApiTransport — shared HTTP client for cloud API calls.
 * The client never holds an AI provider key: requests go to this site's own
 * /api routes, which add the key on the server. VITE_API_BASE_URL is optional
 * and only needed when the API is hosted on a different origin.
 */

import { sanitizePayload } from '../../cloud-api/src/lib/privacy.js';
import { cloudEnabled, getAccessCode, setHealthProbe } from './cloudSession.js';

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
  if (!await cloudEnabled()) throw new ApiError('Turn on Cloud AI first (and enter the access code if this site asks for one).', 401);
  const code = await getAccessCode();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Study-Bunny-Code': code },
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
 * Returns { ok, codeRequired }: `ok` only for a successful JSON liveness
 * response; `codeRequired` is false when the site runs in open demo mode.
 */
export async function apiHealthInfo(timeoutMs = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal });
    const body = res.ok ? await res.json() : null;
    return { ok: body?.status === 'ok', codeRequired: body?.accessCode !== 'none' };
  } catch {
    return { ok: false, codeRequired: true };
  } finally {
    clearTimeout(timer);
  }
}

/** True only when the cloud API answers with a healthy JSON response. */
export async function apiHealthCheck(timeoutMs = 5_000) {
  return (await apiHealthInfo(timeoutMs)).ok;
}

// cloudSession asks this module whether the site needs an access code.
setHealthProbe(apiHealthInfo);
