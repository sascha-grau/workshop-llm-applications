# Lesson 05 – Retrieval strategies: Guide

*Deutsche Fassung: [GUIDE.de.md](GUIDE.de.md)* · Overview and start: [README.md](README.md)

## What is this about?

**Retrieval** means fetching the chunks that fit a question from the index. Lesson 04 always took the best three. Here you learn the rules a search uses to choose what ends up in the prompt: by rank, by diversity, by metadata and by minimum similarity.

Comparison: a librarian who brings you books for your question. She can bring the five best matches (top-k), five that are as different as possible (MMR), only books from the section you are allowed to enter (filter), or only the ones that really fit, and none if nothing does (threshold).

This lesson needs no language model. Every table shows what would go into the prompt. What the search does not deliver, the model in Lesson 07 cannot know; what it delivers in excess distracts it.

## Where are we?

```text
L03 Embeddings ──► L04 Chunking ──► [ L05 Retrieval ] ──► L06 Qdrant/Hybrid ──► L07 RAG ──► L08 Evaluierung
                                          ▲ du bist hier

indexes/headings__<Modell>.json  (aus npm run l04:2)
        │  Frage einbetten ("query: "), mit jedem Chunk vergleichen
        ▼
Rangliste aller Chunks
        ├─ Teil 1: die ersten k behalten ─────────────────────────► Top-k
        ├─ Teil 2: nacheinander wählen, Ähnliches bestrafen ───────► MMR
        ├─ Teil 3: vorher nach Metadaten filtern ──────────────────► Filter (Zugriffsrechte)
        ├─ Teil 4: nur über einer Mindest-Ähnlichkeit ─────────────► Schwellenwert
        └─ Teil 5: alles nebeneinander + Schwelle kalibrieren ─────► question-set.json
```

## New terms

| Term | In one sentence | Example |
|---|---|---|
| Retrieval strategy | The rule deciding which chunks from the ranking go into the prompt. | top-k, MMR, filter, threshold |
| Noise | Chunks in the prompt that add nothing to the answer; they lengthen the prompt and distract. | A section about supply chains for a question about prompt injection |
| Redundancy | A candidate's highest similarity to a chunk already chosen; high means "already said". | Column `redundancy` in Part 2 |
| Pre-filter / post-filter | Filter before the search (top-k only searches the allowed rest) or after it (hits are removed, nothing moves up). | Columns `(pre-filter)` and `(post-filter)` in Part 3 |
| Access group | `public` or `internal`, in the metadata of every chunk since Lesson 04. The appendix counts as internal. | `accessGroup: 'internal'` |
| Threshold, calibration | Minimum similarity for a hit; measured on questions with and without an answer in the corpus. | `THRESHOLD` and `question-set.json` in Part 5 |

## Check first

- [ ] LM Studio is running and the E5 model (`REMOTE_EMBEDDING_MODEL_NAME`) is loaded. This lesson needs no chat model.
- [ ] The index `headings` exists: run `npm run l04:0` once, then `npm run l04:2`.
- [ ] The constants are at their defaults (`git diff lessons/05-retrieval-strategies` is empty).

All output below: measured on 2026-11-13 with LM Studio and `text-embedding-multilingual-e5-base` (workshop default). Log lines, table borders and long paths are shortened (`…`). With a different server, embedding model or different chunks the numbers differ; the patterns stay.

## Part 1 – Top-k

**In one sentence:** Top-k sorts all chunks by similarity to the question and keeps the best k, however well they fit.

**Steps**

1. **Public chunks only** (KERN 1). `loadPublicIndex` removes the internal chunks of the appendix before the search. Part 3 shows why before.
2. **Rank once** (KERN 2). The question is embedded with `query: ` and compared with every chunk, for the largest k in `TOP_K_VALUES`.
3. **Cut off** (KERN 3). For each k the start of that list remains. The table shows similarity, gap to the previous rank and the estimated length of the context.

**What you see**

