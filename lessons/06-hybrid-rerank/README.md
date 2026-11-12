# Lesson 06 – Hybrid search and reranking

[Deutsch](README.de.md)

**Learning goal:** You load the indexes from Lesson 04 into a vector database (Qdrant) and search them in three ways: by keywords (BM25), by meaning (vectors) and by both together (hybrid search with RRF). You see what a language model adds on top, either by re-sorting the hits (reranking) or by rephrasing the question (multi-query), and what that costs.

| Part | File | npm script | Learning goal | Requires |
| --- | --- | --- | --- | --- |
| 1 | `01-collection-load.ts` | `npm run l06:1` | Load the indexes into Qdrant and add a BM25 full-text index | Qdrant, index from `l04:2` (more indexes optional) |
| 2 | `02-keywords-search.ts` | `npm run l06:2` | Keyword search with BM25: finds exact terms, understands no meaning | Qdrant, collections from Part 1 |
| 3 | `03-vector-search.ts` | `npm run l06:3` | Vector search in Qdrant next to BM25: each fails where the other works; a year in the question becomes a metadata filter (`VERSION_QUESTIONS`) | like Part 2, plus LM Studio (E5) |
| 4 | `04-hybrid-rrf.ts` | `npm run l06:4` | Hybrid search: combine both lists by rank with RRF | like Part 3 |
| 5 | `05-reranking.ts` | `npm run l06:5` | Reranking: a language model re-sorts the hits, at a cost per candidate | like Part 3, plus chat model |
| 6 | `06-multiquery.ts` | `npm run l06:6` | Multi-query: rephrase the question, search with every version, merge with RRF | like Part 5 |
| 7 | `99-full-demo.ts` | `npm run l06:7` | All methods side by side with their costs | like Part 5 |

`hybrid.ts` is the helper module shared by all parts (connection to Qdrant, collection names), not a part of its own. Ranking and index files live in [`shared/index.ts`](../shared/index.ts).

**Order:** First create the chunks (`npm run l04:0`) and the heading index (`npm run l04:2`); the other indexes (`l04:1`, `l04:3`, `l04:4`) are optional, Part 1 skips missing ones with a note. Start Qdrant with `docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.20.0`; the address is `QDRANT_URL` in `.env`. The `127.0.0.1:` keeps Qdrant on your own machine (it has no login here, and a plain `-p 6333:6333` would publish it to everyone on the network); the version is pinned to match the client, and the BM25 text index with `scoring: true` needs a current Qdrant. Then run Part 1 once: it fills the collections that all later parts read. Work through the parts from 1 to 7: each builds on the previous one. Each part runs once, writes its tables to the terminal and exits; there is no chat. Parts 1 and 2 need neither LM Studio nor a model. Parts 3 and 4 need the E5 model in LM Studio, Parts 5 to 7 also the chat model. No part needs Open WebUI. Burp is optional.

**Why this lesson:** Lesson 05 searched with vectors only. That works for questions in the words of the document, but it blurs exact terms such as "PoisonGPT", and a colloquial question can land far from the matching chunk. Here you see why neither search is reliable alone, how to combine them, and what a language model can add before or after the search.

**No access filter in this lesson:** The searches in Parts 2 to 7 query Qdrant without the access filter, on purpose, to keep them easy to read. They therefore also see the `internal` appendix, and Parts 5 to 7 can send it to the chat model in the reranking and multi-query prompts. Lesson 07 adds `PUBLIC_FILTER` (OWASP LLM02 and LLM08).

**Burp and Qdrant:** Burp does not see the requests to Qdrant: the Qdrant client uses its own connection pool, which the proxy setting does not reach (see `hybrid.ts`). Burp still shows the calls to the embedding and chat model. You watch Qdrant in its dashboard at `<QDRANT_URL>/dashboard`, for example `http://localhost:6333/dashboard`.

**Measured values:** BM25 scores and cosine similarities cannot be compared with each other (BM25 is open-ended, cosine with E5 is mostly 0.7 to 0.9). Compare the order of the hits, not the values. The model-based parts (5 to 7) depend on the chat model; a small model rates less evenly. Reranking makes one chat call per candidate (`CANDIDATES`, 8 by default) for every question: fine locally, but it costs money on a paid API.

## Key terms

