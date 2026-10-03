# Deploy Study Bunny: Vercel PWA + optional AWS AI

## Readiness

The repository includes notes checking, privacy review, validated evidence quotes,
local report history, sign-in, authorization, quotas, throttling, alerts, Vercel
configuration, installation icons and offline PDF processing. This change does
**not** publish a URL, create resources, configure accounts or certify live AI.

Deploy the offline app on Vercel first. AWS is only needed for optional AI; use
`study-bunny-prod`, not the Organizations management account. Cognito doesn't
back up or synchronize local study data.

## Vercel-only requirements

- Vercel account and access to the Git repository.
- Stable production HTTPS domain; the assigned `*.vercel.app` domain is sufficient.
- Node.js **24.x** locally and for the Vercel build.
- Modern browsers with IndexedDB/service workers. First use needs internet;
  allow assets to cache before testing offline.
- Text-based PDFs. Limits: 20 MB, 300 pages, 1,000,000 extracted characters.
  Scanned/handwritten-note OCR is **not implemented**.
- Appropriate privacy notice/permissions for student data and uploaded references.

Run from the repo root:

```powershell
npm ci
npm ci --prefix cloud-api
npm test
npm run build
npm run check:pwa
npm audit
npm audit --prefix cloud-api
```

For the isolated production browser test:

```powershell
npx playwright install chromium
npm run test:browser
```

Alternatively, use installed Edge in a temporary test profile:

```powershell
$env:TEST_BROWSER_CHANNEL = 'msedge'
npm run test:browser
```

Import the Git repository in Vercel with these settings:

| Setting | Value |
| --- | --- |
| Root directory | Repo root, **not** `cloud-api` |
| Framework | Vite |
| Node.js | 24.x |
| Install | `npm ci` |
| Build | `npm run build && npm run check:pwa` |
| Output | `dist` |
| Cloud variables | All four blank for offline mode |

`vercel.json` supplies build settings, targeted SPA rewrites, security headers
and service-worker cache headers. Don't replace it with a blanket rewrite that
serves HTML at `/api/health`. Vercel serves static files here, not the Lambdas.
Keep the production domain stable: browser data will not move to a new origin.

Sources: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Additional requirements for Cloud AI

- Confirmed `study-bunny-prod` AWS member account, billing and production SSO or
  assumed-role access. Never create/expose root access keys.
- Current AWS CLI v2 and SAM CLI supporting Lambda `nodejs24.x`, with Node 24
  available to SAM's local builder. Normal JavaScript `sam build` needs no Docker.
- Deployment permission for CloudFormation, Lambda/IAM (including PassRole), API
  Gateway, Cognito, DynamoDB, Logs, CloudWatch, SNS, Budgets and packaging resources.
  Organization SCPs, model access/subscription permissions and billing access matter.
- **An active, permitted in-region Anthropic model supporting Bedrock InvokeModel
  in Singapore (`ap-southeast-1`).** Confirm lifecycle, Marketplace terms, account
  access and quota. The stack has no default model; Claude 3 Haiku has regional
  legacy/retirement restrictions. Listing a model isn't proof that invocation works.
- Monitored alert email, chosen monthly budget and permanent Vercel HTTPS origin
  without a trailing slash. Default budget is USD 10/month: an alert threshold,
  **not a price quote, free-tier promise or spending cap**.
- Review student/minor consent, source quality and account-level Bedrock
  invocation logging. Redaction is heuristic and may miss personal data.

This stack uses a bare Anthropic model ID and an exact regional foundation-model
IAM ARN. **Inference profiles/global routing, other providers and Mantle are not
configured.** If no suitable in-region model is available, keep AI disabled and
make an explicit integration/region decision; don't silently route student content
outside the intended region.

Sources: [AWS model lifecycle](https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html),
[regional availability](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html),
[Haiku 4.5 endpoint requirements](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html).

## Deploy in this order

1. Deploy the offline Vercel app; record its stable production origin.
2. Sign into the member-account CLI profile and verify the account ID before
   deployment. Replace example names/values with approved actual values:

   ```powershell
   aws sso login --profile study-bunny-prod
   aws sts get-caller-identity --profile study-bunny-prod
   ```

3. Confirm a harmless model invocation succeeds in the intended region/account
   and record its in-region model ID.