```text
Index: 194 public chunks from …/indexes/headings__text-embedding-multilingual-e5-base.json
Top 1 for “Wie begrenze ich Prompt Injection?”: 1 chunks, 443 characters (about 178 tokens of context)
…
Top 8 for “Wie begrenze ich Prompt Injection?”: 8 chunks, 5066 characters (about 2027 tokens of context)
│ rank │ similarity │ gap to previous │ file                           │ section                                                              │
│ 1    │ '0.885'    │ '–'             │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien › 1. Begrenzen Sie das Mod…' │
│ 2    │ '0.881'    │ '0.004'         │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien › 5. Fordern Sie manuelle …' │
│ 3    │ '0.879'    │ '0.002'         │ '01-llm01-prompt-injection.md' │ 'Arten von Prompt Injection-Schwachstellen › Direkte Prompt Injec…'  │
│ 4    │ '0.870'    │ '0.009'         │ '01-llm01-prompt-injection.md' │ 'Beschreibung'                                                       │
│ …                                                                                                                                              │
│ 6    │ '0.866'    │ '0.000'         │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien › 6. Trennen und kennzeic…'  │
│ 7    │ '0.866'    │ '0.000'         │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien'                             │
│ 8    │ '0.863'    │ '0.003'         │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien › 3. Implementieren Sie Fi…' │
```

**What does it mean?**

- 194 instead of 199 chunks: the five chunks of the internal appendix were filtered out before the search.
- The table for k = 3 is exactly the start of the table for k = 8. Ranking happens only once.
- With E5, even unrelated hits often score 0.7 to 0.8 (Lesson 03). Read order and gaps, not absolute values.
- The token count is an estimate from the character count (`CHARACTERS_PER_TOKEN`). It shows how fast the prompt grows with k.

**Try it:** the tasks in the header of `01-top-k.ts` (in German). Watch the column `gap to previous` and how many hits top-k returns for a question the corpus does not answer.

**Pitfalls**

- `gap to previous` shows `0.000` although two chunks differ: the values are rounded to three digits.
- `section` shows `–` for text directly below the document title. The heading path is shown without the title.
- Top-k always returns exactly k chunks, even if none fits. That is not a bug but the rule.

**When it fails**

