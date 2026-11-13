# Lesson 03 – Embeddings

[Deutsch](README.de.md) · Explanations, expected output and pitfalls: [GUIDE.md](GUIDE.md)

**Learning goal:** You understand what an embedding is, compare texts with cosine similarity and see what the prefixes `query: ` and `passage: ` are for. This is the basis of the search in Lessons 04 to 08.

## Parts

| Part | File | Start | Shows | Requires |
|---|---|---|---|---|
| 1 | [`01-hello-embeddings.ts`](01-hello-embeddings.ts) | `npm run l03:1` | Embed two sentences and measure their similarity | LM Studio with E5; Burp optional |
| 2 | [`02-comparisons.ts`](02-comparisons.ts) | `npm run l03:2` | Sort passages by meaning, compare E5 with EmbeddingGemma | like Part 1, plus EmbeddingGemma |
| 3 | [`03-prefixes.ts`](03-prefixes.ts) | `npm run l03:3` | Measure how much the role prefixes matter | like Part 2 |

The tasks are in the header of each file. [`embeddings.ts`](embeddings.ts) is a helper module (the two models with their prefixes), not a part of its own; E5 and the cosine similarity live in [`../shared/embeddings.ts`](../shared/embeddings.ts).

## Order and dependencies

- **Parts 1 → 3** in order. Each part runs once and ends.
- **No chat model, no Open WebUI:** this lesson needs only the embedding models in LM Studio. Their identifiers are in `.env` (`REMOTE_EMBEDDING_MODEL_NAME`, `REMOTE_EMBEDDING_GEMMA_MODEL_NAME`).
- **Burp** is optional; if `BURP_PROXY_URL` is set, the HTTP history shows the texts and the raw vectors.
- **Afterwards:** Lesson 04 embeds the OWASP documents with E5; you no longer need EmbeddingGemma there.

## Further reading

- [GUIDE.md](GUIDE.md): terms, flow per part, real output, pitfalls, chat language
- [docs/architecture.md](../../docs/architecture.md): data flow across all lessons
- [docs/production.md](../../docs/production.md): simplifications and literature (E5)
- [docs/trainer.md](../../docs/trainer.md) (for trainers, contains solutions): preparation, timings
- Error messages: [Troubleshooting](../../README.md#troubleshooting) in the root README

Back to the [overview](../../README.md).
