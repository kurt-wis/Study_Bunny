import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInvokeModel, modelConfigured, modelSettings } from '../src/lib/modelClient.js';

const prompt = { system: 'sys', messages: [{ role: 'user', content: 'hi' }] };

test('modelConfigured needs a known provider, a key and a model', () => {
  assert.equal(modelConfigured({ AI_PROVIDER: 'gemini', AI_API_KEY: 'k', AI_MODEL: 'm' }), true);
  assert.equal(modelConfigured({ AI_PROVIDER: 'groq', AI_API_KEY: 'k' }), false);
  assert.equal(modelConfigured({ AI_PROVIDER: 'made-up', AI_API_KEY: 'k', AI_MODEL: 'm' }), false);
  assert.equal(modelConfigured({ AI_PROVIDER: 'made-up', AI_API_KEY: 'k', AI_MODEL: 'm', AI_BASE_URL: 'https://example.invalid/v1' }), true);
  assert.equal(modelConfigured({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'm' }), true); // older settings still work
  assert.equal(modelConfigured({}), false);
});

test('Gemini and Groq use the OpenAI-compatible format with JSON mode', async () => {
  for (const [provider, base] of [['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai'], ['groq', 'https://api.groq.com/openai/v1'], ['openai', 'https://api.openai.com/v1']]) {
    let request;
    const fetchImpl = async (url, init) => {
      request = { url, headers: init.headers, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"a":1}' } }] }) };
    };
    const env = { AI_PROVIDER: provider, AI_API_KEY: 'test-key', AI_MODEL: 'test-model' };
    assert.equal(await createInvokeModel({ fetchImpl, env })(prompt), '{"a":1}');
    assert.equal(request.url, `${base}/chat/completions`);
    assert.equal(request.headers.authorization, 'Bearer test-key');
    assert.deepEqual(request.body, {
      model: 'test-model', max_tokens: 2048,
      messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
      response_format: { type: 'json_object' },
    });
  }
  assert.equal(modelSettings({ AI_PROVIDER: 'groq', AI_JSON_MODE: 'off' }).jsonMode, false);
});

test('Anthropic uses the Messages API shape', async () => {
  let request;
  const fetchImpl = async (url, init) => {
    request = { url, headers: init.headers, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }] }) };
  };
  const env = { AI_PROVIDER: 'anthropic', AI_API_KEY: 'test-key', AI_MODEL: 'test-model' };
  assert.equal(await createInvokeModel({ fetchImpl, env })(prompt), '{"a":1}');
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.headers['x-api-key'], 'test-key');
  assert.deepEqual(request.body, { model: 'test-model', max_tokens: 2048, messages: [{ role: 'user', content: 'hi' }], system: 'sys' });
});

test('failures do not leak the response body, and an unconfigured server refuses to run', async () => {
  const failing = async () => ({ ok: false, status: 429, json: async () => ({ error: 'secret detail' }) });
  const env = { AI_PROVIDER: 'gemini', AI_API_KEY: 'k', AI_MODEL: 'm' };
  await assert.rejects(createInvokeModel({ fetchImpl: failing, env })(prompt), e => /429/.test(e.message) && !/secret/.test(e.message));
  await assert.rejects(createInvokeModel({ fetchImpl: failing, env: {} })(prompt), /not configured/);
});
