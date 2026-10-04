
# Study Bunny â€” App Specification v5.0 (FINAL)
## Offline-First AI Study Companion with Learning Technique Diagnosis

**Build Deadline:** October 4, 2026, 10:00 AM
**Team Size:** 4 developers
**Track:** Educational Crisis â€” Build Over Nights 2026

---

## Changes since v5.0 (October 4, 2026)

- **Navigation** is Home / Review / Quiz / Profile (side menu on wide screens, bottom tabs on phones). Dashboard is opened from inside a document.
- **Brand** changed to the sky-blue Study Bunny look with the bunny mascot and logo (section 11).
- **Home** shows a daily goal, study streak, study time, topics mastered, today's plan and a learning curve.
- **Profile** added: name, totals, reminders, sound effects, dark appearance, data export, clear data, Cloud AI consent.
- **Review** asks for the technique first (Spaced Repetition, Feynman, Pomodoro) with a "Skip, use flashcards" option, then the module/handout. Flashcards are rated Again / Hard / Good / Easy.
- **Technique suggestions** appear after a weak review and on the learning-curve page when scores are low or stuck.
- **Summaries** are short and structured: three key points, up to five key ideas, a study order.
- **Feynman** results show the student's explanation next to what the notes say, with covered and missing ideas marked.
- **Listen to this lesson**: a read-aloud script with a mini-quiz, using the device's built-in voice (offline).
- **Study tips**: up to four personal tips per lesson, from the lesson content and the student's progress (offline).
- **Better offline questions**: handouts that define terms ("Men - a male person") are quizzed on the term ("________ - a male person"), and summaries list terms with their meanings.
- **Pre-quiz survey** and **topic mastery bars on quiz results** are built.
- **More handout layouts**: tables, two-column glossaries, and a term on one line with its meaning on the next are recognised. Plain-paragraph quizzes blank one short word per sentence and change every time.
- **Feynman matching** accepts different word forms and common synonyms ("makes" for "produce").
- **All screens share the new look**: Document, Chat, Check-notes and Dashboard use the same header and cards; no emoji icons. Install icons use the logo.
- **Animations** added (section 11.3).
- **Module clean-up at upload**: name, section, date and score fields, page numbers, repeated headers and footers, school letterhead, blank answer lines, links and copyright lines are removed before the module is saved, so quizzes and summaries only use lesson content.
- **Students can fix generated content**: each module has a Cards tab where terms and meanings can be edited, removed or added, with a reset to the automatic list. Flashcards, offline quizzes and the summary are rebuilt from the corrected cards. Flashcards and quiz feedback link straight to it.
- **Cloud AI moved off AWS**: the optional AI tier now runs as Vercel functions in `/api`, calling whichever AI service is set on the server (Gemini, Groq, OpenAI or Claude). Students opt in with a consent box and a shared access code; there are no accounts or sign-in.

---

## 1. One-Line Description

Study Bunny is a free, offline-first PWA that turns uploaded PDF notes into adaptive quizzes, diagnoses how you study, recommends evidence-based learning techniques, and lets you apply those techniques to your own materials â€” all on a â‚±5,000 phone with no internet.

---

## 2. Core Loop

```
UPLOAD â†’ QUIZ â†’ SEE LEARNING CURVE â†’ DIAGNOSE TECHNIQUE â†’ REVIEW WITH NEW TECHNIQUE â†’ SEE IMPROVEMENT â†’ REPEAT
```

The app answers three questions no other study tool asks:
1. **What don't you know?** (Quiz + BKT mastery tracking)
2. **Why aren't you learning it?** (Study technique diagnosis)
3. **How should you study instead?** (Evidence-based technique recommendation + guided review)

---

## 3. Architecture

### 3.1 Three-Tier Graceful Degradation

| Tier | Engine | Requires | Quality | Offline? |
|------|--------|----------|---------|----------|
| Tier 2: Cloud AI | A hosted AI model (Gemini, Groq, OpenAI or Claude; chosen in server settings) via the app's own `/api` server functions | Internet + consent + access code | Best | âŒ |
| Tier 1: On-Device AI | SmolLM2 via llama.cpp WASM | 4GB+ RAM, cached model | Good | âœ… |
| Tier 3: Deterministic | RAKE + TF-IDF + BKT + Templates | Nothing | Functional | âœ… |

