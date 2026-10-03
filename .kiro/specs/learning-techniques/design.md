# Learning Techniques — Design

## Overview

This design layers three evidence-based learning techniques (Pomodoro, Feynman,
Spaced Repetition) onto Study Bunny's existing student loop. It reuses what already
ships — the Dexie repository, `resolveTier`, the quiz engine (RAKE/TF-IDF/BKT + cloud
tiers), `TierBadge`, and the accessibility baseline — and adds a Review section, a
Dashboard, a technique-recommendation engine, and the small amount of new persisted
state each technique needs.

The design is driven by the Session Matrix CSV, which fixes the behavior and data:

| Technique | Quiz session | Review session | Tiers | New data |
|-----------|--------------|----------------|-------|----------|
| Pomodoro | Timed quiz blocks + optional revocable focus mode | Timed review blocks for summary/notes | All (pure client) | `appSettings`: focus-mode permission, timer state |
| Feynman | Post-quiz "explain this topic" (AI eval / keyword self-compare) | "Explain without looking", hide-then-reveal | Cloud (AI eval) + Deterministic (TF-IDF) | Feynman attempts stored with records |
| Spaced Repetition | Topics prioritized by `nextReviewDate` + BKT; intervals adapt | Due concepts surfaced; confidence rating; curve shown | All (deterministic SM-2) | `knowledgeState`: +`nextReviewDate`, +`interval`, +`easeFactor` |

### Design principles

- **Additive only.** New Dexie version 2; no v1 store or index is renamed or removed.
- **Reuse before rebuild.** Spaced Repetition reuses `generateQuiz`; Feynman reuses the
  TF-IDF index and the chat-style cloud transport; Pomodoro is a pure-client UI overlay.
- **Tier parity.** Every technique works at Deterministic tier offline. Cloud only
  enriches Feynman evaluation and technique diagnosis, with mid-flight fallback.
- **No new heavy deps.** Charts are CSS/HTML; SM-2 and the recommendation engine are
  pure JS, consistent with the existing zero-dependency offline services.

---

## Architecture

```
src/
├── services/
│   ├── techniqueEngine.js        NEW — technique registry + recommendation engine
│   ├── spacedRepetition/
│   │   ├── sm2.js                NEW — pure SM-2 (interval, easeFactor, nextReviewDate)
│   │   └── index.js              NEW — due-topic selection, session orchestration
│   ├── feynman/
│   │   ├── index.js              NEW — tier router + mid-flight fallback
│   │   ├── feynmanTier3.js       NEW — TF-IDF coverage + unmatched-keyword gaps
│   │   └── feynmanTier2.js       NEW — cloud explanation evaluation
│   ├── diagnosis/
│   │   ├── index.js              NEW — tier router for technique diagnosis
│   │   └── diagnosisTier2.js     NEW — cloud personalized analysis
│   ├── bkt.js                    REUSE
│   ├── difficultyBuilder.js      REUSE
│   └── quiz/                     REUSE (SR sessions call generateQuiz)
├── hooks/
│   └── usePomodoro.js            NEW — timer state machine, persists to appSettings
├── components/
│   ├── shared/ (TierBadge, LoadingSpinner, ErrorMessage)  REUSE
│   ├── PomodoroTimer.jsx         NEW
│   ├── TechniqueCard.jsx         NEW
│   └── LearningCurve.jsx         NEW — pure CSS/SVG line chart
├── pages/student/
│   ├── StudentHome.jsx           REUSE
│   ├── StudentDocument.jsx       EDIT — add Review + Dashboard tabs/links, technique picker
│   ├── StudentQuiz.jsx           EDIT — optional Pomodoro overlay, post-quiz diagnosis, Feynman prompt
│   ├── StudentReview.jsx         NEW — technique pick → module pick → session → results
│   ├── StudentDashboard.jsx      NEW — learning curve, mastery bars, effectiveness
│   └── StudentChat.jsx           REUSE
├── db/database.js                EDIT — version(2): SR fields + feynmanAttempts + technique store
└── utils/ (tfidf, tierDetection, apiTransport, chunkRecords, documentProcessor)  REUSE

cloud-api/ (optional Tier 2)
├── src/handlers/analyzeTechnique.js   NEW — POST /api/analyze-technique
├── src/handlers/feynman.js            NEW — POST /api/feynman (explanation eval)
└── template.yaml                      EDIT — add the two functions (least-privilege)
```

