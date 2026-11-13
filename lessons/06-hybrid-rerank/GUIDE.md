# Lesson 06 – Hybrid search and reranking: Guide

*Deutsche Fassung: [GUIDE.de.md](GUIDE.de.md)* · Overview and start: [README.md](README.md)

## What is this about?

Lesson 05 searched with vectors only. That works for questions in the document's own words, but it blurs exact terms like "PoisonGPT", and a colloquial question can land far from the matching chunk. Here you load the indexes into a vector database (Qdrant), search by keywords and by meaning, combine both, and let a language model help before or after the search.

Comparison: a book's index finds exactly the word you look up, but no synonyms. A colleague who knows the book understands what you mean but is unsure about proper names. If you ask both and take what they agree on, you are right more often.

Each method solves a different problem and costs something different. At the end, Part 7 compares them all side by side.

## Where are we?

```text
L04 Chunking ──► L05 Retrieval ──► [ L06 Qdrant/Hybrid ] ──► L07 RAG ──► L08 Evaluation
                                          ▲ you are here

indexes/*.json (L04) ──Part 1──► Qdrant: 4 collections, each with vectors + BM25 full-text index
                                        │  searches use headings__<model> (INDEX_STRATEGY)
                                        ▼
            ┌─ Part 2: keyword search (BM25) ──┐
 question ──┤                                  ├─ Part 4: hybrid (RRF) ─► Part 5: reranking (LLM)
            └─ Part 3: vector search ──────────┘
 question ──LLM──► rewrites ──► one vector search each ──► Part 6: multi-query (RRF)
                                       Part 7: everything side by side, with costs
```

## New terms

| Term | In one sentence | Example |
|---|---|---|
| Collection, point, payload | A collection is in Qdrant what a table is in a database; a point is an entry with ID, vector and payload (chunk text and metadata). | `headings__text-embedding-multilingual-e5-base`, point `#61` |
| BM25 | Classic full-text search: counts the question's words in the chunk, weights rare words higher (IDF) and corrects for length. The score has no upper bound. | `'BM25 score': '5.146'` |
| Stemmer, stop words | The stemmer reduces word forms to a stem; stop words ("die", "und") do not count. Snowball is a common rule-based method for this. | "Maßnahmen" and "Maßnahme" become the same term. |
| Hybrid search, RRF | A keyword list and a vector list are combined into one result. RRF (Reciprocal Rank Fusion) only counts the ranks. | `1 / (RRF_K + rank)` per list |
| Reranking (pointwise) | A language model reads question and chunk together and assigns a score; each candidate is rated on its own. | `{"score": 7}` |
| Multi-query | The language model rewrites the question several times in the corpus's language; each rewrite searches, RRF merges the lists. | "unbeabsichtigte Datenlecks" (unintended data leaks) instead of "ausplaudern" (blab) |

## Check first

