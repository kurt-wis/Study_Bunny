/**
 * Model client — the only place the backend talks to an AI provider.
 *
 * The provider is chosen with environment variables, so the site owner can use
 * a free tier (Google Gemini, Groq) or a paid one (OpenAI, Anthropic) without
 * changing code. Handlers are authored as makeHandler({ invokeModel }); the
 * deployed functions wire `invokeModel` from here, while tests inject a stub
 * and never touch the network.
 *
 * invokeModel({ system, messages }) -> Promise<string> returns the model's raw
 * text output. The caller parses and validates that text.
 *
 * Server environment only — never a VITE_ variable:
 *   AI_PROVIDER   gemini | groq | openai | openrouter | anthropic
 *   AI_API_KEY    the key from that provider
 *   AI_MODEL      the model ID to call (see that provider's model list)
 *   AI_BASE_URL   optional: any other OpenAI-compatible endpoint
 *   AI_JSON_MODE  optional: "off" if the provider rejects JSON mode
 * (ANTHROPIC_API_KEY / ANTHROPIC_MODEL are still accepted for Anthropic.)
 */

const TIMEOUT_MS = 20_000;
const MAX_TOKENS = 2048;

/** Providers that speak the OpenAI "chat completions" format. */
const OPENAI_COMPATIBLE = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Read and normalise the provider settings. */
export function modelSettings(env = process.env) {
  const provider = String(env.AI_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : '')).trim().toLowerCase();
  const apiKey = env.AI_API_KEY ?? (provider === 'anthropic' ? env.ANTHROPIC_API_KEY : undefined);
  const model = env.AI_MODEL ?? (provider === 'anthropic' ? env.ANTHROPIC_MODEL : undefined);
  const baseUrl = (env.AI_BASE_URL ?? OPENAI_COMPATIBLE[provider] ?? '').replace(/\/$/, '');
  const known = provider === 'anthropic' || Boolean(baseUrl);
  return { provider, apiKey, model, baseUrl, known, jsonMode: String(env.AI_JSON_MODE ?? '').toLowerCase() !== 'off' };
}

/** True when the server has what it needs to call the model. */
export function modelConfigured(env = process.env) {
  const s = modelSettings(env);
  return Boolean(s.known && s.apiKey && s.model);
}

async function callAnthropic({ system, messages }, s, fetchImpl) {
  const payload = { model: s.model, max_tokens: MAX_TOKENS, messages: messages.map(m => ({ role: m.role, content: m.content })) };
  if (system) payload.system = system;
  const response = await fetchImpl(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': s.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Never include the response body in the error: it can echo request content.
  if (!response.ok) throw new Error(`Model request failed with status ${response.status}`);
  const decoded = await response.json();
  return Array.isArray(decoded?.content)
    ? decoded.content.map(part => (part?.type === 'text' ? part.text ?? '' : '')).join('')
    : '';
}

async function callOpenAiCompatible({ system, messages }, s, fetchImpl) {
  const payload = {
    model: s.model,
    max_tokens: MAX_TOKENS,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ],
  };
  // Every prompt asks for a single JSON object; JSON mode makes that reliable.
  if (s.jsonMode) payload.response_format = { type: 'json_object' };
  const response = await fetchImpl(`${s.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Model request failed with status ${response.status}`);
  const decoded = await response.json();
  const content = decoded?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * @param {{ fetchImpl?: typeof fetch, env?: Record<string, string | undefined> }} [deps]
 * @returns {(args: { system?: string, messages: Array<{ role: string, content: string }> }) => Promise<string>}
 */
export function createInvokeModel({ fetchImpl, env = process.env } = {}) {
  return async function invokeModel(prompt) {
    const s = modelSettings(env);
    if (!(s.known && s.apiKey && s.model)) throw new Error('Model is not configured');
    const doFetch = fetchImpl ?? globalThis.fetch;
    return s.provider === 'anthropic' && !env.AI_BASE_URL
      ? callAnthropic(prompt, s, doFetch)
      : callOpenAiCompatible(prompt, s, doFetch);
  };
}

/** Default invokeModel bound to the real API. Importing it makes no request. */
export const invokeModel = createInvokeModel();
