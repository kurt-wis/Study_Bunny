# Study Bunny

An offline-first study PWA that helps students learn with evidence-based
techniques. Upload notes, get summaries and quizzes, and study with **Pomodoro**,
**Feynman** (explain-it-back), and **Spaced Repetition** (SM-2) - all usable
fully offline, with optional cloud enrichment that degrades gracefully to an
"Offline mode" deterministic path.

## Features

- **Three learning techniques**: Pomodoro timer, Feynman self-explanation with
  TF-IDF coverage/gap analysis, and Spaced Repetition scheduling (SM-2).
- **Technique diagnosis**: a post-quiz recommendation engine that suggests a
  higher-utility technique when a quiz score is low or mastery plateaus.
- **Guided Review** and a **learning-curve Dashboard** with per-technique
  effectiveness and quiz-vs-review attribution.
- **Tiered, offline-first architecture**: a deterministic tier runs 100% on
  device; a cloud tier (optional) enriches results and falls back to the
  deterministic path on any failure.
- **Local-first storage** via Dexie/IndexedDB; mastery tracked with Bayesian
  Knowledge Tracing (BKT).
- **Accessibility baseline**: 48px touch targets, text+icon tier labels,
  live-region announcements, and non-color-only status.

## Tech stack

React 18 - Vite 5 - Tailwind CSS - Dexie (IndexedDB) - PDF.js - vite-plugin-pwa.
Tests run on Node's built-in test runner (`node --test`).

## Getting started

```sh
npm install
npm run dev      # start the local server
npm run build    # production build (generates the PWA service worker)
npm test         # run the unit test suite
```

### Optional cloud backend

The optional Tier 2 cloud API (AWS Lambda + Amazon Bedrock) lives in
[`cloud-api/`](./cloud-api). See its README for deploy instructions. The app is
fully functional without it. Configure the frontend with the API URL by copying
`.env.example` to `.env.local` and setting `VITE_API_BASE_URL`; leave it blank
to run entirely offline.

## Deploy to AWS

This repository is configured for AWS Amplify Hosting (frontend) and AWS SAM
(API Gateway, Lambda, and Bedrock). Build settings are in `amplify.yml`; the
generated frontend artifact is `dist/`. Apply the SPA route rule in
`amplify-rewrites.json` with `aws amplify update-app` after creating the Amplify
app. Full deployment commands and ordering are in [`cloud-api/README.md`](./cloud-api/README.md).

The frontend can be deployed first with `VITE_API_BASE_URL` unset and will work
in offline mode. After deploying the API, set that Amplify build variable to the
SAM stack's `ApiBaseUrl` output and rebuild. The API's `AllowedOrigin` parameter
must exactly match the deployed Amplify origin.

## Project layout

```
src/            React app (pages, components, hooks, services)
src/services/   technique engine, spaced repetition, feynman, diagnosis, dashboard
cloud-api/      optional AWS serverless backend (Bedrock-fronting Lambdas)
.kiro/specs/    feature specs (requirements, design, tasks)
```

## License

No license is specified yet. Add one before relying on this as open source.