| Message | Fix |
|---|---|
| `Cannot load index …/headings__….json (headings). Generate it with npm run l04:0, then npm run l04:2.` | Run `npm run l04:0` first, then `npm run l04:2`. |
| `The index … is invalid or outdated. …` | The index comes from an older version. Run `npm run l04:2` again. |
| `The index … contains no public chunks.` | The index contains only internal chunks, usually after a change to `SUBSET` in Lesson 04. Empty `SUBSET`, run `npm run l04:2`. |
| `Model API directly: The model server is unreachable or timed out. …` | Start LM Studio, load E5, check `REMOTE_MODEL_BASE_URL` in `.env`; more under [Troubleshooting](../../README.md#troubleshooting). |

> **Deep dive:** How much context a model really uses also depends on where the information sits in the prompt: in the middle of a long context it is missed more easily. A large k is therefore not automatically better. Literature ("Lost in the Middle") under [Further reading](../../docs/production.md#further-reading).

## Part 2 – MMR

**In one sentence:** MMR (Maximal Marginal Relevance) chooses hits one by one and deducts points from a candidate that resembles a chunk already chosen.

**Steps**

1. **Fetch candidates** (KERN 1). Top-k as in Part 1, but with `FETCH_K` instead of `TOP_K`. MMR chooses only from these candidates.
2. **Choose** (KERN 2). `TOP_K` rounds, for each value in `LAMBDA_VALUES` with the same candidates.
3. **The MMR value** (KERN 3). In each round the candidate with the highest value `LAMBDA × relevance − (1 − LAMBDA) × redundancy` wins. Relevance is the similarity to the question, redundancy the highest similarity to a chunk already chosen.

A worked example with `LAMBDA` = 0.5:

```text
Kandidat A: Relevanz 0,88, Redundanz 0,91  →  0,5 × 0,88 − 0,5 × 0,91 = −0,015
Kandidat B: Relevanz 0,85, Redundanz 0,87  →  0,5 × 0,85 − 0,5 × 0,87 = −0,010
```

B wins although A fits the question better: A repeats too much of what is already chosen.

**What you see**

```text
Index: 194 public chunks from …/indexes/headings__text-embedding-multilingual-e5-base.json
MMR with lambda 1 for “Wie verhindere ich Prompt Injection?”: 3 of 20 candidates from 1 document(s)
│ rank │ top-k rank │ similarity │ redundancy │ file                           │ section                                                    │
│ 1    │ 1          │ '0.886'    │ '–'        │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien'                   │
│ 2    │ 2          │ '0.879'    │ '0.901'    │ '01-llm01-prompt-injection.md' │ '… › 5. Fordern Sie manuelle Freigabe für risikoreiche …'  │
│ 3    │ 3          │ '0.879'    │ '0.914'    │ '01-llm01-prompt-injection.md' │ '… › 1. Begrenzen Sie das Modellverhalten'                 │
MMR with lambda 0.6 for “Wie verhindere ich Prompt Injection?”: 3 of 20 candidates from 1 document(s)
│ 1    │ 1          │ '0.886'    │ '–'        │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien'                   │
│ 2    │ 2          │ '0.879'    │ '0.901'    │ '01-llm01-prompt-injection.md' │ '… › 5. Fordern Sie manuelle Freigabe für risikoreiche …'  │
│ 3    │ 3          │ '0.879'    │ '0.914'    │ '01-llm01-prompt-injection.md' │ '… › 1. Begrenzen Sie das Modellverhalten'                 │
MMR with lambda 0.5 for “Wie verhindere ich Prompt Injection?”: 3 of 20 candidates from 2 document(s)
│ 1    │ 1          │ '0.886'    │ '–'        │ '01-llm01-prompt-injection.md'               │ 'Präventions- und Mitigationsstrategien'                       │
│ 2    │ 14         │ '0.853'    │ '0.865'    │ '07-llm07-offenlegung-des-system-prompts.md' │ '… › 1. Trennen Sie sensible Daten vom System Prompt'          │
│ 3    │ 12         │ '0.856'    │ '0.873'    │ '01-llm01-prompt-injection.md'               │ '… › 3. Implementieren Sie Filter für Ein- und Ausgaben'       │
```

**What does it mean?**

- The table `MMR with lambda 1` is plain top-k: the column `top-k rank` counts 1, 2, 3.
- The column `top-k rank` shows the rank a chunk would have under top-k. Gaps in this column are skipped candidates.
- `redundancy` is always `–` for the first hit: nothing is chosen in round 1, so the best top-k hit wins.
- Redundancy here is higher than relevance. The sections of one document resemble each other more than the question.
- MMR needs no further model call. The candidates' vectors are already in the index.

**Try it:** the tasks in the header of `02-mmr.ts` (in German). Watch the column `top-k rank` and the number of documents in the title line of each table.

**Pitfalls**

- The column `similarity` is not sorted descending. That is correct: MMR sorts by the MMR value, not by similarity.
- The question says "verhindere" (prevent) instead of "begrenze" (limit) as in Part 1. Sections of other documents fit it too, so MMR has a choice at all.
- MMR finds nothing that is not among the `FETCH_K` candidates. And "different from the previous ones" does not mean "useful": MMR does not check whether a chunk answers the question.
- `selectByMmr` exists twice in the code: for reading in `02-mmr.ts` (marker `LEHRKOPIE`, teaching copy) and as the original in `retrieval.ts`, which Part 5 uses. If you change the calculation, change both.

**When it fails:** the same messages as in Part 1.

> **Deep dive:** MMR comes from selecting documents for summaries (Carbonell and Goldstein, 1998; [Further reading](../../docs/production.md#further-reading)). Common values for `LAMBDA` are around 0.5 to 0.7. Because E5 similarities lie close together, even a small change has a strong effect here; the values in `LAMBDA_VALUES` are chosen for this index, not a general guideline. Lesson 07, Part 5 uses MMR for real answers.

## Part 3 – Metadata filter

**In one sentence:** A filter on the metadata decides which chunks may be found at all; similarity only decides the order.

**Steps**

1. **The access filter** (KERN 1). `mayRead` sees only a chunk's metadata, never text or vector, and says yes or no. Allowed is what is listed in `ALLOWED_ACCESS_GROUPS`. Every further filter builds on `mayRead`.
2. **Pre-filter** (KERN 2). For each entry in `FILTERS` only the matching chunks remain; top-k then runs over this rest.
3. **Post-filter** (KERN 3). For comparison: top-k over all chunks, then remove the non-matching hits. Nothing moves up.

**What you see**

```text
Index: 199 chunks from …/indexes/headings__text-embedding-multilingual-e5-base.json
Filter “no filter” for “Welche Unternehmen sind Sponsoren des Projekts?”: 199 of 199 chunks searchable, pre-filter returns 3 hits, post-filter would return 3
│ filter                   │ rank │ similarity │ access group │ file                                                              │ section                         │
│ 'no filter (pre-filter)' │ 1    │ '0.830'    │ 'internal'   │ '11-appendix-llm-application-architecture-and-threat-modeling.md' │ 'Projektsponsoren'              │
│ 'no filter (pre-filter)' │ 2    │ '0.807'    │ 'public'     │ '00-vorwort-der-projektleiter.md'                                 │ 'Das deutsche Übersetzungsteam' │
│ …
Filter “access groups public” for “…”: 194 of 199 chunks searchable, pre-filter returns 3 hits, post-filter would return 1
│ 'access groups public (pre-filter)'  │ 1    │ '0.807'    │ 'public'     │ '00-vorwort-der-projektleiter.md' │ 'Das deutsche Übersetzungsteam'      │
│ …
│ 'access groups public (post-filter)' │ 2    │ '0.807'    │ 'public'     │ '00-vorwort-der-projektleiter.md' │ 'Das deutsche Übersetzungsteam' │
Filter “mitigation sections” for “…”: 60 of 199 chunks searchable, pre-filter returns 3 hits, post-filter would return 0
│ 'mitigation sections (pre-filter)' │ 1    │ '0.775'    │ 'public'     │ '03-llm03-lieferkette.md' │ 'Präventions- und Mitigationsstrategien' │
│ …
```

**What does it mean?**

- The line "x of y chunks searchable" shows how much the filter leaves. The search only sees this rest.
- The post-filter keeps the ranks of the unfiltered search. A gap means: a removed hit stood there.
- The pre-filter always returns `TOP_K` hits as long as enough chunks remain. The post-filter can return fewer, even none.
- A filter does not check relevance. With `mitigation sections`, supply-chain sections appear because no countermeasure section fits the sponsor question.

**Try it:** the tasks in the header of `03-metadata-filter.ts` (in German). Watch the column `access group` and the number after "post-filter would return".

**Pitfalls**

- The table `no filter` and the line "x of y chunks searchable" deliberately show internal file names and counts. They are teaching output for you as a developer. You must not show a user blocked hits or the number of blocked chunks: that alone reveals that internal documents exist for the question.
- When in doubt, keep it out: a chunk only counts as public if it carries `public` and is not on the list `INTERNAL_DOCUMENTS`. A filter is only as good as the metadata.
- `ALLOWED_ACCESS_GROUPS` is a constant in the code because there is no login. In a real application the server derives the groups from the login, never from the request, chat text or a model response.

**When it fails:** the same messages as in Part 1.

> **Deep dive:** Why access rights are always filtered before the search and never live in the system prompt: [docs/decisions.md](../../docs/decisions.md#pre-filter). A chunk that is never in the prompt cannot be coaxed out. How rights get into the metadata in production: [docs/production.md](../../docs/production.md#workshop-simplification--in-production).

## Part 4 – Score threshold

**In one sentence:** A threshold only lets chunks with a minimum similarity through; the number of hits is open, even zero.

**Steps**

1. **Candidates** (KERN 1). For each question in `QUESTIONS` the best `MAX_K` chunks as in Part 1. `MAX_K` stays as an upper bound so that a threshold set too low cannot blow up the prompt.
2. **The rule** (KERN 2). A chunk stays if its similarity is at least the threshold. For each value in `THRESHOLDS` the table shows a column with `keep` or `–`.
3. **Empty list** (KERN 3). If nothing remains, there is no context. The application should then answer "not in the documents" instead of guessing from unsuitable context.

**What you see**

```text
Candidates for “Wie begrenze ich Prompt Injection?”: top 5 by similarity
│ rank │ similarity │ ≥ 0.5  │ ≥ 0.82 │ ≥ 0.88 │ file                           │ section                                   │
│ 1    │ '0.885'    │ 'keep' │ 'keep' │ 'keep' │ '01-llm01-prompt-injection.md' │ '… › 1. Begrenzen Sie das Modellverhalten' │
│ 2    │ '0.881'    │ 'keep' │ 'keep' │ 'keep' │ '01-llm01-prompt-injection.md' │ '… › 5. Fordern Sie manuelle Freigabe …'   │
│ 3    │ '0.879'    │ 'keep' │ 'keep' │ '–'    │ '01-llm01-prompt-injection.md' │ '… › Direkte Prompt Injections'           │
│ …
Threshold 0.5: 5 of 5 candidates
Threshold 0.82: 5 of 5 candidates
Threshold 0.88: 2 of 5 candidates
Candidates for “Wie wird das Wetter morgen?”: top 5 by similarity
│ 1    │ '0.790'    │ 'keep' │ '–'    │ '–'    │ '00-vorwort-der-projektleiter.md' │ 'Das deutsche Übersetzungsteam' │
│ …
│ 5    │ '0.781'    │ 'keep' │ '–'    │ '–'    │ '02-llm02-offenlegung-sensibler-informationen.md' │ 'Referenzlinks' │
Threshold 0.5: 5 of 5 candidates
Threshold 0.82: 0 of 5 candidates – no context, the application should answer “not in the documents”
Threshold 0.88: 0 of 5 candidates – no context, the application should answer “not in the documents”
```

**What does it mean?**

- At `≥ 0.88` rank 3 already drops out, although it lies only 0.002 below rank 2 and fits the topic just as well. A value set too high discards good hits.
- With top-k, the weather question gets five hits with similarities close to 0.8. Without a threshold they would go into the prompt.
- The line "no context" is the desired result: better no answer than one from unsuitable context.
- A value like 0.5, which can make sense with other models, lets everything through with E5.

**Try it:** the tasks in the header of `04-score-threshold.ts` (in German). Watch the gap between the worst `keep` row of the first question and the best row of the second.

**Pitfalls**

- A threshold only holds for one embedding model and one kind of text. With a different model you must measure again.
- If questions with and without an answer lie close together, no value separates them cleanly: a high value discards good hits, a low one lets noise through. Then you need a second check, such as a model that says when the context does not answer the question (Lesson 07).
- A threshold is a quality rule, not a protection. It does not hold back internal chunks (that is what Part 3 is for). Someone who smuggles a text into the index can make it very similar to the expected question.

**When it fails:** the same messages as in Part 1.

> **Deep dive:** In practice you combine threshold and top-k: top-k limits the length, the threshold the quality. How to calibrate a value per model and kind of text is in [docs/production.md](../../docs/production.md#workshop-simplification--in-production). Part 5 takes the first step.

## Part 5 – All strategies compared (`99-full-demo.ts`)

**In one sentence:** Part 5 applies all strategies to the same question and measures the threshold on a question set instead of guessing it.

The file is called `99-full-demo.ts` but is Part 5 and starts with `npm run l05:5`.

**Question set:** [`question-set.json`](question-set.json) contains questions the corpus answers, each with its expected documents (`expectedSources`), and one question without an answer (`withoutSource`). Lesson 08 measures on the same file.

**Steps**

1. **Top-k** (KERN 1), plus the range of similarities.
2. **MMR** (KERN 2) over the best `FETCH_K` candidates.
3. **Metadata filter** (KERN 3): top-k only over chunks whose metadata match `FILTER`.
4. **Threshold** (KERN 4): of the top-k hits only those with at least `THRESHOLD`.
5. **Parent document** (KERN 5) from Lesson 04, Part 5: search in children of about `CHILD_SIZE` characters, deliver the whole section.
6. **Calibrate** (KERN 6): for each question in the question set the best similarity in the expected documents and in all others, and whether the best hit reaches `THRESHOLD`.

**What you see**

```text
Index: 199 chunks from …/indexes/headings__text-embedding-multilingual-e5-base.json
199 parents → 357 children of about 300 characters
1. Top 5 for “Welche Maßnahmen schützen vor Prompt Injection?”:
│ rank │ similarity │ access group │ file                           │ section                                      │ characters │
│ 1    │ '0.896'    │ 'public'     │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien'      │ 428        │
│ …
Similarity of the top 5: min 0.879 / average 0.886 / max 0.896
2. MMR with lambda 0.5 from the top 20:
│ …
│ 5    │ '0.861'    │ 'public'     │ '07-llm07-offenlegung-des-system-prompts.md' │ '… › 1. Trennen Sie sensible Daten vom System Prompt' │ 443 │
3. Filter {"accessGroup":"public","version":"2025"} (194 of 199 chunks), top 5:
│ …
4. Threshold 0.83: 5 of 5 hits remain
│ …
5. Parent-document: children searched, 5 parents delivered from the top 20 children
│ 1    │ '0.896'    │ 'public'     │ '01-llm01-prompt-injection.md' │ 'Beschreibung'                                │ 1843       │
│ …
Calibration with …/lessons/05-retrieval-strategies/question-set.json (best similarity per question):
│ id          │ best expected │ best elsewhere │ answers │ question                                                      │
│ 'F-00'      │ '0.911'       │ '0.870'        │ true    │ 'Was ist neu in den OWASP Top 10 für LLM-Anwendungen 2025?'  │
│ 'F-01'      │ '0.896'       │ '0.861'        │ true    │ 'Welche Maßnahmen schützen vor Prompt Injection?'            │
│ …
│ 'no-source' │ '–'           │ '0.825'        │ false   │ 'Wie richte ich eine Firewall unter Linux ein?'               │
```

**What does it mean?**

- All strategies use the same question vector. The differences between the five tables come only from the selection.
- The column `characters` shows how much text a strategy would put into the prompt. For the parent document this is the whole section, not the child that was found.
- `best expected` is the best similarity in the documents that contain the answer; `best elsewhere` the best in all others. If the second is higher, a foreign document is closer to the question.
- `answers` is decided by the best hit, whatever document it comes from. The calibration only asks whether the application would answer, not whether it would find the right document.
- The question without a source has no expected documents, hence `–`. The default of `THRESHOLD` lies just above its `best elsewhere`.

**Try it:** the tasks in the header of `99-full-demo.ts` (in German). In the calibration, watch rows where `best elsewhere` is greater than `best expected`.

**Pitfalls**

- The filter table equals the top-k table here. That is correct: the best five chunks are public and from the 2025 edition anyway. The filter only acts when a blocked chunk would be in front.
- Part 5 loads the whole index, internal chunks included, so that the filter has something to do. No chunk text goes to a language model; the output is teaching output.
- The questions are embedded with `embedDocuments`, but with the prefix `query: `. With E5 the prefix decides whether a text counts as a question, not the method.
- If the question without an answer lies only just below the others, the threshold is a bet: a new, slightly different question can land on the wrong side.
- `question-set.json` is shared. If you change it, the measurements in Lesson 08 change too.

**When it fails**

| Message | Fix |
|---|---|
| `Cannot load the question set …/question-set.json. Check its JSON and fields.` | The file is not valid JSON or a field is missing. The cause is in the line below (`cause`). Back to the original: `git checkout -- lessons/05-retrieval-strategies/question-set.json`. |
| Messages about the index | as in Part 1 |

> **Deep dive:** The calibration only checks whether the best hit reaches the threshold. Whether the right document is among the top-k is measured by [Lesson 08](../08-evaluations/GUIDE.md), Part 1 on the same question set (hit ratio and MRR). How large a question set should be in production: [docs/production.md](../../docs/production.md#workshop-simplification--in-production).

## What you take away

1. Top-k cuts by rank, not by quality. It always returns k chunks, even if none fits.
2. Access rights belong in a filter before the search, not in the prompt and not after the search.
3. You measure a threshold on questions with and without an answer. It only holds for one model and one corpus.

## What's next

- [Lesson 06 – Hybrid search and reranking](../06-hybrid-rerank/README.md) loads the indexes into Qdrant and adds keyword search (BM25), fusion and a language model that rates hits to the vector search.
- [Lesson 07](../07-rag-open-webui/README.md) gives the retrieved chunks to the language model as context; Parts 5 to 7 there use MMR, filter and threshold from this lesson.
- [Lesson 08](../08-evaluations/README.md) measures the search on the question set from Part 5.
- [docs/architecture.md](../../docs/architecture.md) describes the data flow across all lessons.
