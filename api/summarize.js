// POST /api/summarize — see cloud-api/src/handlers/summarize.js
import { handler } from '../cloud-api/src/handlers/summarize.js';
import { toVercel } from './_lib/adapter.js';

export default toVercel(handler);
