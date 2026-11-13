# Lesson 08 – Evaluations: Guide

*Deutsche Fassung: [GUIDE.de.md](GUIDE.de.md)* · Overview and start: [README.md](README.md)

## What is this about?

Up to Lesson 07 you tuned search and answers by eye: one question, one table, one impression. Now you measure. You measure the search with two numbers and without a language model. A language model acting as judge checks the answers. It is like cooking: only when you weigh things do you notice whether the new ingredient makes the dish better or just different.

## Where are we?

```
Lesson 04       Lesson 05        Lessons 06/07                 Lesson 08
Chunks/index ─► search (top-k) ─► answer (RAG, facade) ──────► ► MEASURE ◄
                  ▲                 ▲                ▲
                  Parts 1, 4        Parts 2, 3       Part 6 (through the API)
                  └──── Part 5: all chunking strategies at once ────┘
```

## New terms

| Term | In one sentence | Example |
|---|---|---|
| Hit ratio | Share of questions with an expected document among the top-k. | 11 of 12 questions → 0.92 |
| MRR (mean reciprocal rank) | Mean of 1 / rank of the first hit; a miss counts 0. | Ranks 1, 2, 0 → (1 + 0.5 + 0) / 3 = 0.50 |
| Faithfulness | Every statement of the answer is backed by the context it was given. | "A firewall in front of the model" is not in the context → not faithful |
| Correctness | The answer contains the expected key point (`keyPoint`), in substance and without contradiction. | F-01 expects seven measures |
| LLM-as-a-judge | A language model rates a language model's output, reasoning first, verdict second. | `{"reasoning": "…", "verdict": "no"}` |
| Control answer (Gegenprobe) | A deliberately wrong answer that the judge must reject. | `INVENTED_ANSWER`, `HONEST_NO` |
| Regression | A change that makes a measured value worse; visible only in comparison with the previous run. | `TOP_K` 5 → 3 lowers the hit ratio |

## Check first

