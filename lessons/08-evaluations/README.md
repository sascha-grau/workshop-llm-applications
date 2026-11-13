# Lesson 08 – Evaluations

[Deutsch](README.de.md)

**Learning goal:** You measure a RAG application instead of judging it by eye. You measure the search with hit ratio and MRR, without a language model. A language model acting as judge checks the answers for faithfulness and correctness, and a control answer checks the judge. You save every measurement, catch changes for the worse (regressions), and run the same measurements with promptfoo: across all chunking strategies and against the running facade from Lesson 07.

## Parts

| Part | File | Start | Shows | Requires |
|---|---|---|---|---|
| 1 | [`01-hitratio-mrr.ts`](01-hitratio-mrr.ts) | `npm run l08:1` | Hit ratio and MRR of the search, without a language model | LM Studio (E5), index from `l04:2` |
| 2 | [`02-faithfulness.ts`](02-faithfulness.ts) | `npm run l08:2` | Faithfulness: is the answer backed by its context? | like Part 1, plus the chat model |
| 3 | [`03-correctness.ts`](03-correctness.ts) | `npm run l08:3` | Correctness: does the answer contain the expected key point? | like Part 2 |
| 4 | [`04-regression.ts`](04-regression.ts) | `npm run l08:4` | Regression: measure like Part 1, save, compare with the previous run | like Part 1 |
| 5 | [`05-promptfoo-strategies.yaml`](05-promptfoo-strategies.yaml) | `npm run l08:5` | promptfoo: all four chunking strategies, all four measures, one table | like Part 2, plus the indexes from `l04:1` to `l04:4` |
| 6 | [`06-promptfoo-black-box.yaml`](06-promptfoo-black-box.yaml) | `npm run l08:6` | promptfoo: the running facade as a black box, through Open WebUI's API | like Part 2, plus Qdrant (`l06:1`) and the facade (`l07:11`) |

The tasks are in the header of each file (in German, like all lesson code). The [guide](GUIDE.md) explains flow, expected output and pitfalls per part. The [FAQ](FAQ.md) explains why promptfoo cells turn red.

## Order and dependencies

- **First:** chunks and heading index from Lesson 04 (`npm run l04:0`, then `npm run l04:2`). Parts 1 to 4 read this one index.
- **Parts 1 → 4:** in order. Part 3 builds on Part 2, Part 4 on Part 1. Each part runs once and exits; there is no chat and no Open WebUI.
- **Part 4** writes every run to `results/lesson-08-regression/` (listed in `.gitignore`).
- **Parts 5 and 6** are promptfoo configurations, not programs. In the workshop you start them with the first question (`npm run l08:5 -- --filter-first-n 1`). The full run of Part 5 takes several minutes: with your own GPU you start it yourself, otherwise the trainer shows the report of a run started beforehand. Duration and means of the measurement run are in the [guide](GUIDE.md#measurement-run-2026-11-13).
- **Helper modules, not parts of their own:** [`evaluation.ts`](evaluation.ts) (Parts 2 to 5) and `promptfoo-*.ts` (Parts 5 and 6). Question set and index loading come from Lesson 05 ([`question-set.json`](../05-retrieval-strategies/question-set.json), [`retrieval.ts`](../05-retrieval-strategies/retrieval.ts)).
- **Burp** is optional; in Parts 2 and 3 it shows the prompts of answer and judge.

## Before Parts 5 and 6

1. Start LM Studio with the E5 and chat models, the chat model loaded with Parallel 1 ([why](GUIDE.md#check-first)). Leave `SHOW_THINKING` in `.env` empty or set it to `false`.
2. Part 5: create all four indexes (`npm run l04:0`, then `npm run l04:1` to `npm run l04:4`). If one is missing, only its column shows `[ERROR] Cannot load index …`.
3. Part 6: start Qdrant and load the collection (`npm run l06:1`). Start the facade in a second terminal: `npm run l07:11` (or `npm run l07:8`, `lesson-07-hybrid` only).
4. Start promptfoo only through `npm run l08:5` / `npm run l08:6` or the VS Code configuration "promptfoo: current config". Only then are `.env` and [`promptfoo.env`](promptfoo.env) loaded.
5. Result: a table in the terminal and an HTML report in `results/lesson-08-promptfoo/`. If a test fails, npm exits with code 100; that is normal.

## Privacy

- promptfoo stores every run (questions, answers, judge reasoning, configuration) under `~/.promptfoo/`, outside the repo, plus debug logs under `~/.promptfoo/logs/`. Delete everything: `npx promptfoo delete eval all`.
- The configuration names only the variable holding the API key (`apiKeyEnvar`), never the key itself.
- `promptfoo.env` turns off telemetry, the update check, cloud sharing and test generation on promptfoo's servers. The judge's address falls back to LM Studio, never to OpenAI.
- `npx promptfoo view` listens on all network interfaces. On a shared Wi-Fi, others can read your results. Stop the viewer with Ctrl+C right after use, and read everything except the column means in the HTML report.

## Further reading

- [Guide](GUIDE.md): flow, real output, pitfalls and error messages per part
- [FAQ](FAQ.md): when a promptfoo test passes and how to read a red cell
- [docs/architecture.md](../../docs/architecture.md): data flow and artifacts between lessons
- [docs/decisions.md](../../docs/decisions.md): reasoned decisions, e.g. the judge wrapper for promptfoo
- [docs/production.md](../../docs/production.md): what the workshop simplifies
- [docs/trainer.md](../../docs/trainer.md): for trainers, contains solutions
- General error messages: "Troubleshooting" in the [root README](../../README.md)

Back to the [overview](../../README.md).
