// Tests für den Judge von `faithful` mit Aufzeichnungen (scripts/fixtures): strukturierte Ausgabe zuerst,
// Rückfall auf Klartext-JSON bei leerer oder abgelehnter Antwort, Versuchsbudget, JSON nie aus den
// Denkschritten. Kein Modell-Server nötig. Start: `npm run check` (oder `node --test scripts/faithfulness-judge.test.ts`).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { z } from 'zod';
import { askJudgeJson, createChatModel, JudgeFormatError } from '../lessons/08-evaluations/evaluation.ts';
import { evaluateFaithfulness } from '../lessons/08-evaluations/promptfoo-faithfulness.ts';
import JudgeProvider from '../lessons/08-evaluations/promptfoo-judge.ts';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/faithfulness-judge.json', import.meta.url), 'utf8'));
const statementsSchema = z.strictObject({ statements: z.array(z.string().trim().min(1)) });

function replay(rawResponses: unknown[]) {
  const requests: Record<string, any>[] = [];
  const model = createChatModel({
    model: 'qwen3.5-4b', apiKey: 'not-required', baseURL: 'http://localhost:1234/v1',
    maxTokens: 8192, timeout: 600_000,
  });
  model.completions.clientConfig.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    assert.ok(rawResponses.length, 'Unexpected extra judge call');
    const response = rawResponses.shift();
    if (response instanceof Error) throw response;
    if (response instanceof Response) return response;
    return new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } });
  };
  return { model, requests };
}

function completion(content: string, finishReason = 'stop') {
  return {
    id: 'fixture', object: 'chat.completion', created: 0, model: 'qwen3.5-4b',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
  };
}

test('real malformed outputs remain errors after one structured attempt and two plain attempts', async () => {
  for (const cell of fixture.cells) {
    const { model, requests } = replay([cell.unconstrained[0], ...cell.unconstrained]);
    await assert.rejects(evaluateFaithfulness(model, 'answer', 'context'), error => {
      assert.ok(error instanceof JudgeFormatError);
      assert.equal(error.message, 'judge format error (statement extraction) after 3 attempts: The judge did not return valid JSON.');
      return true;
    });
    assert.equal(requests.length, 3);
    assert.doesNotMatch(requests[1].messages[1].content, /Formatkontrolle fehlgeschlagen/);
    assert.match(requests[2].messages[1].content, /Formatkontrolle fehlgeschlagen/);
  }
});

test('schema-constrained live fixtures yield measured results for all five failing cells', async () => {
  for (const cell of fixture.cells) {
    const { model, requests } = replay([cell.constrained.extraction, cell.constrained.support]);
    const result = await evaluateFaithfulness(model, 'answer', 'context');
    const { statements } = JSON.parse(cell.constrained.extraction.choices[0].message.content);
    const { verdicts } = JSON.parse(cell.constrained.support.choices[0].message.content);
    const expectedScore = verdicts.filter((verdict: { supported: boolean }) => verdict.supported).length / statements.length;
    assert.equal(result.score, expectedScore);
    assert.equal(result.pass, expectedScore >= 1);
    assert.equal(requests.length, 2);
    for (const [index, field] of ['statements', 'verdicts'].entries()) {
      const format = requests[index].response_format;
      assert.equal(format.type, 'json_schema');
      assert.equal(format.json_schema.strict, true);
      assert.deepEqual(format.json_schema.schema.required, [field]);
      assert.equal(format.json_schema.schema.additionalProperties, false);
      assert.equal(requests[index].reasoning_effort, 'none');
      assert.equal(requests[index].max_tokens, 8192);
    }
    assert.equal(requests[1].response_format.json_schema.schema.properties.verdicts.minItems, statements.length);
    assert.equal(requests[1].response_format.json_schema.schema.properties.verdicts.maxItems, statements.length);
  }
});

test('a malformed live completion can recover on retry without turning an unsupported answer into PASS', async () => {
  const cell = fixture.cells[0];
  const { model, requests } = replay([cell.unconstrained[0], cell.constrained.extraction, cell.constrained.support]);
  const result = await evaluateFaithfulness(model, 'answer', 'context');
  assert.equal(requests.length, 3);
  assert.equal(result.pass, false);
  assert.ok(result.score < 1);
  assert.equal(requests[0].response_format.type, 'json_schema');
  assert.equal(requests[1].response_format, undefined);
  assert.equal(requests[2].response_format, undefined);
});

test('constrained requests still reject extra fields, missing fields, wrong types, and duplicate verdict IDs', async () => {
  for (const content of [
    '{"statements":["fact"],"secret":"do not log"}',
    '{"other":"do not log"}',
    '{"statements":[1]}',
    '{"statements":[""]}',
    '{"statements":"fact"}',
  ]) {
    const { model } = replay([completion(content)]);
    await assert.rejects(askJudgeJson(model, 'extract', 'answer', statementsSchema, { jsonSchema: true }), error => {
      assert.ok(error instanceof JudgeFormatError);
      assert.match(error.message, /unexpected shape/);
      assert.doesNotMatch(error.message, /secret|other|do not log/);
      return true;
    });
  }
  const duplicate = completion('{"verdicts":[{"statement":1,"supported":true,"reason":"yes"},{"statement":1,"supported":true,"reason":"yes"}]}');
  const { model, requests } = replay([completion('{"statements":["one","two"]}'), duplicate, duplicate, duplicate]);
  await assert.rejects(evaluateFaithfulness(model, 'answer', 'context'), /judge format error \(context support\).*unexpected shape/);
  assert.equal(requests.length, 4);
});

