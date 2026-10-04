# Study Bunny AI API

Request handlers for the optional Cloud AI tier. They are served as Vercel
serverless functions by the thin wrappers in `../api`, and call the AI service
chosen in the server settings (`src/lib/modelClient.js`): Gemini, Groq, OpenAI,
OpenRouter or Anthropic. See [DEPLOYMENT.md](../DEPLOYMENT.md).

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | JSON liveness; `ok` only when the server is fully configured; no model call |
| `POST /api/summarize` | Access code | Note-based summary |
| `POST /api/quiz` | Access code | Five quiz questions |
| `POST /api/chat` | Access code | Grounded note Q&A |
| `POST /api/feynman` | Access code | Explanation coverage and gaps |
| `POST /api/analyze-technique` | Access code | Study-method recommendation |
| `POST /api/verify-notes` | Access code + review consent | Reference-based claim checking |

## Server settings

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `gemini`, `groq`, `openai`, `openrouter` or `anthropic`. |
| `AI_API_KEY` | Secret key from that service. Server only. |
| `AI_MODEL` | Model ID to call, copied from that service's model list. |
| `AI_BASE_URL`, `AI_JSON_MODE` | Optional: another OpenAI-compatible endpoint; `off` to disable JSON mode. |
| `ACCESS_CODE` | Shared code students enter in Profile. Sent as `X-Study-Bunny-Code`. |
| `DAILY_REQUEST_LIMIT` | AI requests per device per UTC day (default 20). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional. Accurate daily limit shared by all server instances. |

If the provider, key, model or access code is missing, `/api/health` reports
`not_configured`, the AI routes return 503, and the app stays in offline mode.

## Protection and limits

- **Access code**: compared in constant time on the server. It is a shared
  secret, not a per-student account; anyone who has it can use the allowance.
  Change it in Vercel if it leaks.
- **Same-origin check**: browser requests from other sites are refused.
- **Daily limit**: counted per access code + IP address before the model is
  called. Without Upstash the counter is kept in memory, which is best effort
  only because serverless instances do not share memory. On a paid service set a spend
  limit as the real cost cap.
- Bodies are limited to 100 KB. A failed model request still counts; its one
  validation retry does not count twice.

## Privacy

Only extracted study text and anonymous study signals go to the API; original
PDFs and document titles stay local. Shared heuristics redact emails, phone
numbers, labelled IDs/names/addresses on client and server. Unlabelled or unusual
personal details can still be missed. Do not promise complete anonymization.
Diagnostic logs contain only handler, status, latency and timestamp.

Verification accepts 1–12 claims and 1–24 reference passages. Every claim ID must
appear exactly once. Supported/contradicted results need quotes present in the
selected source; missing or fabricated quotes are downgraded to insufficient
evidence. This validates provenance, not source accuracy; users must inspect the
evidence.

## Tests

`npm test` (from this folder or the project root). Tests inject a stub model and
never call the network.
