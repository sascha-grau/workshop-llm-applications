# Lesson 05 – Retrieval strategies

[Deutsch](README.de.md) · Explanations, expected output and pitfalls: [GUIDE.md](GUIDE.md)

**Learning goal:** You understand the rules a search uses to choose the chunks that later end up in the prompt: by rank (top-k), by diversity (MMR), by metadata (filter) and by minimum similarity (threshold). You see why access rights are filtered before the search, and you measure a threshold on a question set instead of guessing it.

## Parts

| Part | File | Start | Shows | Requires |
|---|---|---|---|---|
| 1 | [`01-top-k.ts`](01-top-k.ts) | `npm run l05:1` | Top-k: the best k chunks by similarity | LM Studio with E5, index from `l04:2` |
| 2 | [`02-mmr.ts`](02-mmr.ts) | `npm run l05:2` | MMR: weigh relevance against diversity | as Part 1 |
| 3 | [`03-metadata-filter.ts`](03-metadata-filter.ts) | `npm run l05:3` | Metadata filter before and after the search, access rights | as Part 1 |
| 4 | [`04-score-threshold.ts`](04-score-threshold.ts) | `npm run l05:4` | Threshold: cut off by minimum similarity | as Part 1 |
| **5** | [`99-full-demo.ts`](99-full-demo.ts) (file 99 = Part 5) | `npm run l05:5` | All strategies side by side and calibrating the threshold on [`question-set.json`](question-set.json) | as Part 1 |

The tasks are in the header of each file (in German). [`retrieval.ts`](retrieval.ts) is a helper module, not a part: loading the index and question set, and the MMR selection that Part 5 uses (Part 2 has a teaching copy of it). Ranking and index files live in [`../shared/index.ts`](../shared/index.ts).

## Order and dependencies

- **First:** chunks and the heading index from Lesson 04 (`npm run l04:0`, then `npm run l04:2`). All five parts search this one index.
- **Parts 1 → 5** in order: Parts 2 to 5 assume top-k from Part 1.
- Each part runs once, writes tables to the terminal and ends. You only need LM Studio with the E5 model, no chat model and no Open WebUI.
- Lesson 08 also reads `question-set.json` (hit ratio, MRR, judge). Changes to it take effect there too.

## Security

- The access filter in Part 3 enforces rights in the search code, before the search, not in the prompt. In a real application the server determines which groups a user may read from the login, never from the request.
- The table `no filter` and the line "x of y chunks searchable" deliberately show internal file names and counts. They are teaching output a user must not see.
- Threshold and MMR are quality rules and protect against nothing.

## Further reading

- [GUIDE.md](GUIDE.md): terms, steps per part, real output, pitfalls, error messages.
- [docs/architecture.md](../../docs/architecture.md): data flow across all lessons and naming pitfalls (two `retrieval.ts`, two `INDEX_STRATEGY`).
- [docs/decisions.md](../../docs/decisions.md#pre-filter) and [docs/production.md](../../docs/production.md): rationale, simplifications, literature.
- [docs/trainer.md](../../docs/trainer.md): for trainers, contains solutions.
- General error messages: "Troubleshooting" in the [root README](../../README.md#troubleshooting).

Back to the [overview](../../README.md).
