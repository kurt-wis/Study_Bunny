// POST /api/analyze-technique — see cloud-api/src/handlers/analyzeTechnique.js
import { handler } from '../cloud-api/src/handlers/analyzeTechnique.js';
import { toVercel } from './_lib/adapter.js';

export default toVercel(handler);
