# Lesson 05 – Retrieval strategies

[Deutsch](README.de.md)

**Learning goal:** You understand the rules by which a search selects the chunks that later end up in the prompt: by rank (top-k), by diversity (MMR), by metadata (filter) and by minimum similarity (score threshold). You see what each rule can and cannot do, why access rights are filtered before the search, and how to measure a threshold on a set of questions instead of guessing it.

| Part | File | npm script | Learning goal | Requires |
| --- | --- | --- | --- | --- |
| 1 | `01-top-k.ts` | `npm run l05:1` | Top-k: the k best chunks by similarity | LM Studio (E5), index from `l04:2` |
| 2 | `02-mmr.ts` | `npm run l05:2` | MMR: weigh relevance against diversity | like Part 1 |
| 3 | `03-metadata-filter.ts` | `npm run l05:3` | Metadata filter: before or after the search, access rights | like Part 1 |
| 4 | `04-score-threshold.ts` | `npm run l05:4` | Score threshold: cut off by minimum similarity | like Part 1 |
| 5 | `05-full-demo.ts` | `npm run l05:5` | All strategies side by side (including parent-document from Lesson 04, Part 5), and the threshold calibrated on `question-set.json` | like Part 1 |

`retrieval.ts` is the helper module shared by the parts (loading the index, and the MMR selection that Part 5 uses; Part 2 keeps an identical copy in its own file so you can read it there), not a part of its own. Ranking and index files live in [`shared/index.ts`](../shared/index.ts).

**Order:** First create the chunks (`npm run l04:0`) and the heading index (`npm run l04:2`); all five parts search this one index. Work through the parts from 1 to 5: Parts 2 to 5 assume top-k from Part 1. Each part runs once, writes its tables to the terminal and exits; there is no chat. You only need the E5 model in LM Studio, no chat model and no Open WebUI. Burp is optional.

**Why this lesson:** Lesson 04 built the indexes and, at the end of each part, searched for the three best chunks. Lesson 07 (RAG) gives the chunks found to the language model as context. In between sits the question of which chunks the search should return. Here you see that without a language model: each table shows what would go into the prompt.

**Measured values:** The example values in the files (`LAMBDA_VALUES` in Part 2, `THRESHOLDS` in Part 4) were measured with E5 on this index. With another embedding model or other documents they shift.

**Security note:** The access filter in Part 3 is where access rights are enforced: in the search code, before the search, not in the prompt. Which access groups a user may read is decided by the server from the login, never by the request. The `no filter` table and the line "x of y chunks searchable" show internal file names and counts on purpose; they are teaching output that a user must not see. A score threshold (Part 4) and MMR (Part 2) are quality rules and protect against nothing.

## Key terms

- **Retrieval:** fetching the chunks that match a question from the index. A retrieval strategy is the rule that decides which chunks remain.
- **Top-k:** sort all chunks by cosine similarity to the question and keep the best k. Always returns exactly k chunks, even if none fits (Part 1).
- **Noise:** chunks in the prompt that contribute nothing to the answer. They make the prompt longer and the answer slower and can distract the model.
- **MMR (maximal marginal relevance):** picks the hits one at a time and deducts points from each candidate that resembles a chunk already picked. `LAMBDA` sets the balance: 1 is plain top-k, 0 looks only at diversity. `FETCH_K` is the number of candidates MMR picks from (Part 2).
- **Redundancy:** a candidate's highest similarity to a chunk already picked; high means "this has been said already" (Part 2).
- **Metadata filter:** a hard rule on a chunk's metadata (document, heading path, access group). What the filter excludes, the search can never return (Part 3).
- **Pre-filter / post-filter:** filter before the search (top-k then searches only the allowed rest) or after it (hits are then missing, and the blocked text was already part of the result). For access rights, always before (Part 3).
- **Access group:** `public` or `internal`, in every chunk's metadata since Lesson 04. The appendix counts as `internal` and stands in for a document that not everyone may read.
- **Score threshold:** only chunks with a minimum similarity remain. The number of hits is open, zero included. The right value depends on the embedding model and has to be measured (Part 4).
- **Calibration / question set:** measuring the threshold instead of guessing it. `question-set.json` holds questions the corpus answers (each with its expected documents) and one question without an answer (`withoutSource`). A good threshold lets all answerable questions through and stops the one without an answer; it is valid only for this model and this corpus (Part 5).

