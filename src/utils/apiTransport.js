/**
 * ApiTransport — shared HTTP client for cloud API calls.
 * The client never holds or transmits AWS credentials.
 * The API_BASE_URL is a deployment config value, not a secret.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const DEFAULT_TIMEOUT_MS = 15_000;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      let message = `API error ${res.status}`;
      try {
        const err = await res.json();
        if (err?.message) message = err.message;
      } catch { /* ignore parse errors */ }
      throw new ApiError(message, res.status);
    }

    return res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out', 408);
    }
    throw err;
  }
}

/**
 * GET /api/health — lightweight availability check.
 * Returns true if the API responds with status 200.
 */
export async function apiHealthCheck(timeoutMs = 5_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}
