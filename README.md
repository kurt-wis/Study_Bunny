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
- **Check my notes**: detect and redact possible personal details, compare up to
  12 statements with a reference PDF or pasted source, inspect evidence, and
  keep the last 20 reports per document on this device. Offline checking matches
  wording only; optional AI interprets agreement and conflicts with the source.
- **Opt-in, authenticated AI**: Cognito sign-in, server-side daily allowances,
  API throttling, and budget alerts. No AWS credentials in the browser.
- **Accessibility baseline**: 48px touch targets, text+icon tier labels,
  live-region announcements, and non-color-only status.

## Tech stack

React 18 - Vite 7 - Tailwind CSS 4 - Dexie (IndexedDB) - PDF.js - vite-plugin-pwa.
Tests run on Node's built-in test runner (`node --test`).

## Getting started

```sh
npm ci           # use Node.js 24
npm run dev      # start the local server
npm run build    # production build (generates the PWA service worker)
npm test         # run the unit test suite
npm run check:pwa # check icons and offline PDF worker after build
```

### Optional cloud backend

Deploy the PWA on **Vercel**; the optional AI API remains on **AWS** in a dedicated
project account. See [DEPLOYMENT.md](./DEPLOYMENT.md) for requirements, exact steps,
environment variables, acceptance checks, and limitations. Leaving the four
public cloud configuration variables blank runs entirely offline.

PDF extraction runs locally, including offline after the first completed app
load. Scanned/image-only PDFs need OCR outside this implementation. Personal-detail
detection is heuristic, not a guarantee; manually redact missed details and review
the sanitized preview before sending a check to AI. Results describe agreement
with the supplied reference, **not guaranteed factual truth**. Notes aren't
automatically rewritten. IndexedDB data is tied to the browser and app origin,
not backed up or synchronized to a signed-in account.

## Project layout

```
src/            React app (pages, components, hooks, services)
src/services/   technique engine, spaced repetition, feynman, diagnosis, dashboard
cloud-api/      optional AWS serverless backend (Bedrock-fronting Lambdas)
.kiro/specs/    feature specs (requirements, design, tasks)
```

## License

No license is specified yet. Add one before relying on this as open source.
