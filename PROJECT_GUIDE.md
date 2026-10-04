# Study Bunny: Complete Application Guide

This document explains the application as it is implemented: its features, screens, architecture, algorithms, data, optional cloud services, deployment, tests, and limitations. It is intended for the project owner, developers, and anyone preparing a demonstration or deployment.

**Code snapshot:** 4 October 2026, based on commit `f921e6e`. Application version: `0.1.0`. This is a description of the current repository, not a promise that every idea in the historical specifications has been built. Update this guide when the implementation changes.

## Contents

1. [Application overview](#1-application-overview)
2. [Technology stack](#2-technology-stack)
3. [Architecture and system boundaries](#3-architecture-and-system-boundaries)
4. [Screens, routes, and navigation](#4-screens-routes-and-navigation)
5. [PDF import and lesson preparation](#5-pdf-import-and-lesson-preparation)
6. [Summaries](#6-summaries)
7. [Editable study cards](#7-editable-study-cards)
8. [Quizzes and adaptive practice](#8-quizzes-and-adaptive-practice)
9. [Guided review and spaced repetition](#9-guided-review-and-spaced-repetition)
10. [Feynman explanation practice](#10-feynman-explanation-practice)
11. [Pomodoro focus timer](#11-pomodoro-focus-timer)
12. [Ask My Notes chat](#12-ask-my-notes-chat)
13. [Check My Notes against a reference](#13-check-my-notes-against-a-reference)
14. [Progress, recommendations, and study tips](#14-progress-recommendations-and-study-tips)
15. [Listening, profile, and preferences](#15-listening-profile-and-preferences)
16. [Processing tiers and cloud eligibility](#16-processing-tiers-and-cloud-eligibility)
17. [Local database and record lifecycle](#17-local-database-and-record-lifecycle)
18. [Cloud API and provider architecture](#18-cloud-api-and-provider-architecture)
19. [Privacy, security, and cost controls](#19-privacy-security-and-cost-controls)
20. [PWA, offline behavior, and interface design](#20-pwa-offline-behavior-and-interface-design)
21. [Development and testing](#21-development-and-testing)
22. [Deployment requirements and steps](#22-deployment-requirements-and-steps)
23. [Troubleshooting and operational checks](#23-troubleshooting-and-operational-checks)
24. [Limitations and implementation caveats](#24-limitations-and-implementation-caveats)
25. [Repository map and maintenance guide](#25-repository-map-and-maintenance-guide)

## 1. Application overview

Study Bunny is an offline-first, student-focused progressive web app (PWA). Students import text-based PDF notes, turn them into study material, practice recall, explain weak topics, and track their progress on the same device.

The usual journey is:

```text
Import PDF -> prepare lesson -> summary/cards -> quiz or guided review
                                              -> topic mastery and review dates
                                              -> progress and study suggestions
```

Students can also ask questions about their notes and compare academic statements with a supplied reference. The main study tools have browser-local implementations. Optional Cloud AI enriches selected features through the app's own server functions.

### What the app currently includes

- PDF extraction, automatic handout cleanup, and overlapping text chunks.
- Short structured summaries and editable term/meaning cards.
- Quiz practice, immediate feedback, quiz history, and weak-topic targeting.
- Guided flashcard review with SM-2 scheduling.
- Feynman explanation practice with coverage and gap feedback.
- An optional Pomodoro timer with focus and break phases.
- Retrieval-based note Q&A, optionally enriched by a cloud model.
- Reference-based note checking with redaction previews and evidence passages.
- Home statistics, streaks, study time, learning curves, and technique suggestions.
- Lesson read-aloud, personalized study tips, local profile/preferences, data export, and local-data deletion.
- An installable PWA shell, local PDF worker, and offline fallback behavior.
- Optional Vercel-hosted AI functions supporting multiple provider configurations.

### What kind of product this is

This is a **local-first student study workspace**, not a hosted school management system. A profile name is a local preference, not a signed-in account. Documents and progress are not synchronized between devices. Cloud AI adds processing; it does not add cloud storage or user accounts.

**AWS is not required by the current implementation.** There is no deployed AWS architecture, Cognito sign-in flow, Bedrock client, or AWS infrastructure template in the current application path. The present hosting configuration is Vercel plus an optional external AI provider and optional Upstash Redis quota store.

## 2. Technology stack

Versions below come from [package.json](./package.json), not from a claim about the latest available release.

| Layer | Implementation | Role |
| --- | --- | --- |
| Application language | JavaScript, JSX, ES modules | Browser UI, algorithms, and server handlers |
| UI | React / React DOM `18.3.1` | Components, hooks, and page state |
| Routing | React Router DOM `7.18.4` | Browser navigation and document-specific screens |
| Frontend tooling | Vite `7.3.6`, React plugin `5.2.0` | Development server and production bundling |
| Styling | Tailwind CSS `4.3.3`, PostCSS `8.5.28` | Utilities plus Study Bunny design tokens |
| Browser database | Dexie `4.0.8` | IndexedDB repository and schema migrations |
| PDF text extraction | PDF.js / `pdfjs-dist` `6.4.299` | Local extraction with a bundled worker |
| PWA | `vite-plugin-pwa` `2.0.0`, Workbox | Manifest, service worker, static precache |
| Unit/integration tests | Node's built-in test runner; `fake-indexeddb` | Pure algorithms, database, handlers, adapters |
| Browser smoke tests | Playwright `1.63.0` | Isolated production-build/offline checks |
| Runtime requirement | Node.js `24.x` | Declared in root and backend packages |
| Hosting | Vercel configuration and Node functions | Static frontend plus `/api` routes |
| Optional AI | Shared HTTP provider adapter | Gemini, Groq, OpenAI, OpenRouter, Anthropic configurations |
| Optional distributed quotas | Upstash Redis REST API | Shared counters across function instances |

There is no AI SDK dependency in the backend package. Its provider client uses the runtime's `fetch` API. There is no separate SQL database, object-storage service, vector database, or persistent backend study-data service.

## 3. Architecture and system boundaries

### 3.1 High-level layout

```text
Student's browser / installed PWA
|
+-- React pages, shared shell, and preferences
+-- Local study services
|   +-- definition extraction, RAKE, TF-IDF
|   +-- quizzes, BKT, SM-2, Feynman, recommendations
|   +-- reference checking and redaction
+-- PDF.js worker: reads the selected PDF locally
+-- Dexie / IndexedDB: documents, results, progress, settings
+-- Service worker: caches application assets, not AI responses
|
+-- Optional text-only HTTPS request
    -> same-origin /api route on Vercel
       -> access/origin/configuration guards
       -> body parsing, redaction, input validation, quota
       -> prompt builder -> provider HTTP client
       -> JSON parsing and output validation
       -> normalized response -> browser -> local persistence
```

The optional Redis counter is consulted by server handlers before model invocation. It stores quota counters rather than a copy of the student's lesson database. Hosting and AI providers can still observe requests according to their own infrastructure and policies.

### 3.2 Frontend layers

1. **Bootstrap:** [src/main.jsx](./src/main.jsx) mounts React in `StrictMode` and wraps the app with `BrowserRouter`.
2. **Application composition:** [src/App.jsx](./src/App.jsx) supplies the preferences context, shared shell, and route table.
3. **Pages:** `src/pages/student/` contains feature screens and their UI orchestration.
4. **Components:** `src/components/` contains reusable UI, charts, the timer, card editor, audio player, and cloud consent panel.
5. **Services:** `src/services/` handles feature logic, tier routing, algorithms, persistence coordination, and result shaping.
6. **Utilities/AI helpers:** `src/utils/` and `src/ai/` handle transport, eligibility, PDF processing, chunk metadata, preferences, keyword extraction, and retrieval.
7. **Repository:** [src/db/database.js](./src/db/database.js) is the single shared Dexie database and exposes persistence helpers.

The app primarily uses component state, hooks, and a small preferences context; it does not use a separate global-state framework. Pure derivation functions are kept apart from React and I/O where practical so they can be tested with Node.

### 3.3 Server layers

- `api/*.js`: deployable Vercel route entry points.
- [api/_lib/adapter.js](./api/_lib/adapter.js): translates Vercel requests/responses to the event-style handler interface and applies route guards.
- `cloud-api/src/handlers/`: feature-specific HTTP pipelines.
- `cloud-api/src/lib/`: validation, privacy, prompts, provider calls, quotas, errors, and safe diagnostic logging.

Handlers accept an event and return `{ statusCode, headers, body }`. The event-style shape and some comments retain earlier API Gateway terminology. This is an internal compatibility shape, **not evidence that AWS is currently being deployed**.

### 3.4 Failure boundaries

Cloud failures normally cause the affected feature to use its local fallback and show the effective tier. The frontend, database, and PDF pipeline do not depend on the AI provider being configured.

This does not mean every failure is invisible: PDF errors, unavailable browser storage, invalid verification inputs, and save failures can still produce error messages. A network request is not automatically queued for later delivery.

## 4. Screens, routes, and navigation

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | Redirect | Opens `/student` |
| `/student` | `StudentHome` | Uploads, study sets, daily plan, statistics, overview curve |
| `/student/review` | `StudentReview` | Guided technique and document selection, then review |
| `/student/quiz` | `StudyRedirect` | Opens a quiz for the last opened set, otherwise the newest available set |
| `/student/profile` | `StudentProfile` | Local profile, preferences, export/delete, optional Cloud AI |
| `/student/document/:id` | `StudentDocument` | Summary, Cards, Quiz, and Mastery tabs |
| `/student/document/:id/quiz` | `StudentQuiz` | Quiz session and results |
| `/student/document/:id/chat` | `StudentChat` | Ask My Notes |
| `/student/document/:id/review` | `StudentReview` | Document-focused guided review |
| `/student/document/:id/dashboard` | `StudentDashboard` | Per-document progress and technique comparisons |
| `/student/document/:id/verify` | `StudentVerify` | Check notes against a supplied reference |
| Unmatched client route | Redirect | Returns to `/student` |

`id` refers to the document's numeric local IndexedDB ID, not a server-owned document ID.

### Shared workspace shell

[AppShell](./src/components/layout/AppShell.jsx) renders a desktop sidebar and a mobile bottom navigation bar with Home, Review, Quiz, and Profile. The selected workspace item is derived from the route. Document summary/chat/dashboard/verification pages remain under Home unless their path identifies Review or Quiz.

### Document tabs and deep links

- `?tab=summary`, `cards`, `quiz`, or `mastery` chooses the document's initial tab.
- `?technique=pomodoro`, `feynman`, or `spaced_repetition` carries a study technique into quiz/review flows.
- A review link can include `?topic=<encoded-topic>` to focus Feynman practice.
- `?start=1` plus a valid technique and document ID can start a review session directly.

The global Review route currently presents the guided review picker; it does **not** automatically choose the most-due set. `StudyRedirect` contains a review-selection branch, but only its quiz mode is mounted in the current route table.

## 5. PDF import and lesson preparation

**Primary files:** [StudentHome](./src/pages/student/StudentHome.jsx), [documentProcessor](./src/utils/documentProcessor.js), [cleanModule](./src/utils/cleanModule.js), [chunkRecords](./src/utils/chunkRecords.js), [definitions](./src/ai/definitions.js).

### 5.1 Import flow

1. Select or drag a PDF onto Home. The UI handles one selected file per import.
2. Read the file into an array buffer in the browser.
3. Load PDF.js and configure its locally bundled worker.
4. Extract text page by page and report extraction progress.
5. Reconstruct lines using PDF text-item positions and end-of-line markers.
6. Detect wide horizontal gaps as column/table separators.
7. Remove recognized non-lesson lines.
8. Build cleaned page strings, a flattened `rawText`, and a line-preserving `lineText`.
9. Create overlapping study chunks and save the document locally.
10. Remember `lastDocumentId` and open its document screen.

The original PDF bytes are not persisted by the document repository. The stored study source is the extracted, cleaned text and its related metadata.

### 5.2 Import limits

| Limit | Current value |
| --- | --- |
| File size | At most 20 MiB; the error message describes this as 20 MB |
| PDF length | At most 300 pages |
| Extracted text | At most 1,000,000 characters before cleanup |
| Target chunk length | Approximately 400 estimated tokens |
| Target chunk overlap | Approximately 50 estimated tokens |
| Token estimate | `ceil(characterCount / 4)` |

The limits are guards, not a guarantee of good performance on every phone. Chunk targets are approximate; a very long sentence can exceed the target because the implementation preserves sentence boundaries.

Home currently requires a PDF MIME type. The lower-level processor also accepts a `.pdf` filename fallback, which the reference-upload flow can use. Some unusual file-picker MIME values may therefore work in one entry point but not another.

### 5.3 Automatic handout cleanup

Line-based rules recognize administrative fields such as name, section, date, score, student number, teacher, school, and address. Other rules handle blank answer lines, page numbers, standalone dates, links, copyright/instruction lines, and repeated headers/footers.

Repeated edge lines are considered only for documents with at least three pages. If cleanup would retain less than 30% of the original text length, the safety net keeps the original text instead. Cleanup records a count and categories of removed lines; the summary screen can display them.

Cleanup is heuristic. It can remove a useful line or preserve a sensitive one. It is not OCR, a semantic parser, or a privacy guarantee. The original pre-cleanup source is not separately stored for an in-app restore operation.

### 5.4 Chunk records and page metadata

The database stores chunks as `string[]`. `getChunkRecords(doc)` derives:

```text
chunkId:       <document-id>-<zero-based-chunk-index>
text:          stored chunk string
index:         zero-based index
tokenEstimate: ceil(text.length / 4)
page:          optional, best-effort 1-based page match
```

Page resolution searches page text for the chunk's opening fragment. Unresolved pages are omitted rather than guessed. Blank extracted pages are preserved in the page list so page numbering remains meaningful.

### 5.5 Definition extraction

The offline engines recognize common glossary/handout forms:

- `Term - meaning`, including dash variants.
- `Term: meaning`.
- Two-column/table rows reconstructed with tabs.
- Definition sentences using phrases such as `means`, `refers to`, `is defined as`, `is`, and `are`.
- Repeated patterns with a term on one line and its meaning on the next.

The helper removes bullet prefixes, deduplicates terms, handles some wrapped definitions, and rejects many pronouns/headings as terms. Automatic terms and meanings have length/word guards. This is mainly English-oriented pattern matching, not general multilingual language understanding.

Scanned/image-only PDFs have no usable text without OCR. Empty, protected, malformed, or over-limit files produce a recoverable upload error. There is no OCR integration in this repository.

## 6. Summaries

**Primary files:** [summary orchestrator](./src/services/summarize/index.js), [offline summary](./src/services/summarize/summarizeTier3.js), [cloud summary](./src/services/summarize/summarizeTier2.js).

### Output and presentation

A normalized summary contains `version`, `overview`, `keyPoints`, `keyConcepts`, `keyTopics`, `studyOutline`, and `topSentences`. It is displayed as a short "In short" section, key ideas, study order, and topic chips. Cloud concepts can also include why a concept matters and common mistakes.

### Offline path

1. Use student-edited cards if present.
2. Otherwise, use extracted definitions when at least three are found.
3. Otherwise, use RAKE keyword extraction and select source sentences by keyword coverage.

The prose path uses at most three key points, five key concepts, six topic chips, and three outline groups. The definition path can include up to eight key concepts, plus short instructions about how to study the handout's terms. Extractive prose is shortened; no language model is running locally.

### Cloud path

The app sends extracted chunks and optional page metadata to `/api/summarize`. The server asks the model to use only the supplied source and return JSON. The browser normalizes that result into the shared summary shape.

The source language is used unless a service caller supplies a language hint. There is no complete language-selection/localization interface.

### Cache and refresh

Summaries are cached by document ID and effective tier. `SUMMARY_VERSION` is currently `3`; a cached summary in an older format is regenerated. "Make a new summary" forces a new result. Editing cards clears that document's cached summaries.

Cloud summary generation currently reads the original extracted text, not the edited card list. Card edits reliably affect **offline** summaries, but are not forwarded into cloud summary generation.

## 7. Editable study cards

**Primary file:** [CardEditor](./src/components/CardEditor.jsx).

The Cards tab lets students inspect and correct automatically extracted terms and meanings:

- Edit the term and meaning.
- Add a new card.
- Remove a card.
- Save valid, complete term/meaning pairs.
- Reset a previously edited list to automatic extraction after confirmation.

Editor input limits are 80 characters for a term and 300 characters for a meaning. Incomplete pairs are excluded from saving, with a warning. Whitespace is normalized in the repository.

Saved pairs live on the document as `items`, with `itemsEditedAt`. They take precedence in offline quiz and summary generation, including quiz-generated review cards. Saving an empty valid list resets the document to automatic cards; it is not a persistent "disable all automatic cards" mode.

Editing cards does not rewrite `rawText`, the source chunks, chat context, Feynman context, or past attempts/mastery records. Cloud quizzes and summaries still use the original extracted chunks.

## 8. Quizzes and adaptive practice

**Primary files:** [StudentQuiz](./src/pages/student/StudentQuiz.jsx), [quiz orchestrator](./src/services/quiz/index.js), [offline generator](./src/services/quiz/quizTier3.js), [difficulty helper](./src/services/difficultyBuilder.js), [BKT](./src/services/bkt.js).

### 8.1 Student experience

- A study-habit survey is offered once per document and can be skipped.
- Questions are shown one at a time.
- Selecting an option immediately submits that answer and reveals feedback.
- Fill-in answers require typed submission.
- Feedback includes the correct answer and an explanation.
- Completion saves a score, updates topic mastery, and shows weak topics.
- Students can take another quiz or follow links to review/explanation practice.
- Optional Pomodoro can accompany the quiz.
- A document's Quiz tab displays recent attempt history, including unfinished records.

Survey choices include rereading, highlighting, summaries, flashcards, practice tests, teaching/explaining, group study, and videos. Some choices map to diagnosis habits; others have no specific engine mapping. The choice is a local setting, not a demographic profile.

### 8.2 Offline question generation

The generator uses edited cards first, then automatic definitions when at least two exist, then complete prose sentences.

- Targets up to five questions.
- Usually produces three fill-in-the-blank questions and two true/false questions.
- False glossary statements swap meanings between different terms.
- Prose blanks hide a short source word; false prose statements replace it with a different candidate word.
- Orders candidates by mastery, with randomized selection/ties for variety.
- Treats unseen terms as initial-mastery candidates rather than requiring previous history.
- Can reuse a term in a true/false question for a short source.
- Can return fewer than five questions, or none, when there is not enough suitable material.

"Deterministic" is the tier's historical name: it means rule-based/no model. Current quiz selection uses `Math.random`, so repeat quizzes need not be identical.

Typed answers are compared case-insensitively after trimming. Definition helpers add simple spelling alternatives, such as parenthesized abbreviations, articles, and singular/plural variants. They do not perform semantic answer grading.

### 8.3 Cloud question generation

`/api/quiz` receives source chunks, weak-topic labels, and `count: 5`. The prompt prefers multiple-choice questions with four options and explanations. The backend requires exactly five returned questions and normalizes the fields; prompt preferences are not all enforced as strict semantic constraints.

The difficulty helper computes average mastery and an instructional description, but the current cloud wire payload sends **weak-topic labels**, not the full computed difficulty instruction. It is therefore more accurate to describe this as weak-topic-biased practice than a fully calibrated adaptive difficulty system.

### 8.4 Scoring and mastery persistence

Each completed answer contributes a correct/incorrect signal. At completion, mastery is updated for each question's topic; repeated questions about the same topic build on the mastery updated earlier in that attempt. The quiz record receives the score and `completedAt`.

Ordinary quiz completion updates BKT. It does **not** call the SM-2 scheduler. Review card ratings are the path that writes review intervals.

Scores are counts, not percentages: a record with `score: 3` and five questions represents 60%. Some older UI history text assumes a denominator of five even when an offline quiz is shorter; use the stored question count for accurate calculations.

## 9. Guided review and spaced repetition

**Primary files:** [StudentReview](./src/pages/student/StudentReview.jsx), [review orchestration](./src/services/spacedRepetition/index.js), [SM-2](./src/services/spacedRepetition/sm2.js).

### 9.1 Review flow

The guided page proceeds through technique selection, document selection, and a session. Students choose Spaced Repetition, Feynman, or Pomodoro, or skip technique selection for a normal flashcard review. Document choices show locally tracked weak topics.

Spaced Repetition, the skipped/normal flashcard flow, and Pomodoro-backed review share a flashcard-style session. The cards come from the quiz generator rather than a separate persistent flashcard-deck store. The student reveals the answer, then rates recall.

### 9.2 Recall ratings

| Visible rating | Internal grade | SM-2 quality | Successful recall for BKT? |
| --- | --- | --- | --- |
| Again | `again` | 1 | No |
| Hard | `hard` | 3 | No |
| Good | `good` | 4 | Yes |
| Easy | `easy` | 5 | Yes |

The page previews the next interval for each grade. Keyboard shortcuts support Space to flip and `1`–`4` to grade a revealed card, excluding focused inputs/buttons and modified shortcuts.

Each rating updates mastery and the topic's schedule. The finished review saves a score counting Good/Easy ratings, marks the quiz record `source: 'review'`, and records its technique. A poor session can suggest another technique.

### 9.3 Scheduling model

SM-2 starts with ease factor `2.5`, with a floor of `1.3`. For quality `q`, its ease update is:

```text
newEase = max(1.3, oldEase + 0.1 - (5-q) * (0.08 + (5-q)*0.02))
```

Failed recall (`q < 3`) schedules one day and resets the internal repetition count. Successful recall advances intervals through one day, six days, then approximately `round(previousInterval * newEase)`. Due dates use 24-hour day increments from the supplied/current timestamp.

The persisted schedule fields are `interval`, `easeFactor`, and `nextReviewDate`. A full repetition streak is not stored; orchestration approximates it from the previous interval. This is a lightweight SM-2 implementation, not an exact reproduction of every SuperMemo/Anki behavior.

### 9.4 Due topics

Topics with no review date are due. The repository orders due topics by oldest due date first, then weakest mastery. Home counts due tracked topics, not every possible term in the PDF.

`startSession` supplies due-topic labels to the quiz orchestrator, but the current quiz orchestrator does not consume its `opts.weakTopics` argument. A review can therefore include generated material that is not currently due. Due counts and schedule previews work; strictly due-only card selection is not fully wired.

## 10. Feynman explanation practice

**Primary files:** [Feynman orchestrator](./src/services/feynman/index.js), [offline evaluator](./src/services/feynman/feynmanTier3.js), [cloud evaluator](./src/services/feynman/feynmanTier2.js).

### Workflow

1. Select a weak topic, or open a deep link naming one.
2. Explain the topic from memory in a text box.
3. Optionally reveal a locally retrieved source passage.
4. Choose Got it, Partially, or Missed it.
5. Evaluate the explanation.
6. Compare "What you wrote" with "What your notes say" and inspect covered/missing ideas.
7. Retry or return to the document/dashboard.

When no weak topic or deep-linked topic exists, the UI asks the student to take a quiz first. This is typed self-explanation: it does not record microphone input or transcribe speech.

### Offline evaluation

The service focuses on lines/sentences related to the selected topic where possible. It extracts key terms, excludes generic terms, groups some word forms and hard-coded synonyms, and computes:

```text
coverage = matchedKeyTerms / totalKeyTerms
```

TF-IDF retrieves related source passages. The UI highlights covered/missing terms and presents a coverage-based message. Topic-focused evaluation caps its key-term list more tightly than whole-source evaluation.

This is lexical coverage, **not proof of conceptual correctness**. It can miss valid paraphrases, count a misleading explanation as coverage, or overgeneralize a synonym group. Missing terms are possible gaps rather than definitive errors.

### Cloud evaluation and persistence

The optional server receives explanation, topic label, and extracted chunks. It returns coverage, covered terms, gaps, and feedback. The browser normalizes these into the offline-compatible result shape; cloud coverage also becomes `aiScore`.

Attempts are stored in `feynmanAttempts`. If the attempt has a concrete topic, the service updates its BKT mastery. A valid explicit self-rating wins; otherwise coverage/AI score of at least `0.6` is treated as a successful signal.

Feynman attempts are not saved as scored quiz records. Consequently, they do not currently appear as sessions in the quiz-based learning curves or per-technique effectiveness comparison. The Feynman screen also does not currently use the study-time hook.

## 11. Pomodoro focus timer

**Primary files:** [usePomodoro](./src/hooks/usePomodoro.js), [PomodoroTimer](./src/components/PomodoroTimer.jsx).

Pomodoro is an optional browser-local modifier on quiz/review, not an AI feature.

| Setting | Default |
| --- | --- |
| Focus block | 25 minutes |
| Short break | 5 minutes |
| Long break | 15 minutes |
| Long-break cadence | Every four completed focus blocks |

The reducer handles Idle, Focus, Short Break, and Long Break phases, with start/resume, pause, reset, skip, configuration, and restore actions. Durations are configurable through the hook/component API; there is not a full duration-settings screen.

Timer state and optional focus-mode permission live in `appSettings`. Reload restores saved remaining time. The hook ticks using an interval; it does not reconcile elapsed wall-clock time while the app was closed or fully suspended. Background throttling can affect accuracy.

Optional focus mode requests a screen wake lock when supported and permitted. It can keep the screen awake but cannot enable operating-system Do Not Disturb, block other apps, or guarantee uninterrupted background timing. Unsupported/rejected wake locks leave the timer usable. Phase changes are announced to assistive technology without announcing every tick.

## 12. Ask My Notes chat

**Primary files:** [StudentChat](./src/pages/student/StudentChat.jsx), [TF-IDF](./src/utils/tfidf.js), [chat handler](./cloud-api/src/handlers/chat.js).

### Retrieval-first architecture

Every question is locally compared with the stored document chunks before optional cloud generation. There is no embedding API or vector database.

The retrieval helper lowercases text, strips non-alphanumeric characters, removes its English stopword list and short tokens, then scores query matches using normalized term frequency and `log2(N / documentFrequency)` IDF.

### Offline answer

The normal local branch retrieves up to three chunk records and tries to quote up to three matching source lines. If no positive line matches exist, it falls back to short excerpts from up to two retrieved chunks. It does not generate explanatory prose.

Important retrieval limitation: the helper can return zero-score chunks instead of an empty set. This is particularly relevant to one-chunk documents, where matching tokens have zero IDF. An unrelated question may therefore show source excerpts rather than reliably produce the not-found message. Retrieval relevance is a heuristic, not a semantic understanding guarantee.

### Cloud answer

The cloud branch sends the question and up to five retrieved chunks to `/api/chat`. The model is prompted to answer only from that context. Backend and frontend discard citations whose chunk IDs were not supplied. An answer without a valid source ID collapses to the not-found result.

Chat citations validate source **IDs**, not exact evidence quotes or semantic entailment. The reference-checking feature uses stricter quote validation. The chat UI persists citation IDs but primarily displays answer text and the processing-tier badge; it is not a full clickable PDF citation viewer.

Messages are stored per document with role, content, citations, tier, and timestamp. Although chat history is displayed locally, previous turns are not sent as conversational history to the model: each cloud request carries the current question and retrieved passages.

On cloud transport failure, local retrieval answers are used and labelled Offline mode. The original PDF and filename are not part of the API payload, but sensitive information inside text can still evade redaction.

## 13. Check My Notes against a reference

**Primary files:** [StudentVerify](./src/pages/student/StudentVerify.jsx), [verification core](./src/services/verification/core.js), [verification orchestration](./src/services/verification/index.js), [server evidence validator](./cloud-api/src/lib/verification.js).

### Purpose

This feature compares statements with a textbook excerpt, teacher-approved text, or another reference supplied by the student. It does not browse the web, inspect an individual's identity, grade a person, or independently certify factual truth.

### Student workflow

1. Open "Check notes against a reference" from a document.
2. Select/edit a notes excerpt. This does not change the original document.
3. Upload a text-based reference PDF or paste reference text.
4. Inspect detected personal-detail categories.
5. Add any missed names/details to the custom redaction list, one per line.
6. Open the redacted notes/reference preview.
7. Choose Compare offline, or enable AI and confirm preview review.
8. Read each verdict, explanation, suggested correction, and expandable evidence/context.
9. Replace/shorten the excerpt to check additional statements.

Changing notes, reference, or custom redaction terms resets the preview-review checkbox. An uploaded reference has a visible loaded-file status; edited reference text is labelled accordingly. Reference PDFs are extracted with the same local cleanup pipeline as lesson PDFs.

### Input limits and evidence passages

| Input | Limit |
| --- | --- |
| Notes excerpt | 16,000 characters |
| Reference text | 60,000 characters |
| Claims in one run | First 12 unique detected statements |
| Claim text | At most 1,200 characters each |
| Detection minimum | At least 12 characters after removing redaction markers and trimming |
| Reference passages | Up to 24, each at most 2,500 characters |
| Server JSON body | At most 100,000 UTF-8 bytes |

Statement extraction uses `Intl.Segmenter` when available and a sentence/newline fallback otherwise. The reference is divided by character count, not semantic sentence boundaries. The results disclose checked count versus total detected statements.

References use `reference-1`, `reference-2`, etc. Evidence labels refer to these **passages**, not guaranteed original PDF page numbers, because uploaded/pasted text can be edited before checking.

### Verdicts

| API status | UI label | Meaning |
| --- | --- | --- |
| `supported` | Supported by reference | Agreement with the supplied reference |
| `contradicted` | Conflicts with reference | The cloud interpretation identifies explicit conflicting evidence |
| `insufficient_evidence` | Insufficient evidence | The supplied source/result does not establish a supported/conflicting verdict |

Offline comparison recognizes the same complete-sentence wording after case/whitespace normalization. Unmatched statements are insufficient evidence, **not false**. Offline checking does not generate corrections or contradictions.

### Cloud safeguards

- Device-level Cloud AI eligibility is required.
- This feature separately requires explicit review consent before sending the excerpt.
- The server requires `consent: true` in the body and validates the claim/reference shapes.
- Every supplied claim ID must occur exactly once in the result.
- A supported/contradicted result requires at least one valid reference ID and a quote present in that reference after whitespace normalization.
- Quotes remain case-sensitive in server validation; fabricated quotes are discarded.
- Unsupported definitive verdicts are downgraded to insufficient evidence.
- Suggested corrections only accompany grounded contradictions and are never automatically applied.
- Failed AI requests produce an explicit notice and local comparison results.

Quote provenance does not prove that the model interpreted the quote correctly. A reference can itself be incomplete, outdated, or wrong. Human review remains necessary.

### Saved checks

The app keeps the latest 20 report snapshots per document. Reports include sanitized claims/evidence, tier, counts, and a locally retained reference label. They are not recomputed when source text or cards change. Report storage is not a guarantee that every sensitive detail was removed: heuristics can miss content, and local labels such as a reference title are not automatically anonymized.

## 14. Progress, recommendations, and study tips

### 14.1 Bayesian Knowledge Tracing (BKT)

The app models estimated mastery per document/topic, separately from quiz percentages.

| Parameter | Value | Interpretation |
| --- | --- | --- |
| `pInit` | 0.3 | Initial mastery |
| `pLearn` | 0.2 | Learning transition |
| `pSlip` | 0.1 | Error despite knowing |
| `pGuess` | 0.25 | Correct response without knowing |

For prior mastery `p`, a correct answer uses:

```text
posterior = (1-slip)*p / ((1-slip)*p + guess*(1-p))
```

An incorrect answer uses:

```text
posterior = slip*p / (slip*p + (1-guess)*(1-p))
```

Both then apply `posterior + (1-posterior)*learn` and clamp the result to `[0.01, 0.99]`.

- Below `0.4`: Needs work.
- From `0.4` to below `0.7`: Learning.
- At least `0.7`: Mastered for UI/home counts.
- Below `0.6`: Weak for targeting and recommendation inputs.

These values are implementation defaults, not individualized psychometric measurements. Quiz correctness, flashcard self-ratings, and Feynman outcomes all feed the estimate differently.

### 14.2 Home overview

[overview.js](./src/services/home/overview.js) derives Home/Profile values from documents, knowledge rows, completed quiz/review records, and `studyLog`:

- Personalized local-time greeting.
- Daily goal adapted to no notes, due cards, or being caught up.
- Current/best streak based on completed attempts and recorded study days.
- Study time for the recent local-calendar week and lifetime focus totals.
- Topic mastery counts and per-set average mastery.
- Last-review dates, strongest/weakest measured set, and due-topic totals.
- Today's plan with recent completions and review/quiz suggestions.
- A curve for the latest seven scored sessions across sets.

The current streak can continue when the latest activity was yesterday. A review-duration estimate uses approximately 40 seconds per due topic. "Mastered this week" counts currently mastered rows updated recently, not a historical record of first becoming mastered.

### 14.3 Study time

[useStudyTimer](./src/hooks/useStudyTimer.js) counts 15-second ticks while an active quiz/flashcard-review page is visible, writes accumulated minutes, and flushes remaining ticks on cleanup. It does not measure comprehension, all screen interactions, or total time spent anywhere in the app. Very short visits and abrupt termination can be undercounted. Feynman, chat, summary reading, and audio listening are not currently included.

### 14.4 Per-document dashboard

[learningCurve.js](./src/services/dashboard/learningCurve.js) derives points from completed quiz/review records. Each plotted value is `score / questionCount`, not a stored historical BKT snapshot, even where the interface calls it "mastery".

The dashboard shows:

- Attempt curve with technique labels/colors and accessible text.
- The first recorded technique change from the first attempt's technique.
- Current BKT topic bars.
- Average change in attempt score grouped by recorded technique.
- Quiz versus review source counts.
- Suggestions when the latest score is low or the curve plateaus.

Average gain gives the first attempt a zero gain and attributes later differences to the later attempt's technique. This is a descriptive heuristic, not proof a technique caused the score change. Feynman attempts are excluded because they are stored separately. Ordinary quiz records currently do not persist their chosen technique, so they appear as plain quizzes even with a Pomodoro overlay.

### 14.5 Technique diagnosis

[techniqueEngine](./src/services/techniqueEngine.js) contains the technique registry and local recommendation rules. [diagnosis](./src/services/diagnosis/index.js) handles optional cloud enrichment and creates Review deep links.

- Supported session techniques: Pomodoro, Feynman, Spaced Repetition.
- Diagnosis triggers include a score below 70% or a plateau across at least three attempts.
- Plateau means the latest value differs from the value two attempts earlier by less than `0.05`.
- The deterministic recommendation output is Feynman, Spaced Repetition, or keep going.
- Switching avoids recommending the same high-utility technique currently in use where possible.
- Passive habits can influence diagnosis but are not built session types.
- Cloud analysis is used only when the deterministic result calls for a switch.
- Recommendations never require the student to follow them and do not guarantee a particular gain.

The registry contains effectiveness labels and research-attribution strings. Those are application content, not a research review performed by this guide; evaluate them separately before making educational efficacy claims. Quiz/result call sites primarily use the latest low score, while the dashboard supplies a score history for plateau analysis.

### 14.6 Personal study tips

[studyTips.js](./src/services/studyTips.js) generates at most four local suggestions using first-quiz status, weakest topics, recent scores, due schedules, lesson length, number of terms, and whether all measured topics are mastered.

Examples include taking a baseline quiz, explaining a weak topic, changing technique, reviewing due material, using focus blocks for a lesson of roughly 1,500+ words, and using flashcards for many terms. Duplicate action links are removed. Tips do not make AI requests.

## 15. Listening, profile, and preferences

### 15.1 Listen to this lesson

[AudioSummary](./src/components/AudioSummary.jsx) and [audioScript](./src/services/audioScript.js) turn summary content into a spoken-style script:

- Introduction, up to three key points, and up to five key ideas.
- Up to three oral self-check questions with a four-second pause before each answer.
- Play, Pause, Resume, and Stop controls.
- Slow/Normal/Fast playback (`0.8`, `1`, `1.2` rates).
- A visible script and current-line highlighting.
- Stop on page exit or script change.

The browser's Speech Synthesis API reads the script with an `en-US` language hint. No dedicated cloud audio API is used. Offline speech depends on an installed/local voice and platform behavior; a browser may expose remote voices. The script remains readable when speech is unsupported. The mini-quiz is not scored or saved as a quiz attempt.

### 15.2 Local profile

Profile stores a display name, shows initials, a "learning since" label, streak, set/topic/focus totals, and application version. There is no username/password authentication, profile server, or account recovery.

### 15.3 Preferences

| Preference | Behavior |
| --- | --- |
| Study reminders | Requests notification permission; can show one due-card nudge per day when Home is opened |
| Sound effects | Locally generated Web Audio tones for answers, flips, and completion |
| Dark appearance | Applies a document-root theme and updates the browser theme-color metadata |

Reminders are not push notifications or a background schedule. They require supported APIs, permission, due topics, and the app/Home flow running. Defaults are off for reminders, sound, and dark mode.

### 15.4 Export and clear data

"Export my study data" downloads a JSON snapshot with app name, export timestamp, schema version, and all database tables. The saved shared cloud access code is excluded. The export can still contain names, source text, questions, and personal study history; store it securely.

There is no import/restore interface for the export. "Clear all local data" requires confirmation and clears all tables, including preferences and consent. Document deletion removes that document's dependent study records, but does not clear all app-level settings.

### 15.5 Optional Cloud AI panel

The panel appears in Profile and the note-checking page. It checks `/api/health`, loads local consent/code, offers access-code entry when required, and allows turning Cloud AI off. Turning it off clears local consent and the saved code.

Its "on for this device" message describes saved eligibility settings, not a completed paid-provider request or validated access code. Per-result badges show which processing path actually produced the result. There is no separate OpenAI-only connection indicator in the current shell.

## 16. Processing tiers and cloud eligibility

**Primary files:** [tierDetection](./src/utils/tierDetection.js), [cloudSession](./src/utils/cloudSession.js), [apiTransport](./src/utils/apiTransport.js), [TierBadge](./src/components/shared/TierBadge.jsx).

| Internal tier | UI label | Current status |
| --- | --- | --- |
| `cloud` | Cloud AI | Optional provider-backed text processing |
| `edge` | On-device AI | Extension point; no ready provider registered |
| `deterministic` | Offline mode | Browser-local algorithms and rules |

Some filenames/docs use historical numeric tiers: Tier 2 is cloud, Tier 1 is edge, and Tier 3 is offline. Prefer the stable string values when integrating code.

### Normal tier selection

1. Explicit deterministic preference uses offline mode.
2. Otherwise try cloud unless the caller explicitly prefers edge.
3. Cloud needs online status, saved consent, a saved code or a site reporting no code requirement, and a successful health response.
4. Otherwise try a ready registered edge provider.
5. Otherwise use deterministic processing.

Cloud health and code-requirement probes use short in-memory caches of roughly 30 seconds. Saving consent/code invalidates the tier-health cache; network/browser state and separate probe caches can still cause short-lived stale status.

Summary and quiz edge modules are placeholders that throw. Feynman and diagnosis use local rules if no cloud path is active. The app does not download or run a small language model, WebLLM, or an on-device neural model today.

### Request versus health status

`cloudEnabled()` checks browser-local eligibility. `/api/health` checks server configuration. Neither confirms that the provider key/model works, its allowance remains, or a saved access code is correct. A successful AI operation is the meaningful end-to-end check.

Verification has its own explicit `useCloud` and reviewed-preview controls. It calls the guarded transport directly after eligibility checks and provides a visible fallback notice on failure.

## 17. Local database and record lifecycle

**Database:** `StudyBunnyDB`, accessed through [database.js](./src/db/database.js).

### 17.1 Tables

| Table | Important fields/indexes | Stored information |
| --- | --- | --- |
| `documents` | Auto ID, title, createdAt | Cleaned raw/line text, chunks, pages, cleanup metadata, edited items |
| `summaries` | Auto ID, documentId, tier, `[documentId+tier]`, createdAt | Versioned cached summary content and format |
| `quizzes` | Auto ID, documentId, tier, createdAt | Questions, score, completedAt, optional source/technique |
| `knowledgeState` | Auto ID, documentId, topic, `[documentId+topic]`, nextReviewDate | Current BKT estimate, update time, SM-2 fields |
| `chatHistory` | Auto ID, documentId, timestamp | User/assistant text, citation IDs, effective tier |
| `appSettings` | String `key` | Preferences, consent, code, activity log, timer, navigation and habit settings |
| `studyTechniques` | Auto ID, documentId | Selected technique for a document and selection time |
| `feynmanAttempts` | Auto ID, documentId, topic, createdAt | Explanation, prompt, self-rating, tier, AI score, matched/missed terms |
| `verificationReports` | Auto ID, documentId, createdAt | Sanitized check result snapshots and evidence passages |

Each topic's schedule is topic-level, not a permanent unique-card schedule. Equivalent concepts with different topic spellings/case from different generators can produce separate tracked rows.

### 17.2 Schema versions

- **v1:** documents, summaries, quizzes, knowledge state, chat history, and settings.
- **v2:** study techniques, Feynman attempts, and a due-date index. Existing mastery rows receive interval `0`, ease `2.5`, and null due date if those fields were absent.
- **v3:** verification history and the compound summary index.

Dexie upgrades are additive. Older fields/stores are preserved. A few helpers retain fallback lookups for older index availability. Future schema changes should be additive and explicitly versioned.

### 17.3 Settings keys

Examples include:

- `profileName`, `prefReminders`, `prefSound`, `prefDark`.
- `cloudConsent`, `cloudAccessCode`.
- `lastDocumentId`, `studyLog`, `lastReminderDay`.
- `studyHabit:<documentId>`.
- `pomodoro.state`, `pomodoro.focusPermission`.

The access code is a local shared secret, not encrypted application credentials. Export intentionally excludes it, but browser users/extensions with appropriate access can still read local data.

### 17.4 Deletion and storage boundaries

`deleteDocument(id)` transactionally deletes the document and its seven dependent study tables' rows: summaries, quizzes, knowledge, chat, techniques, Feynman attempts, and verification reports. App-wide settings, including a per-document habit key or last-document setting, are not individually cleaned by this operation.

`clearAllData()` clears every database table in a transaction. Neither operation is an automatic provider-data deletion request. No app-level encryption at rest, backup service, storage-persistence request, or cross-device synchronization is implemented.

IndexedDB is scoped to the browser profile and exact origin. A localhost site, preview deployment, production domain, and different subdomain have separate data. Clearing browser storage, private browsing, browser eviction, or changing devices can lose access to local study history.

## 18. Cloud API and provider architecture

### 18.1 Endpoint contracts

All successful API responses are JSON. AI routes are POST-only and use `X-Study-Bunny-Code` when an access code is configured. Payloads deliberately omit PDF bytes, filenames, document titles, and dedicated identity fields.

| Route | Request fields | Successful response |
| --- | --- | --- |
| `GET /api/health` | None | `{ status: 'ok', accessCode: 'required' \| 'none' }` |
| `POST /api/summarize` | `chunks: [{text, page?}]`, `language?` | `overview`, `keyConcepts` with term/explanation/importance/commonMistakes, `studyOutline` |
| `POST /api/quiz` | `chunks: [{chunkId, text}]`, `weakTopics?`, `count?: 5` | `questions` with ID, type, topic, prompt, answer, optional options/explanation |
| `POST /api/chat` | `question`, `chunks: [{chunkId, text, page?}]` | `found`, nullable `answer`, `citations: [{chunkId}]` |
| `POST /api/feynman` | `explanation`, `topic?`, `chunks: [{chunkId, text}]` | `coverage`, `covered`, `gaps`, `feedback` |
| `POST /api/analyze-technique` | `currentHabit`, `weakTopics`, `masteryHistory`, `topicType?` | `recommended_technique`, `analysis`, `expected_improvement` |
| `POST /api/verify-notes` | `consent: true`, `claims: [{claimId, text}]`, `references: [{chunkId, text, page?}]` | Validated `claims` verdicts/explanations/corrections/citations |

The deployed health route is [api/health.js](./api/health.js). It differs from the retained generic `cloud-api` health handler: it checks provider configuration and reports the access-code mode. It does not call the provider.

### 18.2 Handler pipeline

```text
Vercel adapter guards
  -> method check
  -> JSON parse and body-size check
  -> recursive redaction
  -> route input validation
  -> daily quota increment/check
  -> grounded prompt creation
  -> provider call
  -> strict JSON parse and route output validation
  -> retry once on upstream/invalid-output failure
  -> normalized response and diagnostic log
```

Summarize, quiz, and chat have explicit pipelines. Feynman, technique analysis, and verification use `makeModelHandler`. Handlers expose `makeHandler({ invokeModel })` so tests can inject a fake model without credentials or network access.

Model text must parse as a JSON object as expected by the route. Markdown fences/prose are not automatically stripped. A response with an invalid shape or invalid provenance is retried/rejected or downgraded according to its validator.

### 18.3 Provider client

[modelClient.js](./cloud-api/src/lib/modelClient.js) is the shared provider boundary. It takes `{ system, messages }` and returns raw text for the handler to validate.

- Gemini, Groq, OpenAI, and OpenRouter configurations use the client's OpenAI-compatible chat-completions request format.
- Anthropic normally uses its separate Messages-format HTTP request.
- `AI_BASE_URL` can override the compatible endpoint, including routing an Anthropic-labelled configuration through a compatible endpoint.
- Legacy `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` fallbacks remain supported by the code; new deployments should use the generic variables.
- Compatible requests use JSON object mode unless `AI_JSON_MODE=off`.
- Provider calls have a 20-second timeout and output-token limit of `2048`.
- The same server-configured model is used by all feature routes; there is no per-user/per-feature model selector.
- No streaming, tool use, web search, image inference, automatic provider failover, or server response cache is implemented.

The client configuration recognizes its built-in endpoints or a supplied compatible base URL. Actual model availability, account permissions, billing, data policies, and provider limits must be checked with the chosen service; this guide does not promise a free allowance or permanently valid model name.

### 18.4 Transport and timing

`apiPost` sends sanitized JSON and the access-code header, uses a 28-second default abort timeout, and throws a safe API error on unsuccessful responses. Health requests default to a five-second timeout.

Vercel configuration sets a maximum function duration of 30 seconds. Two possible 20-second model calls can exceed either frontend or function limits, so a slow first call plus retry may still fall back offline. One app request can make two billable/provider-quota-consuming model calls even though the app's daily counter increments only once.

### 18.5 Limits and errors

The body parser allows at most **100,000 bytes**, labelled 100 KB in errors. Standard request validation bounds content strings to 8,000 characters and arrays to 32 entries where its shared checks apply. Verification has its own stricter claim/reference limits. Long documents can import locally yet exceed a cloud route's payload limits.

Legacy summarize/quiz/chat validators reject known forbidden fields and normalize accepted data; they do not uniformly reject every unknown field. Feynman, diagnosis, and verification enforce stricter allowed top-level shapes. Output validators check structure, not the truth of all generated material or every prompt constraint.

| HTTP status | Typical code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Malformed JSON or invalid input |
| 401 | `UNAUTHORIZED` | Incorrect/missing required access code |
| 403 | `FORBIDDEN` | Browser Origin host does not match the request host |
| 405 | `METHOD_NOT_ALLOWED` | Wrong HTTP method |
| 413 | `PAYLOAD_TOO_LARGE` | Body-size limit exceeded |
| 429 | `QUOTA_EXCEEDED` | Daily allowance exceeded |
| 502 | `UPSTREAM_ERROR` | Provider, output validation, or backend dependency failure |
| 503 | `NOT_CONFIGURED` | Protected routes lack provider configuration |

Unconfigured health responds `503` with `{ status: 'not_configured' }`. Most error bodies contain `{ error, code }`. Public errors intentionally omit prompt text, model output, keys, and stack traces.

## 19. Privacy, security, and cost controls

### 19.1 What stays local and what is sent

| Data | Browser storage | Optional outbound use |
| --- | --- | --- |
| Original PDF bytes | Not persisted by the app | Not sent by feature payloads |
| Document title, local display name | Local records/settings | Not dedicated fields in study API payloads |
| Extracted lesson text | Documents/chunks | Summaries, quizzes, chat context, Feynman sources |
| Questions/explanations | Local messages/attempts | Current chat question or Feynman explanation |
| Performance signals | Mastery/quizzes/settings | Selected habit, weak-topic labels, score history for diagnosis |
| Verification claims/reference | Saved sanitized report excerpts | Only with cloud opt-in plus preview-review consent |
| Access code | Local setting, excluded from export | Request header to the app backend, not AI prompt |
| Provider API key | Never in frontend settings | Server-to-provider authorization only |
| Client IP and quota counter | Not a local study record | Backend routing/quota identity; quota key can include IP |

The app does not upload a student's whole local database for synchronization. Optional text requests still leave the device. "Local-first" must not be marketed as "nothing ever leaves the device" when cloud features are enabled.

### 19.2 Personal-detail detection

[privacy.js](./cloud-api/src/lib/privacy.js) is shared by the browser transport and server parser. It detects email patterns, selected phone formats, labelled student IDs, labelled names, and labelled addresses. It replaces detected spans with `[REDACTED]`. Verification supports custom case-insensitive literal terms in addition to these rules.

String values are sanitized recursively, with citation/claim IDs preserved. Unlabelled names, unusual identifiers, addresses, sensitive academic context, and other private text can be missed. Custom redaction terms apply to verification, not a global student-defined redaction list for every feature.

### 19.3 Access code and origin checks

- A configured `ACCESS_CODE` is compared through SHA-256 digests with constant-time comparison.
- The adapter checks browser Origin host against the request host.
- Requests without an Origin header are allowed through this origin check; the code guard still applies if configured.
- No `ACCESS_CODE` means open-demo mode: anyone able to reach the API can potentially use its AI allowance.

These are basic access/abuse controls, not individual authentication, authorization roles, enrollment, or a complete anti-bot system. A shared code can leak. Same-origin checks do not stop a non-browser client that knows the code.

### 19.4 Daily allowance

[quota.js](./cloud-api/src/lib/quota.js) counts requests across all six AI routes using **access-code digest + IP address + UTC date**. In open mode the code component is `open`. It is not a durable student/device identifier, despite some UI/docs calling it a per-device limit.

- Default `DAILY_REQUEST_LIMIT`: `20`.
- Configuration must be a positive integer.
- Allowed requests increment after input validation and before model invocation.
- A failed model call still consumes one request; its retry does not increment twice.
- Counters use a two-day expiry and date-separated keys.
- Configured Upstash uses a REST increment/expiry pipeline with a two-second timeout.
- Counter-store failure prevents the model call rather than silently ignoring the limit.
- Without both Redis settings, each server process uses its own memory map; resets/scaling make enforcement best effort.

Students on the same school/public network can share an IP and consume the same allowance. Changing IP can create another allowance. Redis improves cross-instance consistency but does not make the identity a real user account or cap the whole site's aggregate spending.

Set appropriate provider billing controls and monitor usage before wide release. Shared-code and IP limits alone are not a guaranteed monetary cap. Free/provider allowances and quotas are shared by every user of the configured key.

### 19.5 Logging and production headers

The application diagnostic logger records only handler, HTTP status, latency, and timestamp. It discards additional fields by construction. This describes the application's logger, not all hosting/provider access logs or data-retention policies.

[vercel.json](./vercel.json) adds no-sniff, no-referrer, frame denial, camera/microphone/geolocation restrictions, and a Content Security Policy. The CSP limits browser connections to the app's own origin. API responses are marked `no-store`.

Cloud prompts identify uploaded content as untrusted data and ask the model not to follow embedded commands. Input/output validation and evidence checks reduce risk but do not eliminate prompt injection or hallucination. The app renders result text through React, not arbitrary model-supplied HTML.

## 20. PWA, offline behavior, and interface design

### 20.1 Installation and static caching

[vite.config.js](./vite.config.js) configures the PWA with a full/short name, standalone display, root start URL, theme/background colors, and standard/maskable PNG icons. Install support depends on browser/platform capabilities.

Workbox precaches built JS/MJS, CSS, HTML, icons/images, and eligible fonts. The local PDF worker is included; the precache maximum per asset is 8 MiB. There are no runtime caching rules for AI responses. `/api/` and legacy `/auth/` are excluded from the navigation fallback.

The service worker is created by a production build. A first successful online load and completed worker/cache setup are needed before relying on offline reopening. Browser-local files can subsequently be imported offline if the relevant application assets are cached.

Updates use prompt-style registration rather than automatic mid-session reload. Do not promise a custom update banner; the app has no explicit React update-prompt component. Refresh/reopen behavior depends on service-worker lifecycle and browser control.

### 20.2 Offline feature matrix

| Feature | Local/offline capability | Optional cloud enrichment |
| --- | --- | --- |
| PDF import/cleanup/cards | Yes, after assets are cached | None required |
| Summary | Extractive/definition summary | Richer structured wording |
| Quiz/review generation | Rule-based questions | Model-generated questions |
| BKT and SM-2 | Fully local | None required |
| Feynman | Lexical coverage and passages | Model feedback/coverage |
| Pomodoro | Local countdown | None |
| Ask My Notes | Source-line/excerpt retrieval | Grounded generated answer |
| Reference check | Matching-wording comparison | Interpretation of source agreement/conflict |
| Dashboard/tips/profile/export | Local records/derivations | Diagnosis may optionally use AI |
| Read-aloud | Script is local; speech depends on voice availability | No app-level audio API |
| Reminders/sounds | Browser capability and permissions | No push service |

IndexedDB data is separate from static service-worker caches. The service worker neither backs up nor encrypts local study records. It does not automatically cache API responses or queue offline AI jobs.

### 20.3 Styling and accessibility

- [src/index.css](./src/index.css) defines Study Bunny colors, component classes (`sb-*`), typography, dark theme, transitions, and responsive styling.
- System font stacks avoid external font downloads.
- Shared icons use code-native SVG; branding/install images live in `public/`.
- Many controls target 48-pixel touch dimensions; some styles/controls explicitly use 44 pixels.
- Important status is presented with text plus icons/percentages, not just color.
- Screens include labelled inputs, alert/status regions, loading states, keyboard controls, and result focus movement.
- Reduced-motion preferences have CSS accommodations.

These are accessibility provisions, not a completed WCAG certification. Manual keyboard, screen-reader, contrast, zoom, and device testing is still needed before claiming full conformance.

## 21. Development and testing

### 21.1 Local setup

Use Node.js **24.x**, as specified in both package manifests. Installing another version does not guarantee the terminal is using it; inspect the version in the terminal used for the project and restart that terminal after changing the runtime.

From the project root:

```sh
node --version
npm --version
npm ci
npm run dev
```

Vite prints the local development URL. Plain `npm run dev` serves the frontend, not Vercel server functions. With the default configuration, AI paths fall back offline. Setting secret values does not make the Vite-only server execute `/api` files.

For local full-stack testing, use the Vercel development workflow (`vercel dev`) with the repository linked/configured and server environment variables available to that process. The repository does not contain a custom all-in-one local API launcher.

### 21.2 Commands

| Command | What it does |
| --- | --- |
| `npm ci` | Installs locked root dependencies |
| `npm run dev` | Starts the Vite frontend server |
| `npm test` | Runs discovered Node tests, including frontend services and backend tests |
| `npm run build` | Runs the prebuild icon check, then builds `dist` with Vite/PWA |
| `npm run preview` | Serves built frontend files; does not execute Vercel AI functions |
| `npm run check:pwa` | Validates built manifest icons, registration, precache, and PDF worker |
| `npx playwright install chromium` | Installs the browser needed for the default smoke-test runner |
| `npm run test:browser` | Runs the isolated production-build browser smoke test |

Despite its name, `scripts/generate-icons.mjs` currently **checks committed icon dimensions**; it no longer generates new graphics. Required branding/icon PNGs must already exist.

There is no dedicated lint or TypeScript-check script. JSX type packages do not make this a TypeScript application.

### 21.3 Test coverage and boundaries

- Algorithm tests: definitions, cleanup, quiz generation, Feynman, BKT-related flows, SM-2, diagnosis, tips, overview, and dashboard derivations.
- Repository tests: fake IndexedDB, migrations, persistence, report retention, export/deletion contracts.
- API tests: injected model behavior, input/output validation, grounding, HTTP methods/errors, provider format, quota, and Vercel adapter guards.
- Browser smoke: temporary local server, production headers, mobile UI, offline PDF/reference extraction, redaction, evidence, persistence, consent reset, unavailable cloud, deletion, and unknown API routing.

The browser runner uses an isolated browser context, not the owner's logged-in browser profile. It can use `TEST_BROWSER_CHANNEL` when an installed supported browser channel is desired. Screenshots are written under ignored `test-results/`.

Tests do not call a real AI service. Passing unit/integration tests is not evidence that a deployed key, model, billing account, or cloud limit is working. The browser smoke test is not full coverage of every feature.

**Verified while preparing this guide:** the Node 24 test run reported **242 tests passed, 0 failed, 0 skipped**. The production build and PWA asset checks also passed. Vite reported mixed static/dynamic import warnings; these did not fail the build. The browser smoke test, dependency audit, and a real deployed-provider request were not run as part of this documentation task. These are dated results, not permanent guarantees.

### 21.4 Continuous integration

[.github/workflows/verify.yml](./.github/workflows/verify.yml) runs on pushes and pull requests using Node 24. It installs dependencies, runs tests, builds, checks the PWA, runs `npm audit`, installs Chromium, and runs browser smoke checks.

A configured workflow describes intended CI behavior; check actual run results before releasing. No deployment workflow or automated live-provider acceptance test is included in that file.

## 22. Deployment requirements and steps

### 22.1 Requirements

For a local-first/offline-capable deployment:

- This repository and its committed assets/lockfile.
- A build environment using Node 24.x and npm.
- Vercel project access and a repository import or equivalent deployment workflow.
- HTTPS production hosting for PWA/browser capabilities.
- A browser supporting the required storage and PDF worker features.

For optional Cloud AI, also provide:

- One supported/configured AI provider account and key.
- An enabled model ID usable by that key.
- Provider quota/billing controls suitable for the intended audience.
- A shared access code if the site is not an open demo.
- Optional Upstash Redis credentials for cross-instance counters.
- A clear consent/privacy policy appropriate to the deployment audience and chosen provider.

An AWS account, S3 bucket, IAM user, Cognito pool, DynamoDB table, or AWS API key is **not** a requirement for this architecture.

### 22.2 Environment variables

See [.env.example](./.env.example) and [cloud-api/.env.example](./cloud-api/.env.example). Example files document settings; copying them does not itself configure production.

| Variable | Location | Requirement and meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Public frontend build setting | Leave blank for same-origin Vercel deployment |
| `AI_PROVIDER` | Server only | Provider name: `gemini`, `groq`, `openai`, `openrouter`, or `anthropic` |
| `AI_API_KEY` | Server only, secret | Provider key; needed for cloud processing |
| `AI_MODEL` | Server only | Model ID from the selected service; needed for cloud processing |
| `ACCESS_CODE` | Server only, secret | Shared student code; unset means open demo, not offline mode |
| `DAILY_REQUEST_LIMIT` | Server only | Positive integer; defaults to `20` |
| `AI_BASE_URL` | Server only | Optional trusted OpenAI-compatible endpoint override |
| `AI_JSON_MODE` | Server only | Set `off` only if compatible provider rejects JSON object mode |
| `UPSTASH_REDIS_REST_URL` | Server only | Optional quota-store REST URL; use together with token |
| `UPSTASH_REDIS_REST_TOKEN` | Server only, secret | Optional quota-store authorization |

Never prefix keys, access codes, or Redis tokens with `VITE_`; Vite public variables are bundled into browser assets. Set the relevant Vercel environment scope (Production/Preview/Development) intentionally, then redeploy when changing production settings.

The default CSP and adapter are designed for same-origin APIs. A separate `VITE_API_BASE_URL` is not a turnkey cross-origin deployment: browser CSP, backend CORS/preflight, and origin guards must also be deliberately changed. Keep the default blank for the documented deployment.

### 22.3 Step-by-step release

1. **Check the runtime.** Use Node 24.x in the project terminal/build environment.
2. **Install and verify locally.** Run:

   ```sh
   npm ci
   npm test
   npm run build
   npm run check:pwa
   npx playwright install chromium
   npm run test:browser
   ```

3. **Review secrets.** Keep local `.env*` secrets out of Git. Example files are safe templates, not places to save real keys.
4. **Push the project repository.** Include source, `api/`, `cloud-api/`, public assets, lockfile, and `vercel.json`.
5. **Import the repository in Vercel.** Use the project root as the Root Directory, not `cloud-api` or `src`.
6. **Confirm the build configuration.** Framework is Vite, install command is `npm ci`, build is `npm run build && npm run check:pwa`, output is `dist`, and runtime is Node 24.x.
7. **Deploy without AI if desired.** Missing AI settings are a valid local-first deployment; protected routes report not configured and feature services use offline processing.
8. **Configure optional AI.** Add server provider, key, and model settings. Add a strong shared access code before sharing privately/prod; leaving it unset exposes open-demo AI usage. Add quota/Redis settings as needed.
9. **Redeploy.** Environment changes must be applied to a fresh deployed function/build environment.
10. **Check `/api/health`.** Configured cloud should return JSON `status: 'ok'` and access-code mode. This is only configuration readiness.
11. **Opt in on the app.** Open Profile, enable consent, save the code if required.
12. **Perform a real feature check.** Generate a fresh summary, or start a new quiz; confirm its Cloud AI badge. Test a wrong code/quota/provider failure to confirm offline fallback.
13. **Test reference checking separately.** Review previews, consent, evidence passages, claim coverage, and fallback messaging.
14. **Test the production PWA offline.** Load online, wait for worker readiness, refresh/reopen, disconnect, import a text PDF, and run a quiz/review.
15. **Check navigation and data.** Refresh deep document routes; verify local records survive refresh; test export before destructive actions; check phone/desktop layouts.
16. **Review exposure and costs.** Inspect function errors/latency, provider allowance, quotas, access-code distribution, and applicable hosting limits before a wider release.

`vercel.json` rewrites `/student/:path*` to the app shell while leaving real API routes distinct. Function duration is set to 30 seconds, subject to the actual platform/project capabilities. Do not send `/api/*` through a catch-all HTML rewrite.

### 22.4 Disable or roll back cloud safely

To disable cloud site-wide, remove the AI key or otherwise make the provider configuration incomplete, then redeploy. **Removing `ACCESS_CODE` does not disable cloud; it makes cloud publicly accessible in open-demo mode.**

To disable cloud for one browser, use Turn off Cloud AI. Existing local notes/results remain. Rolling back a deployment does not migrate data between origins or automatically revert local schema/data changes.

For more concise deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md); use the code-grounded cautions here where older wording differs.

## 23. Troubleshooting and operational checks

| Symptom | What to inspect |
| --- | --- |
| Node still shows version 22 | The executable selected by the current terminal PATH; restart the terminal and select/install Node 24 |
| UI runs but Cloud AI never activates locally | Vite alone does not run `/api`; use a configured full-stack Vercel development/deployment environment |
| Health returns HTML | Incorrect rewrite/base URL or static host; the frontend requires JSON `status: 'ok'` |
| Health reports not configured | Provider/key/model values and the deployment environment scope; redeploy after changes |
| Health is ok but a feature shows Offline mode | Consent, code validity, provider key/model permissions, quota, output schema, source size, or timeouts |
| Code saved but unauthorized | Code must exactly match the server's configured secret after browser trimming; health does not test it |
| Several students hit one allowance | They may share an IP; the current limiter is not per authenticated device/user |
| Allowance seems inconsistent | Memory counters reset/scale; configure Redis for shared counters and monitor the provider |
| Provider rejects response format | Verify endpoint/model compatibility; try `AI_JSON_MODE=off` if JSON mode is specifically rejected |
| Provider call takes too long | 20-second provider timeout, possible retry, 28-second browser timeout, 30-second function ceiling |
| A large PDF works offline but not with cloud | Request/body/array limits can be much smaller than import limits; split the source |
| No text can be extracted | Image-only, empty, protected, damaged PDF; OCR/conversion is outside this app |
| Missing or incorrect glossary cards | Inspect Cards and edit/add terms; automatic line/definition extraction is heuristic |
| Card edits do not change cloud output/chat | Those paths use original source chunks, not edited cards |
| Reference check button is disabled | Valid excerpt/reference limits and, for AI, the reviewed-preview checkbox |
| Statement is insufficient evidence | No exact offline match, no valid quote, incomplete source, or AI inability to establish agreement/conflict |
| Chat returns unrelated notes | Zero-score TF-IDF retrieval can still return chunks; inspect source and rephrase |
| Study history disappeared | Different browser/origin, private mode, cleared/evicted storage, or device change |
| Read-aloud does not work offline | Browser Speech Synthesis and available local voices; use the visible script |
| Reminder never appears | Notification support/permission, preference, due tracked topics, Home being open, and daily suppression |
| Timer differs after suspension | It is interval-based and does not reconstruct elapsed wall-clock time |
| Build fails at icon check | Required committed PNGs and their expected dimensions |
| Browser smoke cannot start | Install Chromium or set a supported installed browser channel |

When diagnosing a cloud problem, distinguish three separate questions:

1. **Is the server configured?** Check the deployed JSON health route.
2. **Is this browser eligible?** Check online status, consent, saved code/code requirement.
3. **Does a real operation work?** Run a fresh request and inspect its effective badge and safe server/provider diagnostics.

Do not troubleshoot by copying secret keys into chat, browser code, screenshots, or public repositories.

## 24. Limitations and implementation caveats

These are current boundaries, not changes implemented by this document.

### Not implemented

- Teacher/admin dashboards, classes, enrollment, reading assessment, intervention/grouping workflows, or school-management roles.
- Per-student authentication, cloud sync, server document storage, account-based backups, or account recovery.
- OCR, handwriting/image recognition, microphone recording, speech transcription, or direct text/Word import as a primary lesson-upload flow.
- Independent factual certification, live web research, general-world-knowledge fact checking, or automatic note correction.
- Ready on-device language models despite edge extension points.
- Import/restore UI for exported JSON.
- Background push reminders or queued offline AI requests.
- Provider-specific OpenAI connection indicator, model picker, streaming chat, or provider failover.

### Important behavior to account for

- Health checks configuration only; they do not validate credentials, model availability, a shared code, or provider allowance.
- The local Cloud AI panel describes saved eligibility, not guaranteed backend/provider success.
- Quotas are code/IP/UTC-day counters, not per-account/per-device counters or a global spend cap.
- Deleting a shared code makes AI open; it does not switch the site off.
- Edited cards affect local summary/quiz-generated review, but not cloud generation, chat, or original source records.
- Offline quizzes can be shorter than five; some history UI still assumes five.
- Due-topic generation wiring does not currently enforce due-only review selection.
- Feynman results update current topic mastery but are absent from quiz-based curves and the study-time log.
- Ordinary quizzes do not persist selected technique attribution.
- Lexical retrieval and explanation coverage can be misleading; neither measures factual understanding reliably.
- Dashboard gain comparisons and mastery estimates are heuristics, not scientific/causal assessments.
- Personal-detail detection is incomplete; exports/local labels may retain sensitive data.
- PDF cleanup can remove useful material and has no separately saved original-text restore path.
- Countdown timers, local notifications, speech, and offline storage depend on browser/platform behavior.
- Local persistence can fail or be evicted; there is no guaranteed backup/durability layer.
- Large sources may exceed cloud limits; a retry can exceed the deployment/request time budget.
- The default cross-origin configuration is not ready merely by setting a frontend base URL.
- No open-source license is specified in the current repository; private package flags are not a license.

Before a broad production rollout, review these limitations alongside real browser tests, actual live-provider acceptance, privacy handling, access control, cost exposure, and the deployment audience. Passing tests alone does not certify production readiness.

## 25. Repository map and maintenance guide

```text
Study_Bunny/
|-- index.html                     Browser entry document and metadata
|-- package.json / package-lock.json
|-- .env.example                   Frontend/server configuration template
|-- vite.config.js                 Vite and PWA configuration
|-- vercel.json                    Hosting, API function limits, headers, rewrite
|-- postcss.config.js              Tailwind PostCSS integration
|-- tailwind.config.js             Shared utility configuration
|-- public/                        Logo, mascot, favicon, install icons
|-- src/
|   |-- main.jsx / App.jsx         Bootstrapping and routes
|   |-- index.css                  Design tokens/themes/shared styles
|   |-- context/Prefs.jsx          Local preferences context
|   |-- pages/student/             Home/document/quiz/review/chat/verify/profile/dashboard
|   |-- components/                Cards, audio, icons, tips, curves, Pomodoro
|   |   |-- layout/                Shared shell and page header
|   |   `-- shared/                Cloud panel, tier badge, loading/error UI
|   |-- hooks/                     Pomodoro state machine and study-time hook
|   |-- db/database.js             Single local repository and migrations
|   |-- ai/                        RAKE and definition extraction
|   |-- utils/                     PDF processing, cleanup, retrieval, transport, settings
|   `-- services/
|       |-- bkt.js / difficultyBuilder.js / techniqueEngine.js
|       |-- audioScript.js / studyTips.js
|       |-- summarize/             Tier routing, cache, summary implementations
|       |-- quiz/                  Tier routing and question generators
|       |-- spacedRepetition/      SM-2 and review orchestration
|       |-- feynman/               Explanation evaluation and attempt persistence
|       |-- diagnosis/             Technique recommendation/enrichment
|       |-- verification/          Claims, reference passages, local/cloud comparison
|       |-- home/                  Global progress derivations
|       `-- dashboard/             Per-document curve derivations
|-- api/
|   |-- health.js                  Deployed configuration-readiness route
|   |-- summarize.js / quiz.js / chat.js / feynman.js
|   |-- analyze-technique.js / verify-notes.js
|   `-- _lib/adapter.js            Vercel adapter and access/origin guards
|-- cloud-api/
|   |-- src/handlers/              Event-style AI request handlers
|   |-- src/lib/                   Model client, prompts, validators, privacy, quotas
|   |-- test/                      Backend/adapter/provider tests and model fixtures
|   |-- stubs/                     Example response fixtures
|   `-- README.md / .env.example / package.json
|-- scripts/
|   |-- generate-icons.mjs         Checks committed icon files
|   |-- check-pwa.mjs              Checks built manifest/worker/icons
|   `-- browser-smoke.mjs          Isolated offline production smoke test
|-- .github/workflows/verify.yml   Test/build/audit/browser CI
|-- .kiro/specs/                   Historical learning/notes-check proposals
|-- README.md                      Short project introduction
|-- FEATURES.md                    Existing feature overview
|-- INTEGRATION.md                 Existing persistence/API integration notes
|-- DEPLOYMENT.md                  Existing short Vercel deployment guide
|-- PROJECT_GUIDE.md               This code-grounded comprehensive guide
`-- Study_Bunny_App_Spec_v5_FINAL.md and session-matrix CSV
                                    Product/design references, not runtime code
```

Tests are colocated with many frontend modules and also live in `cloud-api/test/`. `dist/`, `.vercel/`, dependency folders, local secret files, screenshots/test results, and other generated output are ignored by Git.

### How to extend the project safely

1. Add page routes in `App.jsx` and keep navigation/deep links consistent with the shell.
2. Put reusable UI in components and pure algorithms/derivations in services or helpers.
3. Use the shared repository; do not introduce a second Dexie database for an existing feature.
4. Version additive database schema changes and test upgrades from existing records.
5. Keep a local fallback for cloud-enriched features and display the tier that produced the result.
6. Keep provider secrets server-side and route calls through the shared transport/adapter.
7. For a new API feature, add its input validator, prompt, output validator, injectable handler, route wrapper, and quota/access tests.
8. Treat source/model text as untrusted. Preserve redaction, body limits, safe errors, and content-free diagnostics.
9. Test sparse documents, malformed content, offline mode, denied permissions, save failures, and cloud failures—not only successful cases.
10. Rebuild and check the PWA when changing assets, the PDF worker, routing, or deployment headers.
11. Review origin/CSP/CORS together if moving the API to another host.
12. Update this guide, example environment files, and shorter integration/deployment docs when behavior changes.

### Reading historical documents

[README.md](./README.md), [FEATURES.md](./FEATURES.md), [INTEGRATION.md](./INTEGRATION.md), [DEPLOYMENT.md](./DEPLOYMENT.md), and [cloud-api/README.md](./cloud-api/README.md) provide useful shorter introductions. Some wording lags the current code: examples include React Router version, five-question guarantees, per-device quotas, global review redirect behavior, requiring an access code for health, and treating removal of an access code as disabling AI.

The final app specification, session-matrix CSV, and `.kiro/specs/` explain product intentions and older proposals. In particular, the historical notes-fact-check proposal is not the same as the implemented reference-based checker. Shared libraries also retain unused intervention helpers and earlier cloud terminology; there is no mounted teacher/intervention feature because those helpers exist.

For actual behavior, prioritize current routes, service call sites, database code, deployed API wrappers, and passing tests over aspirational specifications or stale comments.
