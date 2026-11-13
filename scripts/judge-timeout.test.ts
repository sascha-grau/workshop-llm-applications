// Tests für die Zeitlimit-Meldung des Judge: "did not answer within" erscheint nur, wenn der eigene Zeitgeber
// ablief, andere Zeitlimits bleiben "unbekannte Quelle". Kein Modell-Server nötig.
// Start: `npm run check` (oder `node --test scripts/judge-timeout.test.ts`).
import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { askJudgeJson, isJudgeTimeout } from '../lessons/08-evaluations/evaluation.ts';
import { evaluateFaithfulness } from '../lessons/08-evaluations/promptfoo-faithfulness.ts';
import JudgeProvider from '../lessons/08-evaluations/promptfoo-judge.ts';

function judge(timeout = 600_000) {
  return new JudgeProvider({ config: {
    model: 'local-test', apiBaseUrl: 'http://localhost:1234/v1', apiKeyEnvar: 'TEST_KEY', apiKeyRequired: false, timeout,
  } });
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

test('upstream timeout names and exact timeout text never assert the configured duration elapsed', () => {
  const provider = judge();
  for (const error of [
    Object.assign(new Error('Request timed out.'), { name: 'TimeoutError' }),
    Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }),
    'Request timed out.',
    'API call error: Error: Request timed out after 300000 ms',
  ]) {
    assert.equal(isJudgeTimeout(error), false);
    assert.throws(() => provider.throwIfTimedOut(error), {
      message: 'The judge request timed out (local limit: 600 s; actual timeout source unknown).',
    });
  }
  for (const error of [new Error('Other failure'), 'The answer says Request timed out.', 'API call error: server supplied private text']) {
    assert.doesNotThrow(() => provider.throwIfTimedOut(error));
  }
});

test('a positively expired JSON judge deadline preserves its timeout identity and configured-duration message', async () => {
  const provider = judge(20);
  const model = { invoke: async (_messages: unknown, options: { signal: AbortSignal }) => waitForAbort(options.signal) };
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(askJudgeJson(model, 'judge', 'data', z.object({}), { timeout: provider.timeout }), error => {
      assert.equal(isJudgeTimeout(error), true);
      assert.equal(error.name, 'TimeoutError');
      assert.throws(() => provider.throwIfTimedOut(error), /did not answer within 0\.02 s/);
      return true;
    });
  } finally {
    clearInterval(keepAlive);
  }
});

test('the rubric wrapper distinguishes local expiry, upstream timeout, and caller cancellation', async () => {
  const local = judge(20);
  Object.assign(local, { provider: Promise.resolve({ callApi: async (_prompt: string, _context: unknown, options: { abortSignal: AbortSignal }) => waitForAbort(options.abortSignal) }) });
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(local.callApi('test'), /did not answer within 0\.02 s/);
    const upstream = judge();
    Object.assign(upstream, { provider: Promise.resolve({ callApi: async () => ({ error: 'API call error: Error: Request timed out after 300000 ms' }) }) });
    await assert.rejects(upstream.callApi('test'), /actual timeout source unknown/);
    const cancelled = judge();
    const controller = new AbortController();
    controller.abort(new Error('caller cancelled'));
    Object.assign(cancelled, { provider: Promise.resolve({ callApi: async (_prompt: string, _context: unknown, options: { abortSignal: AbortSignal }) => waitForAbort(options.abortSignal) }) });
    await assert.rejects(cancelled.callApi('test', undefined, { abortSignal: controller.signal }), { message: 'caller cancelled' });
  } finally {
    clearInterval(keepAlive);
  }
});

test('a shared capability-probe timeout keeps its real duration across providers with different limits', async () => {
  const started = Promise.withResolvers<void>();
  const identity = { model: 'shared-deadline-test', clientConfig: { baseURL: 'http://localhost:1234/v1' } };
  const primary = { ...identity, invoke: async (_messages: unknown, options: { signal: AbortSignal }) => {
    started.resolve();
    return waitForAbort(options.signal);
  } };
  let queuedCalls = 0;
  const queued = { ...identity, invoke: async () => { queuedCalls++; throw new Error('unexpected request'); } };
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const first = evaluateFaithfulness(primary, 'answer', 'context', 1, 20);
    await started.promise;
    const second = evaluateFaithfulness(queued, 'answer', 'context', 1, 600_000);
    const results = await Promise.allSettled([first, second]);
    assert.ok(results.every(result => result.status === 'rejected'));
    const error = results[0].reason;
    assert.equal(results[1].reason, error);
    assert.equal(isJudgeTimeout(error, 20), true);
    assert.equal(isJudgeTimeout(error, 600_000), false);
    assert.throws(() => judge(20).throwIfTimedOut(error), /did not answer within 0\.02 s/);
    assert.throws(() => judge().throwIfTimedOut(error), /actual timeout source unknown/);
    assert.equal(queuedCalls, 0);
  } finally {
    clearInterval(keepAlive);
  }
});