test('truncation, empty responses, transport failures, and no factual statements retain their meanings', async () => {
  for (const [raw, expected] of [
    [completion('{"statements":[]}', 'length'), /truncated \(finish_reason: length\)/],
    [completion(''), /empty answer/],
  ] as const) {
    const { model } = replay([raw]);
    await assert.rejects(askJudgeJson(model, 'extract', 'answer', statementsSchema, { jsonSchema: raw.choices[0].message.content !== '' }), expected);
  }
  const { model, requests } = replay([new Error('transport failed')]);
  await assert.rejects(evaluateFaithfulness(model, 'answer', 'context'), error => {
    assert.ok(error instanceof Error && !(error instanceof JudgeFormatError));
    assert.equal(error.cause?.message, 'transport failed');
    return true;
  });
  assert.equal(requests.length, 1);
  const empty = replay([completion('{"statements":[]}')]);
  const result = await evaluateFaithfulness(empty.model, 'answer', 'context');
  assert.equal(result.pass, true);
  assert.equal(result.score, 1);
  assert.equal(empty.requests.length, 1);
});

test('JSON schema is opt-in and SHOW_THINKING keeps visible reasoning and format failures', async t => {
  const previous = process.env.SHOW_THINKING;
  t.after(() => {
    if (previous === undefined) delete process.env.SHOW_THINKING;
    else process.env.SHOW_THINKING = previous;
  });
  process.env.SHOW_THINKING = 'false';
  const plain = replay([completion('{"statements":[]}')]);
  await askJudgeJson(plain.model, 'extract', 'answer', statementsSchema);
  assert.equal(plain.requests[0].response_format, undefined);
  process.env.SHOW_THINKING = 'true';
  const thinkingResponse = completion('{"statements":[]}');
  Object.assign(thinkingResponse.choices[0].message, { reasoning_content: 'private reasoning' });
  const visible = replay([thinkingResponse]);
  await assert.rejects(askJudgeJson(visible.model, 'extract', 'answer', statementsSchema, { jsonSchema: true }), /valid JSON/);
  assert.equal(visible.requests[0].response_format, undefined);
  assert.equal(visible.requests[0].reasoning_effort, undefined);
});

test('faithfulness keeps the configured judge endpoint, model, budget, temperature, and overrides', async () => {
  const judge = new JudgeProvider({
    config: {
      model: 'local-judge', apiBaseUrl: 'http://localhost:1234/v1', apiKeyEnvar: 'TEST_JUDGE_KEY',
      apiKeyRequired: false, max_tokens: 456, temperature: 0.25, timeout: 123_000,
      passthrough: { reasoning_effort: 'low', seed: 42 },
    },
  });
  const model = judge.createJudgeModel();
  assert.equal(model.timeout, 123_000);
  let calls = 0;
  model.completions.clientConfig.fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), 'http://localhost:1234/v1/chat/completions');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'local-judge');
    assert.equal(body.max_tokens, 456);
    assert.equal(body.temperature, 0.25);
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.seed, 42);
    assert.equal(body.stream, false);
    assert.equal(body.response_format.type, 'json_schema');
    return new Response(JSON.stringify(completion('{"statements":[]}')), { headers: { 'content-type': 'application/json' } });
  };
  assert.equal((await evaluateFaithfulness(model, 'answer', 'context', 1, judge.timeout)).pass, true);
  assert.equal(calls, 1);
});

test('empty structured content ignores JSON in reasoning and reuses plain mode for both stages and later calls', async () => {
  const reasoningOnly = JSON.parse(readFileSync(new URL('./fixtures/faithfulness-judge-reasoning.json', import.meta.url), 'utf8')).reasoningOnly;
  const extraction = completion('{"statements":["one"]}');
  const support = completion('{"verdicts":[{"statement":1,"supported":false,"reason":"unsupported"}]}');
  const { model, requests } = replay([reasoningOnly, extraction, support, extraction, support]);
  for (let call = 0; call < 2; call++) {
    const result = await evaluateFaithfulness(model, 'answer', 'context');
    assert.equal(result.pass, false);
    assert.equal(result.score, 0);
    assert.deepEqual(result.metadata?.statements, ['one']);
  }
  assert.equal(requests.length, 5);
  assert.equal(requests[0].response_format.type, 'json_schema');
  for (const request of requests.slice(1)) assert.equal(request.response_format, undefined);
});

