# Study Bunny cloud-api

A small AWS serverless backend that fronts Amazon Bedrock (Claude 3 Haiku) for
the Study Bunny offline-first study/teaching PWA. It is an API Gateway **HTTP API**
with five Node.js 24 Lambda functions, one per frozen route:

| Method | Path                | Purpose                                                   |
|--------|---------------------|-----------------------------------------------------------|
| GET    | `/api/health`       | Liveness probe (`{ status: "ok" }`); no Bedrock access.   |
| POST   | `/api/summarize`    | Study summary from anonymous text chunks.                 |
| POST   | `/api/quiz`         | Exactly 5 questions from chunks + weak topics.            |
| POST   | `/api/chat`         | Grounded answer with validated citation chunkIds.         |
| POST   | `/api/intervention` | 30-minute, 3-activity plan from anonymous group metadata. |

`/api/generate-items` is **deferred** for the MVP and is intentionally not
implemented or routed.

## Privacy guarantees

- **Anonymous content only.** Handlers accept text chunks, questions, and
  anonymous group metadata. PII-looking fields (filenames, student names,
  classroom ids, raw PDF bytes, etc.) are rejected at the Lambda boundary with
  `400 VALIDATION_ERROR`.
- **Content-free logging.** The diagnostic logger can only emit
  `{ handler, httpStatus, latencyMs, timestamp }`. Chunk text, questions,
  prompts, and secrets cannot flow through it.
- **No secrets committed.** Configuration is injected via environment variables
  (`BEDROCK_MODEL_ID`, `ALLOWED_ORIGIN`); `AWS_REGION` is provided by the Lambda
  runtime. `template.yaml` holds no secret values. `.env` and build artifacts
  are git-ignored.
- **Errors never leak.** Error responses are exactly `{ error, code }` with a
  generic message — no stack traces, prompt text, chunk text, or secrets.

## Architecture

Each handler follows one pipeline: validate the JSON body at the boundary →
build the prompt → call the injected `invokeModel` (Bedrock seam) → parse and
validate the model's JSON output. Bad model JSON is retried **once**, then the
request fails with `502 UPSTREAM_ERROR`. Amazon Bedrock access is behind a
dependency-injection seam (`src/lib/bedrockClient.js`), so tests inject a stub
and never touch the network or the AWS SDK.

Status mapping: `200` ok · `400 VALIDATION_ERROR` · `405 METHOD_NOT_ALLOWED`
(non-GET on health) · `502 UPSTREAM_ERROR` (model failure / timeout /
unparsable output).

## Prerequisites

- AWS account with Amazon Bedrock access enabled and the Claude 3 Haiku model
  granted in the target region.
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials.
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html).
- Node.js (local tests run on Node 18+; the deploy target runtime is Node.js 24).

> **This sandbox performs NO live deploy.** The SAM CLI is not installed here and
> must not be run. `template.yaml` is deploy-ready configuration validated by
> parsing and manual review; `sam validate` runs at deploy time (next section).
> The test suite (`node --test`) needs **no network and no AWS credentials** —
> Bedrock is stubbed through the injection seam.

## Deploy

Run these from the `cloud-api/` directory.

```sh
# 1. (optional) validate the template — runs at deploy time, not in this sandbox
sam validate

# 2. build the Lambda bundles
sam build

# 3. first deploy, interactive
sam deploy --guided
```

During `sam deploy --guided` you will be prompted for the stack name, region,
and the template parameters:

- **BedrockModelId** — the Claude 3 Haiku model id for your region, e.g.
  `anthropic.claude-3-haiku-20240307-v1:0`. The function IAM policy is scoped to
  `bedrock:InvokeModel` on exactly this model's ARN
  (`arn:aws:bedrock:<region>::foundation-model/<BedrockModelId>`).
- **AllowedOrigin** — the exact frontend origin for CORS, e.g.
  `https://your-app.example.com`. No wildcard is allowed. Use the Amplify app URL
  (see below) once it is known; redeploy to update it.

SAM saves these answers to `samconfig.toml`, so later deploys are just:

```sh
sam build && sam deploy
```

### Read the invoke URL

After a successful deploy, read the HTTP API invoke URL from the stack outputs:

```sh
aws cloudformation describe-stacks \
  --stack-name <your-stack-name> \
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" \
  --output text
```

`sam deploy` also prints the `ApiBaseUrl` output at the end of a run. Routes live
under `/api`, e.g. `GET {ApiBaseUrl}/api/health`.

## Wire the frontend

The frontend reads its API base URL from the build-time env var
`VITE_API_BASE_URL` (see `src/utils/apiTransport.js`, which is the
contract and must **not** be edited). This value is deployment configuration,
not a secret, and no credentials are sent by the client.

1. Copy the example env file in the frontend project:

   ```sh
   cd ..  # the frontend is the repo root
   cp .env.example .env.local
   ```

2. Set `VITE_API_BASE_URL` to the `ApiBaseUrl` output from the deploy, e.g.:

   ```
   VITE_API_BASE_URL=https://abc123.execute-api.ap-southeast-1.amazonaws.com
   ```

3. Rebuild the frontend so Vite inlines the value.

Do **not** edit `src/utils/apiTransport.js` — only set the env var.

## Host the frontend on AWS Amplify

1. Connect the frontend app to AWS Amplify Hosting (Git-based build or manual
   deploy of the Vite `dist/` output).
2. Set `VITE_API_BASE_URL` as an Amplify build environment variable to the
   `ApiBaseUrl` from the stack outputs.
3. After Amplify assigns the app URL, set the backend stack's **AllowedOrigin**
   parameter to that exact origin and redeploy the backend so CORS permits it.
4. Publish both URLs to the team: the **API URL** (`ApiBaseUrl`) and the **app
   URL** (the Amplify domain).

## Local tests

No build or transpile step. From `cloud-api/`:

```sh
node --test
```

The full suite passes with **no network access and no AWS credentials**: every
handler test injects a Bedrock stub (`test/helpers/fakeBedrock.js`) and the real
client path (`src/lib/bedrockClient.js`) is never imported by tests. Optional:
`npm install` pulls `@aws-sdk/client-bedrock-runtime`, used only by the real
client path at deploy/runtime, never by tests.

## Repository hygiene

`.gitignore` keeps `node_modules/`, `.env`, `.aws-sam/`, and `*.log` out of
source control. `.env.example` lists only variable names, never values.
