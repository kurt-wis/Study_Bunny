# Study Bunny AWS deployment

The AWS deployment has two parts:

- AWS Amplify Hosting serves the React/Vite PWA from `dist/` using `amplify.yml`.
- AWS SAM deploys API Gateway HTTP API, six Node.js 24 Lambda handlers, scoped
  Amazon Bedrock permissions, and CloudWatch log groups from `template.yaml`.

The app remains usable offline if the API or Bedrock is unavailable.

## API routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness check |
| POST | `/api/summarize` | Summary from anonymous note chunks |
| POST | `/api/quiz` | Quiz questions from anonymous note chunks |
| POST | `/api/chat` | Grounded note chat with citation validation |
| POST | `/api/feynman` | Explanation coverage and gaps against note chunks |
| POST | `/api/analyze-technique` | Recommendation from anonymous study signals |

Teacher/classroom routes are outside the current product scope.

## Security and costs

- Request bodies are capped at 1 MiB. Model inputs are limited by chunk count,
  per-chunk size, total text, explanation length, and metadata list sizes.
- API Gateway has best-effort default throttling targets of 5 requests/second
  and a burst of 10. Those targets are not a hard spend ceiling.
- Lambda diagnostics contain only handler name, status, latency, and timestamp.
  API access logs contain request ID, route, status, and response length, not
  request text or identity.
- IAM grants `bedrock:InvokeModel` for the configured model ARN only. The SAM
  deployer needs permissions to create the resources and pass the generated
  Lambda execution roles; enabling API access-log delivery also requires the
  CloudWatch Logs delivery permissions documented by AWS.
- There is no end-user authentication in the current no-account product. CORS
  restricts browser origins but does not block direct HTTP clients. Before a
  broad public launch, add an abuse-control/authentication plan and budget
  alarms for Bedrock usage.
- Do not put secrets in the frontend. `VITE_API_BASE_URL` and `AllowedOrigin`
  are configuration, not credentials.

## Prerequisites

- AWS CLI configured for the account and target region.
- AWS SAM CLI installed.
- Use the Amplify Amazon Linux 2023 build image; `amplify.yml` selects Node.js 22.
- A region where the selected Bedrock model is offered, with model access
  enabled for the account.
- Node.js 20+ for local tooling. Lambda uses the AWS-supported `nodejs24.x`
  runtime.

## Deploy the frontend

1. Connect this GitHub repository and the production branch in Amplify Hosting.
   Amplify reads `amplify.yml` and builds with `npm ci` and `npm run build`.
2. Leave `VITE_API_BASE_URL` unset for the first build. The app starts in
   offline mode until the API is wired in.
3. After the Amplify app exists, apply the single-page-app route rewrite from
   the repository root:

   ```sh
   aws amplify update-app --app-id <amplify-app-id> --custom-rules file://amplify-rewrites.json
   ```

   This sends extensionless app routes to `/index.html` with a 200 rewrite.
4. Record the Amplify app's exact HTTPS origin (no trailing slash), such as
   `https://main.<app-id>.amplifyapp.com`.

## Deploy the backend

From `cloud-api/`:

```sh
sam validate
sam build
sam deploy --guided
```

Choose a stack name and region. Set:

- `BedrockModelId`: a model ID available in that region, for example
  `anthropic.claude-3-haiku-20240307-v1:0` where supported.
- `AllowedOrigin`: the exact Amplify origin from the previous step.

The API CORS configuration and function response header use this same origin.
After a successful deployment, read the API base URL from the output:

```sh
aws cloudformation describe-stacks `
  --stack-name <your-stack-name> `
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" `
  --output text
```

`ApiBaseUrl` is the origin only; routes append `/api/...`.

## Connect and verify

1. In Amplify Hosting, set the build environment variable `VITE_API_BASE_URL`
   to the SAM `ApiBaseUrl` output.
2. Redeploy the Amplify production branch so Vite embeds the API URL.
3. Confirm `GET {ApiBaseUrl}/api/health` returns `{ "status": "ok" }`.
4. Open the Amplify URL, upload a text-based PDF, and confirm Cloud AI is shown
   when available. If the health or model call fails, deterministic offline
   behavior remains available.

If the Amplify URL changes, update the SAM `AllowedOrigin` parameter and redeploy
the backend. If the API URL changes, update the Amplify variable and rebuild.

## Local development

```sh
# Repository root
npm ci
npm run dev

# Cloud API local dependencies, if needed
cd cloud-api
npm ci
```

Run `npm run build` from the repository root to generate the PWA production
artifact in `dist/`. Tests are available via `npm test` in each package.