test('structured syntax, empty content, and wrong shapes fall back before the two plain attempts', async () => {
  for (const raw of [completion('{'), completion(''), completion('{"statements":[1]}')]) {
    const { model, requests } = replay([raw, completion('{"statements":[]}')]);
    assert.equal((await evaluateFaithfulness(model, 'answer', 'context')).pass, true);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].response_format.type, 'json_schema');
    assert.equal(requests[1].response_format, undefined);
  }
  const { model, requests } = replay([completion(''), completion('{"statements":[1]}'), completion('{"statements":[1]}')]);
  await assert.rejects(evaluateFaithfulness(model, 'answer', 'context'), error => {
    assert.ok(error instanceof JudgeFormatError);
    assert.match(error.message, /after 3 attempts.*unexpected shape/);
    return true;
  });
  assert.equal(requests.length, 3);
});

function apiFailure(status: number, message: string, param?: string) {
  return new Response(JSON.stringify({ error: { message, type: 'invalid_request_error', param } }), {
    status, headers: { 'content-type': 'application/json' },
  });
}

test('explicit schema rejection permits plain fallback and excludes server text from format errors', async () => {
  for (const rejected of [
    apiFailure(400, 'unsupported response_format: do not log'),
    apiFailure(422, 'invalid parameter: do not log', 'response_format.json_schema'),
  ]) {
    const { model, requests } = replay([rejected, completion('{"statements":[]}')]);
    assert.equal((await evaluateFaithfulness(model, 'answer', 'context')).pass, true);
    assert.equal(requests.length, 2);
    assert.equal(requests[1].response_format, undefined);
  }
  const { model } = replay([apiFailure(400, 'unsupported json_schema: do not log')]);
  await assert.rejects(askJudgeJson(model, 'extract', 'answer', statementsSchema, { jsonSchema: true }), error => {
    assert.ok(error instanceof JudgeFormatError);
    assert.equal(error.retryWithoutSchema, true);
    assert.equal(error.message, 'The judge server rejected JSON Schema response formatting.');
    return true;
  });
});

test('auth, rate limits, unrelated API errors, timeouts, and truncation do not disable structured mode', async () => {
  for (const failure of [
    apiFailure(401, 'unsupported response_format'),
    apiFailure(403, 'unsupported response_format'),
    apiFailure(429, 'unsupported response_format'),
    apiFailure(500, 'unsupported response_format'),
    apiFailure(400, 'context size exceeded'),
    apiFailure(422, 'invalid unrelated parameter'),
  ]) {
    const { model, requests } = replay([failure, completion('{"statements":[]}')]);
    await assert.rejects(evaluateFaithfulness(model, 'answer', 'context'), error => !(error instanceof JudgeFormatError));
    assert.equal(requests.length, 1);
    assert.equal((await evaluateFaithfulness(model, 'answer', 'context')).pass, true);
    assert.equal(requests[1].response_format.type, 'json_schema');
  }
  const truncated = completion('{"statements":[]}', 'length');
  const { model, requests } = replay([truncated, truncated]);
  await assert.rejects(evaluateFaithfulness(model, 'answer', 'context'), /after 2 attempts.*truncated/);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.response_format.type === 'json_schema'));
  let calls = 0;
  const timedOut = { invoke: async () => { calls++; throw Object.assign(new Error('deadline'), { name: 'TimeoutError' }); } };
  await assert.rejects(evaluateFaithfulness(timedOut, 'answer', 'context'), { name: 'TimeoutError' });
  assert.equal(calls, 1);
});

test('the real author-server malformed plain output retains its own retry and exact request accounting', async () => {
  const author = JSON.parse(readFileSync(new URL('./fixtures/faithfulness-judge-reasoning.json', import.meta.url), 'utf8'));
  const { model, requests } = replay([author.reasoningOnly, author.malformedPlain, completion('{"statements":[]}')]);
  assert.equal((await evaluateFaithfulness(model, 'answer', 'context')).pass, true);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].response_format.type, 'json_schema');
  assert.equal(requests[1].response_format, undefined);
  assert.equal(requests[2].response_format, undefined);
  assert.equal(requests[0].messages[1].content, requests[1].messages[1].content);
  assert.match(requests[2].messages[1].content, /Formatkontrolle fehlgeschlagen/);
  const failure = replay([author.reasoningOnly, author.malformedPlain, author.malformedPlain]);
  await assert.rejects(evaluateFaithfulness(failure.model, 'answer', 'context'), /after 3 attempts.*valid JSON/);
  assert.equal(failure.requests.length, 3);
});

test('a truncation before schema incompatibility keeps the total request budget bounded at three', async () => {
  const truncated = completion('{"statements":[]}', 'length');
  const { model, requests } = replay([truncated, completion(''), completion('{"statements":[]}')]);
  assert.equal((await evaluateFaithfulness(model, 'answer', 'context')).pass, true);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].response_format.type, 'json_schema');
  assert.equal(requests[1].response_format.type, 'json_schema');
  assert.equal(requests[2].response_format, undefined);
  const failure = replay([truncated, completion(''), completion('{')]);
  await assert.rejects(evaluateFaithfulness(failure.model, 'answer', 'context'), /after 3 attempts.*valid JSON/);
  assert.equal(failure.requests.length, 3);
});