- **Collection:** in Qdrant what a table is in a database. Part 1 creates one collection per index from Lesson 04; its name contains the strategy and the embedding model. A collection is a copy of its index file: if the file changes, load it again (Part 1).
- **Point and payload:** a point is one entry in a collection, with an ID, a vector and a payload. The payload holds the chunk text and its metadata. In the question index every point is one generated question (Part 1).
- **BM25:** a classic full-text search method. It counts how often the words of the question occur in a chunk, weights rare words higher and corrects for the length of the chunk. It finds exact terms that an embedding can blur, but it understands no meaning. The score is a sum of weights, not a similarity between 0 and 1 (Parts 1 and 2).
- **Stemmer and stop words:** the stemmer reduces word forms to a stem, so that "Maßnahmen" and "Maßnahme" count as the same term. Stop words ("die", "der", "und") do not count (Part 1).
- **IDF (inverse document frequency):** the weight of a word in BM25. The fewer chunks contain a word, the higher its weight (Part 2).
- **Vector search:** compares the question's vector with every chunk's vector by cosine similarity. It finds meaning without a shared word, but always returns `TOP_K` hits, even when none fits (Part 3).
- **Hybrid search:** combines a keyword list and a vector list into one result, here in a single request to Qdrant (Part 4).
- **RRF (reciprocal rank fusion):** each list gives a chunk `1 / (RRF_K + rank)`, with rank counted from 0 as in Qdrant, and the contributions are added. Only the rank counts, not the score, so the incomparable values of BM25 and cosine do not matter. RRF rewards agreement and does not check whether a chunk answers the question (Part 4).
- **Metadata filter from the question (Part 3):** a hard rule on a payload field instead of a hint in the vector. Here a year in the question (`OWASP 2024`) becomes a filter on `version`, and only the rest of the question is embedded. The corpus holds only the 2025 edition, so the filter on 2024 returns nothing, which is the honest answer.
- **Reranking:** a language model reads question and chunk together and rates the chunk. Pointwise means each candidate is rated on its own. It only re-sorts: what is not among the candidates stays out of the prompt. It costs one model call per candidate. A cross-encoder is a small model trained for exactly this (Part 5).
- **Multi-query:** the language model rewrites the question several times in the language of the corpus, the search runs with each version, and RRF merges the lists. The original question stays one of the lists. It costs one model call and several embeddings per question, and it depends on the model: a bad rewrite sends the search in the wrong direction (Part 6).

## Tasks

Translated from the `Aufgabe` block at the top of each file; the file headers remain the source.

### Part 1 – `01-collection-load.ts`

1. Open the dashboard (`<QDRANT_URL>/dashboard`, e.g. `http://localhost:6333/dashboard`) and look at the collections: Which fields does a point's payload have, and how do the points of the `questions__…` collection differ from the others?
2. Run the program a second time. Why does the number of points per collection stay the same instead of doubling?
3. Set the stemmer language in `TEXT_INDEX` to `english` and reload. Search in the dashboard (tab "Search" with a filter on `text`) for `Maßnahme`: Are chunks with `Maßnahmen` still found?

### Part 2 – `02-keywords-search.ts`

1. Compare the two questions in `QUESTIONS`: Which words of the second question do not count (0 chunks), and do its hits fit the question?
2. Add a technical term from a document to `QUESTIONS` (e.g. `LoRA` or `Slopsquatting`) and compare with the vector search from Lesson 05, Part 1 (change `QUESTION` there): Which search finds the term more reliably?
3. Set `INDEX_STRATEGY` in `hybrid.ts` to `prepared` and restart. How do the count per word and the BM25 scores change when the chunks are larger?

### Part 3 – `03-vector-search.ts`

1. Compare the two columns for `PoisonGPT`: Which search finds the scenario in which the term occurs, and what does the other return?
2. Compare the columns for the colloquial question: How many hits of each search come from `02-llm02-offenlegung-sensibler-informationen.md`?
3. Add a question to `QUESTIONS` that contains both a technical term and a paraphrase (e.g. `Wie schütze ich mich vor Slopsquatting, wenn mein Assistent Pakete vorschlägt?` (How do I protect myself from slopsquatting when my assistant suggests packages?)). Which hits appear in both columns?
4. Read the output of step 0: How many numbers does the question vector have, and which word of the question do you find again in the request to Qdrant?
5. Compare the searches for the two questions in `VERSION_QUESTIONS`: What does the filter on 2024 return, what does the one on 2025, and how does 2025 differ from the search without a filter?

### Part 4 – `04-hybrid-rrf.ts`

1. Compare the columns "RRF by hand" and "RRF Qdrant": Do they match? Recalculate one value yourself with the formula above.
2. Read the lines "Rank 0 …" under each table: Which top hit of a list is missing from the hybrid top-k, and why (its rank in the other list)?
3. Set `RRF_K` to 1 and then to 1000. How does the order change, and which list prevails at a small `RRF_K`?

### Part 5 – `05-reranking.ts`

1. Compare the two columns: Which chunks move up, which drop? In Burp, read the model's answer for a chunk that dropped a lot.
2. Set `TEXT_LIMIT` to 150 and then to 1500. How do the scores, the tokens and the time change?
3. Change `QUESTION` to `PoisonGPT`. Does reranking help with a one-word question?

### Part 6 – `06-multiquery.ts`

1. Read the versions: Which technical terms did the model add that the original question lacks? Do you find them again in the headings of the hits?
2. Compare the columns: How many hits in each column come from `02-llm02-offenlegung-sensibler-informationen.md`, and which hits do all lists find?
3. Set `VARIANT_COUNT` to 1 and then to 5. Are more versions worth it, measured by the time?

### Part 7 – `99-full-demo.ts`

1. Compare the three columns in step 1 for both questions: For which question does the hybrid search help compared with the better of the two single searches?
2. Compare the costs of reranking and multi-query: Which method changes the hits for the colloquial question more, measured by the hits from `02-llm02-offenlegung-sensibler-informationen.md`?
3. Replace `COLLOQUIAL_QUESTION` with a question of your own from the question set of Lesson 05 (`question-set.json`) and decide which combination you would use for it.

Back to the [overview](../../README.md).