The app detects the best available tier on **every feature call.** No loading screens. No error messages. Automatic fallback.

### 3.2 Tier Detection Logic

```
resolveTier(feature):
  IF manual override is "offline"                          → TIER 3
  IF online AND student gave consent AND access code saved
     AND /api/health answers { "status": "ok" }            → TIER 2
  IF an on-device model is registered and ready (none yet) → TIER 1
  ELSE                                                     → TIER 3
```

If a Cloud AI call fails part-way, the feature re-runs its offline path and
shows the "Offline mode" badge. Tier 1 is a future option; no on-device model
ships today.

### 3.3 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS |
| PWA | Service Worker (Workbox) |
| Local DB | Dexie.js (IndexedDB) |
| PDF extraction | PDF.js (pdfjs-dist) |
| Keyword extraction | RAKE (pure JS, zero dependencies) |
| Text search | TF-IDF (pure JS) |
| Adaptive learning | BKT â€” Bayesian Knowledge Tracing (pure JS) |
| Cloud LLM | Any one of Gemini, Groq, OpenAI, OpenRouter or Anthropic, set by `AI_PROVIDER` / `AI_MODEL` (Gemini and Groq have free tiers) |
| Cloud compute | Vercel serverless functions (`/api/*.js`, Node.js) |
| API routing | Same-origin `/api` routes; shared access code + daily limit per device |
| Hosting | Vercel (auto-deploy from GitHub) |
| IDE | Kiro (specs-driven development) |

---

## 4. App Sections

### 4.1 Section Overview

| Section | Purpose | Entry Point |
|---------|---------|-------------|
| **HOME** | Daily goal, streak, study time, topics mastered, study sets, PDF upload, today's plan, learning curve | App launch |
| **REVIEW** | Pick a learning technique (or skip to flashcards) → pick a module/handout → guided study session | Workspace menu, a document's "Review" button, or a recommendation after a quiz |
| **QUIZ** | Adaptive quiz → identify weak topics → diagnose study technique | Workspace menu (opens the last module studied) or a document's "Quiz" button |
| **PROFILE** | Name, totals, study reminders, sound effects, dark appearance, data export, clear data, optional Cloud AI | Workspace menu |
| **DASHBOARD** | Learning curve, mastery map, technique effectiveness, technique suggestion | Inside a document, or after a quiz/review |

### 4.2 Navigation

```
Workspace menu (always visible):
  wide screens → side menu      phones → bottom tab bar

  Home | Review | Quiz | Profile
```

- Home is the default landing page
- Review asks for the technique first, then the module/handout
- Quiz opens the last module studied; Dashboard is opened from inside a document
- The tier badge (Cloud AI / On-device AI / Offline mode) is shown on every AI-powered result

---

## 5. HOME Section

### 5.1 Purpose
The daily starting point: what is due, how the student is doing, and where to add notes.

### 5.2 Screen
From top to bottom:

1. **Greeting** with the date, and a bell that opens reminder settings.
2. **Daily goal** banner with the mascot. It changes with the data: "Start with your notes" (no modules), "Keep your momentum going" (cards due, with a Start review button), or "You are all caught up" (Take a quiz).
3. **Three stats**: current streak (and best), study time this week, topics mastered.
4. **Continue learning**: one row per module with its mastery bar, when it was last studied, and a delete button. Empty state: "No documents yet".
5. **Add notes**: drag-and-drop or Upload PDF.
6. **Today's plan**: sessions finished today, due cards to review, and a quiz for the weakest module.
7. **Learning curve**: scores of the last seven sessions, with a link to a technique suggestion when scores are not going up.

### 5.3 Upload Flow
Choose or drop a PDF → text is read page by page on the device → the text is split into chunks → the module is saved → the module page opens. Scanned, empty or protected PDFs show a clear error.

### 5.4 Technical Requirements
- PDF.js runs locally; nothing is uploaded.
- Before saving, `src/utils/cleanModule.js` removes lines that are not the lesson (form fields, dates, page numbers, repeated headers and footers, letterhead, blanks, links). If that would remove most of a document, the original text is kept.
- Both a flattened text and a line-by-line text are stored. The line-by-line text keeps glossary lines such as "Men - a male person" intact.
- Limits: 20 MB, 300 pages, 1,000,000 characters.

