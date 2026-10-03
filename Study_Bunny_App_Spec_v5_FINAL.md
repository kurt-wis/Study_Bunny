
# Study Bunny â€” App Specification v5.0 (FINAL)
## Offline-First AI Study Companion with Learning Technique Diagnosis

**Build Deadline:** October 4, 2026, 10:00 AM
**Team Size:** 4 developers
**Track:** Educational Crisis â€” Build Over Nights 2026

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
| Tier 2: Cloud AI | Claude 3 Haiku via Amazon Bedrock + Lambda | Internet | Best | âŒ |
| Tier 1: On-Device AI | SmolLM2 via llama.cpp WASM | 4GB+ RAM, cached model | Good | âœ… |
| Tier 3: Deterministic | RAKE + TF-IDF + BKT + Templates | Nothing | Functional | âœ… |

The app detects the best available tier on **every feature call.** No loading screens. No error messages. Automatic fallback.

### 3.2 Tier Detection Logic

```
detectTier():
  IF manual override â†’ USE override
  IF navigator.onLine AND /api/health responds â†’ TIER 2
  IF WASM supported AND deviceMemory â‰¥ 4GB AND model cached â†’ TIER 1
  ELSE â†’ TIER 3
```

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
| Cloud LLM | Amazon Bedrock (Claude 3 Haiku) |
| Cloud compute | AWS Lambda (Node.js 20) |
| API routing | API Gateway (HTTP API) |
| Hosting | AWS Amplify (auto-deploy from GitHub) |
| IDE | Kiro (specs-driven development) |

---

## 4. App Sections

### 4.1 Section Overview

| Section | Purpose | Entry Point |
|---------|---------|-------------|
| **HOME** | Upload PDFs, manage document library | App launch |
| **QUIZ** | Adaptive quiz â†’ identify weak topics â†’ diagnose study technique | Tap a document â†’ "Quiz" |
| **REVIEW** | Pick a learning technique â†’ apply to a module â†’ guided study session | Tap a document â†’ "Review" OR recommended after quiz |
| **DASHBOARD** | Learning curve, mastery map, technique effectiveness | Tap a document â†’ "Dashboard" OR shown after quiz/review |

### 4.2 Navigation

```
Bottom Navigation Bar (always visible):
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  ðŸ  Home â”‚  ðŸ“ Quiz â”‚  ðŸ“– Reviewâ”‚ ðŸ“Š Dashboardâ”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

- Home is the default landing page
- Quiz, Review, and Dashboard are document-scoped (user selects a document first)
- Tier badge (ðŸŸ¢ðŸ”µðŸŸ¡) visible in the top-right corner of every screen

---

## 5. HOME Section

### 5.1 Purpose
Upload PDFs, view document library, select a document to study.

### 5.2 Screens

#### 5.2.1 Home â€” Empty State
**When:** No documents uploaded yet.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Study Bunny          ðŸŸ¡ Offline   â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚       ðŸ“„                        â”‚
â”‚   Upload your first PDF         â”‚
â”‚   to start studying             â”‚
â”‚                                 â”‚
â”‚   Your notes. Your device.      â”‚
â”‚   Your pace.                    â”‚
â”‚                                 â”‚
â”‚   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”      â”‚
â”‚   â”‚  ðŸ“¤ Upload PDF       â”‚      â”‚
â”‚   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜      â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

#### 5.2.2 Home â€” Document Library
**When:** One or more documents uploaded.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Study Bunny          ðŸ”µ Cloud AI  â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ“„ Calculus Ch.3        â”‚   â”‚
â”‚  â”‚    12 pages Â· 3 quizzes â”‚   â”‚
â”‚  â”‚    Mastery: 45% â–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘  â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ“„ Philippine History   â”‚   â”‚
â”‚  â”‚    8 pages Â· 1 quiz     â”‚   â”‚
â”‚  â”‚    Mastery: 72% â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘ â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ“„ Data Structures      â”‚   â”‚
â”‚  â”‚    15 pages Â· 0 quizzes â”‚   â”‚
â”‚  â”‚    Mastery: New         â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚            [+ Upload PDF]       â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Tap a document â†’ enters document scope â†’ bottom nav shows Quiz, Review, Dashboard for that document.**

### 5.3 Upload Flow

1. User taps "Upload PDF" â†’ file picker opens (accept `.pdf` only)
2. PDF.js extracts text page by page
3. Text chunked into 400-token segments with 50-token overlap (sentence-aware)
4. Document + chunks saved to IndexedDB
5. Progress bar shown during extraction
6. On complete â†’ navigate to document's Quiz section

### 5.4 Technical Requirements

- PDF.js with web worker for non-blocking extraction
- Max file size: 50MB (soft limit, warn user)
- Estimated storage: ~350KB per document in IndexedDB
- Document card shows: title (filename minus .pdf), page count, quiz count, overall mastery %

---

## 6. QUIZ Section

### 6.1 Purpose
Test the student's knowledge, track mastery per topic via BKT, identify weak areas, diagnose study technique, and recommend improvements.

### 6.2 Flow

```
Quiz Section Entry
  â†’ Pre-Quiz: Study Technique Survey (first time per document)
  â†’ Quiz: 5 adaptive questions
  â†’ Results: Score + weak topics
  â†’ Post-Quiz: Technique Diagnosis + AI Recommendation
  â†’ CTA: "Try Review Mode with [recommended technique]"
