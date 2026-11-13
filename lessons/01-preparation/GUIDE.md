# Lesson 01 – Preparation: Guide

*Deutsche Fassung: [GUIDE.de.md](GUIDE.de.md)* · Overview and start: [README.md](README.md)

## What is this about?

You call a language model from your own code for the first time. Then you put a chat interface in front of it and watch what goes over the wire. At the end you have the setup that all further lessons work with.

Comparison: a phone call. In Part 1 you call the model directly. In Part 2 an operator (the facade) puts the calls from Open WebUI through to your program. In Part 3 you listen in with Burp.

## Where are we?

```text
[ L01 Preparation ] ──► L02 Tool calls ──► L03 Embeddings ──► L04 Chunking ──► … ──► L08 Evaluation
        ▲ you are here

Part 1:  your program ───────────────────────────────────────► LM Studio (chat model)
Part 2:  Open WebUI ──► facade + your program ───────────────► LM Studio
Part 3:  Open WebUI ──► facade + your program ──► Burp ──────► LM Studio
```

## New terms

| Term | In one sentence | Example |
|---|---|---|
| Language model (LLM) | A program that produces the most likely next word pieces for a text. | The chat model in LM Studio (`REMOTE_MODEL_NAME`) |
| Token | The word piece in which a model reads and writes. One word can consist of several tokens. | One line in the answer stream in Part 2 |
| Streaming | The answer arrives piece by piece as it is produced, instead of all at once at the end. | The text runs through the console word by word. |
| Reasoning model, thinking | A model that writes thinking steps (reasoning) before the answer. The server sends them separately from the answer. | The `reasoning` field in Part 3 |
| Facade | A small server inside your program that behaves like Ollama (a common local model server) towards Open WebUI. | Model `lesson-01-part-2` in Open WebUI |
| Proxy (Burp) | A program between your code and the server that shows every HTTP request. | Proxy → HTTP history in Burp |

## Check first