## Tasks

Translated from the `Aufgabe` block at the top of each file; the file headers remain the source.

### Part 1 – `01-top-k.ts`

1. Compare the tables for the values in `TOP_K_VALUES`. How many documents do the eight hits come from, and do some of them say almost the same thing? Does the "gap to previous" column show a clear jump where the fitting hits end? (Expected: no, the values lie close together. So top-k does not tell you how many hits are good.)
2. Change `QUESTION` to a question the documents cannot answer (e.g. `Wie wird das Wetter morgen?` (What will the weather be like tomorrow?)). How many hits does top-k return, and how high are the similarities compared with the first question?
3. Ask a question whose answer is spread over several documents (e.g. `Welche Risiken entstehen durch zu viele Berechtigungen?` (Which risks arise from too many permissions?)). Which k do you need so that all fitting documents are among the hits, and how long does the context get?

### Part 2 – `02-mmr.ts`

1. Compare the tables for the values in `LAMBDA_VALUES`. At which value does only the order change, from which value does the selection differ from top-k, and which top-k ranks drop out in return? Do the new chunks fit the question better or worse?
2. Set `FETCH_K` to the same value as `TOP_K`. What does `LAMBDA` still change then, and why? Then set `FETCH_K` to 50: do the hits still fit the question at a small `LAMBDA`?
3. Ask a question whose answer is spread over several documents (e.g. `Welche Risiken entstehen durch zu viele Berechtigungen?`). With which `LAMBDA` does the selection cover more documents than top-k with the same `TOP_K`?

### Part 3 – `03-metadata-filter.ts`

1. Compare the tables for the entries in `FILTERS`. Which hits does the search return without a filter that a user without access to internal documents must not see? How many hits remain if the same filter runs only after the search?
2. Change `QUESTION` to `Wie begrenze ich Prompt Injection?` (How do I limit prompt injection?) and compare the tables of the filters `access groups public` and `mitigation sections`. Which sections drop out? (Expected: only sections under "Präventions- und Mitigationsstrategien" (prevention and mitigation strategies) remain; descriptions and examples drop out even if they are more similar to the question.)
3. Add a filter of your own to `FILTERS` that admits only readable chunks from one document, e.g. this line: `'only LLM06': (metadata) => mayRead(metadata) && metadata.source === '06-llm06-uebermaessige-handlungsfreiheit.md',`. Then ask a question about another document (e.g. the one from task 2). What does the search return, and how can you tell that the hits do not fit? Never leave out `mayRead`: without the access check your filter also finds internal chunks.
4. Set `QUESTION` back to `Welche Unternehmen sind Sponsoren des Projekts?` (Which companies sponsor the project?) and `ALLOWED_ACCESS_GROUPS` to `['public', 'internal']` (an employee instead of a guest). Which hits does the access filter add?

### Part 4 – `04-score-threshold.ts`

1. Compare the two questions in `QUESTIONS`. Which value from `THRESHOLDS` lets hits through for the first question and none for the second? How large is the gap between the worst hit of the first question and the best hit of the second?
2. Add a question of your own to `QUESTIONS` that the documents answer (e.g. `Welche Risiken entstehen durch zu viele Berechtigungen?`). Does the threshold from task 1 let the fitting hits through here too?
3. Add a question that sounds like security but is not in the documents (e.g. `Wie sichere ich mein WLAN zu Hause ab?` (How do I secure my Wi-Fi at home?)). Can you find a threshold that separates it from all answerable questions?

### Part 5 – `05-full-demo.ts`

1. Compare the five tables: which strategy returns chunks from other sections than top-k, and which one delivers the most context?
2. Read the calibration: which questions do not reach `THRESHOLD` although the answer is in the corpus? For which is the best similarity in another document higher than in the expected ones (`best elsewhere` larger than `best expected`)?
3. Add a question of your own to `question-set.json` with its expected documents and adjust `THRESHOLD` so that all questions with an answer get through and `withoutSource` does not.

Back to the [overview](../../README.md).