```

### 6.3 Screens

#### 6.3.1 Pre-Quiz: Study Technique Survey
**When:** First quiz on this document, OR user hasn't set a technique yet.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  â† Calculus Ch.3   ðŸ”µ Cloud AI  â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  Before we start, how do you    â”‚
â”‚  usually study this material?   â”‚
â”‚                                 â”‚
â”‚  â—‹ Re-reading notes             â”‚
â”‚  â—‹ Highlighting key parts       â”‚
â”‚  â—‹ Summarizing in own words     â”‚
â”‚  â—‹ Flashcards                   â”‚
â”‚  â—‹ Practice testing / quizzes   â”‚
â”‚  â—‹ Teaching it to someone       â”‚
â”‚  â—‹ Group study                  â”‚
â”‚  â—‹ Watching video explanations  â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”       â”‚
â”‚  â”‚  Start Quiz â†’        â”‚       â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜       â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Stored as:** `{ documentId, technique: 'rereading', setAt: timestamp }`

#### 6.3.2 Quiz: 5 Adaptive Questions
**Question types by tier:**

| Tier | Question Types |
|------|---------------|
| Tier 2 (Bedrock) | MCQ with 4 options + distractor explanations |
| Tier 3 (Offline) | Fill-in-blank (RAKE keyword removal) + True/False (keyword swap) |
| Tier 1 (On-device) | SLM-generated MCQ (stretch goal) |

**Adaptive logic (BKT):**
- First quiz: balanced across all detected topics
- Subsequent quizzes: â‰¥3 of 5 questions target weak topics (mastery < 0.6)
- BKT updates after EACH answer, not just at quiz end

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  â† Calculus Ch.3   ðŸ”µ Cloud AI  â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚  Question 2 of 5                â”‚
â”‚  Topic: Derivatives             â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  What is the derivative of      â”‚
â”‚  f(x) = 3xÂ² + 2x?             â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ A) 6x + 2               â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ B) 3x + 2               â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ C) 6xÂ² + 2              â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ D) 6x                   â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**After answering:** Show correct/incorrect + explanation + source passage from notes.

#### 6.3.3 Quiz Results
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  â† Calculus Ch.3   ðŸ”µ Cloud AI  â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  Score: 2/5 (40%)              â”‚
â”‚                                 â”‚
â”‚  Topic Mastery:                 â”‚
â”‚  Derivatives    â–ˆâ–ˆâ–‘â–‘â–‘â–‘â–‘â–‘ 25%   â”‚
â”‚  Integrals      â–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘â–‘ 52%   â”‚
â”‚  Limits         â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘ 71%   â”‚
â”‚  Chain Rule     â–ˆâ–‘â–‘â–‘â–‘â–‘â–‘â–‘ 15%   â”‚
â”‚                                 â”‚
â”‚  âš ï¸ Weak areas: Derivatives,   â”‚
â”‚     Chain Rule                  â”‚
â”‚                                 â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚  ðŸ“Š View Learning Curve         â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

#### 6.3.4 Post-Quiz: Technique Diagnosis
**Shown after quiz results if score < 70%.**

**Tier 3 (Offline):**
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  â† Calculus Ch.3   ðŸŸ¡ Offline   â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  ðŸ’¡ Study Technique Analysis    â”‚
â”‚                                 â”‚
â”‚  You're using: Re-reading       â”‚
â”‚  Effectiveness: Low             â”‚
â”‚  (Dunlosky et al., 2013)       â”‚
â”‚                                 â”‚
â”‚  Your mastery in Derivatives    â”‚
â”‚  has plateaued at 25% across    â”‚
â”‚  3 quiz attempts.               â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ”¬ Recommended:          â”‚   â”‚
â”‚  â”‚ PRACTICE TESTING          â”‚   â”‚
â”‚  â”‚                           â”‚   â”‚
â”‚  â”‚ Research shows it's 2.5x  â”‚   â”‚
â”‚  â”‚ more effective than        â”‚   â”‚
â”‚  â”‚ re-reading for procedural â”‚   â”‚
â”‚  â”‚ knowledge like Calculus.   â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ Try Practice Testing â†’    â”‚   â”‚
â”‚  â”‚ (Opens Review Mode)       â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ Retake Quiz Instead       â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Tier 2 (Bedrock) â€” enhanced analysis:**
Bedrock receives: weak topics, current technique, mastery history, topic type.
Returns: personalized analysis explaining WHY the current technique isn't working for THIS specific material + tailored recommendation.

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

```javascript
const TECHNIQUES = {
  rereading:       { name: 'Re-reading',               effectiveness: 'low' },
  highlighting:    { name: 'Highlighting',              effectiveness: 'low' },
  summarizing:     { name: 'Summarizing',               effectiveness: 'low' },
  flashcards:      { name: 'Flashcards',                effectiveness: 'moderate' },
  group_study:     { name: 'Group Study',               effectiveness: 'moderate' },
  video:           { name: 'Video Explanations',        effectiveness: 'moderate' },
  self_explain:    { name: 'Teaching / Self-Explanation',effectiveness: 'moderate' },
  practice_test:   { name: 'Practice Testing',          effectiveness: 'high' },
  distributed:     { name: 'Spaced Retrieval',          effectiveness: 'high' },
  interleaved:     { name: 'Interleaved Practice',      effectiveness: 'high' },
};