### Routing additions (`App.jsx`)

```
/student/document/:id/review      → StudentReview
/student/document/:id/dashboard   → StudentDashboard
```

Review accepts optional query params to pre-set the recommended technique:
`/student/document/:id/review?technique=spaced_repetition`.

---

## Data model (Dexie version 2 — additive)

```js
db.version(2).stores({
  // unchanged v1 stores kept verbatim
  documents: '++id, title, createdAt',
  summaries: '++id, documentId, tier, createdAt',
  quizzes: '++id, documentId, tier, createdAt',
  knowledgeState: '++id, documentId, topic, [documentId+topic], nextReviewDate',
  chatHistory: '++id, documentId, timestamp',
  appSettings: 'key',
  // new stores
  studyTechniques: '++id, documentId, [documentId]',   // selected technique per document
  feynmanAttempts: '++id, documentId, topic, createdAt',
}).upgrade(async tx => {
  // Backfill SM-2 fields on existing knowledgeState rows (idempotent, additive).
  await tx.table('knowledgeState').toCollection().modify(r => {
    if (r.interval === undefined) r.interval = 0;
    if (r.easeFactor === undefined) r.easeFactor = 2.5;
    if (r.nextReviewDate === undefined) r.nextReviewDate = null;
  });
});
```

Notes:
- Adding the `nextReviewDate` index to `knowledgeState` is index-additive; the existing
  `[documentId+topic]` compound index is preserved, so no v1 record is lost.
- `quizzes` records gain two optional fields, `source: 'quiz' | 'review'` and
  `technique: string | null`, written by the orchestrators. These are record-shape
  additions (owned by this feature), not index changes, so no schema bump is needed for
  them beyond what version 2 already declares.

### New record shapes

```js
// studyTechniques
{ id, documentId, technique: 'pomodoro'|'feynman'|'spaced_repetition'|null, setAt }

// feynmanAttempts
{ id, documentId, topic, prompt, explanation,
  tier, selfRating: 'got_it'|'partial'|'missed'|null,
  aiScore: number|null, matchedKeywords: string[], missedKeywords: string[], createdAt }

// knowledgeState (additive fields)
{ ...existing, interval: number, easeFactor: number, nextReviewDate: Date|null }

// appSettings (string-keyed)
{ key: 'pomodoro.state', value: { phase, remainingMs, cycleCount, running, updatedAt } }
{ key: 'pomodoro.focusPermission', value: boolean }
```

### Repository helpers (additive — contract bump 1.0.0 → 1.1.0)

```
getStudyTechnique(documentId) -> Promise<object|undefined>
setStudyTechnique(documentId, technique) -> Promise<number>   // upsert
saveFeynmanAttempt(attempt) -> Promise<number>
getFeynmanAttempts(documentId, topic?) -> Promise<object[]>
getDueTopics(documentId, now = new Date()) -> Promise<{topic, mastery, nextReviewDate}[]>
updateSchedule(documentId, topic, { interval, easeFactor, nextReviewDate }) -> Promise<number>
```

`updateKnowledgeState` keeps its existing signature; a sibling `updateSchedule` writes
the SM-2 fields so the BKT mastery update path is untouched.

---

## Components and services

### 1. Technique engine (`services/techniqueEngine.js`)

Holds the registry restricted to the three in-scope techniques plus the passive
techniques used only as *diagnosis inputs* (what the student says they currently do):

```js
export const TECHNIQUES = {
  pomodoro:          { name: 'Pomodoro', kind: 'timer', effectiveness: 'moderate' },
  feynman:           { name: 'Feynman', kind: 'explain', effectiveness: 'high' },
  spaced_repetition: { name: 'Spaced Repetition', kind: 'quiz', effectiveness: 'high' },
};

// Current-habit inputs for the pre-quiz survey (NOT buildable sessions):
export const CURRENT_HABITS = { rereading, highlighting, summarizing, flashcards, ... };

export function recommendTechnique({ currentHabit, quizScore, weakTopics, masteryHistory }) {
  // score >= 0.7 → keep. plateau or low-effectiveness habit → recommend a HIGH technique.
  // Only ever returns 'feynman' or 'spaced_repetition' (or keep). Never an unbuilt one.
}
```

