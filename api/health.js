// GET /api/health — public liveness check; makes no model call.
// Reports "ok" only when the server is fully set up, so the app stays in
// offline mode on a half-configured deployment.
import { handler } from '../cloud-api/src/handlers/health.js';
import { cloudReady, toVercel } from './_lib/adapter.js';

const health = toVercel(handler, { protect: false });

export default function healthRoute(req, res) {
  if (!cloudReady()) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ status: 'not_configured' }));
    return undefined;
  }
  return health(req, res);
}
