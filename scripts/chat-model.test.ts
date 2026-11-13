// Tests für `createJsonChatModel` (lessons/shared/chat-model.ts): Die Denkpolitik (`reasoning_effort: none`,
// außer mit `thinking` oder SHOW_THINKING=true), Eigenheiten des Aufrufers und Abbruch bleiben erhalten.
// Kein Modell-Server nötig. Start: `npm run check` (oder `node --test scripts/chat-model.test.ts`).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createJsonChatModel } from '../lessons/shared/chat-model.ts';
import { createChatModel } from '../lessons/08-evaluations/evaluation.ts';

test('JSON model sends the shared thinking policy while preserving caller settings and cancellation', async () => {
  const previous = process.env.SHOW_THINKING;
  try {
    for (const [thinking, showThinking, override, expected] of [
      [undefined, 'false', undefined, 'none'],
      [false, 'false', undefined, 'none'],
      [false, 'true', undefined, undefined],
      [true, 'false', undefined, undefined],
      [true, 'true', undefined, undefined],
      [false, 'false', 'low', 'low'],
    ] as const) {
      process.env.SHOW_THINKING = showThinking;
      let calls = 0;
      let tokens = 0;
      const model = createJsonChatModel({
        model: 'qwen3.5-4b', apiKey: 'not-required', timeout: 600_000, maxTokens: 321, temperature: 0.25,
        thinking,
        modelKwargs: override ? { reasoning_effort: override } : {},
        configuration: {
          baseURL: 'http://localhost:1234/v1',
          fetch: async (_input, init) => {
            calls += 1;
            const body = JSON.parse(String(init?.body));
            assert.equal(body.reasoning_effort, expected);
            assert.equal(body.thinking, undefined);
            assert.equal(body.max_tokens, 321);
            assert.equal(body.temperature, 0.25);
            assert.equal(body.stream, false);
            return new Response(JSON.stringify({
              id: 'mock', object: 'chat.completion', created: 0, model: body.model,
              choices: [{ index: 0, message: { role: 'assistant', content: '{"score":7}' }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 },
            }), { headers: { 'content-type': 'application/json' } });
          },
        },
        callbacks: [{ handleLLMEnd: output => { tokens += output.llmOutput?.tokenUsage?.totalTokens ?? 0; } }],
      });
      assert.equal(model.timeout, 600_000);
      assert.equal((await model.invoke('rating')).text, '{"score":7}');
      assert.equal(tokens, 17);
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(model.invoke('cancelled rating', { signal: controller.signal }), { name: 'AbortError' });
      assert.equal(calls, 1);
    }
  } finally {
    if (previous === undefined) delete process.env.SHOW_THINKING;
    else process.env.SHOW_THINKING = previous;
  }
});

test('Lesson 08 keeps its public factory defaults and explicit model overrides', t => {
  const previous = process.env.SHOW_THINKING;
  process.env.SHOW_THINKING = 'false';
  t.after(() => {
    if (previous === undefined) delete process.env.SHOW_THINKING;
    else process.env.SHOW_THINKING = previous;
  });
  const model = createChatModel({
    model: 'external-model', apiKey: 'external-key', baseURL: 'http://localhost:1234/v1',
  });
  assert.equal(model.timeout, 120_000);
  assert.equal(model.temperature, 0);
  assert.equal(model.maxTokens, undefined);
  assert.equal(model.modelKwargs.reasoning_effort, 'none');
  const overridden = createChatModel({
    model: 'external-model', apiKey: 'external-key', baseURL: 'http://localhost:1234/v1',
    timeout: 600_000, temperature: 0.75, maxTokens: 123, modelKwargs: { reasoning_effort: 'low' },
  });
  assert.equal(overridden.timeout, 600_000);
  assert.equal(overridden.temperature, 0.75);
  assert.equal(overridden.maxTokens, 123);
  assert.equal(overridden.modelKwargs.reasoning_effort, 'low');
});