This resolves the v5-vs-CSV conflict: v5's recommendation engine references techniques
like `practice_test`/`interleaved`; here the recommender's **output** is constrained to
the three built techniques, while the passive habits remain valid **inputs** to diagnose.

### 2. Pomodoro (`hooks/usePomodoro.js` + `components/PomodoroTimer.jsx`)

- A `useReducer` timer state machine: `idle → focus → break → focus …`, default
  25/5 minutes, configurable. Ticks via `setInterval`, persists `{phase, remainingMs,
  cycleCount, running}` to `appSettings['pomodoro.state']` on every pause/resume/cancel
  and on unmount so a reload restores it.
- Focus mode is an optional capability: on opt-in it may use the Screen Wake Lock API
  (`navigator.wakeLock`) where available; it is permission-based and revocable, and its
  absence never blocks the timer. (No real "phone lock" exists on the web; wake-lock is
  the honest, in-scope approximation and degrades silently.)
- `PomodoroTimer` renders remaining time, phase, and controls (≥48px), and announces
  phase transitions in a `role="status"` live region.
- Pomodoro is an **overlay**: it wraps the existing quiz/review/summary screens and never
  changes their logic, satisfying "all tiers, pure client, optional."

### 3. Spaced Repetition (`services/spacedRepetition/`)

`sm2.js` — pure SM-2:

```js
// quality q in [0..5] derived from correctness + optional confidence rating.
export function sm2({ interval, easeFactor, repetitions }, quality) {
  // q < 3 → repetitions = 0, interval = 1 (relearn)
  // q >= 3 → interval: 1, then 6, then round(prev * easeFactor)
  // easeFactor += 0.1 - (5-q)*(0.08 + (5-q)*0.02), floored at 1.3
  // nextReviewDate = now + interval days
  return { interval, easeFactor, repetitions, nextReviewDate };
}
```

`index.js` — orchestration:
- `getDueTopics` reads `knowledgeState`, returns topics with `nextReviewDate <= now`
  (or null = never scheduled), sorted by due-ness then ascending mastery.
- A Spaced-Repetition session calls the existing `generateQuiz(documentId, {weakTopics})`
  so question generation and tier handling are entirely reused.
- After each answer, it runs **both** `updateMastery` (BKT) and `sm2` → `updateSchedule`.
- Confidence rating (review session) maps to the SM-2 quality score.

### 4. Feynman (`services/feynman/`)

- `index.js` resolves the tier via `resolveTier({ feature: 'feynman' })`. Cloud path
  wrapped in try/catch; on any failure it runs `feynmanTier3` and relabels to
  `deterministic` ("Offline mode"), matching FEATURES.md §1.
- `feynmanTier3.js` builds a TF-IDF query from the student's explanation against the
  topic's chunks (reusing `utils/tfidf.js`), returns matched passages + unmatched key
  terms as "possible gaps," and collects a Got-it / Partial / Missed self-rating.
- `feynmanTier2.js` posts `{ explanation, chunks: [{chunkId, text}] }` to `/api/feynman`
  (chunks only, no identity, no file) and renders the AI coverage/gap assessment.
- Either way, `saveFeynmanAttempt` persists the attempt and BKT mastery is updated from
  the outcome (self-rating or AI score mapped to correct/incorrect-ish signal).

### 5. Technique diagnosis (`services/diagnosis/`)

- Invoked from `StudentQuiz` results when `score < 0.7` or a 3-attempt plateau is
  detected (`|mastery[n] - mastery[n-2]| < 0.05`).
- Deterministic: `recommendTechnique` from the technique engine, with cited evidence.
- Cloud: `diagnosisTier2` posts `{ currentHabit, weakTopics, masteryHistory, topicType }`
  to `/api/analyze-technique`; on failure falls back to the deterministic result.
- Output always ends in a CTA → `StudentReview` pre-set to the recommended technique.

### 6. Review (`pages/student/StudentReview.jsx`)