- [ ] Qdrant is running: see [Setting up Qdrant](../../README.md#setting-up-qdrant) in the root README (Docker, bound to `127.0.0.1` only). The address is `QDRANT_URL` in `.env`.
- [ ] The index `headings` exists (`npm run l04:0`, then `npm run l04:2`). The other three indexes are optional.
- [ ] For Parts 3 to 7 LM Studio runs with E5, for Parts 5 to 7 also with the chat model (`REMOTE_MODEL_NAME`).
- [ ] `SHOW_THINKING` in `.env` is empty or `false`. Otherwise the thinking precedes the JSON: in Part 5 the ratings fail, Part 6 aborts, Part 7 hits both ([why](../../docs/decisions.md#show-thinking)).
- [ ] Burp is optional. It sees the calls to the embedding and chat model but never the requests to Qdrant: the Qdrant client uses its own connection pool that the proxy setting does not reach. You watch Qdrant in its dashboard at `<QDRANT_URL>/dashboard`.

All output below: measured on 2026-11-13 with LM Studio, `qwen3.5-4b` (chat, Parts 5 to 7) and `text-embedding-multilingual-e5-base` (workshop default), plus Qdrant 1.20.0. With a different server or model, numbers and answers differ. Log lines, timings and table borders are shortened (`…`).

## Part 1 – Loading the indexes into Qdrant

**In one sentence:** Part 1 copies the finished vectors of all four indexes from Lesson 04 into one Qdrant collection each and adds a BM25 full-text index next to them.

So far the vector store was a JSON file that every program loads completely and compares with every entry. A vector database keeps the vectors permanently, searches them with an index and can also do full-text search.

**Steps**

1. **Load the index** (KERN 1). The vectors are ready in the index file; nothing is embedded again. If a file is missing, the program skips it with a note.
2. **Create the collection afresh** (KERN 2). An existing collection of the same name is deleted and created again. The dimension comes from the file, the distance is cosine as before.
3. **Full-text index** (KERN 3) on the field `text`, with German stemmer and German stop words (`TEXT_INDEX`).
4. **Write points** (KERN 4). The ID is the position in the index file, the payload everything except the vector. Afterwards the program shows the number of points, the settings of the full-text index and the fields of one point.

**What you see**

```text
Index prepared: 69 entries from …/indexes/prepared__text-embedding-multilingual-e5-base.json, dimension 768
Collection prepared__text-embedding-multilingual-e5-base: 69 points from 69 index entries
…
Index headings: 199 entries from …/indexes/headings__text-embedding-multilingual-e5-base.json, dimension 768
Collection headings__text-embedding-multilingual-e5-base: 199 points from 199 index entries
Full-text index on text: {"type":"text","tokenizer":"word","stopwords":"german","stemmer":{"type":"snowball","language":"german"},"scoring":{"type":"bm25"}}
Payload fields of point #0: text, source, position, headingPath, version, accessGroup
Index semantic: 230 entries from …/indexes/semantic__text-embedding-multilingual-e5-base.json, dimension 768
…
Index questions: 597 entries from …/indexes/questions__text-embedding-multilingual-e5-base.json, dimension 768
Collection questions__text-embedding-multilingual-e5-base: 597 points from 597 index entries
…
```

**What does it mean?**

- All four indexes end up in Qdrant, but Parts 2 to 7 only search `headings__…`. Which collection is searched is set by `INDEX_STRATEGY` in `hybrid.ts`.
- One point per index entry. The payload fields are the metadata from Lesson 04; which ones exist depends on the index.
- `"scoring":{"type":"bm25"}` confirms: Qdrant stores what BM25 needs for its calculation.
- `dimension 768` comes from the index file. A different embedding model gets its own collection because its name is part of the collection name.

**Try it:** the tasks in the header of `01-collection-load.ts` (in German). In the dashboard, watch the payload fields and compare the collections with each other.

**Pitfalls**

- A collection is a copy of its index file, not a replacement. If an index file changes, load it again here (`npm run l06:1`).
- Burp shows nothing for this part, even when it is running. That is correct: Part 1 only talks to Qdrant.
- A change to `TEXT_INDEX` only takes effect after Part 1 runs again. Until then Qdrant searches with the old full-text index.

**When it fails**

| Message | Fix |
|---|---|
| `Qdrant is not reachable at …. Start it (docker run …) or fix QDRANT_URL in .env.` | Start Qdrant (`docker start qdrant`; the first time see [Setting up Qdrant](../../README.md#setting-up-qdrant)) or check `QDRANT_URL`. |
| `Skipping semantic: Cannot load index …` | Not an error as long as `headings` loads. The npm script named in the message creates the missing index. |
| Part 1 fails while creating the full-text index | The Qdrant is too old for BM25 with `scoring`. Use the version from the root README. |

> **Deep dive:** Why the workshop uses JSON indexes and Qdrant side by side: [docs/decisions.md](../../docs/decisions.md#json-index-und-qdrant). What a vector database adds in production (an index for the neighbour search, updating single entries, authentication): [docs/production.md](../../docs/production.md#workshop-simplification--in-production).

## Part 2 – Keyword search with BM25

**In one sentence:** Part 2 searches the full-text index without any embedding and shows for which questions that works well and for which it does not.

**Steps**

1. **Count words** (KERN 1). For each word of the question Qdrant counts how many chunks contain it, with the same stemmer and stop words as the full-text index. A rare word counts a lot in BM25, a frequent one little, a stop word or an unknown word not at all.
2. **Search** (KERN 2). `query.text` with `using: 'text'` searches the full-text index instead of the vectors and returns at most `TOP_K` chunks, sorted by BM25 score.

**What you see**

```text
Keyword search (BM25) for “PoisonGPT”
Chunks per word (after stemmer and stop words): PoisonGPT 3
Hits: 3 of at most 5
│ rank │ point │ BM25 score │ file                                           │ section                                                              │
│ 1    │ 61    │ '5.146'    │ '03-llm03-lieferkette.md'                      │ 'Beispiele für Angriffsszenarien › Szenario 2: Direkte Manipulation' │
│ 2    │ 73    │ '3.409'    │ '03-llm03-lieferkette.md'                      │ 'Referenzlinks'                                                      │
│ 3    │ 84    │ '3.084'    │ '04-llm04-poisoning-von-daten-und-modellen.md' │ 'Referenzlinks'                                                      │
Keyword search (BM25) for “Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?”
Chunks per word (after stemmer and stop words): Kann 0 · mein 0 · Chatbot 8 · aus 0 · Versehen 1 · Kundendaten 0 · …
Hits: 5 of at most 5
│ 1    │ 37    │ '5.235'    │ '02-llm02-offenlegung-sensibler-informationen.md' │ 'Präventions- und Mitigationsstrategien › Föderiertes Lernen …' │
│ …
Keyword search (BM25) for “Wie wird das Wetter heute?”
Chunks per word (after stemmer and stop words): Wie 0 · wird 0 · das 0 · Wetter 0 · heute 1
Hits: 1 of at most 5
│ 1    │ 1     │ '6.176'    │ '00-vorwort-der-projektleiter.md' │ 'Was ist neu in den Top 10 von 2025' │
```

**What does it mean?**

- `0` in the count means: stop word or not present in the corpus. Such words add nothing to the BM25 score.
- BM25 only returns chunks containing at least one word of the question. So the list can be shorter than `TOP_K` or empty.
- A BM25 score is a sum of weights with no upper bound. A single rare word can produce a higher score than several matching ones. Compare the order, not the score, and never with a cosine similarity.
- `point` is the ID from Part 1, i.e. the position in the index file. Parts 3 to 7 name hits by this number.

**Try it:** the tasks in the header of `02-keywords-search.ts` (in German). Watch the line `Chunks per word` and whether the hits match the meaning of the question.

**Pitfalls**

- A colloquial question ("ausplaudern", blab) uses different words than the document ("Offenlegung", disclosure). That needs the vector search from Part 3.
- The search in Parts 2 to 7 deliberately runs without an access filter, to keep it simple. It also sees the internal appendix. Lesson 07 adds the filter (`PUBLIC_FILTER`).
- `INDEX_STRATEGY` exists twice: in `hybrid.ts` (this lesson; it also affects Lesson 07 from Part 8 and `npm run l08:6`) and in `lessons/05-retrieval-strategies/retrieval.ts`. The two are independent ([naming pitfalls](../../docs/architecture.md#naming-pitfalls)).

**When it fails**

| Message | Fix |
|---|---|
| `The Qdrant collection headings__… does not exist. Load it with npm run l06:1.` | Run `npm run l06:1` first. |
| `Qdrant is not reachable at …` | as in Part 1 |

> **Deep dive:** BM25 and the weighting of rare words (IDF, inverse document frequency) are described by Robertson and Zaragoza (2009) under [Further reading](../../docs/production.md#further-reading). In production, hybrid searches from BM25 and vectors are common because technical terms, product names and error codes easily get lost in an embedding.

## Part 3 – Vector search in Qdrant, next to BM25

**In one sentence:** Part 3 searches Qdrant with vectors, puts the result next to BM25 and turns a year in the question into a filter.

**Steps**

1. **From text to vector** (KERN 1). The question goes to the embedding model, a list of numbers comes back. Only this list goes to Qdrant; Qdrant knows no embedding model.
2. **Vector search** (KERN 2). Instead of `{ text }`, `query` gets the question vector. Without `using` Qdrant searches the vectors, with cosine as in Lesson 05. The table shows the hit of both searches per rank as `#point document score`.
3. **Filter from the question** (KERN 3). If a question from `VERSION_QUESTIONS` names a year, it becomes a filter on the payload field `version` (as in Lesson 05, Part 3). Only the rest of the question is embedded.

**What you see**

```text
1. To the embedding model text-embedding-multilingual-e5-base: “query: Wie verhindere ich, dass mein Chatbot vertrauliche Daten verrät?”
   Back: a vector with 768 numbers: [0.0004, 0.0507, 0.0167, 0.0338, 0.0280, -0.0258, … 762 more]
2. To Qdrant, collection headings__text-embedding-multilingual-e5-base:
   {"query":"[0.0004, 0.0507, 0.0167, 0.0338, 0.0280, -0.0258, … 762 more]","limit":5,"with_payload":true}
│ rank │ hit                   │
│ 1    │ '#44 02-llm02 0.854'  │
│ …
Top 5 for “PoisonGPT” (#point document score):
│ rank │ keyword (BM25)       │ vector               │
│ 1    │ '#61 03-llm03 5.146' │ '#61 03-llm03 0.856' │
│ 2    │ '#73 03-llm03 3.409' │ '#84 04-llm04 0.851' │
│ 3    │ '#84 04-llm04 3.084' │ '#29 01-llm01 0.846' │
│ 4    │ ''                   │ '#44 02-llm02 0.843' │
│ 5    │ ''                   │ '#96 05-llm05 0.843' │
Top 5 for “Kann mein Chatbot aus Versehen …?” (#point document score):
│ 1    │ '#37 02-llm02 5.235'  │ '#44 02-llm02 0.860'  │
│ …
Vector search for “Welche Risiken nennt OWASP 2024 für die Lieferkette?”: version 2024, embedded text “Welche Risiken nennt OWASP für die Lieferkette?”
Filter: {"must":[{"key":"version","match":{"value":"2024"}}]} → 0 of at most 5 hits
│ rank │ no filter            │ version 2024 │
│ 1    │ '#48 03-llm03 0.865' │ ''           │
│ …
Vector search for “Welche Risiken nennt OWASP 2025 für die Lieferkette?”: version 2025, embedded text “…”
│ …
```

**What does it mean?**

- The request to Qdrant contains only numbers. So question and chunks must be embedded with the same model; Qdrant could not notice a mistake.
- The vector search always returns `TOP_K` hits, even for a single word. Its scores lie close together; the gap says little.
- BM25 puts an exact term clearly in front and stays silent when no word matches (empty cells).
- The line `embedded text` shows: the year is removed from the embedded text. In the vector it would only have shifted the search a little; as a filter it is a hard rule.

**Try it:** the tasks in the header of `03-vector-search.ts` (in German). Watch which column contains the document that answers the question.

**Pitfalls**

- The scores of the two columns are not comparable: BM25 has no upper bound, cosine with E5 mostly lies between 0.7 and 0.9. That is why Part 4 combines the lists via ranks.
- An empty cell is not an error: this search has fewer hits.
- If a filter returns nothing, that is the honest answer ("there are no documents on this"), not a case for the most similar hits without the filter.

**When it fails**

| Message | Fix |
|---|---|
| `Model API directly: The model server is unreachable or timed out. …` | Start LM Studio, load E5, check `REMOTE_MODEL_BASE_URL`. |
| Messages about Qdrant | as in Parts 1 and 2 |

> **Deep dive:** Deriving filters from the question is often called "self-query" in the literature: in production a language model usually splits the question into search text and filter. Here a regular expression is enough. Why filters run before the search: [docs/decisions.md](../../docs/decisions.md#pre-filter).

## Part 4 – Hybrid search with RRF

**In one sentence:** Part 4 lets Qdrant fetch the BM25 and vector lists in one request and combine them into one list via RRF over the ranks.

**Steps**

1. **Hybrid in one request** (KERN 1). `prefetch` fetches both lists with `CANDIDATES_PER_LIST` candidates each, `query: { rrf }` fuses them on the server into the best `TOP_K`.
2. **Recalculate** (KERN 2). Each list gives a chunk `1 / (RRF_K + rank)`, with ranks from 0 as in Qdrant; the contributions are added. If a chunk is missing from a list, it gets nothing from it. An example: rank 0 in one list and rank 4 in the other gives 1/60 + 1/64 ≈ 0.0323.
3. **Check top ranks** (KERN 3). Below each table it says whether rank 0 of each single list made it into the hybrid top-k.

**What you see**

```text
Hybrid search (RRF, k = 60) for “PoisonGPT” – rank from 0 in both lists, RRF by hand next to Qdrant’s score:
│ rank │ hit            │ keyword rank │ vector rank │ RRF by hand │ RRF Qdrant │
│ 1    │ '#61 03-llm03' │ 0            │ 0           │ '0.0333'    │ '0.0333'   │
│ 2    │ '#84 04-llm04' │ 2            │ 1           │ '0.0325'    │ '0.0325'   │
│ 3    │ '#73 03-llm03' │ 1            │ 8           │ '0.0311'    │ '0.0311'   │
│ 4    │ '#29 01-llm01' │ '–'          │ 2           │ '0.0161'    │ '0.0161'   │
│ 5    │ '#44 02-llm02' │ '–'          │ 3           │ '0.0159'    │ '0.0159'   │
Rank 0 keyword: #61 03-llm03, in the hybrid top 5: yes
Rank 0 vector: #61 03-llm03, in the hybrid top 5: yes
Hybrid search (RRF, k = 60) for “Kann mein Chatbot aus Versehen …?” – …
│ 1    │ '#158 09-llm09' │ 1            │ 4           │ '0.0320'    │ '0.0320'   │
│ …
Rank 0 keyword: #37 02-llm02, in the hybrid top 5: no
Rank 0 vector: #44 02-llm02, in the hybrid top 5: no
```

**What does it mean?**

- `–` in a rank column means: the chunk is not among the first `CANDIDATES_PER_LIST` of that list. It then only gets the other list's contribution, roughly half.
- RRF rewards agreement. A chunk at ranks 1 and 2 (1/61 + 1/62) beats one that is at rank 0 in only one list (1/60).
- The RRF scores lie close together. With `RRF_K` = 60, rank 0 is worth only a little more than rank 5.
- RRF needs no model call apart from embedding the question.

**Try it:** the tasks in the header of `04-hybrid-rrf.ts` (in German). Watch the lines `Rank 0 …` and how far apart the two rank columns are.

**Pitfalls**

- RRF finds nothing that is not among the first `CANDIDATES_PER_LIST` of some list.
- RRF does not check whether a chunk answers the question. Two lists can also agree on an unsuitable chunk. Only the reranking in Part 5 checks that.
- Ranks count from 0, the column `rank` from 1. The formula uses ranks from 0, like Qdrant.

**When it fails:** the same messages as in Part 3.

> **Deep dive:** RRF and the value 60 for the constant come from Cormack, Clarke and Büttcher (2009), see [Further reading](../../docs/production.md#further-reading). Other fusions weight the normalised scores of both lists; that needs comparable scores and a weighting you have to measure. RRF needs neither.

## Part 5 – Reranking with the language model

**In one sentence:** A language model reads question and chunk together, rates each hybrid hit from 0 to 10 and re-sorts.

The vector search embeds question and chunk separately and only compares vectors. In reranking the model sees both texts at once.

**Steps**

1. **Candidates** (KERN 1). The hybrid search from Part 4 returns the best `CANDIDATES` chunks.
2. **Rate** (KERN 2). Pointwise: one chat call per candidate with the question and the first `TEXT_LIMIT` characters of the chunk, all in parallel. With `RERANK_THINKING` (default) the model thinks before each rating. It answers with JSON `{"score": …}`; a schema checks the answer.
3. **Re-sort** (KERN 3). Descending by the model's number. On a tie the RRF order stays. An unusable answer ends up behind the rated ones.

**What you see**

```text
Reranking the hybrid top 8 for “Kann mein Chatbot aus Versehen …?” (#point document score):
Cost: 8 LLM calls, 15280 tokens, … s
│ rank │ before (RRF)           │ after (LLM 0–10)  │
│ 1    │ '#158 09-llm09 0.0320' │ '#19 01-llm01 2'  │
│ 2    │ '#96 05-llm05 0.0311'  │ '#118 07-llm07 1' │
│ 3    │ '#145 09-llm09 0.0311' │ '#158 09-llm09 0' │
│ 4    │ '#19 01-llm01 0.0310'  │ '#96 05-llm05 0'  │
│ …
│ 8    │ '#44 02-llm02 0.0167'  │ '#44 02-llm02 0'  │
```

**What does it mean?**

- `before` shows RRF scores, `after` the model's number. The two columns have different units.
- Both columns contain the same eight chunks. Reranking only re-sorts; what is not among the candidates does not get into the prompt afterwards either.
- Many equal numbers (here several `0`) are normal for a small model. On a tie the RRF order decides.
- The cost line counts calls and tokens. Each question costs `CANDIDATES` calls; with a paid API that is money, locally waiting time.
- Most tokens are thinking steps (reasoning tokens): the answer itself is only `{"score": …}`, and before it the model thinks for every rating. That makes the ratings slow and expensive.

**Try it:** the tasks in the header of `05-reranking.ts` (in German). Watch the cost line and how far a chunk moves between `before` and `after`.

**Pitfalls**

- A `–` instead of a number in `after` means: the call failed, or the answer was not valid JSON or was outside 0 to 10. The log before it shows the reason.
- Pointwise means: each call sees only one chunk. The numbers of different calls are therefore not exactly calibrated against each other.
- `RERANK_THINKING` is not `SHOW_THINKING`. The switch lets the model think; the program removes the thinking steps before it reads the JSON. `SHOW_THINKING=true`, by contrast, puts them in front of the JSON, and the ratings fail.
- Reranking sends chunk text to the chat model. Because Lesson 06 searches without an access filter, that can include the internal appendix.
- The chunk text is foreign text in the prompt and could contain instructions. That is why the RAG prompts in Lesson 07 frame it in their own tags (`<retrieved_context>`); see [docs/production.md](../../docs/production.md#workshop-simplification--in-production).

**When it fails**

| Message | Fix |
|---|---|
| `– N answer(s) unusable, kept behind the rated ones` | Usually `SHOW_THINKING=true`: the thinking precedes the JSON. Empty the switch or set `false`, run Part 5 again. If the log says `Context size has been exceeded`, see the next row. |
| `ERROR LLM: Call failed – … Context size has been exceeded.` | The parallel calls share the chat model's context in LM Studio. Reload the chat model with Parallel 1 (load setting "Max Concurrent Predictions") and run Part 5 again. |
| `ERROR LLM: Call failed – …` for single points | The model did not return matching JSON. Run again; if it persists, load a different chat model. |
| The ratings take very long, the program seems to hang | Normal with `RERANK_THINKING`: the model thinks before each rating, and LM Studio with Parallel 1 works through the calls one after another. Wait; the log lines `LLM: Call completed` show the progress. |
| `ERROR LLM: Call failed – …` with a timeout (timed out) | The rating's time limit (`timeout` in the call to `createJsonChatModel`) ran out. That only happens with Parallel greater than 1 or on a slower computer: set Parallel 1, otherwise raise `timeout`. |
| Messages about Qdrant or the model server | as in Parts 1 and 3 |

> **Deep dive:** With thinking steps a small model usually rates more sensibly, but needs many times the tokens and time. The third task shows how large the difference is; why `RERANK_THINKING` is still the default: [docs/decisions.md](../../docs/decisions.md#rerank-denken). In practice a small, specially trained model does the reranking (cross-encoder): it reads question and chunk together and outputs a relevance score directly, without a prompt and without JSON to validate. There are lightweight models for this, e.g. Qwen3-Reranker-0.6B with 0.6 billion parameters. See [docs/production.md](../../docs/production.md#workshop-simplification--in-production). Why Part 5 does not ask the server for structured output: [docs/decisions.md](../../docs/decisions.md#kein-structured-output).

## Part 6 – Multi-query

**In one sentence:** The language model rewrites the question several times in the corpus's technical language; each rewrite searches, and RRF merges the lists.

Reranking can only re-sort what the search has already found. Multi-query starts earlier: at the question.

**Steps**

1. **Rewrite** (KERN 1). One chat call returns `VARIANT_COUNT` factual rewrites with IT security terms, as JSON.
2. **Embed and search** (KERN 2). The original question and the rewrites are embedded in one request; each searches on its own. The original question stays one of the lists so that rewrites that drift off cannot push it out.
3. **Fuse** (KERN 3). One `prefetch` per vector, RRF over all lists, as in Part 4, just with more than two.

**What you see**

```text
Multi-query for “Kann mein Chatbot aus Versehen …?” (rewriting: 1 LLM call, … s):
Variant 1: Wie lässt sich das Risiko einer unbeabsichtigten Datenexfiltration durch Generative AI-Modelle im Hinblick auf PII und Trade Secrets bewerten, …?
Variant 2: Welche Bedrohungsvektoren wie Prompt Injection könnten zu einer Verletzung der Vertraulichkeit sensibler Daten führen …?
Variant 3: Wie kann die Compliance bei der Verarbeitung von Kundendaten in LLM-basierten Chatbots gewährleistet werden, um unbeabsichtigte Datenlecks zu verhindern …?
Original question against multi-query (4 vectors, RRF k = 60) (#point document score):
│ rank │ original question (vector) │ multi-query (4 vectors, RRF) │ found by       │
│ 1    │ '#44 02-llm02 0.860'       │ '#115 06-llm06 0.049'        │ '3 of 4 lists' │
│ 2    │ '#96 05-llm05 0.850'       │ '#58 03-llm03 0.046'         │ '3 of 4 lists' │
│ 3    │ '#127 07-llm07 0.846'      │ '#44 02-llm02 0.045'         │ '3 of 4 lists' │
│ …
```

**What does it mean?**

- Always read the rewrites. They show in which direction the model steers the search.
- `found by` counts in how many single lists a hit appears. A chunk found by several rewrites rises.
- The RRF scores are higher than in Part 4 because four lists contribute instead of two. They are only comparable within one table.
- Multi-query costs one chat call and several embeddings per question. The rewrites depend on the model and its mood; a second run can return different ones.

**Try it:** the tasks in the header of `06-multiquery.ts` (in German). Watch the technical terms in the rewrites and the column `found by`.

**Pitfalls**

- The left column is the plain vector search with the original question, not the hybrid search from Part 4. Multi-query uses vectors only here.
- A bad rewrite leads the search in the wrong direction. The original question as its own list softens that but does not prevent it.
- If the model returns a wrong number of rewrites or no JSON, the run aborts. There is no fallback value as in Part 5.

**When it fails**

| Message | Fix |
|---|---|
| `ERROR LLM: Call failed – …`, then abort | Usually `SHOW_THINKING=true` or an answer with the wrong number of rewrites. Empty the switch or set `false`, run again. |
| Messages about Qdrant or the model server | as in Parts 1 and 3 |

> **Deep dive:** Related methods let the model write a hypothetical answer instead of questions and search with its vector (HyDE). All share the weakness: they depend on the model's quality and cost one call before every search. How `SHOW_THINKING` disturbs JSON answers: [docs/decisions.md](../../docs/decisions.md#show-thinking).

## Part 7 – All methods compared (`99-full-demo.ts`)

**In one sentence:** Part 7 runs all methods of this lesson on the same two questions and shows their costs.

The file is called `99-full-demo.ts` but is Part 7 and starts with `npm run l06:7`.

**Steps**

1. **Three searches** (KERN 1). For the technical term (`TECHNICAL_TERM`) and the colloquial question (`COLLOQUIAL_QUESTION`) BM25, vector and hybrid each in one table.
2. **Reranking** (KERN 2) of the hybrid hits for the colloquial question, as in Part 5.
3. **Multi-query** (KERN 3) for the colloquial question, as in Part 6. The original question's vector from step 1 stays one of the lists.

**What you see**

```text
Top 5 for “PoisonGPT” (#point document score) – fusion: RRF in Qdrant (k = 60)
│ rank │ keyword (BM25)       │ vector               │ hybrid (RRF)         │
│ 1    │ '#61 03-llm03 5.146' │ '#61 03-llm03 0.856' │ '#61 03-llm03 0.033' │
│ …
Top 5 for “Kann mein Chatbot aus Versehen …?” (#point document score) – fusion: RRF in Qdrant (k = 60)
│ 1    │ '#37 02-llm02 5.235'  │ '#44 02-llm02 0.860'  │ '#158 09-llm09 0.032' │
│ …
Reranking the hybrid top 8 for “…” (LLM, pointwise 0–10) – cost: 8 LLM calls, 15086 tokens, … s
│ rank │ before (RRF)          │ after (LLM 0–10)  │
│ 1    │ '#158 09-llm09 0.032' │ '#37 02-llm02 3'  │
│ 2    │ '#96 05-llm05 0.031'  │ '#19 01-llm01 2'  │
│ …
│ 8    │ '#37 02-llm02 0.017'  │ '#147 09-llm09 0' │
Multi-query for “…”:
Variant 1: …
Multi-query cost: 1 LLM calls, 3124 tokens, … s – 4 vectors, fusion: RRF in Qdrant (k = 60)
│ rank │ original question (vector) │ multi-query (4 vectors, RRF) │
│ 1    │ '#44 02-llm02 0.860'       │ '#115 06-llm06 0.049'        │
│ …
```

**What does it mean?**

- The three columns in step 1 use the same question. Differences come only from the method.
- The cost lines compare the two methods that use a language model: reranking needs one call per candidate, multi-query one per question.
- The model's numbers vary between runs and models. Compare Part 5 and Part 7: the same search, not always the same ratings.
- Which combination pays off is decided by your questions. Part 7 shows how to check that on examples before building a method in.

**Try it:** the tasks in the header of `99-full-demo.ts` (in German). Watch the hits from `02-llm02-offenlegung-sensibler-informationen.md` in each column.

**Pitfalls**

- The values in the column `hybrid (RRF)` have three decimals; Part 4 shows four. Values that look equal can differ in the fourth digit.
- The hybrid search fetches more hits than the table shows, so that the reranking has eight candidates.
- Candidate 8 can change between Part 5 and Part 7, here #37 and #44. Both are at rank 0 in only one list and have exactly the same RRF score (1/60); on a tie the order is not guaranteed.
- The values in Part 7 are copies of the constants from Parts 4 to 6. If you change them there, Part 7 does not change.

**When it fails:** the same messages as in Parts 5 and 6.

> **Deep dive:** Lesson 07, Parts 8 to 10 build hybrid search, reranking and multi-query into the RAG facade, then with an access filter on every sub-search. What the workshop simplifies compared with production: [docs/production.md](../../docs/production.md#workshop-simplification--in-production).

## What you take away

1. BM25 finds exact terms, the vector search meaning. Neither is reliable on its own.
2. RRF combines lists via ranks, without a model call, and rewards agreement.
3. A language model helps before the search (multi-query) or after it (reranking); both cost calls, and reranking finds nothing new.

## What's next

- [Lesson 07 – RAG with Open WebUI](../07-rag-open-webui/README.md) gives the hits to a language model as context. From Part 8 it searches the collection from Part 1 of this lesson, controlled by `INDEX_STRATEGY` in `hybrid.ts`.
- [Lesson 08](../08-evaluations/README.md), Part 6 measures the running facade from Lesson 07, which searches these collections.
- [docs/architecture.md](../../docs/architecture.md) shows who reads which collection.
