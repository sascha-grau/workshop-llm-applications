# Lesson 04 – Chunking

[Deutsch](README.de.md) · Explanations, expected output and pitfalls: [GUIDE.md](GUIDE.md)

**Learning goal:** You understand why documents are split into chunks, build indexes from them, and see how the way you cut changes the search.

## Parts

| Part | File | Start | Shows | Requires | Writes |
|---|---|---|---|---|---|
| 0 | [`00-prepare-chunks.ts`](00-prepare-chunks.ts) | `npm run l04:0` | Cut the documents into chunks under 512 tokens and check the limit | E5 tokenizer (`npm run tokenizer:fetch`, once), otherwise LM Studio with E5 | `content/owasp-genai-top-10/chunks/` with `manifest.json` |
| 1 | [`01-prepared-chunks.ts`](01-prepared-chunks.ts) | `npm run l04:1` | Build and search an index from finished chunks | as Part 0, plus the chunks from Part 0 | index `prepared` |
| 2 | [`02-heading-chunking.ts`](02-heading-chunking.ts) | `npm run l04:2` | Cut at headings | as Part 1 | index `headings` |
| 3 | [`03-semantic-chunking.ts`](03-semantic-chunking.ts) | `npm run l04:3` | Cut where the topic changes (percentile) | as Part 1 | index `semantic` |
| 4 | [`04-question-generation-chunking.ts`](04-question-generation-chunking.ts) | `npm run l04:4` | Search with generated questions (multi-vector index) | as Part 1, plus chat model | index `questions` |
| 5 | [`05-parent-document.ts`](05-parent-document.ts) | `npm run l04:5` | Search small, deliver big (parent document) | LM Studio with E5, index from Part 2 | nothing |

An index is the file `indexes/<index>__<REMOTE_EMBEDDING_MODEL_NAME>.json`. The tasks are in the header of each file (in German). `chunking.ts` (shared functions) and `formats.ts` (manifest format) are helper modules; reading and writing the index lives in [`../shared/index.ts`](../shared/index.ts).

## Order and dependencies

- **Part 0 first, once.** The chunks are not in the repository. A second run aborts instead of overwriting; check with `npm run l04:0 -- --verify`.
- **Parts 1 to 4** afterwards in any order. All need LM Studio with E5, Part 4 also the chat model.
- **Part 4** writes questions for the whole corpus and takes long on its first run. It can resume: a new start only adds missing chunks.
- **Part 5** needs the index from Part 2.
- Old chunks or indexes are rejected with a message; regenerate them in that case.

Which lesson reads which index is in [docs/architecture.md](../../docs/architecture.md#data-flow).

## Switches

| Switch | Where | Affects |
|---|---|---|
| `DEMO_QUESTION` | `chunking.ts` | search question of all parts (output only) |
| `EXAMPLE_DOCUMENT` | `chunking.ts` | tables in Parts 1 to 3; Part 4 when `FULL_CORPUS` is off |
| `ALL_DOCUMENTS` | `chunking.ts` or `.env` | only the tables in Parts 1 to 3 |
| `TOKEN_LIMIT_OVERRIDE` | `00-prepare-chunks.ts` | chunks and therefore all indexes |
| `SUBSET` | `02-heading-chunking.ts` | index `headings` |
| `DISTANCE_PERCENTILE` | `03-semantic-chunking.ts` | index `semantic` |
| `FULL_CORPUS`, `QUESTIONS_PER_CHUNK` | `04-question-generation-chunking.ts` | index `questions` |
| `CHILD_SIZE` | `05-parent-document.ts` | only the output of Part 5 |
| `SHOW_THINKING` | `.env` | must be empty or `false` for Part 4 |

The defaults are in the code (`// Standard:`). Resetting: [docs/trainer.md](../../docs/trainer.md), section "Switches: default and reset" (for trainers, contains solutions).

## Further reading

- [GUIDE.md](GUIDE.md): steps per part, real output, pitfalls, error messages.
- [docs/architecture.md](../../docs/architecture.md): data flow across all lessons.
- [docs/trainer.md](../../docs/trainer.md) (for trainers, contains solutions): preparation, timings.
- [docs/decisions.md](../../docs/decisions.md) and [docs/production.md](../../docs/production.md): rationale and simplifications.

Back to the [overview](../../README.md).