Three steps in one page: technique pick (recommendation highlighted) → document pick
(weak topics shown) → session. Session rendering branches by technique kind:
- `quiz` (Spaced Repetition) → embed the existing quiz UI, wired to the SR orchestrator.
- `explain` (Feynman) → the explanation text-input flow + evaluation.
- `timer` (Pomodoro) → wrap the chosen underlying session (defaults to a quiz) in the
  Pomodoro overlay; Pomodoro is a *modifier* on a session, consistent with the CSV.

Results tag records with `source: 'review'` and `technique`, update BKT (+SM-2 for SR),
then link to the Dashboard.

### 7. Dashboard (`pages/student/StudentDashboard.jsx` + `components/LearningCurve.jsx`)

- Reads all `quizzes` for the document ordered by time, maps to `{attempt, mastery,
  technique, source, label}`, and finds the first technique switch for the inflection
  marker (v5 §8.4 algorithm, used verbatim).
- `LearningCurve` is a pure SVG/CSS line chart (no library), color-coded by technique,
  with an annotated inflection point, meeting WCAG by also labeling points in text.
- Below the curve: current per-topic mastery bars (reuse the Mastery-tab markup) and a
  per-technique "avg mastery gain / session" comparison.

---

## Cloud API additions (optional Tier 2)

Both are additive, follow the existing handler/validation/logger/responseValidator
pattern, accept **chunks and metadata only**, and never log content (the integration
test's content-free-logging sweep is extended to cover them).

```
POST /api/feynman
  req:  { explanation: string, topic?: string, chunks: [{ chunkId, text }] }
  res:  { coverage: number, covered: string[], gaps: string[], feedback: string, tier }

POST /api/analyze-technique
  req:  { currentHabit: string, weakTopics: string[], masteryHistory: number[], topicType }
  res:  { analysis, recommended_technique, evidence, expected_improvement, tier }
```

`recommended_technique` is validated against the three in-scope technique keys; an
out-of-scope value from the model is coerced to the closest in-scope technique
(`feynman` or `spaced_repetition`) by the response validator.

---

## Error handling

- Cloud failures (Feynman, diagnosis) are caught by the feature orchestrator and fall
  through to Deterministic with a visible "Offline mode" badge — never an error screen.
- SM-2 and the recommendation engine are pure and total: they clamp inputs
  (`easeFactor >= 1.3`, `quality` in [0,5], mastery in [0.01, 0.99]) and never throw on
  valid persisted data.
- Pomodoro wake-lock failures are swallowed; the timer continues.
- Review/Dashboard with no data render encouraging empty states, not errors.

## Testing strategy

- **Unit (pure functions):** `sm2` interval/ease progression and relearn reset;
  `recommendTechnique` keep/plateau/low-effectiveness branches and in-scope-only output;
  Feynman TF-IDF coverage and gap extraction.
- **Repository:** version-2 upgrade backfills SM-2 fields without losing v1 rows;
  `getDueTopics` ordering; `studyTechniques`/`feynmanAttempts` round-trips.
- **Component/behavior:** Pomodoro state persists across reload; post-quiz diagnosis
  fires only below threshold/plateau; Dashboard inflection marker lands on the switch.
- **Cloud (reuse harness):** `/api/feynman` and `/api/analyze-technique` happy-path,
  400 validation, 502 upstream, and content-free logging — extending the existing
  `cloud-api/test` sweep (currently 48 passing).
- **Tier fallback:** forcing a cloud failure mid-Feynman yields a Deterministic result
  labeled "Offline mode."

## Open design decisions (to confirm at review)

1. **Pomodoro focus mode** uses the Screen Wake Lock API as the honest web equivalent of
   "phone lock"; true OS phone-lock is not web-capable. OK to ship wake-lock + a clear
   label, or drop focus mode to just the timer?
2. **Spaced Repetition quality score** derivation: correctness only (Deterministic quiz)
   vs. correctness blended with the student's confidence rating (review). Proposed:
   quiz = correctness→{5 or 2}; review = confidence rating maps to 5/3/1.
3. **Cloud endpoints**: build both `/api/feynman` and `/api/analyze-technique`, or ship
   Feynman + diagnosis Deterministic-only for the MVP and add cloud later? (All three
   techniques are fully functional offline without them.)