---

## 6. QUIZ Section

### 6.1 Purpose
Find out what the student does not know yet, and whether the way they study is working.

### 6.2 Flow

```
Quiz (menu or a module's Quiz button)
  → First time on a module: "How do you usually study this?" survey (can be skipped)
  → 5 questions, feedback after each answer
  → Results: score, topic mastery bars, review of every question
  → If the score is under 70% or stuck: study tip with another technique to try
  → Links to explain weak topics (Feynman), take another quiz, or view mastery
```

### 6.3 Screens

**6.3.1 Pre-quiz survey.** Eight habits: re-reading, highlighting, writing summaries, flashcards, practice tests, explaining to someone, group study, video lessons. Saved once per module on the device and used by the technique suggestion.

**6.3.2 Quiz.** One question per screen with a progress bar and counter.

| Tier | Question types |
|------|----------------|
| Tier 3 (offline), handout defines terms | Fill in the blank on the term (`________ - a male person`) and true/false that pairs a term with the right or a wrong meaning |
| Tier 3 (offline), plain text | Fill in the blank on a key phrase and true/false on sentences from the notes |
| Tier 2 (Cloud AI) | Multiple choice with four options |

Weak and never-seen terms are asked first. Feedback shows the exact line from the notes.

**6.3.3 Results.** Score, a mastery bar per topic (Needs work / Learning / Mastered), each question with the student's answer, the correct answer and the line from the notes.

**6.3.4 Study tip.** Shown when the score is under 70% or mastery has stopped rising. Gives the reason in plain words, the research behind it, and a button that opens Review with the suggested technique.

### 6.4 BKT Engine

```javascript
// Parameters (from cognitive science literature)
const BKT = {
  pInit: 0.3,    // Initial probability of knowing
  pLearn: 0.2,   // Probability of learning after each attempt
  pSlip: 0.1,    // Probability of wrong answer despite knowing
  pGuess: 0.25,  // Probability of right answer despite not knowing
};

// Update after each answer
function updateMastery(currentMastery, isCorrect) {
  let pKnown;
  if (isCorrect) {
    const pCorrectKnown = (1 - BKT.pSlip) * currentMastery;
    const pCorrectUnknown = BKT.pGuess * (1 - currentMastery);
    pKnown = pCorrectKnown / (pCorrectKnown + pCorrectUnknown);
  } else {
    const pWrongKnown = BKT.pSlip * currentMastery;
    const pWrongUnknown = (1 - BKT.pGuess) * (1 - currentMastery);
    pKnown = pWrongKnown / (pWrongKnown + pWrongUnknown);
  }
  return Math.max(0.01, Math.min(0.99, pKnown + (1 - pKnown) * BKT.pLearn));
}
```

### 6.5 Technique Recommendation Engine
`src/services/techniqueEngine.js`, offline rules:

- Score 70% or higher, still rising, and the current habit is not a low-impact one → keep going.
- Otherwise → suggest **Feynman** or **Spaced Repetition**, whichever the student is not already using.
- Low-impact habits: re-reading, highlighting, summarising (Dunlosky et al., 2013).
- With Cloud AI on, `/api/analyze-technique` writes the explanation; the offline rule still decides whether a switch is needed.

---

## 7. REVIEW Section

### 7.1 Purpose
Apply one learning technique to one module, and record the result so the learning curve can show whether it works.

### 7.2 Flow

```
Review
  → Step 1: How do you want to review?  (or "Skip, use flashcards")
  → Step 2: Which module or handout?    (weak topics shown under each)
  → Guided session for that technique
  → Results + mastery update, tagged with the technique
  → If it went badly: suggestion to try a different technique
```

### 7.3 Techniques

| Technique | Session |
|-----------|---------|
| **Flashcards** (skip option) | Question on the front, answer and the line from the notes on the back. Rated Again / Hard / Good / Easy. |
| **Spaced Repetition** | The same flashcards, with due topics first. Each rating sets when the topic comes back (SM-2). |
| **Feynman** | Pick a weak topic, explain it from memory, optionally peek at the notes. The result shows the explanation beside the notes with covered ideas in green and missing ones underlined. |
| **Pomodoro** | Flashcards with a 25-minute focus timer. |

