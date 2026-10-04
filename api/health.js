// GET /api/health — public liveness check; makes no model call.
// Reports "ok" only when the server is fully set up, so the app stays in
// offline mode on a half-configured deployment. `accessCode` tells the app
// whether students must type the shared code ("required") or not ("none").
import { cloudReady, codeRequired } from './_lib/adapter.js';

export default function healthRoute(req, res) {
  const ready = cloudReady();
  const allowed = req.method === 'GET';
  res.statusCode = !allowed ? 405 : ready ? 200 : 503;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(
    !allowed ? { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }
      : ready ? { status: 'ok', accessCode: codeRequired() ? 'required' : 'none' }
        : { status: 'not_configured' },
  ));
}
