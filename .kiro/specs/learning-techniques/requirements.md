# Learning Techniques — Requirements

## Introduction

Study Bunny already turns uploaded PDF notes into adaptive quizzes with per-topic
BKT mastery tracking, offline-first across three tiers (Cloud → Edge → Deterministic).
This feature adds **evidence-based learning techniques** on top of that loop, so the
app can answer not just *"what don't you know?"* but *"how should you study it?"*.

Scope is deliberately limited to the **three techniques named in the Session Matrix
CSV**: **Pomodoro**, **Feynman**, and **Spaced Repetition**. Each technique has a
behavior inside a quiz session and inside a new review session, a defined tier
compatibility, and the extra persisted data it needs. Techniques beyond these three
(Elaborative Interrogation, Interleaved Practice, Mind Mapping) and all Teacher-Mode
functionality are explicitly out of scope.

The merge decisions below reconcile three source documents:

- **FEATURES.md** — the shipped student experience and shared platform contract.
- **Study Bunny App Spec v5** — the technique-diagnosis loop, Review section, and Dashboard.
- **Learning Techniques / Session Matrix CSV** — the authoritative list of the three
  techniques, their per-session behavior, tier compatibility, and new data.

Where v5 described a broader set of techniques, the CSV wins: only the three it lists
are built. Where v5 and FEATURES.md conflict on data-layer rules, the frozen
`INTEGRATION.md` contract wins (additive, versioned schema changes only).

### Guiding constraints (inherited, non-negotiable)

- **Offline-first.** Every technique must be fully usable at the Deterministic tier
  with no network. Cloud only enriches; it never gates.
- **On-device only.** All data stays in IndexedDB (`StudyBunnyDB`). No accounts, no sync.
- **Additive schema.** Schema changes add a new Dexie version; no store or index is
  renamed or removed (INTEGRATION.md §1.3).
- **Accessibility.** 48×48px touch targets, WCAG AA contrast, text+icon never
  color-only, live-region announcements for async results (FEATURES.md §9).

---

## Requirements

### Requirement 1 — Technique selection and persistence

**User story:** As a student, I want to choose a learning technique for a document and
have the app remember it, so my study sessions and recommendations are consistent.

#### Acceptance criteria

1. WHEN a student opens a document THEN the system SHALL expose the three techniques
   (Pomodoro, Feynman, Spaced Repetition) plus the default plain quiz/review flow.
2. WHEN a student selects a technique for a document THEN the system SHALL persist the
   selection keyed by `documentId` and reuse it on the next visit.
3. WHEN no technique has been selected for a document THEN the system SHALL default to
   the existing plain quiz/review behavior with no technique applied.
4. WHEN a student changes the selected technique THEN the system SHALL apply the new
   technique to subsequent sessions without altering past session records.
5. The system SHALL store technique selection in a way that is additive to the frozen
   schema (a new store or an `appSettings` key), never by mutating an existing store's
   contract.

### Requirement 2 — Pomodoro (timed focus blocks)

**User story:** As a student, I want timed study blocks with optional phone-focus, so I
can concentrate in short, repeatable bursts.

#### Acceptance criteria

1. The system SHALL run Pomodoro purely client-side and SHALL make it available at
   **all tiers** with no network dependency.
2. WHEN a student starts a Pomodoro quiz block or review block THEN the system SHALL
   run a countdown timer (default 25-minute focus / 5-minute break, configurable) and
   SHALL display remaining time.
3. WHEN a focus block ends THEN the system SHALL announce the transition (break or next
   block) via a screen-reader live region and a visible state change.
4. The system SHALL offer an **optional, permission-based, revocable** focus mode; WHEN
   the student declines or revokes the permission THEN the timer SHALL still function
   without the focus/phone-lock behavior.
5. WHEN a student pauses, resumes, or cancels a timer THEN the system SHALL persist the
   timer state and focus-mode permission in `appSettings` so a reload restores it.
6. The system SHALL NOT require Pomodoro; a student can take any quiz or review session
   without a timer.

### Requirement 3 — Feynman (explain-to-learn)

**User story:** As a student, I want to explain a topic in my own words and get feedback
on what I missed, so I can find the gaps in my understanding.

#### Acceptance criteria

1. WHEN a student finishes a quiz on a weak topic THEN the system SHALL offer a Feynman
   "explain this topic" prompt for that topic.
2. WHEN a student is in a Feynman review session THEN the system SHALL present an
   "explain without looking" prompt with a hide-then-reveal source passage.
3. WHEN the student submits an explanation at the **Deterministic tier** THEN the system
   SHALL compute a TF-IDF similarity between the explanation and the topic's source
   chunks, surface matched passages, list unmatched key terms as "possible gaps," and
   let the student self-rate (Got it / Partially / Missed it).
4. WHEN the student submits an explanation at the **Cloud tier** THEN the system SHALL
   send only the explanation text plus the relevant anonymous chunks to the backend,
   and SHALL display an AI assessment of coverage and gaps.
5. IF a Cloud Feynman evaluation fails mid-flight THEN the system SHALL fall back to the
   Deterministic TF-IDF path and label the result "Offline mode" (per FEATURES.md §1).
6. WHEN a Feynman attempt completes THEN the system SHALL store the attempt (prompt,
   explanation text, self-rating or AI score, tier, timestamp) associated with the
   document and topic, and SHALL update BKT mastery from the outcome.
7. The system SHALL never send the PDF file, filename, or any identity to the backend —
   only extracted chunks and the explanation text (INTEGRATION.md §3.2).

### Requirement 4 — Spaced Repetition (SM-2 scheduling)

**User story:** As a student, I want the app to resurface topics right before I'd forget
them, so my review time is spent where it matters.

