/**
 * Adapter between Vercel's Node functions (req, res) and the Study Bunny
 * handlers in cloud-api/src/handlers, which take an event and return
 * { statusCode, headers, body }.
 *
 * It also guards the AI routes:
 *   - the server must be configured (API key, model, access code);
 *   - the request must carry the shared access code (X-Study-Bunny-Code);
 *   - browser requests must come from this site (same-origin).
 * Files and folders starting with "_" under /api are not routes.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { modelConfigured } from '../../cloud-api/src/lib/modelClient.js';

const NO_STORE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function send(res, status, body) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(NO_STORE)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function digest(value) {
  return createHash('sha256').update(String(value ?? '')).digest();
}

/** Constant-time comparison of the supplied code with the configured one. */
export function accessCodeMatches(supplied, expected) {
  if (!expected) return false;
  return timingSafeEqual(digest(supplied), digest(expected));
}

/** Server is ready for AI calls only when all three settings exist. */
export function cloudReady(env = process.env) {
  return modelConfigured(env) && Boolean(env.ACCESS_CODE);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients send no Origin; the access code still applies
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function bodyText(req) {
  if (req.body == null) return '';
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return JSON.stringify(req.body);
}

/**
 * Wrap an event-style handler as a Vercel function.
 * @param {(event: object) => Promise<{ statusCode: number, headers?: object, body: string }>} handler
 * @param {{ protect?: boolean }} [opts]  protect=false for the public health route
 */
export function toVercel(handler, { protect = true } = {}) {
  return async function vercelFunction(req, res) {
    const env = process.env;
    if (protect) {
      if (!cloudReady(env)) return send(res, 503, { error: 'Cloud AI is not set up on this site.', code: 'NOT_CONFIGURED' });
      if (!sameOrigin(req)) return send(res, 403, { error: 'Requests must come from the Study Bunny site.', code: 'FORBIDDEN' });
      if (!accessCodeMatches(req.headers['x-study-bunny-code'], env.ACCESS_CODE)) {
        return send(res, 401, { error: 'That access code is not right. Check it in Profile.', code: 'UNAUTHORIZED' });
      }
    }
    const code = digest(req.headers['x-study-bunny-code']).toString('hex').slice(0, 12);
    const event = {
      requestContext: { http: { method: req.method } },
      body: bodyText(req),
      clientId: protect ? `${code}:${clientIp(req)}` : undefined,
    };
    const result = await handler(event);
    res.statusCode = result.statusCode;
    for (const [k, v] of Object.entries(result.headers ?? {})) if (v !== '' && v != null) res.setHeader(k, v);
    res.end(result.body);
  };
}