### 7.4 Results
Flashcards: cards recalled, the rating and next review date per topic. Feynman: a one-line verdict, key ideas covered, and what to add next time.

### 7.5 Technique-Specific Generation

| Technique | Tier 3 (Offline) | Tier 2 (Cloud AI) |
|-----------|------------------|-------------------|
| Flashcards / Spaced Repetition | Term blanks from definitions, or keyword blanks from plain text | Multiple-choice questions from `/api/quiz` |
| Feynman | Key-idea match against the lines about that topic | Feedback on meaning and gaps from `/api/feynman` |
| Pomodoro | Timer only; no generation | Same |

### 7.6 Not built
Elaborative questions, interleaved practice and mind mapping.

---

## 8. DASHBOARD Section

### 8.1 Purpose
Show whether mastery is rising, and which technique is helping.

### 8.2 Screen (opened from a module, or after a quiz or review)

1. **Learning curve**: score per session over time, labelled by technique, with the first technique switch marked.
2. **Try a different way to study**: shown when the latest score is under 70% or the curve is flat.
3. **Topic mastery**: a bar per topic, weakest first.
4. **What is working**: average gain per session for each technique, and how many sessions came from quizzes and from reviews.

Home shows a smaller learning curve across all modules.

### 8.3 Data Sources
Quiz and review records (score, technique, source), per-topic mastery (BKT), and review schedules (SM-2). All on the device.

### 8.4 Technical Implementation
Pure functions in `src/services/dashboard/learningCurve.js` and `src/services/home/overview.js`; charts are inline SVG with no chart library.

---

## 9. IndexedDB Schema

```javascript
import Dexie from 'dexie';

const db = new Dexie('StudyBunnyDB');

db.version(1).stores({
  // Documents
  documents: '++id, title, createdAt',

  // Quiz & Review Results (unified â€” tagged by source + technique)
  quizResults: '++id, documentId, source, technique, score, createdAt, [documentId+createdAt]',

  // Per-topic mastery (BKT state)
  knowledgeState: '++id, documentId, topic, mastery, technique, [documentId+topic]',

  // Study technique per document
  studyTechniques: '++id, documentId, technique, setAt',

  // Chat history (if time permits)
  chatHistory: '++id, documentId, timestamp',

  // Summaries cache
  summaries: '++id, documentId, tier, createdAt',

  // App settings
  appSettings: 'key',
});
```

### Key Records

**quizResults record:**
```javascript
{
  id: auto,
  documentId: 1,
  source: 'quiz' | 'review',
  technique: 'rereading' | 'practice_test' | 'feynman' | 'distributed' | 'elaborative',
  questions: [...],          // The questions asked
  answers: [...],            // Student's answers
  score: 0.4,               // 2/5
  topicScores: {             // Per-topic breakdown
    'derivatives': { correct: 0, total: 2, mastery: 0.25 },
    'chain_rule': { correct: 1, total: 1, mastery: 0.42 },
  },
  createdAt: timestamp,
}
```

**knowledgeState record:**
```javascript
{
  id: auto,
  documentId: 1,
  topic: 'derivatives',
  mastery: 0.42,
  attempts: 5,
  correctCount: 2,
  technique: 'practice_test',  // Last technique used
  lastReviewed: timestamp,
}
```

---

## 10. Cloud API Endpoints (Vercel functions)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Tier detection health check |
| `/api/summarize` | POST | Tier 2 structured summary |
| `/api/quiz` | POST | Tier 2 adaptive MCQ generation |
| `/api/chat` | POST | Tier 2 RAG chat (if time permits) |
| `/api/analyze-technique` | POST | Tier 2 study technique analysis |
| `/api/feynman` | POST | Tier 2 Feynman explanation feedback (coverage, gaps) |
| `/api/verify-notes` | POST | Tier 2 reference-based note checking |

### `/api/analyze-technique` â€” NEW