#### Acceptance criteria

1. The system SHALL implement spacing with a **deterministic SM-2 algorithm** available
   at **all tiers** with no network dependency.
2. WHEN a student answers a quiz or review question for a topic THEN the system SHALL
   update that topic's `interval`, `easeFactor`, and `nextReviewDate` using SM-2, in
   addition to the existing BKT mastery update.
3. WHEN generating a Spaced-Repetition session THEN the system SHALL prioritize topics
   whose `nextReviewDate` is due (or overdue), breaking ties by lowest BKT mastery.
4. WHEN a student reviews a concept in a Spaced-Repetition review session THEN the
   system SHALL let the student rate confidence, and SHALL feed that rating into the
   SM-2 update (quality score).
5. WHEN a session completes THEN the system SHALL show the next due date for the topics
   reviewed and SHALL surface the topic's learning curve over past attempts.
6. The system SHALL store SM-2 fields **additively** on the `knowledgeState` records
   (`interval`, `easeFactor`, `nextReviewDate`) via a new Dexie version, preserving all
   existing `knowledgeState` records and the `[documentId+topic]` index.
7. The system SHALL NOT depend on push notifications or background tasks; due topics are
   computed on demand when the student opens the app (FEATURES.md §8, v5 §12 Won't-Have).

### Requirement 5 — Review section

**User story:** As a student, I want a guided review mode where I pick a technique and a
document and run a technique-specific session, so I can act on the app's recommendation.

#### Acceptance criteria

1. WHEN a student enters Review THEN the system SHALL let them pick one of the three
   techniques (with any AI/rule recommendation highlighted) and then a document.
2. WHEN a document is shown for selection THEN the system SHALL display its weak topics
   (BKT mastery < 0.6) so the student can focus.
3. WHEN a review session runs THEN the system SHALL generate the session in the style of
   the chosen technique and at the effective tier, reusing the existing quiz engine
   where the technique is quiz-shaped (Spaced Repetition) and the text-input flow where
   it is explanation-shaped (Feynman).
4. WHEN a review session completes THEN the system SHALL show results, update BKT mastery
   (and SM-2 for Spaced Repetition), and tag the result with `source: 'review'` and the
   `technique` used.
5. The system SHALL reach Review from the post-quiz recommendation CTA and from a
   top-level Review entry on a document.

### Requirement 6 — Post-quiz technique diagnosis and recommendation

**User story:** As a student, I want the app to tell me when my study method isn't working
and suggest a better one, so I stop wasting time on ineffective techniques.

#### Acceptance criteria

1. WHEN a quiz completes with a score below 70% OR a topic's mastery has plateaued over
   3+ attempts THEN the system SHALL show a technique diagnosis.
2. WHEN diagnosing at the **Deterministic tier** THEN the system SHALL use the rule-based
   recommendation engine (effectiveness tiers + plateau detection) and SHALL cite the
   supporting evidence (e.g. Dunlosky et al., 2013).
3. WHEN diagnosing at the **Cloud tier** THEN the system SHALL send weak topics, current
   technique, and mastery history (no identity, no PDF) and SHALL show a personalized
   analysis; on failure it SHALL fall back to the Deterministic rule-based result.
4. The recommendation SHALL only ever recommend one of the three in-scope techniques (or
   "keep going"); it SHALL NOT recommend an unimplemented technique.
5. WHEN a recommendation is shown THEN the system SHALL offer a CTA that opens Review
   pre-set to the recommended technique and the current document.

### Requirement 7 — Dashboard (learning curve)

**User story:** As a student, I want to see my mastery over time and how switching
techniques changed it, so I can trust that the method matters.

#### Acceptance criteria

1. WHEN a student opens the Dashboard for a document THEN the system SHALL render a
   learning curve of mastery per attempt over time, ordered by timestamp, using the
   persisted quiz/review records (no charting library — pure CSS/HTML per v5 §8.4).
2. WHEN results span more than one technique THEN the system SHALL color/label the curve
   by technique and SHALL mark the inflection point where the technique first changed.
3. The Dashboard SHALL show current per-topic mastery bars and a per-technique
   effectiveness comparison (average mastery gain per session by technique).
4. WHEN there is insufficient data THEN the system SHALL show an empty/encouraging state
   rather than an error.

### Requirement 8 — Tier integrity and graceful degradation

**User story:** As a student on an unreliable connection, I want every technique to keep
working and to tell me honestly what powered the result.

#### Acceptance criteria

1. The system SHALL resolve the effective tier **per invocation** via the existing
   `resolveTier`, never caching a prior decision (INTEGRATION.md §2).
2. WHEN a cloud call fails after cloud was selected THEN the feature's orchestrator
   SHALL catch the error, run the Deterministic path, and display "Offline mode."
3. The system SHALL display the **effective** tier (text + icon via `TierBadge`), never
   the preference, on every technique screen.
4. Pomodoro and Spaced Repetition SHALL have no cloud path at all; Feynman and the
   technique diagnosis SHALL have a cloud path that enriches but never gates.

### Requirement 9 — Data layer additivity

**User story:** As a maintainer, I want the new data to extend the frozen schema cleanly,
so existing documents and mastery survive the upgrade.

#### Acceptance criteria

1. The system SHALL introduce a new `db.version(2)` block that adds any new store(s) and
   the additive `knowledgeState` fields, preserving all v1 data (INTEGRATION.md §1.3).
2. The system SHALL route every read/write through `src/db/database.js` helpers; no
   feature SHALL open its own Dexie connection.
3. New repository helpers SHALL follow the existing naming and Promise-returning style,
   and SHALL be documented as an additive (minor) bump to the integration contract.
