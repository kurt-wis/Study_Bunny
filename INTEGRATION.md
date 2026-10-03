# Study Bunny — Platform Foundation Integration Note

**Contract version: 1.0.0** (frozen for the hackathon MVP)

This document is the handoff from the Platform Foundation spec to the feature specs
(Student Study Mode, Teacher/Assessment, Chat, and Cloud). The contracts below are
**frozen**: feature code depends on them and must not fork them. Any change to a
signature, store name, index, or endpoint shape requires updating this file **and**
every consuming spec before the change lands (see "Breaking-change policy").

Language note: the codebase is **JavaScript / JSX** throughout. The design document's
TypeScript interfaces are shape documentation only — they are expressed here and in the
source as JSDoc on plain JS modules. Do **not** introduce `.ts`/`.tsx` files or a
`tsconfig`.

---

## 1. Dexie Data Layer — `src/db/database.js`

A single Dexie database named **`StudyBunnyDB`**, schema **version 1**. Features must route
every write and read through the exported helpers below. Features must **not** call
`new Dexie(...)` or open their own connection.

### 1.1 Stores (10)

| Store | Primary key | PK type | Indexes |
|-------|-------------|---------|---------|
| `documents` | `++id` | auto-increment number | `title`, `createdAt` |
| `summaries` | `++id` | auto-increment number | `documentId`, `tier`, `createdAt` |
| `quizzes` | `++id` | auto-increment number | `documentId`, `tier`, `createdAt` |
| `knowledgeState` | `++id` | auto-increment number | `documentId`, `topic`, `[documentId+topic]` (compound) |
| `chatHistory` | `++id` | auto-increment number | `documentId`, `timestamp` |
| `classrooms` | `++id` | auto-increment number | `grade`, `section`, `createdAt` |
| `students` | `++id` | auto-increment number | `classroomId`, `name` |
| `assessments` | `++id` | auto-increment number | `studentId`, `classroomId`, `completedAt` |
| `interventionPlans` | `++id` | auto-increment number | `classroomId`, `groupName`, `tier`, `createdAt` |
| `appSettings` | `key` | **string** (named PK, not auto-increment) | — |

The foundation defines store **structure** (keys + indexes). Record **field shapes** are
owned by the consuming feature spec and must be agreed with that spec before use.

### 1.2 Exported LocalRepository functions

Default export: `db` (the Dexie instance; use only when a helper does not yet exist).

Documents
- `saveDocument({ title, rawText, chunks, createdAt }) -> Promise<number>`
- `getDocument(documentId) -> Promise<object|undefined>`
- `getAllDocuments() -> Promise<object[]>` (newest first)
- `deleteDocument(documentId) -> Promise<void>` (cascades to summaries, quizzes, knowledgeState, chatHistory)

Summaries
- `saveSummary({ documentId, tier, content, format, createdAt }) -> Promise<number>`
- `getSummary(documentId, tier) -> Promise<object|undefined>`

Quizzes
- `saveQuiz({ documentId, tier, questions, score, completedAt, createdAt }) -> Promise<number>`
- `getQuizzesByDocument(documentId) -> Promise<object[]>` (newest first)
- `updateQuizScore(quizId, score) -> Promise<number>`

Knowledge state (BKT)
- `getKnowledgeState(documentId) -> Promise<Record<topic, { mastery, updatedAt }>>`
- `updateKnowledgeState(documentId, topic, mastery) -> Promise<number>` (upsert via `[documentId+topic]`)

Chat history
- `saveChatMessage({ documentId, role, content, citations, tier }) -> Promise<number>`
- `getChatHistory(documentId) -> Promise<object[]>` (oldest first, by timestamp)

Classrooms
- `saveClassroom({ name, grade, section, createdAt }) -> Promise<number>`
- `getClassroom(classroomId) -> Promise<object|undefined>`
- `getAllClassrooms() -> Promise<object[]>` (newest first)
- `deleteClassroom(classroomId) -> Promise<void>` (cascades to students, assessments, interventionPlans)

Students
- `saveStudent({ classroomId, name, gender, createdAt }) -> Promise<number>`
- `getStudentsByClassroom(classroomId) -> Promise<object[]>`
- `getStudent(studentId) -> Promise<object|undefined>`
- `deleteStudent(studentId) -> Promise<void>` (cascades to assessments)

Assessments
- `saveAssessment({ studentId, classroomId, skillProfile, philIriLevel, responses, durationMs, completedAt }) -> Promise<number>`
- `getLatestAssessment(studentId) -> Promise<object|null>`
- `getAssessmentsByClassroom(classroomId) -> Promise<object[]>` (newest first)

Intervention plans
- `saveInterventionPlan({ classroomId, groupName, targetSkill, tier, plan, createdAt }) -> Promise<number>`
- `getInterventionPlanByGroup(classroomId, groupName) -> Promise<object|undefined>`
- `updateInterventionPlan(planId, updates) -> Promise<number>`

App settings (string-keyed key/value)
- `getSetting(key, defaultValue = null) -> Promise<any>`
- `setSetting(key, value) -> Promise<string>`

### 1.3 Migration policy

Schema changes are **additive and versioned**. Add a new `db.version(n).stores({...})`
block; never remove or rename an existing store or index without a coordinated migration
agreed across all consuming specs. Existing records and indexes must be preserved.

---

## 2. TierResolver — `src/utils/tierDetection.js`

Resolves the effective AI tier **per feature invocation** (not once at app boot). A cached
tier from a previous invocation is never reused for the decision, though cloud health is
cached briefly to reduce network chatter.

