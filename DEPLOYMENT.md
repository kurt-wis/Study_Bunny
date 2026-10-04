# Deploy Study Bunny on Vercel (with optional Cloud AI)

One Vercel project serves the app and, if you set it up, the AI routes. With no
server settings the app runs fully offline and nothing else is needed.

## 1. Check locally

```
npm ci
npm test
npm run build
npm run check:pwa
npx playwright install chromium   # once
npm run test:browser
```

## 2. Deploy the app

1. Push the repository to GitHub.
2. In Vercel: **Add New → Project**, import the repository. `vercel.json`
   already sets the install command, build command and output folder.
3. Deploy. The app is live in offline mode.

| Setting | Value |
| --- | --- |
| Install | `npm ci` |
| Build | `npm run build && npm run check:pwa` |
| Output | `dist` |

## 3. Turn on Cloud AI (optional)

Pick one AI service. The app works with any of these; only the settings differ.

| `AI_PROVIDER` | Cost | Where to get the key |
| --- | --- | --- |
| `gemini` | Free tier, rate-limited | Google AI Studio |
| `groq` | Free tier, rate-limited | Groq Console |
| `openrouter` | A few free models, small daily limit | OpenRouter |
| `openai` | Paid (prepaid credit) | OpenAI Platform |
| `anthropic` | Paid (prepaid credit) | Anthropic Console |

1. Create an account with the service and create an API key. For a paid
   service, also set a monthly spend limit.
2. In Vercel: **Project → Settings → Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `AI_PROVIDER` | one of the names above |
   | `AI_API_KEY` | the key from step 1 |
   | `AI_MODEL` | a model ID copied from that service's current model list |
   | `ACCESS_CODE` | optional. A long code you make up and share with your students. Leave it out for an open demo (see below) |
   | `DAILY_REQUEST_LIMIT` | optional, default `20` |

   Never prefix these with `VITE_`: that would publish them in the app.
3. **Redeploy** so the functions pick up the settings.
4. Open `https://<your-site>/api/health`. It should show `{"status":"ok"}`.
5. In the app: **Profile → Optional Cloud AI**, tick the consent box, enter the
   access code, save. Summaries, quizzes, chat, Feynman feedback, technique
   suggestions and note checking now show the **Cloud AI** badge.

Open demo mode (no `ACCESS_CODE`):

- Students only tick the consent box; nothing to type.
- Anyone who can open the site can use Cloud AI and spend your allowance. The
  only limits are the daily limit per IP address and the service's own quota.
- Use it for a demo, then set `ACCESS_CODE` and redeploy before sharing widely.

About free tiers:

- The free allowance belongs to your one key and is shared by every student.
  When it runs out, requests fail and the app quietly uses offline mode.
- Limits and model names change. Check the service's own page before a demo.
- Read the service's terms: some free tiers may use what you send to improve
  their products. Students already see a consent notice before any text is sent.
- If the service rejects JSON mode, add `AI_JSON_MODE=off`.

Optional: for a daily limit that holds across all server instances, create an
Upstash Redis database and add `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN`.

## 4. Check the live site

- Airplane mode: upload a PDF, take a quiz, do a review. Everything works.
- Online with the code: a new summary shows the Cloud AI badge.
- Wrong code: the feature still works and shows **Offline mode**.

## Limits to know

- The access code is shared, not a personal account. Change `ACCESS_CODE` and
  redeploy if it leaks.
- Without Upstash the daily limit is best effort. On a paid service, its spend
  limit is the real cost cap; on a free tier, its rate limit is.
- Each AI request may take several seconds; functions are allowed 30 seconds
  (`vercel.json`). If your Vercel plan allows less, long requests fall back to
  offline mode.
- Local `npm run dev` does not run the `/api` functions, so it is always in
  offline mode. Use `vercel dev` to try Cloud AI locally.

## Roll back

Remove `AI_API_KEY` (or `ACCESS_CODE`) in Vercel and redeploy. The app
returns to offline mode; no student data is affected because it never leaves
the device.
