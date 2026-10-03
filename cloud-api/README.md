# Study Bunny AI API

AWS SAM deploys an HTTP API, seven Node.js 24 Lambda functions, Cognito OAuth
code/PKCE sign-in, a DynamoDB allowance, log retention, operational alerts, and
billing notifications. Deploy in the dedicated `study-bunny-prod` member account,
not your AWS Organizations management account. See [DEPLOYMENT.md](../DEPLOYMENT.md).

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | JSON liveness response; no model call |
| `POST /api/summarize` | Student JWT + scope | Note-based summary |
| `POST /api/quiz` | Student JWT + scope | Five quiz questions |
| `POST /api/chat` | Student JWT + scope | Grounded note Q&A |
| `POST /api/feynman` | Student JWT + scope | Explanation coverage and gaps |
| `POST /api/analyze-technique` | Student JWT + scope | Implemented study-method recommendation |
| `POST /api/verify-notes` | Student JWT + scope + review consent | Reference-based claim checking |

No teacher/intervention route is deployed. Legacy helpers are not live capabilities.

## Privacy and limits

Only extracted study text and anonymous study signals go to the API; original
PDFs and document titles stay local. Shared heuristics redact emails, phone
numbers, labelled IDs/names/addresses on client and server. Unlabelled or unusual
personal details can still be missed. Do not promise complete anonymization.
Diagnostic logs contain only handler, status, latency and timestamp. The stack
does not enable Bedrock invocation-content logging; verify account-level settings.

Bodies are limited to 100 KB. Six AI routes share a default allowance of 20
requests per user per UTC day, counted atomically before model invocation. A
failed model request still counts; its one validation retry does not count twice.
Requests stop if the quota service fails. API Gateway enforces JWT scope; the
quota path requires a subject. Keep `QUOTA_TABLE` configured in production; its
absence is only supported for local tests. Budget alerts are not spending caps.

Verification accepts 1–12 claims and 1–24 reference passages. Every claim ID must
appear exactly once. Supported/contradicted results need quotes present in the
selected source; missing/fabricated quotes downgrade them to insufficient evidence.
This validates provenance, not semantic entailment or source accuracy. AI can
misinterpret a genuine quote; users must inspect the evidence. Prompts treat all
supplied text as untrusted data, never instructions.

## Development

Use Node.js 24, `npm ci`, and `npm test` here. Root `npm test` includes frontend
and backend tests. Unit tests inject model/quota stubs and never send content to AWS.

Model configuration supports **in-region Anthropic InvokeModel** IDs with exact,
model-specific IAM permission. There is no default: confirm current regional
availability and account access. Inference profiles, Mantle, and other providers
need an explicit integration/IAM change; do not silently route content globally.

Errors return generic `{ error, code }`, never prompts/stacks. Statuses include
400 input, 401 sign-in, 405 method, 413 size, 429 quota/throttle, 502 model failure.
Model calls have 12-second timeouts and at most one retry; quota calls have a
2-second timeout. Clients gracefully fall back to local tools.