### 2.1 Stable tier string literals

```
TIER.CLOUD         === 'cloud'
TIER.EDGE          === 'edge'
TIER.DETERMINISTIC === 'deterministic'
```

User-facing labels (text, never color alone):

```
'cloud'         -> 'Cloud AI'
'edge'          -> 'On-device AI'
'deterministic' -> 'Offline mode'
```

### 2.2 API

- `resolveTier({ feature, preference = null }) -> Promise<{ tier, label, reason }>`
  - `feature`: feature key string, e.g. `'summarize' | 'quiz' | 'chat' | 'intervention'`.
  - `preference`: optional manual override, one of the tier literals or `null`.
  - Returns the **effective** tier actually used.
- `checkCloudHealth() -> Promise<boolean>` (cached ~30s)
- `invalidateHealthCache() -> void`
- `registerEdgeProvider(feature, { ready }) -> void` (MVP: none registered)
- `detectTier() -> Promise<string>` (convenience, no feature context)
- Constants: `TIER`, `TIER_LABEL`

### 2.3 Resolution order (per invocation)

1. If `preference === 'deterministic'`, return deterministic immediately.
2. Otherwise, unless `preference === 'edge'`, run `checkCloudHealth()`. If it returns
   `true`, select **cloud** (Tier 2) and stop.
3. If a registered **edge** provider for this feature is `ready`, select **edge** (Tier 1)
   and stop. (No edge provider is registered in the MVP.)
4. Fall through to **deterministic** (Tier 3) — always available.

**Manual preference for an unavailable provider silently falls through** to the best
available tier and returns the effective tier. A preference is a hint, never an error. The
UI must display the effective tier, not the preference.

**Post-selection cloud failure** (Lambda call fails after cloud was selected) is handled by
the feature's own orchestrator, which catches the error and runs its deterministic (Tier 3)
path. The resolver is not involved in that recovery.

---

## 3. ApiTransport — `src/utils/apiTransport.js`

The base URL is read from the build-time env var `VITE_API_BASE_URL` (defaults to same
origin). It is **configuration, not a secret**. **No credentials** are embedded in or sent
by the client.

### 3.1 API

- `apiHealthCheck(timeoutMs = 5000) -> Promise<boolean>` — GET `/api/health`; `true` on HTTP 200.
- `apiPost(path, body, timeoutMs = 15000) -> Promise<object>` — POST JSON; parses JSON
  response. Throws `ApiError` (with `.status`) on non-2xx; throws `ApiError('Request timed out', 408)` on timeout.

### 3.2 What must never leave the client

Never send to the API: uploaded PDF file bytes, PDF filenames, individual student names,
classroom names, or any record that could identify a student. Send **extracted text
chunks only**.

---

## 4. Frozen API endpoints

Base URL from `VITE_API_BASE_URL`. Response bodies are owned by the Cloud spec; request
shapes below are frozen.

| Method | Path | Request body | Response |
|--------|------|--------------|----------|
| GET | `/api/health` | — | `{ status: string }` |
| POST | `/api/summarize` | `{ chunks: [{ text: string, page?: number }], language?: string }` | Summary schema (Cloud spec) |
| POST | `/api/quiz` | `{ chunks: [{ chunkId: string, text: string }], weakTopics: string[], count: number }` | Quiz schema (Cloud spec) |
| POST | `/api/chat` | `{ question: string, chunks: [{ chunkId: string, text: string, page?: number }] }` | Chat schema (Cloud spec) |
| POST | `/api/intervention` | `{ gradeLevel: string, skill: string, groupSize: number, availableMaterials: string[], language: 'bilingual' }` | Plan schema (Cloud spec) |

`/api/generate-items` is **deferred** and must not be implemented in the MVP.

---

## 5. PWA / offline shell — `vite.config.js` (vite-plugin-pwa)

- **Cache-first** for static Vite build output: JS/CSS chunks, HTML entry, web manifest,
  icons, fonts (`globPatterns: **/*.{js,css,html,ico,png,svg,woff2}`).
- **No runtime caching of `/api/*`** and no caching of IndexedDB content
  (`runtimeCaching: []`). API responses and user-generated data live exclusively in
  IndexedDB and are never placed in the service-worker static cache.
- The shell and mode chooser render from cache on re-open with no network round-trip.
  Network state is checked lazily at feature-invocation time, not at shell boot.

---

## 6. Shared shell accessibility baseline

Features inherit the shell's layout primitives, so these baselines are already met:

- Minimum **48 × 48 CSS px** touch targets for primary interactive elements
  (enforced in `src/index.css`).
- **WCAG AA** contrast (4.5:1 body text, 3:1 large text / UI components).
- Responsive, single-column at narrow widths; **no horizontal scroll at 320px**.
- Mode and tier are conveyed in **text labels**, not color alone (see `TierBadge.jsx`,
  which pairs an icon + text label; color is supplementary only).

---

## 7. Breaking-change policy

The contract version is **1.0.0**. Treat section 1–4 identifiers (store names, indexes,
exported function names, tier literals, endpoint paths and request shapes) as a public API.

- **Additive, non-breaking** changes (new store, new index, new helper, new endpoint): bump
  the **minor** version and note it here.
- **Breaking** changes (rename/remove a store, index, export, tier literal, or alter a
  frozen request shape): bump the **major** version, update this file, and update every
  consuming spec (Student Study Mode, Teacher/Assessment, Chat, Cloud) **before**
  implementation proceeds.
