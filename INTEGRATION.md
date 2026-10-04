# Study Bunny integration contracts

Current scope is student study mode, written in JavaScript/JSX. Historical
teacher/assessment proposals are not implemented capabilities.

## Local repository

Use the single `StudyBunnyDB` Dexie instance in `src/db/database.js`. Upgrades are
additive: v2 added techniques, Feynman attempts and SM-2 fields; v3 adds
`verificationReports` and the summary compound index `[documentId+tier]`.
The nine stores are `documents`, `summaries`, `quizzes`, `knowledgeState`,
`chatHistory`, `appSettings`, `studyTechniques`, `feynmanAttempts`, and
`verificationReports`.

`saveDocument({ title, rawText, chunks, pages, createdAt })` preserves extracted
pages, including blanks. `deleteDocument(id)` transactionally removes all seven
dependent study stores. Existing helpers manage summaries, quizzes, mastery,
technique selection, Feynman attempts, schedules and chat.
`saveVerificationReport(documentId, report)` requires an existing document, forces
the owning ID/current timestamp, and retains the latest 20 reports per document.
`getVerificationReports(documentId)` returns newest first. Saved reports are
sanitized snapshots, not automatically refreshed when notes change.

## Cloud transport

`apiPost()` requires consent, online status and a saved access code. It redacts
content strings and sends the code in the `X-Study-Bunny-Code` header to the
app's own `/api` routes (same origin; `VITE_API_BASE_URL` is optional). Health
requires JSON `{ status: "ok" }`, not merely HTTP 200, and the server reports ok
only when its AI provider, key, model and access code are all set. Tier resolution checks
eligibility before health. Features fall back to their deterministic path on
cloud failure. No on-device model is bundled; the edge registry is empty.

All six AI POST routes check the access code and origin and share one daily
limit per device (access code + IP address). See `cloud-api/README.md`. The
service worker does not cache API responses.

## Verification contract

`POST /api/verify-notes` accepts exactly:

```json
{
  "consent": true,
  "claims": [{ "claimId": "claim-1", "text": "A complete academic statement." }],
  "references": [{ "chunkId": "reference-1", "text": "Supplied reference passage.", "page": 1 }]
}
```

`page` is optional. UI evidence uses passage IDs rather than original PDF page
numbers, because reference text is editable. Limits: 12 claims (1,200 characters
each), 24 passages (2,500 characters each), and 100 KB body. Identity metadata,
file bytes/titles, and unexpected fields are rejected.

Response:

```json
{
  "claims": [{
    "claimId": "claim-1", "text": "A complete academic statement.",
    "status": "insufficient_evidence", "explanation": "Not established by the reference.",
    "correction": null, "citations": []
  }]
}
```

Statuses: `supported`, `contradicted`, `insufficient_evidence`. Supported/contradicted
requires a supplied reference ID and exact quote; otherwise it becomes unverified.
Corrections are suggestions, never edits to the document. Source agreement isn't
proof of truth; a genuine quote doesn't prove correct interpretation. Offline
checking matches complete-sentence wording only. The UI discloses first-12 coverage,
redaction limitations, reference limitations and cloud failure/fallback. Editing
notes, reference or manual redaction terms resets preview-review consent.

The older `.kiro/specs/notes-fact-check` proposal uses AI world knowledge without
a reference. It is preserved untouched; this implementation follows the
reference-based approach agreed in chat, not an authoritative truth detector.

## Hosting

Vercel serves `dist` with targeted student rewrites and security headers, and
runs the optional AI routes as serverless functions in `/api`. Install icons are committed files made from the logo;
PDF.js and its worker are locally precached. See `DEPLOYMENT.md` for requirements,
environment variables, rollout, limitations and live release gates.
