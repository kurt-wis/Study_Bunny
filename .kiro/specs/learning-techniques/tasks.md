# Learning Techniques — Implementation Plan

Each task is incremental, test-backed where it touches pure logic, and ends in a working
build. Requirement references point back to `requirements.md`.

- [x] 1. Data layer: additive Dexie version 2
  - Add `db.version(2)` with the two new stores (`studyTechniques`, `feynmanAttempts`),
    the additive `nextReviewDate` index on `knowledgeState`, and an `upgrade()` that
    backfills `interval=0`, `easeFactor=2.5`, `nextReviewDate=null` on existing rows.
  - Add repository helpers: `getStudyTechnique`, `setStudyTechnique`,
    `saveFeynmanAttempt`, `getFeynmanAttempts`, `getDueTopics`, `updateSchedule`.
  - Verify v1 documents/mastery survive the upgrade (manual IndexedDB check + unit).
  - _Requirements: 1.5, 4.6, 9.1, 9.2, 9.3_

- [x] 2. Technique engine + recommendation
  - Create `services/techniqueEngine.js` with the three in-scope techniques, the
    passive-habit inputs, and `recommendTechnique(...)` constrained to in-scope output.
  - Unit-test keep / plateau / low-effectiveness branches and that output is only ever
    `feynman`, `spaced_repetition`, or keep.
  - _Requirements: 6.1, 6.2, 6.4_

- [x] 3. Spaced Repetition engine (SM-2)
  - [x] 3.1 `services/spacedRepetition/sm2.js` — pure SM-2 with clamping; unit tests for
        interval progression (1 → 6 → ×ease), relearn reset on q<3, ease floor 1.3.
  - [x] 3.2 `services/spacedRepetition/index.js` — `getDueTopics` ordering and a session
        orchestrator that calls `generateQuiz`, then runs BKT + `updateSchedule` per
        answer; map confidence rating → quality score.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 4. Feynman service
  - [x] 4.1 `services/feynman/feynmanTier3.js` — TF-IDF coverage + unmatched-keyword gaps
        + self-rating; unit test coverage/gap extraction.
  - [x] 4.2 `services/feynman/feynmanTier2.js` — cloud evaluation via `apiPost('/api/feynman')`
        (chunks + explanation only).
  - [x] 4.3 `services/feynman/index.js` — tier router with mid-flight fallback to Tier 3
        and "Offline mode" relabel; persist via `saveFeynmanAttempt`; update BKT.
  - _Requirements: 3.1–3.7, 8.2, 8.4_

- [x] 5. Pomodoro
  - [x] 5.1 `hooks/usePomodoro.js` — reducer state machine, interval ticking, persist to
        `appSettings['pomodoro.state']`; restore on reload; focus permission in
        `appSettings['pomodoro.focusPermission']`.
  - [x] 5.2 `components/PomodoroTimer.jsx` — controls (≥48px), live-region phase
        announcements, optional revocable wake-lock focus mode that degrades silently.
  - _Requirements: 2.1–2.6, 8.4_

- [x] 6. Technique diagnosis
  - `services/diagnosis/index.js` (deterministic via techniqueEngine) +
    `diagnosisTier2.js` (cloud, with fallback).
  - Trigger from quiz results on score < 0.7 or 3-attempt plateau; always end in a
    Review CTA pre-set to the recommended technique.
  - _Requirements: 6.1, 6.2, 6.3, 6.5, 8.2_

- [x] 7. Wire technique selection + Pomodoro into existing screens
  - `StudentDocument.jsx`: add a technique picker (persist via `setStudyTechnique`) and
    Review + Dashboard entry links/tabs.
  - `StudentQuiz.jsx`: optional Pomodoro overlay; post-quiz diagnosis panel; Feynman
    "explain this topic" prompt for weak topics.
  - `App.jsx`: add `/review` and `/dashboard` routes.
  - _Requirements: 1.1–1.4, 2.2, 3.1, 5.5, 6.1_

- [x] 8. Review section
  - `pages/student/StudentReview.jsx` — technique pick (recommendation highlighted) →
    document pick (weak topics shown) → technique-specific session → results tagged
    `source:'review'` + `technique`; update BKT (+SM-2 for SR).
  - Accept `?technique=` query param from the diagnosis CTA.
  - _Requirements: 5.1–5.5_

- [x] 9. Dashboard + learning curve
  - `components/LearningCurve.jsx` — pure SVG/CSS line chart, technique color-coding,
    inflection marker, text labels for accessibility.
  - `pages/student/StudentDashboard.jsx` — curve + mastery bars + per-technique
    effectiveness; empty state when data is thin.
  - _Requirements: 7.1–7.4_

- [ ] 10. Cloud API endpoints (optional Tier 2) — gated on review decision #3
  - [x] `cloud-api/src/handlers/feynman.js` and `analyzeTechnique.js` with request limits,
    anonymous inputs, prompt builders, response validation, retries, and content-free logs.
  - [x] `template.yaml`: add both least-privilege functions, log groups, bounded API
    throttling, and stage access logs.
  - [ ] Add handler tests (happy/400/502 + content-free logging sweep).
  - Validate `recommended_technique` to the in-scope set; coerce out-of-scope values.
  - _Requirements: 3.4, 3.7, 6.3, 8.4_

- [ ] 11. Accessibility + tier-badge pass
  - Confirm 48×48 targets, WCAG AA contrast, text+icon tier labels, and live-region
    announcements across the new Review, Dashboard, Pomodoro, and Feynman screens.
  - Verify effective-tier badge (never preference) on every technique screen.
  - _Requirements: 8.1, 8.3, and FEATURES.md §9 baseline_

- [ ] 12. End-to-end verification
  - [x] AWS frontend/backend deployment configuration and offline PDF worker are present.
  - [x] Production build completed successfully (`npm run build`).
  - [ ] Cloud API unit suite, airplane-mode walkthrough, migration check, and live AWS
    deployment completed.
  - _Requirements: 4.6, 8.1, 8.2, 9.1_

- [x] 13. AWS deployment configuration
  - Add Amplify build settings and an SPA route-rewrite file/command.
  - Add SAM routes for Feynman and technique diagnosis, plus API throttling and bounded
    request sizes; document the Amplify-to-SAM deployment sequence.
  - Bundle the PDF.js worker and provide PWA icon assets required by the manifest.
  - _Requirements: AWS deploy readiness_

## Build order / dependencies

```
1 (data) ──► 2 (engine) ──► 3 SR ─┐
                           ─► 4 Feynman ─┤
                           ─► 5 Pomodoro ┤──► 7 wiring ──► 8 Review ──► 9 Dashboard
                           ─► 6 diagnosis┘
10 cloud (optional, parallel to 7–9)   11 a11y (after 7–9)   12 verify (last)
```

## Out of scope (do not build)

- Teacher Mode (removed from this app).
- Elaborative Interrogation, Interleaved Practice, Mind Mapping.
- Push notifications / background scheduling (due topics computed on open).
- Tier 1 on-device SLM (no edge provider registered in MVP).
