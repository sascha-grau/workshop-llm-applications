# Lesson 07 – RAG with Open WebUI

[Deutsch](README.de.md) · Explanations, real output and pitfalls: [GUIDE.md](GUIDE.md)

**Learning goal:** You answer questions about the OWASP documents with source citations: find matching chunks, put them into the prompt as context and let the language model answer from them (Retrieval-Augmented Generation, RAG). Each part swaps one piece of the search, and you compare the answers in Open WebUI.

> **Only one part at a time.** All parts start the facade on the same port (`FACADE_PORT`). Stop the running part with Ctrl+C before you start another one, then reload the model list in Open WebUI.

## Parts

| Part | File | Start | Shows | Requires |
|---|---|---|---|---|
| 1 | [`01-heading-rag.ts`](01-heading-rag.ts) | `npm run l07:1` | The whole RAG flow, written out (`lesson-07-headings`) | Index from `l04:2` |
| 2 | [`02-semantic-rag.ts`](02-semantic-rag.ts) | `npm run l07:2` | The same with semantic chunks (`lesson-07-semantic`) | Index from `l04:3` |
| 3 | [`03-question-generation-rag.ts`](03-question-generation-rag.ts) | `npm run l07:3` | Search over generated questions, answer with the original chunk (`lesson-07-questions`) | Index from `l04:4` |
| 4 | [`04-parent-document-rag.ts`](04-parent-document-rag.ts) | `npm run l07:4` | Search small, deliver the whole section (`lesson-07-parent-document`) | Index from `l04:2`, E5 already at startup |
| 5 | [`05-mmr-rag.ts`](05-mmr-rag.ts) | `npm run l07:5` | MMR: sources that differ from each other (`lesson-07-mmr`) | Index from `l04:2` |
| 6 | [`06-metadata-filter-rag.ts`](06-metadata-filter-rag.ts) | `npm run l07:6` | Filter by document before the search (`lesson-07-metadata-filter`) | Index from `l04:2` |
| 7 | [`07-score-threshold-rag.ts`](07-score-threshold-rag.ts) | `npm run l07:7` | Threshold, fixed answer without a fitting source (`lesson-07-score-threshold`) | Index from `l04:2` |
| 8 | [`08-hybrid-rag.ts`](08-hybrid-rag.ts) | `npm run l07:8` | Hybrid search (BM25 + vector, RRF) in Qdrant (`lesson-07-hybrid`) | Qdrant, collection from `l06:1` |
| 9 | [`09-rerank-rag.ts`](09-rerank-rag.ts) | `npm run l07:9` | Reranking of the hybrid hits by the chat model (`lesson-07-rerank`) | as Part 8 |
| 10 | [`10-multiquery-rag.ts`](10-multiquery-rag.ts) | `npm run l07:10` | Multi-query: versions of the question, fused with RRF (`lesson-07-multiquery`) | as Part 8 |
| **11** | [`99-full-demo.ts`](99-full-demo.ts) (file 99 = Part 11) | `npm run l07:11` | Full demo: all pipelines in one facade, switch in the dropdown (all ten models above) | per model as its part |

All parts need LM Studio with the chat and E5 model and Open WebUI connected to the facade (setup in the [root README](../../README.md)). In parentheses: the model name in Open WebUI. The tasks are in the header of each file.

**Helper modules, not a part of their own:** `rag.ts` (shared flow and facade), `retrieval.ts` (MMR, filter, threshold in memory), `parent-document.ts` (children and parents), `qdrant-retrieval.ts` (hybrid, reranking, multi-query in Qdrant), `demo.ts` (the models for Part 11).

## Order and dependencies

- **Before:** chunks and index from Lesson 04 (`npm run l04:0`, then `npm run l04:2`; for Part 2 `npm run l04:3`, for Part 3 `npm run l04:4`). Lesson 07 reads only the finished indexes.
- **Part 1 first.** It writes out the flow; Parts 2 to 10 only show what is different. After that, any order.
- **Part 3** needs the question index over the whole corpus (`FULL_CORPUS` in `lessons/04-chunking/04-question-generation-chunking.ts`). With only one document it finds nothing for other topics.
- **Parts 8 to 11** need Qdrant with the collection from Lesson 06, Part 1 (`npm run l06:1`, reads the index from `l04:2`). Start command in the [Lesson 06 README](../06-hybrid-rerank/README.md).
- **Parts 9, 10 and 11** read JSON from the chat model: leave `SHOW_THINKING` in `.env` empty or set it to `false`.
- **Part 11** skips models whose prerequisites are missing, with a `WARN` line. `demo.ts` has its own copies of the values; changes in Parts 1 to 10 have no effect there.
- **Lesson 08, Part 6** tests this facade (`npm run l07:11` or `npm run l07:8`) in a second terminal.

## Security

- **Access groups:** chunks from internal documents (here the appendix `11-appendix-…`) are removed before every search, in Parts 1 to 7 when the index is loaded, in Parts 8 to 11 by a filter on every Qdrant search. They can never end up in the context.
- **Indirect prompt injection:** chunks are untrusted data. The `<retrieved_context>` block and the guardrail in the system prompt reduce the risk but do not protect completely. Access control lives in the code, not in the prompt.

## Further reading

- [GUIDE.md](GUIDE.md): flow per part, real output, pitfalls, error messages.
- [docs/architecture.md](../../docs/architecture.md): data flow across all lessons.
- [docs/decisions.md](../../docs/decisions.md) and [docs/production.md](../../docs/production.md): reasons and simplifications.
- [docs/trainer.md](../../docs/trainer.md): for trainers, contains solutions.

Back to the [overview](../../README.md).