- [ ] LM Studio is running with the server started and the E5 model loaded.
- [ ] For Parts 2, 3, 5 and 6: the chat model (`REMOTE_MODEL_NAME`) is loaded.
- [ ] Chunks and heading index exist: `npm run l04:0`, then `npm run l04:2`.
- [ ] For Part 5 also `npm run l04:1`, `npm run l04:3` and `npm run l04:4`.
- [ ] For Part 6: Qdrant is running, the collection is loaded (`npm run l06:1`), and the facade runs in a second terminal (`npm run l07:11`).
- [ ] For Parts 5 and 6: the chat model is loaded in LM Studio with Parallel 1 (in the Developer tab in the model's settings, or `lms load qwen3.5-4b --parallel 1`). With LM Studio's default (Parallel 4), calls fail with `Context size has been exceeded`.
- [ ] `SHOW_THINKING` in `.env` is empty or `false`. A reasoning model writes thinking steps before its answer; with `true` they precede every judge JSON, and there is no verdict.

All output in this guide: measured on 2026-11-13 with LM Studio, `qwen3.5-4b` (chat model and judge) and `text-embedding-multilingual-e5-base` (workshop default). With another model the numbers differ; answers and verdicts also vary between two runs.

All prompts are German, and so are the code comments. For English answers, change "auf Deutsch" to "in English" in `ANSWER_SYSTEM_PROMPT` (in `evaluation.ts`). You may also replace `QUESTION` and `INVENTED_ANSWER` in Part 2 with English text. The judge always returns `yes` or `no`. Its reasoning is usually German in Parts 2 and 3, and usually English for `correct` in Part 5 (promptfoo puts the rubric into an English prompt). E5 is multilingual, so an English question should still find German passages (not measured).

## Part 1 – Hit ratio and MRR

**In one sentence:** You measure the search on twelve questions with known source documents, without a single chat model.

**Flow** (`// KERN 1–4` in `01-hitratio-mrr.ts`)

1. **Search:** each question is embedded (with the E5 prefix `query: `) and ranked against the index. One embedding per question, no chat call. That is cheap, repeatable and done in a second.
2. **Rank:** the position of the first chunk from an expected document (`expectedSources`), counted from 1. Rank 0 means none of the top-k comes from there.
3. **Measures:** hit ratio = questions with rank > 0 / all questions. MRR = mean of 1 / rank. Rank 1 counts 1, rank 2 counts 0.5, rank 5 counts 0.2.
4. **Question without a source:** `withoutSource` has no expected document and therefore no rank. It counts in neither number.

**What you see** (shortened; heading index, `TOP_K` 5)

```
Index: 199 chunks from …/indexes/headings__text-embedding-multilingual-e5-base.json
Retrieval over 12 questions, top-5:
│ 'F-00' │ 1 │ '00-vorwort-der-projektleiter, 00-vorwort-der-projektleiter, …'
│ 'F-05' │ 0 │ '09-llm09-fehlinformationen, 10-llm10-unbegrenzter-verbrauch, …'
│ 'F-09' │ 3 │ '06-llm06-uebermaessige-handlungsfreiheit, 05-llm05-…, 09-llm09-fehlinformationen, …'
│ … (all other questions: rank 1)
Hit ratio: 0.92 · MRR: 0.86
Without source (no-source): best similarity 0.825; excluded from hit ratio and MRR.
```

**What does it mean?**

- 11 of 12 questions have a hit. Only F-05 does not find its document in the top 5.
- The MRR (0.86) is below the hit ratio (0.92) because F-09 is at rank 3. If both numbers are equal, every hit is at rank 1.
- Twelve questions are a small sample. A single question moves the hit ratio by 1/12 ≈ 0.08.
- The document is measured, not the section. A hit in the right document can still be the wrong chunk.
- The question without a source reaches a similarity of 0.825. Real hits are barely higher (`similarity` column in Part 2). Only the score threshold catches such questions (Lesson 05, Part 4), not the ranking.

**Try it:** the tasks in the header of `01-hitratio-mrr.ts`. In task 2, watch the gap between the two numbers.

**Pitfalls**

- F-11 expects the internal appendix and is still found. That is intended: Part 1 loads the whole index (`loadIndex`). It sends no chunk text to a chat model and prints only file names.
- The `sources` column lists one document several times. A document has several chunks, each takes its own place.
- `withoutSource` is missing from the table. Also intended: counted as a miss, it would lower both numbers although the search did nothing wrong.

**If it gets stuck**

| Message | Fix |
|---|---|
| `Cannot load index … Generate it with npm run l04:0, then npm run l04:2.` | Run the named scripts. |
| `… The model server is unreachable or timed out. …` | Start LM Studio, switch on the server, check the address in `.env`. |

> **Deep dive:** Hit ratio and MRR are the simplest retrieval metrics. In production you often also measure recall@k (how many of the relevant chunks were found) or nDCG (ranking with graded relevance). That needs relevance labels per chunk instead of per document and a larger question set, see [docs/production.md](../../docs/production.md#workshop-simplification--in-production).

## Part 2 – Faithfulness with an LLM judge

**In one sentence:** A language model checks whether an answer says only what is in the context, and a control answer checks whether the judge catches invented content.

**Flow** (`// KERN 1–5` in `02-faithfulness.ts`)

1. **Search and answer:** the top 5 form the context. The chat model answers only from it. The judge gets exactly this context, nothing more.
2. **Instructions to the judge:** it answers with JSON, `reasoning` first, then `verdict`. A language model writes word by word. If the verdict comes first, it commits before it has checked. If the reasoning comes first, the verdict follows from it, and you can read it.
3. **Foreign text in tags:** context and answer go into `<retrieved_context>` and `<answer_under_test>`. The system prompt calls both data to be checked, not followed (OWASP LLM01).
4. **Control answer:** the same judge checks `INVENTED_ANSWER`, a plausible but invented answer.
5. **Evaluate:** the judge passes only with `yes` for the real and `no` for the invented answer.

**What you see** (shortened)

```
Index: 194 public chunks from …/headings__text-embedding-multilingual-e5-base.json
Context: top 5 for “Welche Maßnahmen schützen vor Prompt Injection?”:
│ 1 │ 'hit' │ '0.896' │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien'
│ 2 │ 'hit' │ '0.894' │ '01-llm01-prompt-injection.md' │ '… › 5. Fordern Sie manuelle Freigabe für risikoreiche Aktionen'
│ …
real answer:
  | Basierend auf dem bereitgestellten Kontext können folgende Maßnahmen … ergriffen werden:
  | *   **Begrenzung des Modellverhaltens:** …
  | *   **Manuelle Freigabe für risikoreiche Aktionen:** …
  | *   **Trennen und Kennzeichnen externer Inhalte:** …
  faithful: yes
  | Die Antwort fasst die drei genannten Strategien korrekt zusammen und erwähnt zusätzlich den Hinweis auf die Unmöglichkeit absoluter Sicherheit, was ebenfalls im Kontext enthalten ist.

invented answer:
  | Gegen Prompt Injection hilft vor allem eine Firewall vor dem Modell und ein tägliches Backup der Vektordatenbank.
  faithful: no
  | Der Kontext erwähnt keine Firewalls oder Backups als Schutzmaßnahmen, sondern listet spezifische Strategien wie manuelle Freigaben, Verhaltensbeschränkungen und die Trennung externer Inhalte auf.

Judge check passed: the judge accepted the real answer and rejected the invented answer.
```

**What does it mean?**

- Faithfulness needs no reference answer, only context and answer. That is why it can also be measured in production on real requests.
- A judge is a measuring device. If it does not catch the invented answer, it is useless.
- The control alone is not enough: a judge that always says `no` rejects it too. Only `yes` and `no` together show that it discriminates.
- Each run costs three chat calls (one answer, two verdicts), each with the whole context.

**Try it:** the tasks in the header of `02-faithfulness.ts`. In task 2, watch where the injected sentence sits in the prompt (Burp: inside `<answer_under_test>`).

**Pitfalls**

- The real answer does not name all the measures F-01 expects, and the judge still says `yes`. That is correct: faithful means "nothing invented", not "complete". Part 3 checks completeness.
- The judge does not see the question. It checks only whether the answer is backed, not whether it fits.
- The same small model answers and judges. In practice the judge is often a stronger model.

**Security:** Part 2 loads only public chunks (`loadPublicIndex`, the pre-filter from Lesson 05, Part 3). So the internal appendix reaches neither the model nor the judge nor the terminal, even if you change `QUESTION`. Every `<` in foreign text becomes `‹` before wrapping. So the text cannot close a block early with `</answer_under_test>`. Deleting tag names would be less safe: from `</answer_<answer_under_test>under_test>` the deletion itself assembles the closing tag. All this lowers the risk; it is not complete protection.

**If it gets stuck**

| Message | Fix |
|---|---|
| `Judge check FAILED: expected "yes" for the real answer and "no" for the invented answer, got …` | Read both reasonings. The answer may be incomplete or the judge wrong. Did you do Part 3, task 2? Then reset `INVENTED_ANSWER`. |
| `faithful: – (no usable verdict, see the log line above)` preceded by `The judge did not return valid JSON.` | Set `SHOW_THINKING` empty or `false`. If it persists, load another chat model. |
| `The judge response was truncated (finish_reason: length).` | The model thinks too long. First raise the server's output limit, then choose a model that honours `reasoning_effort: none`. |
| `Judge check incomplete: at least one verdict is missing.` | See the line before; one verdict is missing. |

> **Deep dive:** The control answer is the smallest possible check of a judge. In production you validate it against a sample that humans have rated and measure the agreement. Known weaknesses of LLM judges are a preference for long answers and for their own wording, and variation between runs. See [docs/production.md](../../docs/production.md#workshop-simplification--in-production) and the literature under [Further reading](../../docs/production.md#further-reading).

## Part 3 – Correctness against the key point

**In one sentence:** A judge checks whether the answer contains the expected key point, and it must reject an honest "I find nothing".

**Flow** (`// KERN 1–5` in `03-correctness.ts`)

1. **Search with subsections:** the top 5 get their subsections from the same document added (`EXPAND_SECTIONS`, bounded). Lists often live there. This resembles the parent-document retriever (Lesson 04, Part 5), only in the other direction.
2. **Instructions to the judge:** "in substance", because the key point is a list of bullet points. "without contradiction" catches answers that name the points and add something wrong. "I find nothing" is not correct, except for F-10 ("OWASP gives no numbers").
3. **Reference and foreign text:** question and key point come from `question-set.json` and go into `<question>` and `<expected_key_point>` as reference. Only the answer is foreign text. The judge sees no context.
4. **Control answer:** `HONEST_NO` ("Ich finde dazu nichts im Korpus.", I find nothing on this in the corpus) is faithful, but not correct.
5. **Evaluate:** as in Part 2.

**What you see** (shortened)

```
F-01: Welche Maßnahmen schützen vor Prompt Injection?
Expected key point: Modellverhalten begrenzen, Ausgabeformate validieren, Ein-/Ausgabefilter, geringste Rechte, manuelle Freigabe, externe Inhalte kennzeichnen, adversarial Tests
Context: top 5 expanded to 9 chunks for “Welche Maßnahmen schützen vor Prompt Injection?”:
│ 1  │ 'hit'              │ '0.896' │ … │ 'Präventions- und Mitigationsstrategien'
│ …
│ 5  │ 'hit'              │ '0.879' │ … │ '… › 6. Trennen und kennzeichnen Sie externe Inhalte'
│ '' │ 'subsection of #1' │ '0.878' │ … │ '… › 2. Definieren und validieren Sie erwartete Ausgabeformate'
│ '' │ 'subsection of #1' │ '0.870' │ … │ '… › 3. Implementieren Sie Filter für Ein- und Ausgaben'
│ …
real answer:
  | 1.  **Begrenzen Sie das Modellverhalten:** … (seven points) …
  correct: yes
  | Die Antwort listet alle in den erwarteten Punkten genannten Maßnahmen auf und formuliert sie korrekt.
honest no:
  | Ich finde dazu nichts im Korpus.
  correct: no
Judge check passed: the judge accepted the real answer and rejected the honest no.
```

**What does it mean?**

- Correctness needs a reference, faithfulness does not. So you measure correctness on a question set with known answers, before going live and after every change.
- With the subsections, all points of the list are in the context, and the answer names all seven measures.
- Only all measurements together explain a failure: the rank from Part 1, the faithfulness from Part 2 and the correctness here.

**Try it:** the tasks in the header of `03-correctness.ts`. Task 2 changes a **different file** (`02-faithfulness.ts`); reset it afterwards, otherwise Part 2 reports `Judge check FAILED`. In task 3, watch the `via` column and the judge's reasoning.

**Pitfalls**

- Rows with `subsection of #1` have no rank. They are not search hits but added along.
- Part 3 reports `Judge check passed`, yet F-01 fails in Part 5 for `corpus:headings`. Part 5 does not add subsections; see the [FAQ](FAQ.md#frequently-asked-questions).

**If it gets stuck**

| Message | Fix |
|---|---|
| `Question F-xx is not in question-set.json. Use an id such as F-01.` | Set `QUESTION_ID` to an existing id. |
| `Judge check FAILED: … got "no" and "no".` | Read the reasoning: which points are missing, and are they in the context (table above)? |

> **Deep dive:** In practice a question set with key points is called a "golden set". It grows by one question for every failure seen in production. Why twelve questions are enough only for the workshop is in [docs/production.md](../../docs/production.md#workshop-simplification--in-production). Why Part 3 adds subsections: [docs/decisions.md](../../docs/decisions.md#expand-sections).

## Part 4 – Regression

**In one sentence:** Every measurement is saved, and the next run shows the difference to the previous one.

**Flow** (`// KERN 1–4` in `04-regression.ts`)

1. **Load the previous run:** the newest file in `results/lesson-08-regression/`, before measuring. If it is broken, the program stops before sending requests.
2. **Measure and record how:** the same calculation as Part 1 (`measureRetrieval`). Each run also saves embedding model, index, `TOP_K` and number of questions.
3. **Check comparability:** if the runs differ in embedding model, index or number of questions, the program warns. Then the difference measures several changes at once.
4. **Report a regression:** if a measure drops by more than `TOLERANCE`, the program reports it. Then it saves the run.

The first saved run is the **baseline**.

**What you see**

The first run has no previous run. The program reports `No previous run in …; this run becomes the baseline.`, prints hit ratio and MRR and saves the run. From the second run on it compares. Here a run whose previous run was still measured with a differently cut heading index (shortened):

```
Previous run: …/results/lesson-08-regression/2026-11-13T04-24-52.430Z.json
│ 'top-k'     │ 5      │ 5      │ 'unchanged' │
│ 'questions' │ 12     │ 12     │ 'unchanged' │
│ 'hit ratio' │ '0.83' │ '0.92' │ '+0.08'     │
│ 'MRR'       │ '0.79' │ '0.86' │ '+0.07'     │
No regression: no measure dropped compared with the previous run.
Saved: …/results/lesson-08-regression/2026-11-13T09-13-12.344Z.json
```

**What does it mean?**

- Both measures rose because the chunks had changed. A rise is not a regression.
- The search is deterministic. Without a change the same numbers come out, so every difference comes from a change.
- A single number says little. Whether 0.92 is good only shows in comparison.
- In a build pipeline (CI) a regression would fail the build. Here it is a measurement result, and the program exits normally.

**Try it:** the tasks in the header of `04-regression.ts`. In task 2, watch the last line (`Regression` or `No regression`), in task 3 the line above the table.

**Pitfalls**

- Changing `TOP_K` raises no warning. That is intended: it is exactly what you want to compare. The table still shows it.
- A rebuilt index raises no warning either. The comparison uses the strategy name (`INDEX_STRATEGY`), not the content of the index. If you re-chunked in Lesson 04, the difference measures the new chunks, as in the output above.
- `results/` is in `.gitignore`. The runs belong to your machine, like the indexes.

**If it gets stuck**

| Message | Fix |
|---|---|
| `Cannot read the previous run … Delete the file and run again.` | Delete exactly that one file, not the folder. |
| `The previous run … has an unexpected shape. Delete the file and run again.` | Same; the file was edited by hand or comes from an older version. |

> **Deep dive:** With twelve questions a difference of 0.08 is a single question. In production you therefore compare larger sets, repeat measurements that involve a language model several times, and set thresholds at which a build fails. See [docs/production.md](../../docs/production.md#workshop-simplification--in-production).

## Part 5 – Chunking strategies with promptfoo

**In one sentence:** promptfoo asks every chunking strategy every question and shows hit ratio, MRR, faithfulness and correctness in one table.

[promptfoo](https://www.promptfoo.dev/) is a test tool for LLM applications. It is installed with `npm ci`. Parts 5 and 6 are not programs but configurations (YAML).

| Term (promptfoo) | In one sentence |
|---|---|
| Test case | A question with expected documents and key point ([`promptfoo-testcases.ts`](promptfoo-testcases.ts)). |
| Provider | The system under test, here one chunking strategy. Not the same as an API provider. |
| Assertion (check) | A rule per answer. `javascript` computes fixed rules; `llm-rubric` and `faithful` ask a judge. |
| Rubric | The instruction to the judge in `llm-rubric`. |
| Cell | One pair of question and provider: 11 questions × 4 strategies = 44 cells. |

**Flow** (`# KERN 1–6` in `05-promptfoo-strategies.yaml`)

1. **Providers:** one per strategy. All use the same assistant ([`promptfoo-assistant.ts`](promptfoo-assistant.ts), the pipeline from Lesson 07). Only the index changes.
2. **Test cases:** the Lesson 05 question set without F-11. Its answer is only in the internal appendix, which the assistant never searches.
3. **Judge block:** the chat model from `.env` via LM Studio, for `correct` and `faithful`.
4. **Search without a language model:** `source-hit` (mean = hit ratio) and `mrr` (mean = MRR), from the provider's metadata.
5. **Faithfulness:** `faithful` splits the answer into statements and checks each against the context. The value is the share of supported statements, the threshold 1.
6. **Correctness:** `correct` compares the answer with the key point, as in Part 3.

**What you see**

The trial run (`npm run l08:5 -- --filter-first-n 1`) sends only the first question to all four providers. The terminal then shows one row of the table and the summary below it. What table and summary look like for the full run is shown in the measurement run below. If a test failed, npm exits with code 100 (normal, see Pitfalls). The HTML report shows which check failed in a red cell.

### Measurement run 2026-11-13

The full run `npm run l08:5` (44 cells; LM Studio on an RTX 3080 Ti, `qwen3.5-4b` as chat model and judge, loaded with Parallel 1 and context 8192; `text-embedding-multilingual-e5-base`) took 5 min 46 s, just under 8 seconds per cell. Result: 12 cells passed, 32 failed, none ended with `ERROR`. With your own GPU you start it yourself; otherwise the trainer shows the report of a run started beforehand.

```
Running 44 test cases (up to 1 at a time)...
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ query           │ keyPoint        │ expectedSources │ [corpus:prepar… │ [corpus:headin… │ [corpus:semant… │ [corpus:questi… │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ Was ist neu in  │ Unbegrenzter    │ 00-vorwort-der… │ [FAIL] Die      │ [PASS] Die      │ [FAIL] Die      │ [FAIL] Die      │
│ den OWASP Top   │ Verbrauch       │                 │ OWASP Top 10    │ OWASP Top 10    │ OWASP Top 10    │ OWASP Top 10    │
│ …               │ …               │                 │ …               │ …               │ …               │ …               │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┘
✓ Eval complete (ID: eval-5xX-2026-11-13T14:24:21)
Results:
  ✓ 12 passed (27.27%)
  ✗ 32 failed (72.73%)
  0 errors (0%)
Duration: 5m 46s (concurrency: 1)
Writing output to results/lesson-08-promptfoo/05-promptfoo-strategies.html
```

| Provider | Cells passed | `source-hit` | `mrr` | `faithful` | `correct` | Errors |
|---|---|---|---|---|---|---|
| `corpus:prepared` | 2/11 | 0.91 | 0.76 | 0.86 | 0.62 | 0 |
| `corpus:headings` | 3/11 | 0.91 | 0.85 | 0.76 | 0.69 | 0 |
| `corpus:semantic` | 4/11 | 0.91 | 0.84 | 0.85 | 0.59 | 0 |
| `corpus:questions` | 3/11 | 1.00 | 0.89 | 0.88 | 0.73 | 0 |

The means are over all eleven cells of a column; in this run no cell ended with `ERROR`. `source-hit` is 0.91 and misses only F-05; only `corpus:questions` also finds F-05 (1.00). For `faithful` the judge returned valid JSON throughout: as long as `SHOW_THINKING` is off, the step requests structured output and falls back to plain JSON when needed (reasons: [docs/decisions.md](../../docs/decisions.md#kein-structured-output)). Which checks failed in the red cells is broken down in the [FAQ](FAQ.md#what-actually-makes-cells-fail).

**What does it mean?**

- Most red cells come from the strict `faithful` threshold of 1 and from `correct` (the answer does not name all points).
- A cell passes only if **all** four checks pass. So read the metric means, not the number of green cells.
- Why a cell is red and how to read it is explained in detail in the [FAQ](FAQ.md).

**Try it:** the tasks in the header of `05-promptfoo-strategies.yaml`. Tasks 1 and 2 need the full run: the means are in the table of the measurement run above, the single cells in the report of your full run or the trainer's (`results/lesson-08-promptfoo/05-promptfoo-strategies.html`). Task 3 starts a single cell (`--filter-first-n 1 --filter-providers headings`).

**Reading the output:** at the end the terminal shows a table (row per question, column per provider, cell `[PASS]`, `[FAIL]` or `[ERROR]`). Open the HTML report `results/lesson-08-promptfoo/05-promptfoo-strategies.html` directly in the browser; it shows each check's reasoning per cell ([`promptfoo-scores.ts`](promptfoo-scores.ts)). `npx promptfoo view` shows the mean per column in the column header; after a trial run with one question they say little. Stop the viewer with Ctrl+C afterwards (see README, Privacy).

**Pitfalls**

- `npm run l08:5` exits with code 100 as soon as a test fails, and for `ERROR` cells prints `Assertion grading failed during eval` with a stack trace. That is not a crash; results and report are written.
- `mrr` of 0 counts as FAIL, any value above 0 as PASS. The mean is what matters.
- After Ctrl+C, lines like `Assertion grading failed … Provider registry is shutting down` appear. They only mean those verdicts were cancelled. `npm run l08:5 -- --resume` continues.
- If you set `FULL_CORPUS = false` in Lesson 04, `corpus:questions` knows only one document and does badly on the other questions.
- Always start promptfoo through the npm scripts or the VS Code configuration "promptfoo: current config". Only then are `.env` and [`promptfoo.env`](promptfoo.env) loaded. "Run current file" (F5) works only for `.ts` files.

**If it gets stuck**

| Message in the cell or terminal | Fix |
|---|---|
| `[ERROR] Cannot load index … Generate it with npm run l04:0, then npm run l04:N.` | Create the missing index. The other columns keep running. |
| `[ERROR] … judge format error (…) after … attempts: …` | The judge did not keep to the JSON format even after several attempts. With the structured output of `faithful` this is rare (see [measurement run](#measurement-run-2026-11-13)); accept single cases. If many, put a stronger model into the judge block. |
| `[ERROR] … 400 "Engine protocol predict stream returned an error: … Context size has been exceeded. …"`, in the terminal after `Assertion grading failed during eval` | The chat model is loaded with several parallel requests (LM Studio default: Parallel 4); then the context is not enough for each. Reload it with Parallel 1 (see [Check first](#check-first)) and start the run again. |
| `[ERROR] The judge did not answer within … s (timeout in the judge block of the YAML).` | Raise `timeout` in the judge block. |
| `[ERROR] Request timed out.` (without "judge") | Not the judge but the assistant: its answer took longer than `MODEL_TIMEOUT_MS` in `evaluation.ts`. This happens when the server is under load (other runs, model switch in LM Studio). Run again (`-- --resume`) or raise `MODEL_TIMEOUT_MS`. |
| `[FAIL] … Could not extract JSON from … response` (for `correct`) | The verdict was cut off. First raise `max_tokens` in the judge block, then use a model that thinks less. |
| npm reports `exit code 100` | Normal when tests fail. |

> **Deep dive: why does `promptfoo-judge.ts` exist?** promptfoo inserts `{{ env.X }}` as text, and its OpenAI adapter would treat the text `"false"` for `showThinking` as true. The wrapper therefore sets a real boolean, asks for `reasoning_effort: none` and limits the time per verdict (`timeout`) for the judge only. Both judge checks thus use the same block. Basis for `timeout` and `max_tokens`: a thinking judge needed up to about 2200 tokens per verdict at roughly 8 tokens per second (measured on 2026-11-12 with `qwen3.8-4b-q4`). The trade-off: [docs/decisions.md](../../docs/decisions.md#judge-huelle).

> **Deep dive: `faithful` like RAGAS.** [RAGAS](https://docs.ragas.io/) is a widely used framework for evaluating RAG. Its faithfulness metric splits the answer into statements and checks each against the context. [`promptfoo-faithfulness.ts`](promptfoo-faithfulness.ts) does that in two JSON steps with a strictly checked schema and a second attempt on format errors. As long as `SHOW_THINKING` is off, each step first requests structured output (`json_schema`); if the server returns it empty or rejects it, the plain-text prompt with the same check applies. Reason: the judge occasionally wrote invalid JSON, for example a stray backtick after the JSON or unescaped quotation marks next to „…“ inside a text. The JSON is never read from the thinking. promptfoo's built-in `context-faithfulness` check read plain-text verdicts: thinking steps ended up in the statement lists, and format errors silently counted as 0. See [docs/decisions.md](../../docs/decisions.md#eigene-faithful-pruefung) and the RAGAS paper under [Further reading](../../docs/production.md#further-reading).

## Part 6 – The running facade as a black box

**In one sentence:** promptfoo tests the finished application through the same API Open WebUI uses, without looking into the code.

**Flow** (`# KERN 1–4` in `06-promptfoo-black-box.yaml`)

1. **Provider:** the facade model `lesson-07-hybrid` (hybrid search in the Qdrant collection), through the Ollama API. Address from `FACADE_HOST` and `FACADE_PORT` in `.env`.
2. **Test cases:** the same as in Part 5.
3. **Source hit:** searched in the source list the facade appends to the answer, not in the answer text.
4. **Correctness:** the same rubric as in Part 5.

**What you see** (shortened; `npm run l08:6 -- --filter-first-n 1` with the facade from `npm run l07:8`)

```
Running 1 test cases (up to 1 at a time)...
│ query                        │ keyPoint                     │ expectedSources              │ [lesson-07-hybrid] {{query}} │
│ Was ist neu in den OWASP Top │ Unbegrenzter Verbrauch       │ 00-vorwort-der-projektleite… │ [PASS] Die OWASP Top 10 für  │
│ 10 für LLM-Anwendungen 2025? │ erweitert; …                 │                              │ LLM-Anwendungen 2025 wurde … │
Results:
  ✓ 1 passed (100%)
  0 failed (0%)
  0 errors (0%)
Duration: … (concurrency: 1)
Writing output to results/lesson-08-promptfoo/06-promptfoo-black-box.html
```

In the second terminal the facade shows the same request from its side: promptfoo first asks for the model list, then the question arrives as a chat request, and the facade lists its sources.

```
INFO HTTP request started { requestId: 1, method: 'GET', path: '/api/tags' }
INFO HTTP request started { requestId: 2, method: 'POST', path: '/api/chat' }
INFO RAG: Call started { model: 'qwen3.5-4b', strategy: 'lesson-07-hybrid' }
INFO RAG sources {
  sources: [
    '[1] 00-vorwort-der-projektleiter.md · Vorwort der Projektleiter',
    '[2] 00-vorwort-der-projektleiter.md · Vorwort der Projektleiter › Die Zukunft',
    …
INFO HTTP request completed { requestId: 2, status: 200, durationMs: … }
```

**What does it mean?**

- A black-box test sees only what comes back through the API: the answer including the appended source list.
- In return it tests exactly what users get, including facade, prompt and hybrid search.
- `corpus:headings` in Part 5 and `lesson-07-hybrid` use the same chunks and five hits. What differs is the search (hybrid instead of vectors only) and the path (through the facade).

**Try it:** the tasks in the header of `06-promptfoo-black-box.yaml`. In task 2, watch the facade's terminal for whether sources are found.

**Pitfalls**

- The results depend on the state of the running application: loaded collection, model in LM Studio.
- `npm run l07:8` offers only `lesson-07-hybrid`. Task 2 needs `npm run l07:11`.
- If `.env` has `FACADE_HOST=0.0.0.0` (Open WebUI in Docker), this works on Linux and macOS. On Windows, enter `127.0.0.1` in the provider.

**If it gets stuck**

| Message | Fix |
|---|---|
| `ECONNREFUSED` in every row | The facade is not running. Start `npm run l07:11` in a second terminal. |
| `[ERROR] The judge did not answer within … s` | As in Part 5. |

> **Deep dive:** In production, black-box tests often run as a "smoke test" after every deployment, with few questions and fixed expectations. See [docs/production.md](../../docs/production.md).

## Takeaways

- Measure the search without a language model (cheap, repeatable) and the answers with a judge, separately.
- A judge is a measuring device: check it with a control answer before you believe it, and read its reasoning.
- A number means something only in comparison, and only if exactly one thing changed.

## What's next

Lesson 08 is the last lesson. Its measurements feed back: with Parts 4 and 5 you check every change to chunking (Lesson 04), search (Lessons 05 and 06) or prompt (Lesson 07). What is different in production is in [docs/production.md](../../docs/production.md). Back to the [lesson overview](README.md).
