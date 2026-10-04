// POST /api/quiz — see cloud-api/src/handlers/quiz.js
import { handler } from '../cloud-api/src/handlers/quiz.js';
import { toVercel } from './_lib/adapter.js';

export default toVercel(handler);
