// POST /api/chat — see cloud-api/src/handlers/chat.js
import { handler } from '../cloud-api/src/handlers/chat.js';
import { toVercel } from './_lib/adapter.js';

export default toVercel(handler);
