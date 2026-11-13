# Lesson 06 – Hybrid search and reranking

[Deutsch](README.de.md) · Explanations, expected output and pitfalls: [GUIDE.md](GUIDE.md)

**Learning goal:** You load the indexes from Lesson 04 into a vector database (Qdrant) and search in three ways: by keywords (BM25), by meaning (vectors) and by both together (hybrid search with RRF). You see what a language model contributes when it re-sorts the hits (reranking) or rewrites the question (multi-query), and what that costs.

## Parts

| Part | File | Start | Shows | Requires |
|---|---|---|---|---|
| 1 | [`01-collection-load.ts`](01-collection-load.ts) | `npm run l06:1` | Load all four indexes into Qdrant, with a BM25 full-text index | Qdrant, index `headings` (others optional) |
| 2 | [`02-keywords-search.ts`](02-keywords-search.ts) | `npm run l06:2` | Keyword search with BM25 | Qdrant with collections from Part 1 |
| 3 | [`03-vector-search.ts`](03-vector-search.ts) | `npm run l06:3` | Vector search next to BM25; a year in the question as a filter | as Part 2, plus LM Studio with E5 |
| 4 | [`04-hybrid-rrf.ts`](04-hybrid-rrf.ts) | `npm run l06:4` | Hybrid search: combine both lists with RRF | as Part 3 |
| 5 | [`05-reranking.ts`](05-reranking.ts) | `npm run l06:5` | Reranking with the language model, with costs | as Part 3, plus chat model |
| 6 | [`06-multiquery.ts`](06-multiquery.ts) | `npm run l06:6` | Multi-query: rewrite the question, merge lists with RRF | as Part 5 |
| **7** | [`99-full-demo.ts`](99-full-demo.ts) (file 99 = Part 7) | `npm run l06:7` | All methods side by side, with costs | as Part 5 |

The tasks are in the header of each file (in German). [`hybrid.ts`](hybrid.ts) is a helper module, not a part: collection names, the Qdrant client and the check whether Qdrant and the collection exist.

## Order and dependencies

- **Qdrant first:** Lesson 06 needs a running Qdrant in Docker. Setup and the security note (bind to `127.0.0.1` only) are in the root README under [Setting up Qdrant](../../README.md#setting-up-qdrant).
- **First:** chunks and the heading index from Lesson 04 (`npm run l04:0`, then `npm run l04:2`). The other indexes (`l04:1`, `l04:3`, `l04:4`) are optional; Part 1 skips missing ones with a note.
- **Part 1 once:** it loads all existing indexes as collections. Parts 2 to 7, however, only search `headings__…`, controlled by `INDEX_STRATEGY` in `hybrid.ts`. Run Part 1 again after a new index in Lesson 04.
- **Parts 2 → 7** in order: each builds on the previous one. Each part runs once and ends; there is no chat and no Open WebUI.
- **Parts 5 to 7** read JSON from the chat model: leave `SHOW_THINKING` in `.env` empty or set it to `false`.
- **Lesson 07 from Part 8** and Lesson 08, Part 6 search the same collections.

## Notes

- **No access filter:** Parts 2 to 7 deliberately search unfiltered, to keep things simple, and also see the internal appendix. Parts 5 and 7 send chunk text to the chat model for reranking. Lesson 07 adds the filter ([why before the search](../../docs/decisions.md#pre-filter)).
- **Burp does not see Qdrant:** the Qdrant client uses its own connection pool that the proxy setting does not reach. Burp only shows the calls to the embedding and chat model. You watch Qdrant in its dashboard at `<QDRANT_URL>/dashboard`.
- **Costs:** reranking makes one chat call per candidate for each question. Locally that is waiting time, with a paid API it is money.

## Further reading

- [GUIDE.md](GUIDE.md): terms, steps per part, real output, pitfalls, error messages.
- [docs/architecture.md](../../docs/architecture.md): data flow, known limits and naming pitfalls (two `INDEX_STRATEGY`, file number ≠ part number).
- [docs/decisions.md](../../docs/decisions.md#json-index-und-qdrant) and [docs/production.md](../../docs/production.md): rationale, simplifications, literature on BM25 and RRF.
- [docs/trainer.md](../../docs/trainer.md): for trainers, contains solutions.
- General error messages: "Troubleshooting" in the [root README](../../README.md#troubleshooting).

Back to the [overview](../../README.md).