function recommendTechnique(currentTechnique, quizScore, weakTopics, masteryHistory) {
  const current = TECHNIQUES[currentTechnique];

  if (quizScore >= 0.7) {
    return {
      keep: true,
      message: `${current.name} is working for you. Keep going.`,
    };
  }

  // Check for plateau (3+ attempts, mastery not improving)
  const isPlateaued = masteryHistory.length >= 3 &&
    Math.abs(masteryHistory[masteryHistory.length - 1] - masteryHistory[masteryHistory.length - 3]) < 0.05;

  if (current.effectiveness === 'low' || isPlateaued) {
    return {
      keep: false,
      recommended: 'practice_test',
      message: `${current.name} is a passive technique. Practice Testing is 2.5x more effective for topics like: ${weakTopics.join(', ')}.`,
      action: 'Try answering questions from memory BEFORE re-reading.',
      evidence: 'Dunlosky et al., 2013 â€” Improving Students\' Learning With Effective Learning Techniques',
    };
  }

  if (current.effectiveness === 'moderate') {
    return {
      keep: false,
      recommended: 'distributed',
      message: `${current.name} is decent, but spacing your study sessions dramatically improves long-term retention.`,
      action: 'Study this topic now, then come back in 1-3 days for a follow-up quiz.',
      evidence: 'Cepeda et al., 2006 â€” Distributed Practice in Verbal Recall Tasks',
    };
  }

  // Already using high-effectiveness technique
  return {
    keep: true,
    message: `You're using the right technique. Focus more time on: ${weakTopics.join(', ')}.`,
    action: 'Your next quiz will target your weak areas specifically.',
  };
}
```

---

## 7. REVIEW Section

### 7.1 Purpose
Apply a specific learning technique to a specific module. Generates a guided study session and tracks its own learning curve to prove technique effectiveness.

### 7.2 Flow

```
Review Section Entry
  â†’ Pick a Learning Technique (or use AI recommendation)
  â†’ Pick a Module (uploaded PDF)
  â†’ Guided Study Session (technique-specific)
  â†’ Session Results + Mastery Update
  â†’ Learning Curve Updated (tagged with technique)
