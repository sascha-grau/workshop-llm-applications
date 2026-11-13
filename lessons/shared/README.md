# Shared modules (`lessons/shared/`)

[Deutsch](README.de.md) · Data flow, contracts and known limits: [docs/architecture.md](../../docs/architecture.md)

Module reference for the infrastructure all lessons share: settings, logging, Burp, Ollama facade, embeddings, index.

## When do I need to read this?

Usually never: each lesson explains what its learning goal needs. Look here when a message points to a module, when you want to update a package, or when you share logs and your screen. Messages and their fixes are in the root README under [Troubleshooting](../../README.md#troubleshooting).

## Modules

In the order the lessons need them. "Since" names the first part that loads the module, directly or through another module.

| Module | Purpose in one sentence | Key exports | Since | Notes |
|---|---|---|---|---|
| `config.ts` | Reads `.env` and validates each setting on first read. | `remoteModel`, `remoteEmbeddingModel`, `settings`, `optionalBooleanEnv` | 01, Part 1 | `optionalBooleanEnv` reads the optional switches `ALL_DOCUMENTS` and `SHOW_THINKING` (empty, `true`/`false`, also `1`/`0`, `yes`/`no`; empty = the constant in the code applies), `SHOW_THINKING` as `settings.showThinking`. Old `.env` names report themselves with a hint at the new name. Meaning: [show-thinking](../../docs/decisions.md#show-thinking), [all-documents](../../docs/decisions.md#all-documents) |
| `startup.ts` | Frame of every program. | `runMain` | 01, Part 1 | An error becomes one English line `<what failed> – Cause: <why>` with exit code 1; `DEBUG` adds the stack trace. A cancellation by you is only INFO (`Request cancelled.`). |
| `logging.ts` | Timestamped log lines that line up with Burp's HTTP history. | `log`, `logError`, `logInvocation`, `logHttpRequests`, `isAbortError` | 01, Part 1 | Rule: metadata only, never prompts or model text. The exception is error messages from libraries and the server; they may quote parts of a request, and only `REMOTE_MODEL_API_KEY` is redacted. Check before sharing. |
| `text.ts` | Answer, reasoning, JSON fence and source list from model text. | `modelText`, `modelReasoning`, `stripThinking`, `stripJsonFence`, `formatSourceList`, `withoutSourceLists` | 01, Part 1 | LangChain drops the `reasoning` field; the chat clients set `__includeRawResponse: true`, and `modelReasoning` reads the raw response. `stripThinking` stops at the first `</think>` so an injected tag cannot delete the answer. `formatSourceList` puts each heading (untrusted data, OWASP LLM05) into an inline code span; the format is a [contract](../../docs/architecture.md#contracts) with Lesson 08, Part 6. |
| `stream.ts` | Sends answers to Open WebUI as an NDJSON stream and reports "Stop". | `sendChatStream`, `withoutThinking`, `requestAbortSignal` | 01, Part 1 | Own stream instead of the facade's `asStream`, which drops whitespace-only chunks. `withoutThinking` holds back a possible tag start so a `<think>` split across two chunks is still recognised. Reads a private facade field, see `facade.ts`. |
| `facade.ts` | Version and modules of the `ollama-api-facade-js` package. | `EXPECTED_FACADE_VERSION`, `facadeRequire`, `facadeVersion` | 01, Part 2 | Pinned to `ollama-api-facade-js` 1.0.7 (no `^` in `package.json`) because `stream.ts` reads the private field `response`. An update requires checking `stream.ts`: [fassade-gepinnt](../../docs/decisions.md#fassade-gepinnt) |
| `server.ts` | Prepares the facade, answers errors and starts it. | `prepareFacade`, `logHttpErrors`, `listenWithLogging` | 01, Part 2 | Security: `prepareFacade` rejects foreign Host headers with 403 (DNS rebinding); allowed are `localhost`, IP addresses, `host.docker.internal`, `host.containers.internal` and `FACADE_HOST`. The facade has no authentication, so bind only to `127.0.0.1`. |
| `messages.ts` | Converts the facade's messages for LangChain. | `toPlainMessages`, `splitSystemPrompts`, `isOpenWebUITask`, `withLastUserContext` | 01, Part 2 | Security: an unknown message type throws instead of silently becoming the `system` role. Helper requests (`### Task:`) get a smaller system prompt with a guardrail in the lessons; prefixing `### Task:` bypasses nothing important. |
| `abort.ts` | Stops waiting on APIs without an abort signal. | `abortable` | 01, Part 2 | Only the waiting ends. Embedding calls and Qdrant requests keep running on the server after "Stop" ([known limits](../../docs/architecture.md#known-limits)). |
| `diagnostics.ts` | Checks the model server and Burp at startup. | `checkModelServer`, `checkService` | 01, Part 2 | Checks `/models` through Burp and directly; comparing both shows whether the server or Burp is stuck. Security: through Burp it first fetches Burp's welcome page without the API key, so the key never reaches a foreign service on Burp's port. |
| `proxy.ts` | Routes outgoing requests through Burp when `BURP_PROXY_URL` is set. | `useBurpIfConfigured`, `getBurpDispatcher`, `requireBurpCertificate` | 01, Part 3 | Burp's CA from `BURP_CA_CERT` is added to the normal root certificates; HTTPS through Burp without the CA aborts with instructions. Clients with their own agent bypass Burp, such as the Qdrant client ([known limits](../../docs/architecture.md#known-limits)). |
| `paths.ts` | Paths relative to the repo root. | `repoRoot`, `rootPath`, `contentDirectory`, `indexesDirectory` | 01, Part 3 | Programs run from any folder; only `.env` is loaded by Node relative to the working directory. |
| `chat-model.ts` | Creates chat clients for answers that are parsed as JSON. | `createJsonChatModel` | 06, Part 5 | Sends `reasoning_effort: none` unless `thinking: true` or `SHOW_THINKING=true`; no retries and no streaming. The ratings in Lessons 06/07 set `RERANK_THINKING` (default `true`), see [rerank-denken](../../docs/decisions.md#rerank-denken). |
| `embeddings.ts` | E5 model, prefixes, cosine similarity, embedding client. | `e5Model`, `embeddingQuery`, `cosineSimilarity`, `createEmbeddings` | 03, Part 1 | `embeddingQuery` prepends `query: ` and truncates to `QUERY_CHARACTER_LIMIT`. The client sends plain floats and keeps line breaks (readable in Burp) and never retries ([simplifications](../../docs/production.md)). |
| `index.ts` | Reads and writes index files, ranks hits, defines the access rule. | `readIndex`, `writeIndex`, `rankEntries`, `uniqueChunks`, `isPublicChunk`, `INTERNAL_DOCUMENTS` | 04, Part 1 | Format with `INDEX_FORMAT_VERSION` and a zod schema, written atomically, model name in the file name. `isPublicChunk` filters before the search: [pre-filter](../../docs/decisions.md#pre-filter). The in-memory JSON index is a [simplification](../../docs/production.md). |

## Further reading

| Topic | Where |
|---|---|
| Who writes and reads which file, contracts, known limits, naming pitfalls | [docs/architecture.md](../../docs/architecture.md) |
| Rationale (facade version, `SHOW_THINKING`, `ALL_DOCUMENTS`, pre-filter) | [docs/decisions.md](../../docs/decisions.md) |
| What production would do differently (JSON index, no retries, no tokenizer) | [docs/production.md](../../docs/production.md) |
| Rules for comments and markers in code | [docs/conventions.md](../../docs/conventions.md) |
