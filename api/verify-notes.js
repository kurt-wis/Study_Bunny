// POST /api/verify-notes — see cloud-api/src/handlers/verifyNotes.js
import { handler } from '../cloud-api/src/handlers/verifyNotes.js';
import { toVercel } from './_lib/adapter.js';

export default toVercel(handler);
