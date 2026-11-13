# FAQ: When does a promptfoo test pass, and when does it fail?

*Deutsche Fassung: [FAQ.de.md](FAQ.de.md)*

This FAQ explains the results of Part 5 (`npm run l08:5`) and Part 6 (`npm run l08:6`). Above all it answers one question: **Why is a cell red although the answer seems to contain the right passages?**

## The short version

- **A cell is one pair of question and strategy.** Part 5 has 11 questions × 4 strategies = 44 cells.
- **A cell passes only if _all_ of its checks pass.** Part 5 has four checks per cell. If one fails, the whole cell is `FAIL`, even if the other three are perfect.
- **Two of the four checks are very strict:** `faithful` requires _every_ statement of the answer to be in the context. `correct` requires the answer to contain the _whole_ expected key point, not just part of it.
- **So "the right passages are in there" is not enough.** An answer naming 2 of 7 expected measures is incomplete for `correct`. An answer with 18 supported statements and one that goes slightly too far is not fully faithful for `faithful`.
- **Read the means, not the number of green cells.** A `faithful` of 0.95 means "almost every statement is supported", even if the cell is red.

## The four checks in Part 5

| Check | What it checks | Passes when … | Does _not_ check … |
|---|---|---|---|
| `source-hit` | Did the search find an expected **document**? | at least one file from `expectedSources` is among the hits | whether the right **passage** in that document was found |
| `mrr` | At which **rank** is the first expected document? | the value is above 0 (rank 1 → 1.0; rank 2 → 0.5; rank 3 → 0.33 …) | whether the rank is good; rank 5 passes too |
| `faithful` | Is every **statement of the answer** in the retrieved context? | **all** statements are supported (threshold 1) | whether the answer is complete or correct |
| `correct` | Does the answer contain the **expected key point** (`keyPoint`)? | the judge rates the key point as fully contained and not contradicted | whether the answer stays with the sources |

The code computes `source-hit` and `mrr` without a language model. A language model as judge rates `faithful` and `correct`.

Part 6 has only two checks, `source-hit` (in the source list under the answer) and `correct`. The same rules apply.

## What actually makes cells fail?