```

### 7.3 Screens

#### 7.3.1 Technique Selection
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  â† Review Mode     ðŸ”µ Cloud AI  â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  Pick a learning technique:     â”‚
â”‚                                 â”‚
â”‚  â­ RECOMMENDED                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ”¬ Practice Testing      â”‚   â”‚
â”‚  â”‚ High effectiveness       â”‚   â”‚
â”‚  â”‚ "Test yourself before    â”‚   â”‚
â”‚  â”‚  re-reading"             â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  ALL TECHNIQUES                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ§  Feynman Technique     â”‚   â”‚
â”‚  â”‚ Explain it in your words â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ â° Spaced Retrieval      â”‚   â”‚
â”‚  â”‚ Quiz now, re-quiz later  â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ â“ Elaborative Questions  â”‚   â”‚
â”‚  â”‚ Deep "why" and "how"     â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

#### 7.3.2 Module Selection
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  â† Practice Testing ðŸ”µ Cloud AI â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  Apply to which module?         â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ“„ Calculus Ch.3         â”‚   â”‚
â”‚  â”‚    Weak: Derivatives,    â”‚   â”‚
â”‚  â”‚    Chain Rule             â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ“„ Philippine History    â”‚   â”‚
â”‚  â”‚    Weak: Propaganda      â”‚   â”‚
â”‚  â”‚    Movement               â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ“„ Data Structures       â”‚   â”‚
â”‚  â”‚    No quiz data yet      â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

#### 7.3.3 Guided Study Sessions (Technique-Specific)

Each technique generates a DIFFERENT study experience from the SAME PDF:

---

**PRACTICE TESTING:**
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Practice Testing Ã— Calculus    â”‚
â”‚  Focus: Derivatives, Chain Rule â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  Question 1 of 5                â”‚
â”‚                                 â”‚
â”‚  Without looking at your notes, â”‚
â”‚  answer this:                   â”‚
â”‚                                 â”‚
â”‚  "Explain how the chain rule    â”‚
â”‚   applies to composite          â”‚
â”‚   functions."                   â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚                           â”‚   â”‚
â”‚  â”‚  [Type your answer...]    â”‚   â”‚
â”‚  â”‚                           â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚  Check Answer â†’           â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

After submitting:
- **Tier 2:** Bedrock compares student's answer to source passages, identifies gaps, scores understanding
- **Tier 3:** TF-IDF similarity between student's answer and relevant chunks â†’ show matching passages â†’ student self-rates: "Did I get it right?" (Yes/Partially/No)

---

**FEYNMAN TECHNIQUE:**
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Feynman Ã— Calculus             â”‚
â”‚  Topic: Derivatives             â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  Explain this concept as if     â”‚
â”‚  you're teaching a classmate    â”‚
â”‚  who missed the lecture:        â”‚
â”‚                                 â”‚
â”‚  "What are derivatives and      â”‚
â”‚   why do we use them?"          â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚                           â”‚   â”‚
â”‚  â”‚  [Type your explanation]  â”‚   â”‚
â”‚  â”‚                           â”‚   â”‚
â”‚  â”‚                           â”‚   â”‚
â”‚  â”‚                           â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚  Submit Explanation â†’     â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

After submitting:
- **Tier 2:** Bedrock analyzes explanation â†’ "You covered the definition well but missed: chain rule application, relationship to rate of change" â†’ shows relevant source passages
- **Tier 3:** TF-IDF matches explanation against chunks â†’ shows which chunks were NOT covered â†’ "You might have missed these concepts:" + list of unmatched keywords

---

**SPACED RETRIEVAL:**
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Spaced Retrieval Ã— Calculus    â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  Session 1 of 4                 â”‚
â”‚  (Now â†’ 1 day â†’ 3 days â†’ 7 days)â”‚
â”‚                                 â”‚
â”‚  5 recall questions on          â”‚
â”‚  Derivatives + Chain Rule       â”‚
â”‚                                 â”‚
â”‚  [Same quiz UI as Quiz Section] â”‚
â”‚                                 â”‚
â”‚  After completion:              â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ âœ… Session 1 complete     â”‚   â”‚
â”‚  â”‚ Next session: Tomorrow    â”‚   â”‚
â”‚  â”‚ at ~2:30 AM               â”‚   â”‚
â”‚  â”‚                           â”‚   â”‚
â”‚  â”‚ We'll remind you.         â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

**ELABORATIVE INTERROGATION:**
```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Elaborative Ã— Calculus         â”‚
â”‚  Topic: Chain Rule              â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  Question 1 of 5                â”‚
â”‚                                 â”‚
â”‚  Your notes say:                â”‚
â”‚  "The chain rule is used to     â”‚
â”‚   differentiate composite       â”‚
â”‚   functions."                   â”‚
â”‚                                 â”‚
â”‚  WHY is this true?              â”‚
â”‚  What would happen WITHOUT      â”‚
â”‚  the chain rule?                â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚                           â”‚   â”‚
â”‚  â”‚  [Type your reasoning]    â”‚   â”‚
â”‚  â”‚                           â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚  See Explanation â†’        â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 7.4 Review Session Results

