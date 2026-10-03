# Notes Fact-Check — Design

## Overview

This feature adds an opt-in "Check my notes for errors" capability that is the
single, deliberate exception to Study Bunny's "notes-only" grounding rule. It
extracts factual claims from a document, sends claim text + anonymous chunks to a
**new** cloud endpoint whose prompt is allowed to use world knowledge, and
returns per-claim verdicts (`correct` / `likely_incorrect` / `uncertain`), a
confidence level, and — only for likely-incorrect claims — a suggested
correction with rationale.

The design's governing constraint is **isolation**: nothing here touches the
existing chat/summarize/quiz prompts, validators, or their notes-only guarantee.
Fact-check gets its own endpoint, its own client service, its own prompt, and its
own validator. It is **Cloud-tier only** — there is no deterministic fact-check,
because world-knowledge verification is impossible offline. At Tier 3 the feature
honestly reports "verification needs an internet connection."

```
Reuse (unchanged):  resolveTier · TierBadge · apiTransport (apiPost) ·
                    chunkRecords · Dexie repository · cloud-api lib
                    (http/errors/logger/validation/responseValidators/bedrockClient)
New (frontend):     services/factCheck/{index.js, claimExtractor.js, factCheckTier2.js}
                    components/FactCheckPanel.jsx (or a section on StudentDocument)
New (cloud-api):    src/handlers/verifyNotes.js + prompt + validator additions
Edit:               StudentDocument.jsx (opt-in entry + disclaimer) ·
                    cloud-api/template.yaml (one least-privilege function)
Optional (additive):db version(3) + factCheckResults store (may be deferred)
```

---

## Architecture

### Frontend

```
src/services/factCheck/
├── claimExtractor.js   NEW — pick candidate factual claims from chunks (pure JS)
├── factCheckTier2.js   NEW — POST /api/verify-notes (chunks + claims only)
└── index.js            NEW — tier router: Cloud → honest "unavailable" at Tier 3

src/components/
└── FactCheckPanel.jsx  NEW — opt-in trigger, disclaimer, per-claim results,
                              TierBadge, live-region announcements, empty state

src/pages/student/
└── StudentDocument.jsx EDIT — add the opt-in "Check my notes for errors" entry
```

### Cloud API (Tier 2)

```
cloud-api/src/handlers/verifyNotes.js   NEW — POST /api/verify-notes
cloud-api/src/lib/promptBuilders.js     EDIT — add buildVerifyNotesPrompt (world-knowledge-allowed)
cloud-api/src/lib/validation.js         EDIT — add validateVerifyNotes (boundary; reject PII)
cloud-api/src/lib/responseValidators.js EDIT — add validateVerifyNotes (model output)
cloud-api/template.yaml                 EDIT — add one least-privilege Lambda + log group
cloud-api/test/verifyNotes.test.js      NEW — happy / 400 / 502 + content-free logging
```

---

## Tier routing (the key difference from other features)

Fact-check is the inverse of the normal pattern: instead of "cloud enriches,
deterministic always works," here **only cloud works**, and deterministic is a
dead end by nature.

```js
// services/factCheck/index.js (sketch)
export async function factCheck(documentId, { preference = null } = {}) {
  const { tier } = await resolveTier({ feature: 'factcheck', preference });

  if (tier !== TIER.CLOUD) {
    // No world knowledge offline — do NOT fabricate. Honest unavailability.
    return { tier: TIER.DETERMINISTIC, available: false, results: [],
             message: 'Fact-check needs an internet connection (Cloud AI).' };
  }

  const doc = await getDocument(documentId);
  const records = getChunkRecords(doc);
  const claims = extractClaims(records, { max: 10 });
  if (claims.length === 0) return { tier: TIER.CLOUD, available: true, results: [] };

  try {
    const res = await factCheckTier2({ claims, chunks: records.map(r => ({ chunkId: r.chunkId, text: r.text })) });
    return { tier: TIER.CLOUD, available: true, results: res.results };
  } catch (err) {
    // Mid-flight cloud failure: honest "unavailable", labeled Offline mode. Never fabricate.
    return { tier: TIER.DETERMINISTIC, available: false, results: [],
             message: 'Verification unavailable right now.' };
  }
}
```

The UI shows `<TierBadge tier={result.tier} />` (effective tier). When
`available === false` it renders the message, not an error.

---

## Claim extraction (`claimExtractor.js`, pure JS, offline-safe)

Extraction itself needs no network — it just selects *what to ask about*. It
reuses sentence splitting and the existing RAKE keyword signal to prefer
information-dense sentences, and favors sentences that look like checkable facts:

- Definition shapes ("X is/are/means …"), dated statements (year/number
  patterns), and named relationships (keyword-dense sentences from
  `rakeExtractor`).
- Each claim keeps `{ claimId, text, chunkId, page? }` from `getChunkRecords`.
- Capped at `max` (default 10). Deterministic and total; returns `[]` when the
  document has no suitable sentences (drives the empty state, Req 7.3).

No new heavy deps; consistent with the zero-dependency offline services.

---

## Cloud endpoint

Follows the existing handler pipeline exactly (methodGuard → parseJsonBody →
boundary validate → build prompt → `invokeModel` DI seam → parse + validate
output, retry once then 502; content-free `logDiagnostic`). Bedrock is behind the
injection seam so tests stub it.