4. From `cloud-api`, run:

   ```powershell
   cd cloud-api
   npm ci
   sam validate --lint --region ap-southeast-1 --profile study-bunny-prod
   sam build
   sam deploy --guided --region ap-southeast-1 --profile study-bunny-prod
   ```

   Choose stack `study-bunny-prod`. Supply `BedrockModelId`, Vercel `AllowedOrigin`,
   monitored `AlertEmail` and `MonthlyBudgetUsd`. Start with `DailyRequestLimit=20`.
   Review the changeset and IAM creation before accepting. Credentials are never
   committed; `samconfig.toml`/`.aws-sam` are ignored.
5. Confirm the SNS subscription email; verify budget notifications and API error
   alarm. Billing alerts are delayed and cannot stop spending.
6. Map stack outputs to Vercel **Production** build-time environment variables:

   | SAM output | Vercel variable |
   | --- | --- |
   | `ApiBaseUrl` | `VITE_API_BASE_URL` |
   | `CognitoAuthority` | `VITE_COGNITO_AUTHORITY` |
   | `CognitoClientId` | `VITE_COGNITO_CLIENT_ID` |
   | `CognitoDomain` | `VITE_COGNITO_DOMAIN` |

   Use exact output values (no `/api` suffix on the API base). These identifiers
   are public. **Never put AWS keys, model tokens or client secrets in `VITE_*`.**
7. Invite users in the Cognito pool identified by output `UserPoolId`. Public
   registration is disabled to reduce abuse. The client has no secret and uses
   authorization code with PKCE. Don't open registration without assessing abuse,
   consent, identity controls, quotas and total spending exposure.
8. Redeploy Vercel to embed the four variables. Keep Preview cloud variables blank:
   preview origins are not approved for AI. Use a separate approved test stack
   if preview AI is needed.

Callback: `https://YOUR_PRODUCTION_DOMAIN/auth/callback`; logout: `/student`.
Domain changes require updating `AllowedOrigin` and redeploying AWS for CORS and
Cognito URLs, then rebuilding Vercel. The CSP allows default AWS/Cognito domains;
custom API/auth domains need a deliberate CSP update.

## Live release gates

- HTTPS loads; refresh a nested document/checking URL without 404. Verify actual
  Android/iOS installation icons and launch behavior.
- After completed online caching, reopen offline, import a new PDF, summarize,
  quiz and compare a reference. Scans show a clear no-readable-text error.
- Exercise a matching claim, source conflict and uncovered claim. Inspect exact
  quotes/context: source agreement isn't proof of truth and genuine quotes do
  not guarantee correct AI interpretation.
- No cloud transmission by default. Enable opt-in, sign in as an invited test
  user and explicitly review redacted previews for AI checking. Inspect payloads
  for absence of PDF bytes, titles, learner metadata and credentials.
- Test all six real AI routes, Cognito callback, access-token expiry/renewal and
  sign-out. Local stub tests cannot certify these external integrations.
- Health returns JSON `status: ok`; API Gateway rejects missing tokens and tokens
  without the study scope. Test production-origin CORS/preflight. CORS isn't auth.
- Exhaust a test user's allowance: confirm 429 and local fallback. One shared
  allowance per UTC day; failures count, validation retries don't double-count.
  This isn't an account-wide spending cap.
- Reload saved reports and delete a document to remove its study data. Local
  storage is browser/origin-specific, not isolated by Cognito user: take care on
  shared devices. Clearing browser data removes it; cloud backup isn't included.
- Confirm no note content in logs; review account-level invocation-content logging.
  Verify alerts, actual usage costs, organization restrictions and quotas.

## Limits and rollback

Per run: first 12 detected statements, notes excerpt ≤16,000 characters,
reference ≤60,000 characters. The 100 KB request limit can require shorter
multilingual excerpts. No web search or independent factual certification; use
trusted references and evaluate real English/Filipino student examples before launch.
Suggested corrections never overwrite notes. Originals stay local; only sanitized
report snapshots persist. OCR, export/backup, cloud sync and classroom sharing are
not part of this implementation.

Cloud failures/timeouts/quota exhaustion fall back to conservative local matching
with a visible notice. To disable frontend AI, clear all four variables and redeploy.
This **doesn't disable AWS access for already-issued tokens**: incident response
also requires restricting the AI routes/Lambdas in AWS. Don't automatically delete
the stack/data as rollback. Budget alerts continue until changed. PWA updates wait
rather than force-reload a session; close/reopen clients to activate a waiting update.