After completing any technique session:

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Session Complete!              â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  Technique: Practice Testing    â”‚
â”‚  Module: Calculus Ch.3          â”‚
â”‚  Focus: Derivatives, Chain Rule â”‚
â”‚                                 â”‚
â”‚  Performance: 3/5 correct       â”‚
â”‚  Mastery update:                â”‚
â”‚  Derivatives  25% â†’ 42% â†‘      â”‚
â”‚  Chain Rule   15% â†’ 31% â†‘      â”‚
â”‚                                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ“Š View Learning Curve   â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ”„ Another Session       â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚ ðŸ“ Take a Quiz to Test   â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 7.5 Technique-Specific Generation

| Technique | Tier 3 (Offline) | Tier 2 (Bedrock) |
|-----------|-----------------|-------------------|
| Practice Testing | RAKE keywords â†’ fill-in-blank recall questions | Bedrock generates open-ended recall questions |
| Feynman | TF-IDF similarity score + unmatched keyword list | Bedrock analyzes explanation quality + identifies gaps |
| Spaced Retrieval | Same quiz engine, scheduled intervals, stored locally | Bedrock generates varied questions per interval |
| Elaborative | Template: "Why does [keyword] matter?" + show source passage | Bedrock generates deep "why/how" questions from context |

### 7.6 MVP Scope for Review

**Must build (for demo):**
- Practice Testing (reuses quiz engine with open-ended format)
- Technique selection screen
- Module selection screen
- Session results with mastery update

**Should build (if time):**
- Feynman Technique (text input + TF-IDF comparison)
- Spaced Retrieval (scheduled intervals)

**Won't build (post-hackathon):**
- Elaborative Interrogation
- Interleaved Practice
- Mind Mapping

---

## 8. DASHBOARD Section

### 8.1 Purpose
Visualize the student's learning journey: mastery per topic over time, technique effectiveness, and the inflection point where switching techniques improved performance.

### 8.2 Screens

#### 8.2.1 Learning Curve (Primary View)

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  â† Calculus Ch.3   ðŸ”µ Cloud AI  â”‚
â”‚  ðŸ“Š Dashboard                    â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚                                 â”‚
â”‚  Learning Curve                 â”‚
â”‚                                 â”‚
â”‚  100%â”¤                          â”‚
â”‚      â”‚                    â—â”€â”€â—  â”‚
â”‚   75%â”¤               â—â”€â”€â—      â”‚
â”‚      â”‚          â—â”€â”€â—            â”‚
â”‚   50%â”¤     â—â”€â”€â—                 â”‚
â”‚      â”‚  â—â”€â—  â†‘ Switched to     â”‚
â”‚   25%â”¤â—â”€â—   Practice Testing   â”‚
â”‚      â”‚                          â”‚
â”‚    0%â”¼â”€â”€â”¬â”€â”€â”¬â”€â”€â”¬â”€â”€â”¬â”€â”€â”¬â”€â”€â”¬â”€â”€â†’    â”‚
â”‚      Q1 Q2 Q3 R1 R2 R3 Q4     â”‚
â”‚                                 â”‚
â”‚  â”€â”€ Quiz (Re-reading)           â”‚
â”‚  â”€â”€ Review (Practice Testing)   â”‚
â”‚                                 â”‚
â”‚  âš¡ Mastery improved 35% â†’ 78% â”‚
â”‚     after switching techniques  â”‚
â”‚                                 â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚  Topic Mastery                  â”‚
â”‚                                 â”‚
â”‚  Derivatives    â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘ 72%   â”‚
â”‚  Chain Rule     â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘ 58%   â”‚
â”‚  Integrals      â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘ 85%   â”‚
â”‚  Limits         â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ 91%   â”‚
â”‚                                 â”‚
â”‚â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”‚
â”‚  Technique Effectiveness        â”‚
â”‚                                 â”‚
â”‚  Re-reading (Q1-Q3):           â”‚
â”‚  Avg mastery gain: +2%/session  â”‚
â”‚                                 â”‚
â”‚  Practice Testing (R1-R3):     â”‚
â”‚  Avg mastery gain: +14%/session â”‚
â”‚                                 â”‚
â”‚  ðŸ“ˆ Practice Testing is 7x     â”‚
â”‚     more effective for you      â”‚
â”‚                                 â”‚
â”‚  ðŸ     ðŸ“    ðŸ“–    ðŸ“Š          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 8.3 Dashboard Data Sources