Numbers from the [measurement run 2026-11-13](GUIDE.md#measurement-run-2026-11-13) in the guide. In its 29 failed cells these checks failed (one cell can have several):

| Failed check | in this many cells | of these, the **only** cause |
|---|---|---|
| `faithful` | 20 | 12 |
| `correct` | 17 | 9 |
| `source-hit` and `mrr` (always together) | 3 | 0 |

What follows from this:

1. **The main reasons are `faithful` and `correct`**, not the search. The right documents are almost always found (`source-hit` column in the measurement run).
2. **`source-hit` fails only for F-05**, in three of the four strategies. There the expected document really is not among the hits.
3. **`faithful` fails sometimes narrowly, sometimes clearly.** Narrowly: 18 of 19, 12 of 13, 11 of 12 statements supported. Clearly mostly when the answer says what the sources do _not_ contain: for F-10 ("OWASP gives no numbers") `faithful` failed in three strategies with 1 of 2 or 2 of 6, while `correct` passed everywhere.

## Why `correct` fails although the topic is right

The judge compares the answer with the expected key point from [`question-set.json`](../05-retrieval-strategies/question-set.json). Many key points are **lists**:

> F-01: "Modellverhalten begrenzen, Ausgabeformate validieren, Ein-/Ausgabefilter, geringste Rechte, manuelle Freigabe, externe Inhalte kennzeichnen, adversarial Tests"

If the answer names only part of it, the judge says `not correct`. Real reasons from the run (the judge wrote them in English):

> "The output discusses limiting model behavior and validating output formats, which aligns with two of the expected core points in the rubric ('Modellverhalten begrenzen', 'Ausgabeformate validieren'). However, it fails to mention several other critical security measures listed in the rubric: input/output filters ('Ein-/Ausgabefilter'), least privilege principle ('geringste Rechte'), …"

In short: the answer names two of the seven points; input/output filters, least privilege and others are missing.

> "The output correctly mentions the expansion of 'Unbounded Consumption' and the new entry regarding 'Vector and Embedding Weaknesses'. However, it fails to mention the third required update: 'Excessive Autonomy' (Übermäßige Handlungsfreiheit)."

In short: two of the three changes are in it, the extended "Excessive Agency" is missing.

There are usually two causes:

- **The context does not contain all points.** The search returns five chunks. If the list is spread over several sections, not all of them end up in the context. Part 3 shows this with F-01: only with the subsections (`EXPAND_SECTIONS`) are all seven measures in the context. Part 5 does not expand.
- **The model summarizes.** Even when all points are in the context, a small model often names only the first three or four.

**Remember:** "the right document was found" (`source-hit`) does not mean "all needed sections were found". And "the section is in the context" does not mean "the answer names it".

## Why `faithful` fails although almost everything is supported

The judge splits the answer into single statements and checks each against the context. The threshold is 1: **a single unsupported statement makes the check fail.** Typical unsupported statements from the run (translated):

| Statement in the answer | Judge's reason |
|---|---|
| "The sources often distinguish synonymously between prompt injection and jailbreaking." | The context says both terms are "often used synonymously", not that they are "distinguished synonymously". |
| "The zero-trust approach is recommended as a prevention strategy." | Zero trust appears in the context only for LLM05 (treat the model like another user), not as a general prevention strategy. |
| "This can cause the system to accidentally execute malicious code or process data." | The context names no scenarios in which malicious code is executed, only data leaks. |

These are small exaggerations or additions from the model's general knowledge. To a user the answer looks right, but it claims something that is not in the sources. That is exactly what `faithful` is meant to find.

Sometimes the judge is wrong too and marks a supported statement as unsupported. In the measurement run this mostly hit sentences about what the sources do _not_ contain. For F-10 the judge called "The provided sources contain no specific numeric limits …" unsupported and wrote in the same reason that the context indeed names no limits. The reason is in the cell; read it before blaming the answer.

## FAIL, ERROR, PASS: what means what?

| Shown | Meaning | What to do |
|---|---|---|
| `[PASS]` | All checks of the cell passed. | Nothing. |
| `[FAIL]` | At least one check failed. The cell shows every check's reason. | Find out _which_ check failed (see below). |
| `[ERROR]` with `judge format error` | The judge twice returned no valid JSON. This says nothing about the answer. | Accept single cases, with a 4B judge they are to be expected; if there are many, use a stronger model as judge. |
| `[ERROR]` with `Context size has been exceeded` | LM Studio serves several requests in parallel, and the context is not enough for each. | Load the chat model with Parallel 1 ([Check first](GUIDE.md#check-first) in the guide). |
| `[ERROR]` with `did not answer within … s` | The judge was too slow. | Raise `timeout` in the judge block of the YAML file. |
| `[ERROR]` with `Cannot load index` | An index is missing. | Build the indexes from Lesson 04 (`npm run l04:0` to `l04:4`). |

If there are `[ERROR]` cells, `npm run l08:5` exits with code 100 and prints a stack trace per error. That is not a crash; the results and the HTML report are written anyway.

## How to read a red cell

Open the HTML report (`results/lesson-08-promptfoo/05-promptfoo-strategies.html`). Each cell lists the reason of all four checks. Go through them in this order:

1. **`source-hit` failed?** The search did not find the document. That is a **search** problem (chunking, `topK`, embedding). The other checks then say little.
2. **`correct` failed?** Read which points the judge misses. Is the missing point in the retrieved context? (The viewer `npx promptfoo view` shows the context in the cell details, in the metadata under `context`.) If not: a **search** problem (the section was not found). If yes: an **answer** problem (the model left it out).
3. **`faithful` failed?** Read the statements marked `UNSUPPORTED`. Did the answer add something? Then it is an **answer** problem. Is the statement in the context after all? Then the **judge** was wrong.

## Frequently asked questions

**Why is the cell red although `faithful` shows 0.95?**
Because the threshold is 1: 18 of 19 statements is not enough. That is strict on purpose. The 0.95 still tells you a lot: almost everything is supported.

**Why does `mrr` pass with 0.2?**
`mrr` has no threshold; any value above 0 passes. 0.2 means the first expected document was at rank 5. For comparing strategies the mean counts, not pass or fail.

**The answer sounds right to me. Is the judge wrong?**
Sometimes. A small model as judge does not always judge the same way. Usually, though, the judge found something: a missing measure or a statement that is not in the sources. Read its reason in the cell.

**The answer is right there in the cell, so why is "the text" missing?**
The cell shows the assistant's answer. Whether it hits the topic, you see at once. Whether it names _all_ points of the key point and contains _no_ unsupported statement, you only see in the reasons.

**Which number should I look at?**
The means per column: `source-hit` = hit ratio, `mrr` = MRR, `faithful` = share of supported statements, `correct` = share of correct answers. `npx promptfoo view` shows them in the column header. Use them to compare the strategies; the number of green cells is too coarse for that.

**How do I get more green cells?**
It depends on the cause:

- **Sections missing from the context:** raise `topK` under the provider's `config` (as in Part 5, task 3, but upwards) or include subsections as in Part 3.
- **The model leaves points out or adds things:** a larger chat model.
- **The judge is unreliable:** a stronger model in the judge block of the YAML file.

A lower threshold for `faithful` makes cells greener, but not the answers better.

**Why does F-05 fail almost everywhere?**
For F-05 ("Why is it dangerous to pass the model's answer unchecked to a shell?") the search does not find the expected document `05-llm05-fehlerhafte-ausgabeverarbeitung.md` among the hits in three of the four strategies. There all four checks fail: the answer says the sources give no direct answer. Only `corpus:questions` finds the document (at rank 2), because there the questions generated by the model match the search query. In the measurement run, however, that cell ended with `ERROR` (`judge format error`).

**Part 3 reports `Judge check passed`, but in Part 5 the same question fails. How?**
Part 3 adds the subsections of the hits to the context (`EXPAND_SECTIONS = true`); Part 5 does not. For F-01, the `corpus:headings` column (the same index as Part 3) therefore misses measures. Task 3 in the header of `03-correctness.ts` shows the difference.
