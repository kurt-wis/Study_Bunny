# Notes Fact-Check — Requirements

## Introduction

Study Bunny today treats a student's uploaded notes as the **single source of
truth**. Every AI feature is grounded "notes-only": chat answers only from the
supplied chunks, summaries use only the provided context, quizzes are built only
from the notes. This guarantees privacy and prevents hallucination, but it has a
deliberate blind spot — **if the notes themselves contain a factual error, the
app faithfully reproduces that error** in summaries, quizzes, and chat.

This feature adds an **opt-in, clearly-labeled "Check my notes for errors"**
capability: it extracts factual claims from a document, asks whether each is
likely correct, and when a claim appears wrong it surfaces a **suggested
correction with a confidence level** and a visible disclaimer. It is the one
feature that is intentionally allowed to use **outside/world knowledge**.

Because fact-checking fundamentally requires world knowledge that the offline
deterministic tier does not have, this feature is **Cloud-tier only (Tier 2)**.
At the Deterministic tier it does not pretend to verify; it reports
"verification unavailable offline" and offers no corrections. This is an
explicit, honest degradation, consistent with the app's tier-integrity rule.

### Relationship to existing guarantees (non-negotiable)

- **Grounding isolation.** The existing chat/summarize/quiz "notes-only"
  contract MUST NOT change. Fact-check runs on a **separate code path and a
  separate endpoint** with its own prompt that is allowed outside knowledge. No
  existing prompt is relaxed.
- **Privacy (INTEGRATION.md §3.2).** Only extracted text claims/chunks are sent
  to the backend — never the PDF file, filename, or any student/teacher
  identity. Content-free logging is preserved.
- **Offline-first (FEATURES.md §1, §8).** The app remains fully usable offline;
  this feature simply has no offline capability and says so plainly.
- **Additive schema (INTEGRATION.md §1.3).** Any persistence is a new Dexie
  version / new store, never a mutation of a frozen store.
- **Student safety.** Corrections are presented as **AI suggestions with
  confidence, not authoritative truth**, with a standing disclaimer that the
  student should confirm against an authoritative source (textbook/instructor).

---

## Requirements

### Requirement 1 — Opt-in, clearly-labeled entry point

**User story:** As a student, I want to explicitly ask the app to check my notes
for possible errors, so I stay in control and understand the result is AI advice.

#### Acceptance criteria

1. WHEN a student is viewing a document THEN the system SHALL expose an opt-in
   "Check my notes for errors" action that is clearly distinct from the
   notes-only summary/quiz/chat features.
2. WHEN the fact-check feature is shown THEN the system SHALL display a standing
   disclaimer that results are AI-generated suggestions, may be imperfect, and
   are not a substitute for an authoritative source.
3. The system SHALL NOT run fact-checking automatically or in the background; it
   runs only on explicit student request.

### Requirement 2 — Claim extraction from the student's notes

**User story:** As a student, I want the app to pull out the checkable factual
statements from my notes, so the check is specific rather than vague.

#### Acceptance criteria

1. WHEN a fact-check is requested THEN the system SHALL identify candidate
   factual claims from the document's chunks (definitions, dates, named
   relationships, numeric facts), each tied to its source `chunkId`.
2. The system SHALL cap the number of claims checked per request (default 10) to
   bound cost and response size.
3. The system SHALL send only claim text and the relevant anonymous chunks to the
   backend — never the PDF file, filename, or any identity (INTEGRATION.md §3.2).

### Requirement 3 — Cloud fact-check and suggested correction

**User story:** As a student, I want to know which statements in my notes look
wrong and what the correct version is, so I can fix my understanding.

#### Acceptance criteria

1. WHEN fact-checking runs at the **Cloud tier** THEN for each claim the system
   SHALL return a verdict of `correct` | `likely_incorrect` | `uncertain`, a
   confidence level (`low` | `medium` | `high`), and — only when the verdict is
   `likely_incorrect` — a suggested correction and a short rationale.
2. WHEN a verdict is `uncertain` THEN the system SHALL NOT fabricate a
   correction; it SHALL say it could not verify the claim.
3. The system SHALL display each result anchored to the source passage
   (`chunkId` / page) so the student can locate it in their notes.
4. The response SHALL be rendered with the standing disclaimer (Req 1.2) always
   visible alongside corrections.

### Requirement 4 — Tier integrity and honest offline degradation

**User story:** As a student offline, I want the app to tell me honestly that it
cannot fact-check right now, rather than guessing.

#### Acceptance criteria

1. The system SHALL resolve the effective tier per invocation via the existing
   `resolveTier` (feature key `factcheck`), never caching a prior decision.
2. WHEN the effective tier is **Deterministic** (offline or cloud unavailable)
   THEN the system SHALL display "Fact-check needs an internet connection
   (Cloud AI)" and SHALL NOT produce verdicts or corrections — there is no
   deterministic fact-check path.
3. IF a Cloud fact-check call fails mid-flight THEN the system SHALL catch the
   error and show the same honest "verification unavailable" state labeled
   "Offline mode" — never an error screen and never a fabricated result.
4. The system SHALL display the **effective** tier (text + icon via `TierBadge`),
   never the preference, on the fact-check screen.

### Requirement 5 — Grounding isolation (do not pollute notes-only features)

**User story:** As a maintainer, I want fact-check's outside-knowledge path kept
strictly separate, so the privacy/grounding guarantees of the other features are
untouched.

#### Acceptance criteria

1. The system SHALL implement fact-check via a **new endpoint**
   (`POST /api/verify-notes`) and a **new client service**, with no change to the
   chat/summarize/quiz prompts or validators.
2. The fact-check prompt SHALL be the ONLY prompt permitted to use world
   knowledge; it SHALL remain confined to this feature.
3. The backend SHALL reject PII-looking fields at the boundary with
   `400 VALIDATION_ERROR` and SHALL use content-free logging, matching the
   existing handlers.

### Requirement 6 — Optional persistence (additive)

**User story:** As a student, I want to revisit a past fact-check result, so I do
not have to re-run it.

#### Acceptance criteria

1. IF fact-check results are persisted THEN the system SHALL store them via a new
   Dexie version / new store (e.g. `factCheckResults`), preserving all existing
   stores and indexes (INTEGRATION.md §1.3).
2. Persistence SHALL route through `src/db/database.js` helpers only; no feature
   SHALL open its own Dexie connection.
3. Stored results SHALL carry the tier that produced them and a timestamp.
   (Persistence MAY be deferred to a later minor version — see design open
   decision — in which case results are session-only.)

### Requirement 7 — Safety and accessibility

**User story:** As a student, I want corrections presented responsibly and
accessibly.

#### Acceptance criteria

1. The system SHALL present corrections as suggestions with confidence, never as
   unqualified truth, and SHALL always show the Req 1.2 disclaimer.
2. The system SHALL meet the shell accessibility baseline: ≥48×48px touch
   targets, WCAG AA contrast, verdict conveyed by text + icon (never color
   alone), and async results announced in a live region (FEATURES.md §9).
3. WHEN there are no checkable claims or no results THEN the system SHALL show an
   informative empty state rather than an error.