| Component | Data Source | Calculation |
|-----------|-----------|-------------|
| Learning Curve line | `quizResults` table, ordered by timestamp | Plot mastery % per attempt |
| Technique color coding | `technique` field on each quiz/review result | Different line color per technique |
| Inflection point | First record where `technique` changed | Annotated marker on chart |
| Topic Mastery bars | Latest BKT mastery per topic | Direct from `knowledgeState` table |
| Technique Effectiveness | Group results by technique â†’ calculate avg mastery delta per session | `(mastery_after - mastery_before) / session_count` per technique |
| Improvement stat | Compare avg mastery in last 3 sessions of old technique vs first 3 of new | Percentage difference |

### 8.4 Technical Implementation

The learning curve is a simple line chart. For MVP, render with pure CSS/HTML (no charting library needed to save bundle size):

```javascript
// Query all results for this document, ordered by time
const results = await db.quizResults
  .where('documentId').equals(docId)
  .sortBy('timestamp');

// Group by technique for color coding
const chartData = results.map((r, i) => ({
  attempt: i + 1,
  mastery: r.mastery,
  technique: r.technique,
  source: r.source, // 'quiz' or 'review'
  label: r.source === 'quiz' ? `Q${quizCount++}` : `R${reviewCount++}`,
}));

// Find inflection point
const techniqueSwitch = chartData.findIndex((d, i) =>
  i > 0 && d.technique !== chartData[i-1].technique
);
```

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

## 10. AWS Lambda Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Tier detection health check |
| `/api/summarize` | POST | Tier 2 structured summary |
| `/api/quiz` | POST | Tier 2 adaptive MCQ generation |
| `/api/chat` | POST | Tier 2 RAG chat (if time permits) |
| `/api/analyze-technique` | POST | Tier 2 study technique analysis |
| `/api/review-session` | POST | Tier 2 technique-specific question generation |

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

### `/api/review-session` â€” NEW

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

### 11.1 Colors (from Brand Guidelines v3.0)

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | #0D7377 | Buttons, headers, links |
| Primary Dark | #095557 | Hover states |
| Background | #F8F9FA | Page background |
| Surface | #FFFFFF | Cards |
| Text Primary | #1A1A2E | Body text |
| Text Secondary | #6B7280 | Captions, labels |
| Tier Edge (Green) | #16A34A | ðŸŸ¢ On-Device AI badge |
| Tier Cloud (Blue) | #2563EB | ðŸ”µ Cloud AI badge |
| Tier Offline (Amber) | #D97706 | ðŸŸ¡ Offline Mode badge |
| Success | #059669 | Correct answers, mastery gains |
| Warning | #D97706 | Plateau alerts |
| Error | #DC2626 | Wrong answers, low mastery |

### 11.2 Typography
- Font: Inter (system fallback: system-ui, sans-serif)
- Body: 14px minimum
- Headings: 18-24px, font-weight 600
- Touch targets: 48px minimum height
- Card border radius: 12px
- Screen padding: 16px

