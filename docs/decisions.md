# Decisions

*Deutsche Fassung: [decisions.de.md](decisions.de.md)*

Short decision records: context, decision, consequences. Each heading is also the anchor; code comments and guides link e.g. to `#judge-huelle`. The anchors are the same in both language versions.

| Anchor | Topic |
|---|---|
| [kein-structured-output](#kein-structured-output) | JSON by prompt; only the `faithful` judge tries `json_schema` |
| [judge-huelle](#judge-huelle) | `promptfoo-judge.ts` as a wrapper around the judge |
| [eigene-faithful-pruefung](#eigene-faithful-pruefung) | Own `faithful` check instead of `context-faithfulness` |
| [fassade-gepinnt](#fassade-gepinnt) | `ollama-api-facade-js` pinned to one fixed version |
| [npm-audit-funde](#npm-audit-funde) | Known `npm audit` findings through the facade |
| [json-index-und-qdrant](#json-index-und-qdrant) | In-memory JSON index and Qdrant side by side |
| [pre-filter](#pre-filter) | Access filter before the search |
| [show-thinking](#show-thinking) | `SHOW_THINKING=true` means "show everything" |
| [all-documents](#all-documents) | `ALL_DOCUMENTS` only changes the output |
| [expand-sections](#expand-sections) | Lesson 08, Part 3 adds subsections |
| [full-corpus](#full-corpus) | `FULL_CORPUS = true` as default |
| [exakter-tokenizer](#exakter-tokenizer) | Lesson 04, Part 0 counts with the local E5 tokenizer |
| [rerank-denken](#rerank-denken) | Rerank ratings with thinking (`RERANK_THINKING`) |

## kein-structured-output

**No `withStructuredOutput`, no `response_format`**

**Context:** Several parts need JSON from the chat model: questions in Lesson 04, Part 4, ratings and variants in Lessons 06/07, verdicts in Lesson 08. With a JSON schema in the request, the former workshop server with a reasoning model returned the JSON in the `reasoning` field and left `content` empty; LangChain failed with "Unexpected end of JSON input". Not re-tested with LM Studio.

**Decision:** The prompt only asks for JSON. `stripJsonFence` removes a Markdown fence, a zod schema validates the result. Evidence: comments in `lessons/04-chunking/04-question-generation-chunking.ts` and `lessons/08-evaluations/evaluation.ts`.

**Consequences:** Invalid JSON is a normal case: Lesson 04, Part 4 skips the chunk, reranking falls back to -1, multi-query aborts the question, Lesson 08 reports "no usable verdict" or "judge format error".

**Change for `faithful`:** On LM Studio, five cells of Lesson 08, Part 5 failed on invalid JSON from the judge (`qwen3.5-4b`, measured on 2026-11-13): twice a stray backtick followed the JSON, three times unescaped ASCII quotation marks stood next to „…“ inside a text. Therefore `promptfoo-faithfulness.ts` requests strict structured output (`json_schema`) while thinking is off. If it is empty or invalid, or the server rejects `response_format`, the earlier plain-text prompt applies with the same zod check (two format attempts plus one attempt for the fallback; the model object remembers the plain mode). The JSON is never read from the `reasoning` field. Evidence: on LM Studio the full run finished without `ERROR` (five before). On the author's server (`qwen3.8-4b-q4`, ignores `reasoning_effort: none`) structured output puts the JSON into the `reasoning` field, the fallback kicks in, and a single-question test ran without errors. Chat answers and all other JSON calls stay with the prompt.


## judge-huelle

**Judge wrapper `promptfoo-judge.ts`**

**Context:** promptfoo inserts `{{ env.X }}` as text. Its OpenAI adapter reads `config.showThinking ?? true`; the text "false" would be truthy, and "Thinking: …" would precede every `llm-rubric` output. Part 5 has two judge checks (`correct`, `faithful`) that used to be configured differently.

**Decision:** An own provider wraps `openai:chat:<model>`. It sets `showThinking` as a real boolean from `SHOW_THINKING` and, with thinking hidden, `reasoning_effort: 'none'`. One YAML judge block serves both `correct` and `faithful`; `faithful` builds its LangChain model from the same values. One shared `timeout` in the judge block (raised from 5 to 10 minutes on 2026-11-12) applies to both, with its own message "The judge did not answer within … s".

**Consequences:** A different judge model is changed in one place per YAML file. Parts 5 and 6 must keep their blocks identical. If a server ignores `reasoning_effort`, `max_tokens` in the judge block must also cover the thinking; how `max_tokens` and `timeout` are derived is in the [Lesson 08 guide, Part 5](../lessons/08-evaluations/GUIDE.md#part-5--chunking-strategies-with-promptfoo) (deep dive).

## eigene-faithful-pruefung

**Own `faithful` check instead of `context-faithfulness`**

**Context:** promptfoo's built-in `context-faithfulness` parsed plain-text verdicts. The judge's reasoning leaked into the statement lists, and format errors silently counted as 0 ("Could not parse context-faithfulness verdicts").

**Decision:** `lessons/08-evaluations/promptfoo-faithfulness.ts` works in two steps like RAGAS: extract statements (`{"statements": […]}`), then check each against the context (`{"verdicts": […]}`). A strict zod schema validates both answers; each step gets one retry with feedback, then ERROR "judge format error". No statements yields 1.

**Consequences:** FAIL now means "statements not supported", ERROR means "the judge did not keep the format". The reason per statement appears in the HTML report (`promptfoo-scores.ts`).

## fassade-gepinnt

**Facade pinned to `ollama-api-facade-js` 1.0.7**

**Context:** The facade's `asStream` drops whitespace-only pieces and merges paragraphs. The raw Express response is not publicly reachable.

**Decision:** `stream.ts` reads the private field `response` via `Reflect.get` and streams itself (NDJSON). The exact version is in `package.json`; `facade.ts` (`EXPECTED_FACADE_VERSION`), `prepareFacade` and `rawResponse` check version and shape.

**Consequences:** Updating the facade requires re-checking `stream.ts`. The `npm audit` findings through the facade remain ([npm-audit-funde](#npm-audit-funde)).

## npm-audit-funde

**Known `npm audit` findings through the facade**

**Context:** `npm audit` reports 4 findings (`langsmith` up to 0.5.26, `zod` below 4.6.6 (here 3.25) and `uuid` below 11.1.1). They come only through `ollama-api-facade-js` 1.0.7, the latest version and the one the workshop pins ([fassade-gepinnt](#fassade-gepinnt)), which depends on `@langchain/core` 0.3. No compatible fix exists: it would need major version bumps that break the facade.

**Decision:** The findings are accepted. `npm audit fix` changes nothing, `npm audit fix --force` is never run. `package.json` pins fixed versions of `langsmith`, `zod` and `undici` via `overrides` where that is compatible. The exposure is low: the facade only runs on localhost, LangSmith tracing is off, and the affected functions are not reachable in the workshop.

**Consequences:** Do not set any `LANGSMITH_*` or `LANGCHAIN_TRACING*` variables, not even in your shell profile. A real example of a trade-off in the supply chain ([LLM03](../content/owasp-genai-top-10/03-llm03-lieferkette.md), in German).

## json-index-und-qdrant

**In-memory JSON index and Qdrant side by side**

**Context:** Lessons 04 and 05 should show what a vector search is, without infrastructure. Hybrid search (BM25) and fusion need a real database.

**Decision:** Lessons 04, 05, 07 (Parts 1 to 7) and 08 read JSON files and compare with every entry (`rankEntries`). From Lesson 06 and in Lesson 07, Parts 8 to 11, Qdrant joins; `l06:1` copies the finished vectors and embeds nothing again.

**Consequences:** A collection is a copy of its index file: after a new index, run `npm run l06:1` again. Parts without Qdrant run without Docker.

## pre-filter

**Access filter before the search**

**Context:** A filter after the search leaves fewer than k hits or, misplaced, lets internal chunks into the prompt. In Qdrant every sub-search (`prefetch`) builds its own candidate list before fusion.

**Decision:** `isPublicChunk` filters at load time, before ranking (`loadPublicIndex`, `loadRagIndex`). In Qdrant `PUBLIC_FILTER` sits on every `prefetch` and on the fused query (`qdrant-retrieval.ts`). Lesson 06 searches unfiltered on purpose, for clarity.

**Consequences:** What is not readable can never reach the context. A new search path must bring the filter along itself.

## show-thinking

**`SHOW_THINKING=true` means "show everything"**

**Context:** Reasoning models return thinking in a `reasoning` field or as a `<think>` block. Whoever wants to see the thinking wants to see it everywhere, including before JSON answers.

**Decision:** The author's explicit choice: with `true`, `modelText` and `withoutThinking` put the thinking as `<think>…</think>` before every answer, including those parsed as JSON. Default is off.

**Consequences:** With `true` these break on purpose: Lesson 04, Part 4, Lesson 06, Parts 5, 6 and the full demo, Lesson 07, Parts 9 to 11, Lesson 08, Parts 2 and 3; Parts 5 and 6 become unreliable. The full list is in `.env.example`.

## all-documents

**`ALL_DOCUMENTS` only changes the output**

**Context:** Parts 1 to 3 of Lesson 04 otherwise only show `EXAMPLE_DOCUMENT`. A switch that also shrank the index would change Lessons 05 to 08 unnoticed.

**Decision:** `ALL_DOCUMENTS` (constant in `chunking.ts`, default `false`) only controls the detail tables. A value in `.env` (`true`/`false`) overrides the constant; the program says so. The scope of the index is controlled only by `SUBSET` (Part 2) and `FULL_CORPUS` (Part 4).

**Consequences:** Resetting `ALL_DOCUMENTS` also means emptying it in `.env`.

## expand-sections

**Lesson 08, Part 3: add subsections**

**Context:** The key point for F-01 lists seven measures. The top five hits contained only three of them; the judge rightly said "not correct" although the fault was in the search.

**Decision:** `retrieveContext` in `evaluation.ts` adds subsections of the same hits with `expandSections`, bounded to 6 per hit and 12 in total; a hit at the document root is not expanded. `EXPAND_SECTIONS = true` in `03-correctness.ts`.

**Consequences:** Part 3 measures the judge, not the search. Part 5 does not expand; its `correct` column is therefore stricter.

## full-corpus

**`FULL_CORPUS = true` as default**

**Context:** Until 2026-11-12 Lesson 04, Part 4 built the question index for one document only. Lesson 08, Part 5 needed a special column with a subset of the questions.

**Decision:** `FULL_CORPUS = true` in `04-question-generation-chunking.ts`: questions for the whole corpus. `false` takes only `EXAMPLE_DOCUMENT`.

**Consequences:** The first run takes long (see [trainer.md](trainer.md)); build it in advance. All four columns in Part 5 are comparable. The run can be resumed.

## exakter-tokenizer

**Lesson 04, Part 0 counts with the local E5 tokenizer**

**Context:** Part 0 has to know how many tokens a chunk has. LM Studio has no counting endpoint; in the dress rehearsal `usage.prompt_tokens` reported 0 and inputs that were too long were silently truncated. Part 0 fell back to `character-estimate` and produced 351, 369 or 391 small chunks instead of 69, 199 or 230.

**Decision:** Part 0 counts exactly and locally with the tokenizer of `intfloat/multilingual-e5-base` (package `@huggingface/tokenizers` 0.2.0, 87 KB, no dependencies, no install scripts; Transformers.js would have brought about 446 MB of ONNX runtime). The tokenizer files are pinned to an immutable revision and verified by SHA256. The start and end tokens and the prefix `passage: ` are counted. The `tokenizer` method has priority over `embeddings-overflow`, `embeddings-usage` and `character-estimate`. Verified: 69 of 69 counts equal the server's; the 69 chunk files are byte-identical.

**Consequences:** One more dependency and a one-time download of about 16 MB (`npm run tokenizer:fetch`); afterwards everything runs offline, and the folder `.cache/tokenizers/` can be copied. If the tokenizer cannot be loaded, `l04:0` warns with the fix and falls back to the server methods or the estimate. The manifest stays at version 3; older exact manifests remain valid.

## rerank-denken

**Rerank ratings with thinking**

**Context:** Reranking (Lesson 06, Part 5 and full demo, Lesson 07, Parts 9 to 11) lets the chat model rate each hit from 0 to 10. Without thinking (`reasoning_effort: none`) the 4B model rated almost everything 0 (measured on 2026-11-13 with LM Studio). With thinking the ratings are meaningful, but each rating takes about 30 s. LM Studio with "Parallel 1" works through the eight simultaneous requests one after another; the earlier 60 s timeout expired.

**Decision:** `RERANK_THINKING = true` is the default, in `05-reranking.ts`, `99-full-demo.ts` and `qdrant-retrieval.ts`. The rating calls have a 600 s timeout. Both cases go through the shared helper `createJsonChatModel` (`lessons/shared/chat-model.ts`), which sends `reasoning_effort: none` unless `thinking: true` or `SHOW_THINKING=true`; Lesson 08 uses the same helper.

**Consequences:** Lesson 07, Part 9 takes minutes per question. The switch shows the trade-off live: `false` is fast, but the reranking barely reorders. A stronger model or a reranker model (see [production.md](production.md)) solves this better.