```javascript
// Request
{
  "currentTechnique": "rereading",
  "weakTopics": ["derivatives", "chain_rule"],
  "masteryHistory": [0.30, 0.32, 0.35, 0.33, 0.35],
  "topicType": "procedural"  // or "conceptual", "factual"
}

// Response
{
  "analysis": "You've been re-reading for 5 sessions but your mastery in Derivatives has plateaued at 35%. Re-reading is a passive technique that creates familiarity, not understanding. For procedural topics like Calculus, active recall is significantly more effective.",
  "recommended_technique": "practice_test",
  "evidence": "Dunlosky et al. (2013) rated practice testing as having high utility across all learning conditions.",
  "expected_improvement": "Students who switch from re-reading to practice testing typically see 40-60% mastery improvement within 3-4 sessions.",
  "tier": "TIER_2"
}
```

### `/api/review-session` (not built: review sessions reuse `/api/quiz` and `/api/feynman`) â€” NEW

```javascript
// Request
{
  "technique": "practice_test",
  "text": "...(PDF chunks for weak topics)...",
  "weakTopics": ["derivatives", "chain_rule"],
  "numQuestions": 5
}

// Response
{
  "questions": [
    {
      "id": 1,
      "type": "open_recall",
      "topic": "derivatives",
      "prompt": "Without looking at your notes, explain how to find the derivative of a composite function using the chain rule.",
      "reference_passage": "The chain rule states that...",
      "scoring_rubric": ["mentions outer function", "mentions inner function", "correct notation"]
    }
  ],
  "tier": "TIER_2"
}
```

---

## 11. Brand & Design

### 11.1 Colors (design tokens in `src/index.css`)

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | #1A7DB6 | Buttons, links, active navigation |
| Primary Hover | #14689A | Hover states |
| Accent | #41ADE2 | Progress bars, chart line |
| Background | #F5FAFD | Page background |
| Surface | #FFFFFF | Cards |
| Sky | #DFF2FB | Hero banner, active navigation background |
| Mint | #E6F2EC | Positive panels, counters |
| Text Primary | #1B2B44 | Headings and body text |
| Text Secondary | #5F6F7A | Captions, labels |
| Success | #3B8A6A | Correct answers, mastery gains |
| Warning | #FDF0D5 / #7A4E08 | Plateau alerts, technique suggestions |
| Error | #C9563F | Wrong answers, low mastery |

The tier is always shown as text plus an icon, never by color alone. A dark
appearance redefines the same tokens.

### 11.2 Typography
- Headings: Georgia (serif), bold. Body: Segoe UI / system-ui (sans-serif)
- System fonts only, so nothing is downloaded and the app works offline
- Body: 14px minimum; page titles 30px, section titles 19px
- Touch targets: 48px minimum height
- Card border radius: 18px (large panels 24–28px)
- Screen padding: 16px on phones

