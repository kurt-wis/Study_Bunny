# Study Bunny — current platform contract

**Contract version: 1.1.0.** This describes the student-mode implementation and
the additive learning-technique work. The current product scope is defined by
`.kiro/specs/learning-techniques/requirements.md`; the v5 app specification is
an earlier, broader proposal. Teacher/classroom mode is not part of this build.

The codebase uses JavaScript/JSX. Keep feature reads and writes behind
`src/db/database.js`; schema migrations must be additive and versioned.

## 1. Local data — `src/db/database.js`

The Dexie database is named `StudyBunnyDB`, schema version 2. All user data stays
in IndexedDB; this product has no accounts, sync, or remote database.

| Store | Primary key | Indexes |
|---|---|---|
| `documents` | `++id` | `title`, `createdAt` |
| `summaries` | `++id` | `documentId`, `tier`, `createdAt` |
| `quizzes` | `++id` | `documentId`, `tier`, `createdAt` |
| `knowledgeState` | `++id` | `documentId`, `topic`, `[documentId+topic]`, `nextReviewDate` |
| `chatHistory` | `++id` | `documentId`, `timestamp` |
| `appSettings` | `key` | — |
| `studyTechniques` | `++id` | `documentId` |
| `feynmanAttempts` | `++id` | `documentId`, `topic`, `createdAt` |

The version 2 migration adds the two technique stores and the SM-2
`nextReviewDate` index/fields; it preserves version 1 records. `interval`,
`easeFactor`, `repetitions`, and `nextReviewDate` are additive fields on
`knowledgeState` records.

### Repository helpers

- Documents: `saveDocument({ title, rawText, chunks, pages, createdAt })`,
  `getDocument(id)`, `getAllDocuments()` (newest first),
  `deleteDocument(id)` (cascades through every document-owned store).
- Summaries: `saveSummary(...)`, `getSummary(documentId, tier)`.
- Quizzes: `saveQuiz(...)`, `getQuizzesByDocument(id)` (newest first),
  `updateQuizScore(id, score, { masteryBefore, masteryAfter })`,
  `tagQuizSource(id, { source, technique })`.
- Knowledge: `getKnowledgeState(id)`, `updateKnowledgeState(id, topic, mastery)`,
  `getDueTopics(id, now)`, `updateSchedule(id, topic, schedule)`.
- Techniques: `getStudyTechnique(id)`, `setStudyTechnique(id, technique)`.
- Feynman: `saveFeynmanAttempt(attempt)`, `getFeynmanAttempts(id, topic?)`.
- Chat/settings: `saveChatMessage(...)`, `getChatHistory(id)`, `getSetting(key)`,
  `setSetting(key, value)`.

Quiz and Feynman attempt records can carry `masteryBefore` and `masteryAfter`.
The Dashboard uses those BKT values for mastery change; older quiz records with
no BKT snapshot are labelled as historical quiz accuracy.

## 2. Tier resolution — `src/utils/tierDetection.js`

Stable values are `cloud`, `edge`, and `deterministic`, labelled Cloud AI,
On-device AI, and Offline mode. `resolveTier({ feature, preference })` runs per
feature invocation. Cloud health is cached for 30 seconds; there is no registered
edge model in this MVP. A cloud request failure falls back inside the feature
orchestrator to the deterministic path.

## 3. API transport and privacy

`VITE_API_BASE_URL` is a build-time URL, not a secret. `apiPost(path, body)` sends
JSON; `apiHealthCheck()` calls `GET /api/health`. No client credentials are sent.

The browser may send extracted note chunks for summaries, quizzes, and chat; the
Feynman route also receives an explanation and a non-identifying topic label.
The API must never receive PDF bytes, filenames, document IDs, student identity,
or classroom identity. Technique analysis receives only habit/topic labels and
bounded mastery values. Lambda diagnostic logs do not include request or model
content.

## 4. Cloud routes

Base URL is `VITE_API_BASE_URL`. The API request limits are a 1 MiB body, no more
than 100 chunks, 12,000 characters per chunk, 220,000 total chunk characters,
and endpoint-specific bounds on explanation, question, and metadata fields.
API Gateway has best-effort default throttling targets of 5 requests/second and
a burst of 10.

| Method | Path | Request shape |
|---|---|---|
| GET | `/api/health` | — |
| POST | `/api/summarize` | `{ chunks: [{ text, page? }], language? }` |
| POST | `/api/quiz` | `{ chunks: [{ chunkId, text }], weakTopics, count }` |
| POST | `/api/chat` | `{ question, chunks: [{ chunkId, text, page? }] }` |
| POST | `/api/feynman` | `{ explanation, topic?, chunks: [{ chunkId, text }] }` |
| POST | `/api/analyze-technique` | `{ currentHabit?, weakTopics, masteryHistory, topicType? }` |

`/api/feynman` returns `coverage`, `covered`, `gaps`, and `feedback`.
`/api/analyze-technique` may recommend only `feynman` or `spaced_repetition`.
The SAM template currently deploys only these student-mode routes; there is no
intervention or teacher endpoint.

CORS allows one exact Amplify origin. It is a browser-origin policy, not API
authentication. The current no-account product leaves the HTTP API publicly
invokable; the rate targets and request bounds do not provide a hard spend cap.

## 5. PWA and AWS hosting

The PDF.js worker is bundled locally so PDF extraction works without a third-party
CDN. The PWA precaches static Vite assets including `.mjs`; API responses and
IndexedDB user content are not runtime-cached. Build/deploy configuration lives
in root `amplify.yml`, and `amplify-rewrites.json` contains the SPA route rule.

AWS deployment details and commands are in `cloud-api/README.md`. The frontend
can be hosted before the API with `VITE_API_BASE_URL` unset. After SAM deploy,
set the Amplify variable to `ApiBaseUrl` and set SAM `AllowedOrigin` to the exact
Amplify origin.

## 6. Compatibility policy

Additive stores, fields, helpers, or routes increment the minor contract version.
Removing or renaming a store/index/export/route or changing a request shape
requires a major version and an updated migration plan before implementation.