- [ ] The setup from the [root README](../../README.md#setup) is done: Node, `npm ci`, `.env`.
- [ ] LM Studio is running, the server is started, the chat model is loaded ([Setting up LM Studio](../../README.md#setting-up-lm-studio)). `REMOTE_MODEL_NAME` in `.env` is exactly the identifier from LM Studio.
- [ ] From Part 2: Open WebUI is running ([Starting Open WebUI](../../README.md#starting-open-webui)).
- [ ] For Part 3 (optional): Burp is running, Intercept is off ([Setting up Burp](../../README.md#setting-up-burp)).
- [ ] `SHOW_THINKING` in `.env` is empty.

All output below: measured on 2026-11-13 with LM Studio and `qwen3.5-4b` (workshop default, [Models](../../README.md#models) in the root README). The traffic in Part 3 was recorded not by Burp but by a small logging forwarder between the program and LM Studio; it shows the same requests and responses as Burp's HTTP history. With another server or model, numbers and answers differ; the flow stays the same. Timestamps and durations are shortened (`…`).

The questions in the code are German, so the model answers in German. Ask in English and it usually answers in English.

## Part 1 – Hello, language model

**In one sentence:** Your program sends a question to the chat model and writes the answer piece by piece to the console.

**Flow**

1. **Connect** (KERN 1). `ChatOpenAI` from LangChain (a library for programs that use language models) speaks the OpenAI API: an HTTP format for chat requests that LM Studio and most local servers offer too. `baseURL` from `.env` points to your server.
2. **Ask** (KERN 2). `model.stream(…)` sends the question and delivers the answer as a sequence of small pieces.
3. **Print** (KERN 3). Each piece is written immediately. `withoutThinking` filters out the thinking first.

**What you see**

```text
$ npm run l01:1
… INFO Model: Call started { model: 'qwen3.5-4b' }
Ein Sprachmodell ist eine künstliche Intelligenz, die auf riesigen Textmengen trainiert wird, um Muster in der Sprache zu erkennen und vorherzusagen. Es nutzt diese statistischen Zusammenhänge, um sinnvolle Texte zu generieren oder kontextbezogene Antworten auf Fragen zu geben.
… INFO Model: Call completed { model: 'qwen3.5-4b', durationMs: … }
```

With `SHOW_THINKING=true` in `.env` (shortened):

```text
<think>Thinking Process:

1.  **Analyze the Request:**
    *   Topic: What is a language model (Sprachmodell)?
    *   Constraint: Exactly two sentences (in two Sätze).
    *   Language: German (Erkläre...).
…
3.  **Drafting Sentences (Internal Monologue/Trial):**
    *   *Attempt 1:* Ein Sprachmodell ist eine künstliche Intelligenz, die auf großen Textmengen trainiert wird. …
    *   *Attempt 2:* Ein Sprachmodell lernt aus riesigen Datenmengen, wie Wörter in Sätzen zusammenhängen. …
    *   *Attempt 3:* Ein Sprachmodell ist ein Algorithmus, der statistische Muster in Sprache erkennt und vorhersagt. …
…
7.  **Final Output Generation.** (Matches the refined draft).
…
</think>Ein Sprachmodell ist eine künstliche Intelligenz, die auf großen Textmengen trainiert wird, um statistische Muster in Sprache zu erkennen. Damit kann es dann automatisch Texte generieren, vervollständigen oder Fragen beantworten.
```

↺ Afterwards empty `SHOW_THINKING` in `.env` again (from Lesson 04 on, `true` breaks JSON steps).

**What does it mean?**

- Two log lines frame the call: `Call started` and `Call completed`. Everything in between is the model's answer. Log lines are English; the answer is German because the question is German.
- After `Call started` nothing happens for a while, then the text runs through quickly. During the pause the reasoning model writes its thinking, which the code leaves out by default.
- With `SHOW_THINKING=true` you see it: English, long, with several drafts. The actual answer comes after `</think>`.
- The two runs answer differently, although model and question are the same. The model picks each token by probability; the same question does not give a word-for-word identical answer.

**Try it:** the tasks in the header of `01-hello-llm.ts`. `temperature` controls how randomly the model picks among the likely tokens; 0 means as consistent as possible. Watch when the first text appears.

**Pitfalls**

- Thinking takes time even when you do not see it. That is why even a short answer takes a few seconds.
- The answer stands without quotes directly between the log lines. That is intended: the code writes the pieces one after another without a line break.
- `response.text` of a finished answer never contains the thinking. `modelText` from [`shared/text.ts`](../shared/text.ts) follows `SHOW_THINKING`.

**If it gets stuck**

| Message | Fix |
|---|---|
| `ERROR Model: Call failed – Cause: Connection error. – fetch failed – connect ECONNREFUSED 127.0.0.1:1234 …` | The LM Studio server is not running, or `REMOTE_MODEL_BASE_URL` is wrong. Start the server, check the address. |
| `404` or `400` with the model name in the cause | `REMOTE_MODEL_NAME` does not match the identifier in LM Studio, or the model is not loaded. |
| `The setting REMOTE_MODEL_NAME is missing from .env (template: .env.example).` | `.env` is missing or incomplete. Compare it with `.env.example`. |
| `The setting SHOW_THINKING in .env must be empty, true or false (also 1/0, yes/no), got "…".` | Fix the value in `.env`. |

All other messages: [Troubleshooting](../../README.md#troubleshooting) in the root README.

> **Deep dive:** The server sends the thinking in a separate field (`reasoning`, on some servers `reasoning_content`) or as a `<think>` block in the text. LangChain discards the field; that is why the code sets `__includeRawResponse: true` and reads the raw response itself. Why `SHOW_THINKING=true` also goes in front of JSON answers and later lessons then fail: [docs/decisions.md](../../docs/decisions.md#show-thinking). The workshop model is [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B).

## Part 2 – Open WebUI as a chat interface

**In one sentence:** Your program starts the facade, which Open WebUI takes for an Ollama server; every chat message lands in your code and goes from there to LM Studio.

**Flow**

1. **Facade** (KERN 1). `createOllamaApiFacade` answers the requests Open WebUI sends to Ollama. `GET /api/tags` returns the model list with the name from `ADVERTISED_MODEL`.
2. **Handler** (KERN 2). `postApiChat` registers your code for `POST /api/chat`. It receives the messages from Open WebUI.
3. **Pass on** (KERN 3). Your code asks the model and sends the answer back to Open WebUI piece by piece (`sendChatStream`).

**What you see**

The log after the start and after one question ("Wie begrenze ich Prompt Injection?", how do I limit prompt injection). Instead of Open WebUI, a script sent the requests with `curl`: the model list twice (waiting for the start, model name), then the question.

```text
$ npm run l01:2
… INFO Model API directly: reachable { status: 200 }
… INFO Facade ready { address: 'http://127.0.0.1:11435', advertisedModel: 'lesson-01-part-2' }
… INFO HTTP request started { requestId: 1, method: 'GET', path: '/api/tags' }
… INFO HTTP request completed { requestId: 1, status: 200, durationMs: … }
… INFO HTTP request started { requestId: 2, method: 'GET', path: '/api/tags' }
… INFO HTTP request completed { requestId: 2, status: 200, durationMs: … }
… INFO HTTP request started { requestId: 3, method: 'POST', path: '/api/chat' }
… INFO Model: Call started { messages: 1 }
… INFO Model: Call completed { messages: 1, durationMs: … }
… INFO HTTP request completed { requestId: 3, status: 200, durationMs: … }
```

What the facade sends back for `POST /api/chat`: one line per piece of text. The shape of the lines (content left out):

```text
$ curl -s http://127.0.0.1:11435/api/chat -H 'Content-Type: application/json' \
    -d '{"model":"lesson-01-part-2","messages":[{"role":"user","content":"Wie begrenze ich Prompt Injection?"}],"stream":true}'
{"created_at":"…","message":{"role":"assistant","content":"…"},"done":false}
{"created_at":"…","message":{"role":"assistant","content":"…"},"done":false}
…
{"done":true}
```

The answer, put together (shortened):

```text
Prompt Injection ist ein Sicherheitsrisiko bei Large Language Models (LLMs), bei dem ein Angreifer versuchen kann, die Systemanweisungen des Modells zu umgehen oder zu überschreiben, um schädlichen Inhalt zu generieren oder sensible Daten preiszugeben.

Hier sind die effektivsten Strategien, um Prompt Injection zu begrenzen und zu verhindern:

### 1. Trennung von System- und Benutzerkontext (Prompt Engineering)
…
### 4. Modell-Auswahl und Konfiguration
…
*   **Sichere Modelle:** Nutzen Sie Modelle, die explizit für Sicherheit trainiert wurden (z.B. Anthropic's Claude mit "Guardrails", OpenAI's GPT-4o mit Sicherheitsfiltern).
…
### 7. Monitoring und Logging
…
```

**What does it mean?**

- `GET /api/tags` asks for the model list. That is how Open WebUI finds `lesson-01-part-2`.
- `messages: 1` is the number of messages your handler received.
- Each line of the answer is its own JSON object with one piece of text (NDJSON); `done: true` ends the stream. Open WebUI puts the pieces together.
- The pieces are tokens. A longer word often arrives in several lines.
- The answer is long and generic. The model does not know the workshop's OWASP documents and answers from its training knowledge, including unchecked product recommendations. Lesson 02 shows how to give it context; Lesson 07 answers the same question with retrieved OWASP sections.

**Try it:** the tasks in the header of `02-open-webui.ts`. Watch the log lines that a single chat message triggers.

**Pitfalls**

- The program does not end by itself. The facade waits for requests until you press Ctrl+C.
- Per chat message the log often shows several `POST /api/chat`. That is not an error; task 3 shows what is behind it.
- The facade listens on `FACADE_PORT`, not on Ollama's default port. That way a real Ollama can run next to it.
- The facade has no login and is therefore only reachable at `127.0.0.1`. If Open WebUI runs in Docker, see [Connecting Open WebUI to the facade](../../README.md#connecting-open-webui-to-the-facade-from-lesson-01-part-2) in the root README.

**If it gets stuck**

| Message | Fix |
|---|---|
| `FACADE_PORT 11435 is in use. Stop the other lesson or change FACADE_PORT in .env and the Ollama connection in Open WebUI.` | Another part is still running. Stop it with Ctrl+C. Only one part with a facade runs at a time. |
| Open WebUI does not show the model | Does the log show `Facade ready`? Is the connection in Open WebUI an **Ollama** connection to the address from the log? |
| `Rejected request with unexpected Host header. …` (HTTP 403) | The connection uses a host name. Use `localhost`, an IP address or `host.docker.internal`. |
| `Request cancelled.` | Not an error: you clicked Stop in Open WebUI. |

> **Deep dive:** The facade comes from the package `ollama-api-facade-js`. Why the workshop replaces its streaming and pins the version to 1.0.7: [docs/decisions.md](../../docs/decisions.md#fassade-gepinnt). `prepareFacade` in [`shared/server.ts`](../shared/server.ts) only accepts known Host headers (protection against DNS rebinding). Everything under `lessons/shared/` is described in [lessons/shared/README.md](../shared/README.md).

## Part 3 – Watching the traffic in Burp

**In one sentence:** The same chat server as in Part 2, but every request from your program to the model goes through Burp, and you read it in the HTTP history.

**Flow**

1. **Through Burp** (KERN 1). `setGlobalDispatcher` routes every outgoing request of this program through the proxy from `BURP_PROXY_URL`. If the value is empty, everything stays direct.
2. **Whole answers** (KERN 2). `disableStreaming: true` makes the server send the answer in one piece. That is easier to read in Burp.

At startup the program checks both ways to the model server: through Burp and directly.

**What you see**

Recorded without Burp, through the logging forwarder (see above). That is why the first check line is missing from the log; with `BURP_PROXY_URL` set, `Model API through Burp: reachable { status: 200 }` comes before it.

```text
$ npm run l01:3
… INFO Model API directly: reachable { status: 200 }
… INFO Facade ready { address: 'http://127.0.0.1:11435', advertisedModel: 'lesson-01-part-3' }
```

In Burp under Proxy → HTTP history, the request to `/v1/chat/completions` after the question "Nenne die Hauptstadt von Frankreich. Nur ein Wort." (name the capital of France, one word only; headers shortened, messages left out):

```text
POST /v1/chat/completions HTTP/1.1
Authorization: Bearer not-required
User-Agent: langchainjs-openai/1.0.0 (…)
Content-Type: application/json

{"model":"qwen3.5-4b","stream":false,"messages":[…]}
```

The answer to it (shortened):

```json
{"object":"chat.completion","model":"qwen3.5-4b","choices":[{"index":0,"finish_reason":"stop",
 "message":{"role":"assistant","content":"Paris",
  "reasoning_content":"Thinking Process:\n\n1.  **Analyze the Request:**\n    *   Question: \"Nenne die Hauptstadt von Frankreich.\" …",
  "tool_calls":[]}}],
 "usage":{"prompt_tokens":21,"completion_tokens":243,"total_tokens":264,"completion_tokens_details":{"reasoning_tokens":228}}}
```

**What does it mean?**

- Two check lines at startup: the model server is reachable through Burp and directly. If only the way through Burp fails, Burp is the problem.
- `Authorization: Bearer …` is your API key in plain text. Here it says `not-required`: that placeholder is sent when `REMOTE_MODEL_API_KEY` is empty, because LM Studio needs no key. Redact a real key before you share screenshots or Burp projects.
- `content` is the answer ("Paris"), `reasoning_content` is the thinking (other servers call the field `reasoning`). Open WebUI shows only `content` as long as `SHOW_THINKING` is empty.
- `usage` counts tokens: 21 for the question, 243 generated, 228 of them thinking (`reasoning_tokens`) for a single word.
- Open WebUI still gets the answer as a stream, just in one piece.

**Try it:** the tasks in the header of `03-burp-proxy.ts`. Watch which parts of the request come from Open WebUI and which your program adds.

**Pitfalls**

- Without `BURP_PROXY_URL`, Part 3 runs like Part 2 and Burp stays empty. That is not an error.
- Burp shows only what your program sends: the requests to the model server. The traffic between Open WebUI and the facade does not appear there.
- At startup the history shows `GET http://burp/` and `GET /v1/models`. These are the checks, not chat requests. The first goes to Burp itself without the API key, so the key never reaches a foreign service on Burp's port.
- With Intercept on, Burp holds every request until you click "Forward". After `MODEL_TIMEOUT_MS` the model call gives up.

**If it gets stuck**

| Message | Fix |
|---|---|
| `Burp is not running at http://localhost:8080 – start Burp or clear BURP_PROXY_URL in .env.` | Start Burp or clear `BURP_PROXY_URL`. |
| `Model API through Burp: The request through Burp failed or timed out. Check the listener and turn Intercept off.` | Turn Intercept off in Burp. |
| `Something other than Burp answers at http://localhost:8080 (HTTP …). …` | Another service uses Burp's port, often Open WebUI without Docker. Move one of them ([Troubleshooting](../../README.md#troubleshooting)). |

> **Deep dive:** `getBurpDispatcher` in [`shared/proxy.ts`](../shared/proxy.ts) builds the proxy dispatcher; from Lesson 02 on, `useBurpIfConfigured` does the same in one line. The programs do not retry failed requests (`maxRetries: 0`) so that Burp shows no duplicate requests. In production you retry temporary errors: [docs/production.md](../../docs/production.md#workshop-simplification--in-production).

## What you take away

1. A call to a language model is an HTTP request with JSON: model name and messages go out, answer and thinking come back.
2. The facade turns your program into a "model" for Open WebUI. Your code sits between chat and model and can change everything.
3. Burp shows everything your program sends, including the API key.

## What's next

From now on you use the facade and Burp in every part with a chat. [Lesson 02 – Tool calls](../02-tool-calls/README.md) gives the model knowledge it does not have: first by hand in the prompt, then through tools it requests itself. The path of all data through the workshop is described in [docs/architecture.md](../../docs/architecture.md).
