// Tests für den lokalen E5-Tokenizer in Teil 0: Vorrang vor den Server-Methoden, Rückfall ohne Tokenizer,
// Cache-Prüfung (Summen, fehlende Dateien, Offline) und Manifest-Version 3. Kein Modell-Server nötig.
// Start: `npm run check` (oder `node --test scripts/tokenizer.test.ts`).
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCounter, matchesManifest } from '../lessons/04-chunking/00-prepare-chunks.ts';
import { COUNTING_METHOD, manifestSchema } from '../lessons/04-chunking/formats.ts';
import { loadE5TokenCounter } from '../lessons/04-chunking/tokenizer.ts';

test('local tokenizer takes priority, trims only the text and makes no server requests', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  const inputs: string[] = [];
  const counter = await createCounter('passage: ', 512, async () => (input) => { inputs.push(input); return 513; });
  assert.equal(counter.method, COUNTING_METHOD.tokenizer);
  assert.equal(await counter.count(' \nGrüße 👩🏽‍💻\n '), 513);
  assert.deepEqual(await counter.probe('passage: test'), { tokens: 513, overflow: true });
  assert.deepEqual(inputs, ['passage: Grüße 👩🏽‍💻', 'passage: test']);
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('missing tokenizer preserves server overflow, usage and character fallbacks', async (t) => {
  const previous = { ...process.env };
  process.env.REMOTE_MODEL_BASE_URL = 'http://localhost:1234/v1';
  process.env.REMOTE_EMBEDDING_MODEL_NAME = 'test-e5';
  delete process.env.REMOTE_EMBEDDING_MODEL_BASE_URL;
  delete process.env.REMOTE_EMBEDDING_MODEL_API_KEY;
  t.after(() => { process.env = previous; });
  const missing = async () => { throw new Error('offline cache missing'); };
  for (const method of [COUNTING_METHOD.overflow, COUNTING_METHOD.usage, COUNTING_METHOD.estimate]) {
    const mocked = t.mock.method(globalThis, 'fetch', async (_url, options) => {
      const { input } = JSON.parse(String(options?.body));
      if (method === COUNTING_METHOD.overflow) {
        const padding = input.match(/(?: a)+$/)?.[0].length / 2 || 0;
        const tokens = padding + (input.includes('eins zwei drei') ? 7 : 4);
        return new Response(`input (${tokens} tokens) too large`, { status: 400 });
      }
      const tokens = method === COUNTING_METHOD.estimate ? 0 : input.includes('Kalibrierung') ? 2048 : 7;
      return Response.json({ usage: { prompt_tokens: tokens } });
    });
    const counter = await createCounter('passage: ', 512, missing);
    assert.equal(counter.method, method);
    assert.equal(await counter.count(' eins zwei drei '), method === COUNTING_METHOD.estimate ? 25 : 7);
    mocked.mock.restore();
  }
});

test('cache refuses missing offline assets, corrupt files and unverified downloads', async (t) => {
  const cacheDirectory = await mkdtemp(join(tmpdir(), 'e5-tokenizer-test-'));
  t.after(() => rm(cacheDirectory, { recursive: true, force: true }));
  const mocked = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  await assert.rejects(loadE5TokenCounter({ cacheDirectory, allowDownload: false }), { code: 'ENOENT' });
  assert.equal(mocked.mock.callCount(), 0);
  await assert.rejects(loadE5TokenCounter({ cacheDirectory }), /checksum mismatch/);
  assert.deepEqual(await readdir(cacheDirectory), []);
  await writeFile(join(cacheDirectory, 'tokenizer.json'), '{}');
  await assert.rejects(loadE5TokenCounter({ cacheDirectory }), /checksum mismatch/);
  assert.equal(await readFile(join(cacheDirectory, 'tokenizer.json'), 'utf8'), '{}');
  assert.equal(mocked.mock.callCount(), 1);
});

test('version 3 manifests retain all methods; local verification accepts earlier exact counts', async () => {
  const counter = await createCounter('passage: ', 512, async () => () => 4);
  const sources = new Map([['source.md', 'test']]);
  for (const method of Object.values(COUNTING_METHOD)) {
    const manifest = {
      format_version: 3, model: 'test-e5', limit: 512, passage_prefix: 'passage: ', special_token_reserve: 2,
      counting_method: method,
      sources: [{ file: 'source.md', sha256: 'source-hash', chunks: [{ file: 'chunk.md', source_start: 0, source_end: 4, sha256: 'chunk-hash', token_count: 4 }] }],
    };
    assert.equal(manifestSchema.safeParse(manifest).success, true);
    assert.equal(matchesManifest(manifest, 'test-e5', counter, sources), method !== COUNTING_METHOD.estimate);
    assert.equal(matchesManifest({ ...manifest, limit: 256 }, 'test-e5', counter, sources), false);
  }
});
