// Tests für `modelFetch` und `withModelFetchTimeout` (lessons/shared/model-fetch.ts): Die undici-Grenzen
// folgen dem eingestellten Zeitlimit, ein bestehender Dispatcher (Burp) bleibt erhalten, Qdrant bleibt
// unberührt. Nur lokaler Test-Server nötig. Start: `npm run check` (oder `node --test scripts/model-fetch.test.ts`).
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { Agent, fetch as undiciFetch, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { cache, loadApiProvider } from 'promptfoo';
import { QdrantClient } from '@qdrant/js-client-rest';
import { createJsonChatModel } from '../lessons/shared/chat-model.ts';
import { createChatModel } from '../lessons/08-evaluations/evaluation.ts';
import JudgeProvider from '../lessons/08-evaluations/promptfoo-judge.ts';
import { withModelFetchTimeout } from '../lessons/shared/model-fetch.ts';
import { useBurpIfConfigured } from '../lessons/shared/proxy.ts';

cache.disableCache();

const chatResponse = JSON.stringify({
  id: 'local', object: 'chat.completion', created: 0, model: 'local-test',
  choices: [{ index: 0, message: { role: 'assistant', content: '{"statements":[]}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function delayedChat(t, delay = 1600) {
  return serve(t, async (request, response) => {
    for await (const _chunk of request) {}
    const body = request.url.includes('/body/');
    if (body) { response.writeHead(200, { 'content-type': 'application/json' }); response.write(chatResponse.slice(0, 6)); }
    const timer = setTimeout(() => {
      if (!body) response.writeHead(200, { 'content-type': 'application/json' });
      response.end(body ? chatResponse.slice(6) : chatResponse);
    }, delay);
    response.on('close', () => clearTimeout(timer));
  });
}

function judge(baseURL, timeout = 5000) {
  return new JudgeProvider({ config: {
    model: 'local-test', apiBaseUrl: baseURL, apiKeyEnvar: 'TEST_UNUSED_KEY', apiKeyRequired: false,
    timeout, max_tokens: 32, maxRetries: 0,
  } });
}

test('real LangChain factories override shorter dispatcher header/body limits while retaining the SDK timeout', async t => {
  const baseURL = await delayedChat(t);
  const dispatcher = new Agent({ headersTimeout: 20, bodyTimeout: 20 });
  t.after(() => dispatcher.destroy());
  await assert.rejects(undiciFetch(`${baseURL}/headers/v1/chat/completions`, { dispatcher }), error => error.cause?.code === 'UND_ERR_HEADERS_TIMEOUT');
  const response = await undiciFetch(`${baseURL}/body/v1/chat/completions`, { dispatcher });
  await assert.rejects(response.text(), error => error.cause?.code === 'UND_ERR_BODY_TIMEOUT');
  await Promise.all(['headers', 'body'].flatMap(stage => [true, false].map(async shared => {
    const endpoint = `${baseURL}/${stage}/v1`;
    const configuration = { baseURL: endpoint, fetchOptions: { dispatcher } };
    const model = shared
      ? createJsonChatModel({ model: 'local-test', apiKey: 'not-required', timeout: 5000, configuration })
      : createChatModel({ model: 'local-test', apiKey: 'not-required', timeout: 5000, baseURL: endpoint });
    if (!shared) model.completions.clientConfig.fetchOptions = { dispatcher };
    assert.equal((await model.invoke('local')).text, '{"statements":[]}');
    assert.equal(model.timeout, 5000);
  })));
});

test('the actual promptfoo provider retains its explicit dispatcher and lifts body/header request limits inside the judge scope', async t => {
  const baseURL = await delayedChat(t);
  const original = globalThis.fetch;
  let privateDispatchers = 0;
  globalThis.fetch = (input, init) => {
    assert.ok(init?.dispatcher);
    privateDispatchers++;
    const shortened = init.dispatcher.compose(dispatch => (options, handler) => dispatch({
      ...options, headersTimeout: 20, bodyTimeout: 20,
    }, handler));
    return undiciFetch(input, { ...init, dispatcher: shortened });
  };
  t.after(() => { globalThis.fetch = original; });
  const plain = await loadApiProvider('openai:chat:local-test', {
    options: { config: { apiBaseUrl: `${baseURL}/body/v1`, apiKeyRequired: false, maxRetries: 0 } },
    env: { REQUEST_TIMEOUT_MS: '5000' },
  });
  const baseline = await plain.callApi('local');
  assert.match(baseline.error, /Error reading response body/);
  await Promise.all(['headers', 'body'].map(async stage => {
    const result = await judge(`${baseURL}/${stage}/v1`).callApi('local');
    assert.equal(result.error, undefined);
    assert.equal(result.output, '{"statements":[]}');
  }));
  assert.equal(privateDispatchers, 3);
});

test('configured request deadlines and cancellation still win over transport limits', async t => {
  const baseURL = await delayedChat(t, 1000);
  const model = createJsonChatModel({ model: 'local-test', apiKey: 'not-required', timeout: 30, configuration: { baseURL } });
  await assert.rejects(model.invoke('local'), error => error.name === 'TimeoutError');
  await assert.rejects(judge(baseURL, 30).callApi('local'), /did not answer within 0\.03 s/);
  const controller = new AbortController();
  const cancelled = new Error('cancelled locally');
  controller.abort(cancelled);
  await assert.rejects(model.invoke('local', { signal: controller.signal }), error => error === cancelled);
});

test('Burp forwarding and the selected global dispatcher remain intact', async t => {
  const target = await serve(t, async (request, response) => {
    for await (const _chunk of request) {}
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(chatResponse);
  });
  let forwarded = 0;
  const proxyURL = await serve(t, (request, response) => {
    forwarded++;
    const destination = new URL(request.url);
    assert.equal(destination.origin, target);
    const outgoing = http.request(destination, { method: request.method, headers: request.headers }, incoming => {
      response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response);
    });
    outgoing.on('error', () => response.destroy()); request.pipe(outgoing);
  });
  const previousProxy = process.env.BURP_PROXY_URL;
  const previousCA = process.env.BURP_CA_CERT;
  const previousDispatcher = getGlobalDispatcher();
  process.env.BURP_PROXY_URL = proxyURL; delete process.env.BURP_CA_CERT;
  useBurpIfConfigured();
  const selected = getGlobalDispatcher();
  t.after(async () => {
    setGlobalDispatcher(previousDispatcher); await selected.destroy();
    if (previousProxy === undefined) delete process.env.BURP_PROXY_URL; else process.env.BURP_PROXY_URL = previousProxy;
    if (previousCA === undefined) delete process.env.BURP_CA_CERT; else process.env.BURP_CA_CERT = previousCA;
  });
  const model = createJsonChatModel({ model: 'local-test', apiKey: 'not-required', timeout: 5000, configuration: { baseURL: `${target}/v1` } });
  assert.equal((await model.invoke('local')).text, '{"statements":[]}');
  assert.equal(getGlobalDispatcher(), selected);
  assert.equal(forwarded, 1);
});

test('outside-scope fetch arguments and Qdrant private transport are unchanged', async t => {
  const original = globalThis.fetch;
  const dispatcher = new Agent();
  const seen = [];
  globalThis.fetch = async (input, init) => {
    seen.push({ input, init });
    return String(input).startsWith('http://127.0.0.1:') ? original(input, init) : new Response('{}');
  };
  t.after(async () => { globalThis.fetch = original; await dispatcher.destroy(); });
  await withModelFetchTimeout(1234, () => globalThis.fetch('http://localhost/scoped', { dispatcher }));
  const init = { dispatcher, headers: { 'x-local-test': 'unchanged' } };
  await globalThis.fetch('http://localhost/outside', init);
  assert.equal(seen[1].init, init);
  assert.equal(seen[1].init.dispatcher, dispatcher);
  const qdrantURL = await serve(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ result: { collections: [] }, status: 'ok', time: 0 }));
  });
  const client = new QdrantClient({ url: qdrantURL, checkCompatibility: false });
  assert.deepEqual(await client.getCollections(), { collections: [] });
  assert.equal(seen.length, 3);
  assert.equal(seen[2].init.dispatcher.constructor.name, 'Agent');
});
