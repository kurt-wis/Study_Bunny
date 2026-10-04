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
- **Opt-in AI**: consent plus a shared access code, a server-side daily limit per
  device, and no AI provider key in the browser.
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

Deploy on **Vercel**. The optional AI API ships in the same project as serverless
functions under `/api`, calling the AI service you choose (Gemini and Groq have free tiers). See [DEPLOYMENT.md](./DEPLOYMENT.md) for requirements, exact steps,
environment variables, acceptance checks, and limitations. Leaving the
server variables unset runs entirely offline.

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
api/            Vercel functions: thin wrappers that guard and serve the AI routes
cloud-api/      AI request handlers, validation, prompts, model client, tests
.kiro/specs/    feature specs (requirements, design, tasks)
```

## License

No license is specified yet. Add one before relying on this as open source.

## Workspace UI

The app runs inside one shell (`src/components/layout/AppShell.jsx`): a side menu on wide screens and a bottom tab bar on phones, with four sections.

- **Home** (`/student`) - daily goal, streak, study time, topics mastered, study sets, upload, today's plan and the learning curve. All figures come from `src/services/home/overview.js`, which derives them from data already stored on the device.
- **Review** (`/student/review`) - opens a spaced-repetition flashcard session for the set with the most cards due. Cards are rated Again / Hard / Good / Easy, which feed SM-2 and BKT.
- **Quiz** (`/student/quiz`) - opens a quiz for the last set studied.
- **Profile** (`/student/profile`) - name, totals, study reminders, sound effects, dark appearance, data export, clear-all and the optional Cloud AI panel.

Design tokens (colours, type, component classes prefixed `sb-`) live in `src/index.css`. Fonts are system stacks so nothing is downloaded.