```
POST /api/verify-notes
  req: {
    claims: [{ claimId: string, text: string, chunkId?: string, page?: number }],
    chunks: [{ chunkId: string, text: string }]   // context for grounding the claim wording
  }
  res: {
    results: [{
      claimId: string,
      verdict: 'correct' | 'likely_incorrect' | 'uncertain',
      confidence: 'low' | 'medium' | 'high',
      correction: string | null,   // non-null ONLY when verdict === 'likely_incorrect'
      rationale: string,            // short; empty allowed for 'correct'
      chunkId: string | null
    }]
  }
```

### Prompt (`buildVerifyNotesPrompt`) — the ONE world-knowledge-allowed prompt

System prompt intent (kept confined to this handler):
- "You are checking a student's study notes for factual accuracy. You MAY use
  general world knowledge for this task."
- "For each claim, decide: correct, likely_incorrect, or uncertain. Give a
  confidence level. Only when likely_incorrect, provide a concise corrected
  statement and a one-sentence rationale."
- "If you are not reasonably sure, use 'uncertain' and do NOT invent a
  correction."
- "Respond with a single JSON object and nothing else" + the exact schema above.

This is deliberately the opposite instruction from `buildChatPrompt`
("Never use outside knowledge"). The two prompts never share a code path.

### Boundary validation (`validation.js` addition)

- Require `claims` (non-empty array, each with string `text`) and `chunks`
  (array of `{ chunkId, text }`). Enforce a max claim count.
- Reject PII-looking fields (filename, studentName, classroomId, raw PDF bytes,
  etc.) with `400 VALIDATION_ERROR`, matching the existing handlers' PII policy.

### Output validation / coercion (`responseValidators.js` addition)

- `verdict` must be one of the three literals; anything else → `uncertain`.
- `confidence` must be one of the three literals; anything else → `low`.
- **Safety coercion:** if `verdict !== 'likely_incorrect'`, force
  `correction = null` (a model must never attach a "correction" to a claim it
  called correct or uncertain). Drop `chunkId` values not present in the request.
- On structurally bad JSON, the handler retries once then returns 502
  (never surfaces model text).

---

## Data model (optional, additive — Dexie version 3)

Deferred-by-default (see open decision). If adopted:

```js
db.version(3).stores({
  // all v2 stores kept verbatim …
  factCheckResults: '++id, documentId, createdAt',
});
// record: { id, documentId, tier, results: [...], createdAt }
```

Helpers (additive, contract bump): `saveFactCheck({ documentId, tier, results })`,
`getFactChecks(documentId)`. No existing store or index is touched.

---

## UI (`FactCheckPanel.jsx`)

- An opt-in trigger button (≥48px) on the document screen, visually separate from
  the notes-only features, with a one-line "uses the internet + general
  knowledge" note.
- A **standing disclaimer** always visible with results: "AI suggestions — may be
  imperfect. Confirm against your textbook or instructor."
- Per claim: the original passage (anchored by `chunkId`/page), a text + icon
  verdict badge (✓ correct / ⚠ likely incorrect / ? uncertain — never
  color-only), confidence, and for likely-incorrect, the suggested correction +
  rationale.
- `<TierBadge tier={effectiveTier} />` shown; when `available === false`, render
  the honest message instead of results.
- Loading announced via `role="status"`; completion/errors via live region.
- Empty state (no claims / no results) is encouraging, not an error (Req 7.3).

---

## Error handling

- Offline / cloud-down / mid-flight failure → `available: false` honest message,
  labeled effective tier; never an error screen, never a fabricated verdict.
- Bad model JSON → one retry → 502 UPSTREAM_ERROR (generic body, no content).
- Claim extraction is pure and total; no claims → empty state.

## Testing strategy

- **Unit (pure):** `claimExtractor` selects checkable sentences, caps at max,
  returns `[]` on unsuitable input; output coercion rules (correction forced null
  unless likely_incorrect; verdict/confidence literal coercion).
- **Cloud (reuse harness):** `/api/verify-notes` happy-path, 400 validation
  (including PII rejection), 502 upstream, and content-free logging — extending
  the existing `cloud-api/test` sweep. Bedrock stubbed; no network, no creds.
- **Tier behavior:** Deterministic tier returns `available:false` with no
  results; forced mid-flight cloud failure returns the honest unavailable state.
- **Safety:** a stub model that returns `verdict:'correct'` with a `correction`
  is coerced so `correction` is dropped.

## Open design decisions (confirm at review)

1. **Persistence now or later?** Ship session-only first (no DB bump), or include
   Dexie version 3 + `factCheckResults` in this feature? Recommendation:
   session-only for the MVP; add persistence as a follow-up minor bump.
2. **Claim extraction depth.** Simple heuristic (definition/number/keyword-dense
   sentences, proposed) vs. a richer claim parser. Recommendation: start simple;
   the model does the actual judging.
3. **Entry placement.** A dedicated section on `StudentDocument` vs. a separate
   route (`/student/document/:id/verify`). Recommendation: a section on
   `StudentDocument`, consistent with how summary/quiz surface there.
4. **Scope of "notes."** Check the whole document (capped) vs. only a
   student-selected passage. Recommendation: offer both — a "check this section"
   affordance plus a capped whole-document pass.
