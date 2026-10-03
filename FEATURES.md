# Study Bunny — Feature Overview (Student Mode)

> Offline-first study companion for Filipino college students.
> Upload notes → get a summary → take an adaptive quiz → track topic mastery → ask your notes questions.
> **Teacher Mode is excluded from this document** — everything below is the student experience plus the shared platform it runs on.

---

## 1. Three-Tier Graceful Degradation

Every AI-powered feature resolves its tier **per invocation** and shows the user which tier produced the result. The app is fully usable at the lowest tier with zero internet.

| Tier | Name | Powered by | Requires |
|------|------|-----------|----------|
| Tier 2 | **Cloud AI** | AWS Bedrock (Claude 3 Haiku) via Lambda | Internet + healthy `/api/health` |
| Tier 1 | **On-device AI** | On-device small language model (stretch goal; not registered in MVP) | Ready edge provider |
| Tier 3 | **Offline mode** | Pure-JS deterministic algorithms (RAKE, TF-IDF, BKT) | Nothing — always available |

- Resolution order per call: Cloud → Edge → Deterministic.
- A manual tier preference that is unavailable **silently falls through** to the best available tier; the UI always shows the *effective* tier, never the preference.
- If a cloud call fails **mid-flight**, the feature catches the error and re-runs its Tier 3 path **without re-resolving**, then displays "Offline mode."
- The effective tier is shown as a **text + icon badge** (never color alone) via `TierBadge`.

---

## 2. PDF Ingestion

- **Drag-and-drop or click-to-browse** PDF upload (`StudentHome`).
- Text extraction with **PDF.js**, page by page, preserving page numbers.
- **Sentence-aware chunking**: ~400-token windows with ~50-token overlap, splitting on sentence boundaries.
- Each chunk gets a **stable `chunkId`** (`${documentId}-${index}`) and a token estimate.
- Document + chunks persisted to **IndexedDB** (via the shared repository).
- Graceful failure: scanned/empty/protected PDFs show a recoverable error and let the user pick another file.
- Extraction progress is announced to screen readers via `role="status"`.

## 3. Summarization

Produces a structured study summary with a shared shape across tiers:

- **Overview** — top keyword-dense sentences assembled into a readable paragraph.
- **Key topics** — up to 10 keyword phrases.
- **Key concepts** — term + explanation (importance & common mistakes added at the cloud tier).
- **Study outline** — topic clusters grouped by sentence co-occurrence.
- **Tier 3 (offline):** RAKE keyword extraction + top-5 sentence selection, fully deterministic.
- **Tier 2 (cloud):** richer AI-generated concepts and outline.
- **Per-document, per-tier caching** — a summary is generated once per `(documentId, tier)` and reused on repeat visits.

## 4. Adaptive Quizzes

- Generates **5 questions** per quiz.
- **Tier 3 (offline):** 3 fill-in-the-blank + 2 true/false, derived from RAKE keywords; auto-padded to 5 if source text is thin.
- **Tier 2 (cloud):** multiple-choice with distractor explanations.
- **Weak-topic bias** — questions favor topics the student has the lowest mastery on.
- Tap/type answer flow with immediate per-question feedback and explanations.
- Fill-in-the-blank accepts case variations; true/false uses labeled options.
- Quiz records (questions, score, tier, timestamp) saved to IndexedDB; **quiz history** is viewable per document.
- Accessible: each question in a `fieldset`/`legend`, results surfaced in a live region with focus movement.

## 5. BKT Mastery Tracking

- **Bayesian Knowledge Tracing** engine, pure JS, 100% offline.
- Parameters: `pInit = 0.3`, `pLearn = 0.2`, `pSlip = 0.1`, `pGuess = 0.25`.
- After every answer, per-topic mastery is updated (Bayes posterior + learning transition) and **clamped to [0.01, 0.99]**.
- A correct answer never decreases mastery (monotonic-on-correct invariant).
- **Weak-topic detection** (mastery < 0.6) feeds back into future quiz generation.
- Mastery is visualized as **per-topic progress bars** (color + percentage + label: Needs work / Learning / Mastered).

## 6. "Ask My Notes" Chat

- Retrieval-grounded Q&A over the student's own document.
- **TF-IDF index** (pure JS, log₂ IDF, 25-word stoplist, sub-3-char tokens dropped) built over the document's chunks.
- **Tier 3 (offline):** returns the top 3 matching passages verbatim with source references — no generated prose.
- **Tier 2 (cloud):** sends the top 5 chunks + the question; returns a grounded answer with **citations validated against the supplied chunk IDs**.
- If no chunk supports an answer, returns an explicit **"not found in your notes"** message.
- **Privacy guarantee:** only extracted text chunks and the question are ever sent to the cloud — never the PDF file, filename, or any identity.
- Chat history persisted per document.

---

## 7. Shared Platform Foundation

The thin layer every feature builds on (owned by the Platform Foundation spec).

### App shell & navigation
- React 18 + Vite single-page app with React Router.
- Renders instantly from cache; network state checked lazily at feature-invocation time, not at boot.

### Local persistence (IndexedDB via Dexie)
- Single database `StudyBunnyDB`, accessed only through the shared repository (features never open their own connection).
- Student-mode stores: `documents`, `summaries`, `quizzes`, `knowledgeState` (compound `[documentId+topic]` index), `chatHistory`, plus a string-keyed `appSettings`.
- All student data stays **on-device**. No accounts, no login, no sync.

### API transport
- `apiHealthCheck()` + `apiPost()` against a build-time `VITE_API_BASE_URL`.
- **No credentials on the client.** The base URL is configuration, not a secret.

### Cloud backend (optional Tier 2 enhancement)
- Node.js Lambda handlers behind API Gateway invoking Amazon Bedrock (Claude 3 Haiku).
- Endpoints used by Student Mode: `/api/health`, `/api/summarize`, `/api/quiz`, `/api/chat`.
- Request validation + content-free logging; no PDF bytes, filenames, or identities accepted.
- The app is fully functional **without** this backend — it just unlocks the richer cloud tier.

---

## 8. Progressive Web App (Offline-First)

- Installable PWA (web app manifest + service worker via `vite-plugin-pwa`).
- **Cache-first** for static build assets (JS/CSS/HTML/icons); **network-or-cache** for navigation.
- **Never caches** `/api/*` responses or IndexedDB content — user data lives only in IndexedDB.
- Shell + first screen render on re-open with no network round-trip.

## 9. Accessibility & Mobile

- Minimum **48 × 48 px** touch targets on all primary interactive elements.
- **WCAG AA** contrast (4.5:1 body text, 3:1 large text / UI components).
- Responsive, single-column at narrow widths; **no horizontal scroll at 320 px**.
- Mode and tier conveyed in **text labels**, not color alone.
- Loading, empty, and error states throughout (spinners, `role="alert"` errors, screen-reader announcements).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite |
| Styling | Tailwind CSS 3 |
| Local DB | Dexie.js (IndexedDB) |
| Routing | React Router v6 |
| PDF | PDF.js (`pdfjs-dist`) |
| PWA | vite-plugin-pwa (Workbox) |
| Offline AI | Pure-JS RAKE, TF-IDF, BKT (zero dependencies) |
| Cloud AI (optional) | AWS Lambda + API Gateway + Bedrock (Claude 3 Haiku) |

---

*Excluded by request: Teacher Mode (classroom setup, tap-based reading assessment, auto-grouping, intervention plans, and the class progress/heatmap dashboard).*