### 11.3 Design Principles
- Mobile-first (target: Samsung Galaxy A13, 6.6" screen), with a side-menu layout on wide screens
- Light appearance by default; an optional dark appearance in Profile
- Short, light animations (screens rise in, flashcards flip, answers pop or shake, the mascot floats). All motion is off when the device asks for reduced motion
- Light motivation only: a study streak, study time and topics mastered. No badges, points, leaderboards or avatars
- Mascot and logo: the Study Bunny (`public/mascot.png`, `public/logo.png`)
- Simple wording everywhere: short sentences, no jargon, summaries capped at three key points
- Tier badge always visible on AI results — transparency about what's powering the experience

---

## 12. MVP Build Checklist

### Must Have (Demo-Critical) âœ…

**Home:**
- [ ] PDF upload â†’ text extraction â†’ chunking â†’ IndexedDB
- [ ] Document library with mastery preview
- [ ] Tier detection + badge on every AI-powered result

**Quiz:**
- [ ] Pre-quiz technique survey (first time per document)
- [ ] 5-question adaptive quiz (Tier 3: fill-blank + T/F; Tier 2: Cloud AI MCQ)
- [ ] BKT mastery update after each answer
- [ ] Quiz results with topic mastery bars
- [ ] Post-quiz technique diagnosis (Tier 3: rule-based; Tier 2: Cloud AI analysis)
- [ ] CTA to Review Mode with recommended technique

**Review:**
- [ ] Technique selection screen (with AI recommendation highlighted)
- [ ] Module selection screen (with weak topics shown)
- [ ] Flashcard review session (weakest topics first), rated Again / Hard / Good / Easy
- [ ] Session results with mastery update
- [ ] Results tagged with technique + source for Dashboard

**Dashboard:**
- [ ] Learning curve (mastery over time, color-coded by technique)
- [ ] Technique switch inflection point marked
- [ ] Topic mastery bars
- [ ] Technique effectiveness comparison

**Infrastructure:**
- [ ] Vercel functions deployed: /health, /summarize, /quiz, /chat, /feynman, /analyze-technique, /verify-notes (optional — the app is complete offline)
- [ ] Vercel deployment with live URL
- [ ] PWA manifest + service worker
- [ ] Airplane mode demo works end-to-end

### Should Have (If Time) âš ï¸

- [ ] Feynman Technique in Review Mode
- [ ] Spaced Retrieval scheduling
- [ ] Summary generation (Tier 2 + Tier 3)
- [ ] RAG Chat
- [ ] Tier 2 technique analysis (Cloud AI-powered)

### Won't Have (Post-Hackathon) âŒ

- Elaborative Interrogation
- Interleaved Practice
- Mind Mapping
- Push notifications (a once-a-day local reminder when the app is open is included; background push is not)
- User accounts
- Cloud sync
- Tier 1 (on-device SLM)

---

## 13. Developer Assignment

| Dev | Owns | Priority Tasks |
|-----|------|---------------|
| **Dev 1 (Lead)** | `/src/core/`, `/src/db/`, `/src/services/tierDetection.js` | Scaffold, DB schema, PDF processor, tier detection, integration wiring |
| **Dev 2** | `/src/services/quiz/`, `/src/services/bkt.js`, `/src/services/techniqueEngine.js` | RAKE, TF-IDF, quiz generation (both tiers), BKT engine, technique recommendation engine |
| **Dev 3** | `/api/`, `/cloud-api/`, `/src/services/review/` | Vercel function deployment, all Cloud AI endpoints, review session generation, Tier 2 technique analysis |
| **Dev 4** | `/src/pages/`, `/src/components/` | All UI: Home, Quiz flow, Review flow, Dashboard, learning curve chart, navigation |

---

## 14. Submission Form Answers

**Project Name:** Study Bunny

**Project Overview (â‰¤200 words):**
Study Bunny is a free, offline-first PWA that turns uploaded PDF notes into adaptive quizzes, diagnoses study techniques, and recommends evidence-based learning methods â€” all on a budget phone with no internet. The app uses a three-tier architecture: an optional hosted AI model for best-quality answers when online, and deterministic algorithms (RAKE, TF-IDF, BKT) when offline. Students upload their course notes, take adaptive quizzes powered by Bayesian Knowledge Tracing, see their learning curve over time, and receive personalized recommendations to switch from ineffective study habits (like re-reading) to evidence-based techniques (like practice testing). A dedicated Review Mode lets students apply specific learning techniques to their materials with guided study sessions. Built for the 17.4 million Filipino students without reliable internet, where ChatGPT Plus costs more than a student's entire monthly allowance.

**Pain Point:**
Filipino students face compounding barriers: 91% learning poverty, 51% without internet, and AI tools that cost â‚±1,120/month against a â‚±1,235 average allowance. Even students who CAN study often use ineffective techniques â€” 84% default to re-reading, the least effective method. The students who need AI the most are locked out of it, and those who study do it wrong.

**Solution:**
An offline-first PWA with three-tier AI (hosted model â†’ on-device â†’ deterministic fallback) that provides adaptive quizzes, learning curve tracking, study technique diagnosis, and guided review sessions â€” all from the student's own uploaded notes, for free, on any device.

**Tech Stack:**
React 18, Vite, Tailwind CSS, Dexie.js (IndexedDB), PDF.js, RAKE (pure JS), TF-IDF (pure JS), BKT (pure JS), a hosted AI model (Gemini, Groq, OpenAI or Claude, switchable), Vercel serverless functions, Vercel hosting, Kiro IDE, Amazon Quick.