### 11.3 Design Principles
- Mobile-first (target: Samsung Galaxy A13, 6.6" screen)
- No dark mode (MVP)
- No animations beyond essential transitions
- No gamification (no streaks, badges, avatars)
- Tier badge always visible â€” transparency about what's powering the experience

---

## 12. MVP Build Checklist

### Must Have (Demo-Critical) âœ…

**Home:**
- [ ] PDF upload â†’ text extraction â†’ chunking â†’ IndexedDB
- [ ] Document library with mastery preview
- [ ] Tier detection + badge on all screens

**Quiz:**
- [ ] Pre-quiz technique survey (first time per document)
- [ ] 5-question adaptive quiz (Tier 3: fill-blank + T/F; Tier 2: Bedrock MCQ)
- [ ] BKT mastery update after each answer
- [ ] Quiz results with topic mastery bars
- [ ] Post-quiz technique diagnosis (Tier 3: rule-based; Tier 2: Bedrock analysis)
- [ ] CTA to Review Mode with recommended technique

**Review:**
- [ ] Technique selection screen (with AI recommendation highlighted)
- [ ] Module selection screen (with weak topics shown)
- [ ] Practice Testing session (5 recall questions from weak topics)
- [ ] Session results with mastery update
- [ ] Results tagged with technique + source for Dashboard

**Dashboard:**
- [ ] Learning curve (mastery over time, color-coded by technique)
- [ ] Technique switch inflection point marked
- [ ] Topic mastery bars
- [ ] Technique effectiveness comparison

**Infrastructure:**
- [ ] Lambda deployed with /health, /quiz, /analyze-technique, /review-session
- [ ] Amplify deployment with live URL
- [ ] PWA manifest + service worker
- [ ] Airplane mode demo works end-to-end

### Should Have (If Time) âš ï¸

- [ ] Feynman Technique in Review Mode
- [ ] Spaced Retrieval scheduling
- [ ] Summary generation (Tier 2 + Tier 3)
- [ ] RAG Chat
- [ ] Tier 2 technique analysis (Bedrock-powered)

### Won't Have (Post-Hackathon) âŒ

- Elaborative Interrogation
- Interleaved Practice
- Mind Mapping
- Push notifications
- User accounts
- Cloud sync
- Tier 1 (on-device SLM)

---

## 13. Developer Assignment

| Dev | Owns | Priority Tasks |
|-----|------|---------------|
| **Dev 1 (Lead)** | `/src/core/`, `/src/db/`, `/src/services/tierDetection.js` | Scaffold, DB schema, PDF processor, tier detection, integration wiring |
| **Dev 2** | `/src/services/quiz/`, `/src/services/bkt.js`, `/src/services/techniqueEngine.js` | RAKE, TF-IDF, quiz generation (both tiers), BKT engine, technique recommendation engine |
| **Dev 3** | `/lambda/`, `/src/api/`, `/src/services/review/` | Lambda deployment, all Bedrock endpoints, review session generation, Tier 2 technique analysis |
| **Dev 4** | `/src/pages/`, `/src/components/` | All UI: Home, Quiz flow, Review flow, Dashboard, learning curve chart, navigation |

---

## 14. Submission Form Answers

**Project Name:** Study Bunny

**Project Overview (â‰¤200 words):**
Study Bunny is a free, offline-first PWA that turns uploaded PDF notes into adaptive quizzes, diagnoses study techniques, and recommends evidence-based learning methods â€” all on a budget phone with no internet. The app uses a three-tier architecture: Amazon Bedrock (Claude 3 Haiku) for best-quality AI when online, and deterministic algorithms (RAKE, TF-IDF, BKT) when offline. Students upload their course notes, take adaptive quizzes powered by Bayesian Knowledge Tracing, see their learning curve over time, and receive personalized recommendations to switch from ineffective study habits (like re-reading) to evidence-based techniques (like practice testing). A dedicated Review Mode lets students apply specific learning techniques to their materials with guided study sessions. Built for the 17.4 million Filipino students without reliable internet, where ChatGPT Plus costs more than a student's entire monthly allowance.

**Pain Point:**
Filipino students face compounding barriers: 91% learning poverty, 51% without internet, and AI tools that cost â‚±1,120/month against a â‚±1,235 average allowance. Even students who CAN study often use ineffective techniques â€” 84% default to re-reading, the least effective method. The students who need AI the most are locked out of it, and those who study do it wrong.

**Solution:**
An offline-first PWA with three-tier AI (Bedrock â†’ on-device â†’ deterministic fallback) that provides adaptive quizzes, learning curve tracking, study technique diagnosis, and guided review sessions â€” all from the student's own uploaded notes, for free, on any device.

**Tech Stack:**
React 18, Vite, Tailwind CSS, Dexie.js (IndexedDB), PDF.js, RAKE (pure JS), TF-IDF (pure JS), BKT (pure JS), Amazon Bedrock (Claude 3 Haiku), AWS Lambda, API Gateway, AWS Amplify, Kiro IDE, Amazon Quick.
