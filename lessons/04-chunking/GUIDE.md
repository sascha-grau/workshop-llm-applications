# Lesson 04 – Chunking: Guide

*Deutsche Fassung: [GUIDE.de.md](GUIDE.de.md)* · Overview and start: [README.md](README.md)

## What is this about?

A whole document is too long and too mixed in topic for a single vector. So you split the twelve OWASP documents (together: the **corpus**) into pieces, embed each one separately and store everything in an index. How you cut decides whether the search later finds the passage that answers the question.

Comparison: a reference book with an index. Nobody reads the whole book to find an answer; you look up the page. The chunks are the pages, the index is the book's index.

## Where are we?

```text
L03 Embeddings ──► [ L04 Chunking ] ──► L05 Retrieval ──► L06 Qdrant/Hybrid ──► L07 RAG ──► L08 Evaluation
                         ▲ you are here

content/owasp-genai-top-10/NN-*.md   (12 documents)
        │  Part 0: cut until every piece fits into 512 tokens
        ▼
content/owasp-genai-top-10/chunks/   (69 chunk files + manifest.json)
        │
        ├─ Part 1: embed unchanged ──────────────► indexes/prepared__<model>.json
        ├─ Part 2: cut at headings ──────────────► indexes/headings__<model>.json ──► Part 5 (children, in memory only)
        ├─ Part 3: cut at topic shifts ──────────► indexes/semantic__<model>.json
        └─ Part 4: let the LLM write questions ──► indexes/questions__<model>.json
                                                        │
                                                        ▼
                                          Lessons 05 to 08 read these files
```

## New terms

| Term | In one sentence | Example |
|---|---|---|
| Chunk | A piece of a document that gets its own vector. | `01-llm01-prompt-injection--003.md` |
| Token | The word piece a model counts text in; E5 reads at most 512 per input. | Normal German text: about 4 characters per token. |
| Index | A file with text, metadata and vector per chunk. | `indexes/headings__text-embedding-multilingual-e5-base.json` |
| Metadata | Information about a chunk's origin, stored with it. | `source`, `position`, `headingPath`, `accessGroup` |
| Manifest | The table of contents of the chunks from Part 0, with checksums and token counts. | `chunks/manifest.json` |
| Top-k | The `k` chunks most similar to the question. | Lesson 04 shows the best `DEFAULT_TOP_K`. |
| Reasoning model | A chat model that "thinks" before answering; that costs time and tokens, and if the thinking precedes a JSON answer, the JSON is broken. | `qwen3.5-4b` |

## Check first

- [ ] LM Studio is running and the E5 model (`REMOTE_EMBEDDING_MODEL_NAME`) is loaded. For Part 4 also the chat model (`REMOTE_MODEL_NAME`).
- [ ] `content/owasp-genai-top-10/chunks/manifest.json` exists. If not: run `npm run l04:0` once (Part 0).
- [ ] `SHOW_THINKING` in `.env` is empty or `false`. Otherwise Part 4 fails.
- [ ] `ALL_DOCUMENTS` in `.env` is empty. Otherwise Parts 1 to 3 show the tables of all twelve documents instead of the output below ([why output only](../../docs/decisions.md#all-documents)).
- [ ] The constants are at their defaults (`// Standard:` in the code).

All output below: measured on 2026-11-13 with LM Studio, `qwen3.5-4b` (chat, Part 4 only) and `text-embedding-multilingual-e5-base` (workshop default, [Models](../../README.md#models) in the root README), counting method `tokenizer`. With another server or model, numbers and answers differ, above all the questions in Part 4; the patterns stay. Timestamps and log lines are shortened (`…`).

## Part 0 – Preparing chunks

**In one sentence:** Part 0 cuts the twelve documents so that every piece, including its headings and the prefix `passage: `, fits into E5's 512 tokens.

**Steps**

1. **Counting** (KERN 1). The program counts tokens exactly and locally with E5's own tokenizer. If it is missing, it asks the server: it deliberately pads each input beyond the limit, reads the token count from the rejection and subtracts the padding again.
2. **Does the section fit?** (KERN 2) The budget is the tokens still free after the prefix and the heading chain. A paragraph or list that fits stays whole.
3. **Otherwise cut** (KERN 3). A binary search (halve the candidates until the latest cut that fits is left) finds the spot: at list items first, then at sentence ends, between words only as a last resort. Afterwards the program merges small neighbours again as long as they fit.
4. **Final check** (KERN 4). Every finished chunk is counted once more. If one is too long after all, only that one is split again with a smaller budget.

**What you see**

Part 0 usually runs before the workshop. You can start the check at any time:

```text
$ npm run l04:0 -- --verify
{"counted_with":"tokenizer","chunks":69,"minimum_tokens":173,"maximum_tokens":512}
```

A normal run prints one line per document before this line, for example `01-llm01-prompt-injection.md: 8 chunks prepared`. The existing manifest (created on 2026-11-12) has 3, 8, 5, 11, 6, 6, 6, 4, 5, 6, 7 and 2 chunks for documents `00` to `11`.

**What does it mean?**

- `maximum_tokens` 512 means: exactly at the limit, not above. The program fills each chunk as far as possible.
- Every chunk starts with the document title and heading chain. That makes it understandable on its own.
- The chunks do not overlap. The check requires them to cover every character of the source exactly once.
- `counting_method` in the manifest (`counted_with` in the output of `--verify`) says how tokens were counted. The program tries the methods in this order and the first available one wins:

| Method | What happens | How reliable |
|---|---|---|
| `tokenizer` | E5's local tokenizer, no server needed | exact, no requests |
| `embeddings-overflow` | the server rejects inputs that are too long and states the token count | real count, one request per count |
| `embeddings-usage` | the server accepts long inputs and reports `usage.prompt_tokens` above the limit | real count |
| `character-estimate` | the server returns no usable number | estimate only, with `ESTIMATE_CHARACTERS_PER_TOKEN` characters per token, many small chunks |

**Try it:** the tasks in the header of `00-prepare-chunks.ts`. Watch how strongly the number of chunks depends on the limit.

**Pitfalls**

- A second normal run aborts instead of overwriting. That is intended; use `--verify`.
- The `--` in `npm run l04:0 -- --verify` separates npm's options from the program's.
- `--verify` counts every chunk again, with the same method as a normal run. With the tokenizer it needs no server; when it falls back to the server, it sends requests to the embedding endpoint again.
- Relative links in a chunk point to `../…` because the chunks live one folder deeper than the source.
- In estimate mode the server may still truncate silently. The program reports this with an `INFO` or `WARN` line `No reliable token count: …` and carries on.

**When it fails**

| Message | Fix |
|---|---|
| `chunks already exists. Use --verify or move the existing directory first.` | The chunks are already there. Check with `--verify`; regenerate only after moving `chunks/`. |
| `The embedding request failed. Check REMOTE_MODEL_BASE_URL, …` | Start LM Studio, load E5, check the address in `.env`. |
| `The chunk manifest format, settings or document list do not match. Regenerate …` | The manifest does not match model, limit or counting method. Move `chunks/`, run `npm run l04:0`. |
| `The source has changed: …` or `Chunk content does not match: …` | Source or chunk was edited. Regenerate the chunks. |
| `Local E5 tokenizer unavailable. Falling back to …` | The tokenizer could not be loaded (offline, no cache or a damaged cache). Run `npm run tokenizer:fetch` once with internet access; if the cache is damaged, delete `.cache/tokenizers/`. Without it Part 0 counts through the server or only estimates. |
| `Embedding token count calibration failed. …` | The server counts the padding differently than expected. Check that the E5 model from `.env.example` is really loaded. |
| `The token limit must be an integer between 1 and 512.` | `TOKEN_LIMIT_OVERRIDE` has an invalid value. |
| `An indivisible Markdown link, code block or heading exceeds the token budget.` | The limit is smaller than a single link or heading. Raise `TOKEN_LIMIT_OVERRIDE`. |

> **Deep dive:** Why not simply let the server count? In the dress rehearsal on 2026-11-13 with LM Studio, before the tokenizer was introduced, `usage.prompt_tokens` reported 0 and inputs that were too long were silently truncated. Part 0 therefore fell back to `character-estimate` and produced 351, 369 or 391 small chunks instead of 69, 199 or 230. The local tokenizer counts independently of the server; reasons and consequences: [docs/decisions.md](../../docs/decisions.md#exakter-tokenizer).

> **Deep dive:** When falling back to the server, the counting method is determined once at the start: the program sends `Kalibrierung ` 1024 times to the endpoint and sees whether the server rejects or accepts it. With `embeddings-overflow` it also checks that each padding piece costs exactly one token; otherwise the subtraction would be wrong. An earlier test run (test server, no date) needed about 760 requests for all twelve documents with real counting and about 350 in estimate mode, which produced four times as many chunks in return. 

## Part 1 – Index from prepared chunks

**In one sentence:** Part 1 embeds the 69 chunks from Part 0 unchanged, writes the index `prepared` and searches it with `DEMO_QUESTION`.

**Steps**

1. **Embed** (KERN 1). One vector per chunk, all in one request. Each text is preceded by `passage: `; the index stores the text without this prefix.
2. **Write the index** (KERN 2). Per chunk: text, metadata, vector.
3. **Search** (KERN 3). Embed the question with `query: `, compare it with every chunk vector (cosine similarity), show the best `DEFAULT_TOP_K`.

**What you see**

```text
Chunks from 01-llm01-prompt-injection.md (limit: 512 tokens):
│ file                                │ characters │ tokens │ characters per token │ preview                          │
│ '01-llm01-prompt-injection--001.md' │ 1847       │ 452    │ '4.1'                │ 'Eine Prompt-Injection-Schwachst…'│
│ '01-llm01-prompt-injection--003.md' │ 1785       │ 422    │ '4.2'                │ 'Der Aufstieg multimodaler KI, …'│
│ …                                                                                                                    │
│ '01-llm01-prompt-injection--007.md' │ 1438       │ 510    │ '2.8'                │ '1. [ChatGPT Plugin Vulnerabil…' │
│ '01-llm01-prompt-injection--008.md' │ 1334       │ 463    │ '2.9'                │ '10. [Adversarial Machine Lear…' │
Full corpus: 69 chunks, at most 512 tokens, at least 2.51 characters per token
69 chunks in …/indexes/prepared__text-embedding-multilingual-e5-base.json, characters min 562 / average 1626 / max 2329
Top 3 for “Wie begrenze ich Prompt Injection?”:
│ file                                │ similarity │ accessGroup │ section │ preview                                │
│ '01-llm01-prompt-injection--003.md' │ '0.871'    │ 'public'    │ '–'     │ 'Der Aufstieg multimodaler KI, die …'  │
│ '01-llm01-prompt-injection--001.md' │ '0.870'    │ 'public'    │ '–'     │ 'Eine Prompt-Injection-Schwachstelle…' │
│ '01-llm01-prompt-injection--002.md' │ '0.865'    │ 'public'    │ '–'     │ 'Direkte Prompt Injections treten a…'  │
```

**What does it mean?**

- "characters per token" tells how much text a token carries on average. Normal German text is at about 4.
- Similarities around 0.87 are normal for E5. Even poor hits are often at 0.7 to 0.8. What matters is the order, not the value.
- A prepared chunk fills the token limit and often contains several sections. Its vector is an average over all of them.
- The `section` column shows `–`: the prepared chunks have no heading path in their metadata. Part 2 changes that.

**Try it:** the tasks in the header of `01-prepared-chunks.ts`. Watch which chunks are clearly below 4 characters per token and what they contain.

**Pitfalls**

- The table shows only `EXAMPLE_DOCUMENT`, but the whole corpus is embedded ("Full corpus: 69 chunks").
- If Part 0 only estimated (`character-estimate`), Part 1 prints `Token counts in the manifest are conservative character estimates, …`. Then "characters per token" only follows from the estimate (`ESTIMATE_CHARACTERS_PER_TOKEN`) and tells you nothing about the text.

**When it fails**

| Message | Fix |
|---|---|
| `Prepared chunks are missing. Generate them with npm run l04:0.` | Run `npm run l04:0` once. |
| `The chunk manifest is invalid or outdated. Regenerate the chunks with npm run l04:0.` | The chunks come from an old version or a different limit (e.g. after `TOKEN_LIMIT_OVERRIDE`). Move `chunks/`, run `npm run l04:0`. |
| `Model API directly: The model server is unreachable or timed out. …` | Start LM Studio, check `REMOTE_MODEL_BASE_URL`. |
| `Unknown EXAMPLE_DOCUMENT: … Check manifest.json.` | Write the file name exactly as it appears in the manifest. |

## Part 2 – Cutting at the document structure

**In one sentence:** Part 2 cuts the prepared chunks further at every heading (`#` to `###`); each section becomes a chunk that starts with its heading path.

**Steps**

1. **Cut at headings** (KERN 1). `readChunks` calls `splitByHeadings` in `chunking.ts`. The path (title › section › subsection) is the first line of the chunk.
2. **Metadata** (KERN 2). New are the heading path as a list and the access group: `internal` for the appendix `11-…`, otherwise `public`.
3. Embed, write the index and search as in Part 1, one request per document.

**What you see**

```text
Chunks from 01-llm01-prompt-injection.md:
│ (index) │ characters │ section                                                                        │ preview                         │
│ 0       │ 1843       │ 'Beschreibung'                                                                 │ 'Eine Prompt-Injection-Schwa…'  │
│ 1       │ 523        │ 'Arten von Prompt Injection-Schwachstellen › Direkte Prompt Injections'        │ 'Direkte Prompt Injections t…'  │
│ 2       │ 1277       │ 'Arten von Prompt Injection-Schwachstellen › Indirekte Prompt Injections'      │ 'Indirekte Prompt Injections…'  │
│ 3       │ 745        │ 'Arten von Prompt Injection-Schwachstellen › Indirekte Prompt Injections'      │ 'Der Aufstieg multimodaler K…'  │
│ 5       │ 443        │ 'Präventions- und Mitigationsstrategien › 1. Begrenzen Sie das Modellverhalten'│ 'Geben Sie spezifische Anwei…'  │
│ …       │            │                                                                                │                                 │
│ 21      │ 1434       │ 'Referenzlinks'                                                                │ '1. [ChatGPT Plugin Vulnerab…'  │
│ 22      │ 757        │ 'Referenzlinks'                                                                │ '10. [Adversarial Machine Le…'  │
00-vorwort-der-projektleiter.md: 7 chunks
01-llm01-prompt-injection.md: 24 chunks
…
11-appendix-llm-application-architecture-and-threat-modeling.md: 5 chunks
199 chunks in …/indexes/headings__text-embedding-multilingual-e5-base.json, characters min 130 / average 601 / max 2077
Embedding calls: 12, LLM calls: 0
Top 3 for “Wie begrenze ich Prompt Injection?”:
│ file                           │ similarity │ accessGroup │ section                                                                                │
│ '01-llm01-prompt-injection.md' │ '0.885'    │ 'public'    │ 'Präventions- und Mitigationsstrategien › 1. Begrenzen Sie das Modellverhalten'        │
│ '01-llm01-prompt-injection.md' │ '0.881'    │ 'public'    │ 'Präventions- und Mitigationsstrategien › 5. Fordern Sie manuelle Freigabe für …'      │
│ '01-llm01-prompt-injection.md' │ '0.879'    │ 'public'    │ 'Arten von Prompt Injection-Schwachstellen › Direkte Prompt Injections'                │
```

**What does it mean?**

- 69 chunks become 199. A chunk has 601 instead of 1626 characters on average.
- Part 2 needs no token limit of its own: cutting only makes the chunks from Part 0 smaller. The price: a section that Part 0 had to split stays two chunks (rows 2 and 3, rows 21 and 22).
- A heading without text of its own does not become a chunk. "Arten von Prompt Injection-Schwachstellen" appears only in the paths below it.
- `Embedding calls: 12`: one request per document, no language model.

**Try it:** the tasks in the header of `02-heading-chunking.ts`. Watch how rank 1 shifts compared with Part 1.

**Pitfalls**

- `section` shows the path without the document title; `–` means text directly under the title. The full path is stored as a list (`headingPath`).
- The access group is only stored here. Filtering starts in Lesson 05, Part 3.
- `splitByHeadings` is not a Markdown parser. A line `# …` inside a code block would count as a heading; the corpus has no code blocks.

**When it fails**

| Message | Fix |
|---|---|
| `Unknown document: …. Check SUBSET or EXAMPLE_DOCUMENT against manifest.json.` | Typo in `SUBSET`; the names are in the manifest. |
| `The index … is empty. Check SUBSET and the chunk corpus before indexing.` | `SUBSET` contains no document with chunks. |
| `Prepared chunks are missing. …` | Run `npm run l04:0` once. |

## Part 3 – Cutting where the topic changes

**In one sentence:** Part 3 lets the embedding model find the places where the topic jumps and cuts there as well.

**Percentile:** Percentile 95 of a list is the value below which 95 % of all values lie. Only the largest 5 % lie above it.

**Steps**

1. **Windows** (KERN 1). Each sentence is embedded together with its predecessor and successor, so that a short sentence does not decide alone. Windows never reach across a heading.
2. **Distance** (KERN 2). Distance between two neighbouring windows = 1 − cosine similarity.
3. **Threshold** (KERN 3). The threshold is the `DISTANCE_PERCENTILE` percentile of all distances in the document. With fewer than 4 distances there is none.
4. **Cut** (KERN 4). Where the distance is greater than the threshold, a new chunk begins. Every heading starts one anyway.
5. The finished chunks are embedded in a second round, now with `passage: `.

**What you see**

```text
00-vorwort-der-projektleiter.md: 8 chunks
Distances in 01-llm01-prompt-injection.md: 67 · min 0.000 · median 0.036 · percentile 90 0.061 · percentile 95 0.073 · max 0.089
Cuts: 3 semantic (distance > 0.073) · 27 chunks
Chunks from 01-llm01-prompt-injection.md:
│ number │ file                                │ characters │ preview                                    │
│ 4      │ '01-llm01-prompt-injection--003.md' │ 752        │ 'Der Aufstieg multimodaler KI, die mehr…'  │
│ 5      │ '01-llm01-prompt-injection--003.md' │ 511        │ 'Aufgrund der Natur der generativen KI …'  │
│ 6      │ '01-llm01-prompt-injection--003.md' │ 486        │ 'Geben Sie spezifische Anweisungen zur …'  │
│ …                                                                                                     │
│ 22     │ '01-llm01-prompt-injection--007.md' │ 387        │ '1. [ChatGPT Plugin Vulnerabilities - C…'  │
│ 23     │ '01-llm01-prompt-injection--007.md' │ 358        │ '3. [Not what you’ve signed up for: Com…'  │
│ 24     │ '01-llm01-prompt-injection--007.md' │ 585        │ '[Prompt Injection attack against LLM-i…'  │
…
230 chunks in …/indexes/semantic__text-embedding-multilingual-e5-base.json, characters min 66 / average 560 / max 2081
Embedding calls: 81, LLM calls: 0
Top 3 for “Wie begrenze ich Prompt Injection?”:
│ file                                │ similarity │ section │ preview                                    │
│ '01-llm01-prompt-injection--003.md' │ '0.890'    │ '–'     │ 'Geben Sie spezifische Anweisungen zur …'  │
│ '01-llm01-prompt-injection--004.md' │ '0.880'    │ '–'     │ 'Implementieren Sie Kontrollen, bei den…'  │
│ '01-llm01-prompt-injection--002.md' │ '0.879'    │ '–'     │ 'Direkte Prompt Injections treten auf, …'  │
```

**What does it mean?**

- 67 distances, threshold 0.073, three semantic cuts. The document has 27 chunks instead of 24 in Part 2: most cuts still come from the headings.
- The distances are tiny (median 0.036). E5 vectors are very similar to each other (see Lesson 03). That is why the threshold is relative to the document instead of fixed.
- Short documents are cut at headings only: with fewer than 4 distances there is no threshold. And because the percentile is computed without interpolation, with few distances it is simply the maximum, which no distance exceeds; with the default `DISTANCE_PERCENTILE` a document therefore needs at least 20 distances for a semantic cut.
- `Embedding calls` counts every request to E5 in this run. `LLM calls: 0`: no language model is involved.
- Rank 1 is the same section as in Part 2 ("Geben Sie spezifische Anweisungen …"), found without a heading path.

**Try it:** the tasks in the header of `03-semantic-chunking.ts`. Watch the `Cuts:` line and how the number of chunks changes with the percentile.

**Pitfalls**

- `min 0.000` is not an error: two neighbouring windows can be almost identical. `-0.000` occurs too, because through rounding cosine similarity can be minimally above 1.
- Several chunks show the same `file`: they come from the same prepared chunk.
- `section` is `–` because semantic chunks have no heading path in their metadata. The headings are in the text, though.
- The windows get `query: `, not `passage: `. Comparing windows with windows is a symmetric task; for that E5 intends the query prefix.
- Pieces can get very small (at least 66 characters here), e.g. single entries of a link list.

**When it fails**

| Message | Fix |
|---|---|
| `Cuts: 0 semantic (too few sentences for a semantic cut)` | Not an error: the document has fewer than 4 distances. Choose a longer `EXAMPLE_DOCUMENT`. |
| `The embedding server returned … vectors for … texts.` | The server did not embed all texts. Restart LM Studio, run Part 3 again. |
| `Prepared chunks are missing. …` | Run `npm run l04:0` once. |

> **Deep dive:** `percentile` in `chunking.ts` computes the percentile without interpolation. Other methods use a fixed threshold, larger windows, or split pieces that are too large by size afterwards.

## Part 4 – Searching with generated questions

**In one sentence:** The chat model writes `QUESTIONS_PER_CHUNK` questions for each chunk; each question becomes its own search vector that points to the chunk text.

**Multi-vector index:** An index in which several vectors (here the questions) point to the same text.

**Steps**

1. **Prompt** (KERN 1). The chat model is asked for exactly `QUESTIONS_PER_CHUNK` short questions in German, as a user would ask them, and JSON only. A schema checks the answer.
2. **Entries** (KERN 2). One entry per question: same chunk text, same metadata, its own `generatedQuestion`.
3. **Embed** (KERN 3). The questions get `query: ` because they are queries. The chunk text itself is never embedded.
4. **Search** (KERN 4). The user's question meets generated questions. If several questions of one chunk rank high, the chunk counts only once.

The chunks are the same as in Part 2. The index is saved after every chunk. A new run skips everything already in the index.

**What you see**

A first run over the whole corpus (shortened). A second run finds all chunks in the index and reports `0 new chunks, … already indexed and skipped` per document.

```text
Existing chunks are kept and searched, including those outside the selection. If settings or content change, delete …/questions__text-embedding-multilingual-e5-base.json to rebuild the index.
Chunks per document:   (table, shortened here: 7, 24, 15, 30, 11, 10, 19, 13, 15, 18, 32, 5)
… INFO LLM: Call started { model: 'qwen3.5-4b', source: '00-vorwort-der-projektleiter.md', position: 0 }
… INFO LLM: Call completed { model: 'qwen3.5-4b', source: '00-vorwort-der-projektleiter.md', position: 0, durationMs: … }
00-vorwort-der-projektleiter.md, chunk 1: Warum wurde die OWASP Top 10 für LLMs aktualisiert? | Welche Gruppe hat an der Liste mitgearbeitet? | Wie wurden die Themen ausgewählt?
…
00-vorwort-der-projektleiter.md: 7 new chunks, 0 chunks already indexed and skipped.
…
11-appendix-llm-application-architecture-and-threat-modeling.md: 5 new chunks, 0 chunks already indexed and skipped.
Indexing in this run: … s
Calls in this run: Embedding 199, LLM 199 · LLM tokens: 596399 (reported for 199/199 calls) · Embedding tokens (estimated): 16801
Chunks not yet indexed: 0
Saved index: 12 documents, 597 vectors
199 chunks in …/indexes/questions__text-embedding-multilingual-e5-base.json, characters min 130 / average 601 / max 2077
Top 3 for “Wie begrenze ich Prompt Injection?”:
│ file                                              │ similarity │ section                                   │ question                                                              │
│ '01-llm01-prompt-injection.md'                    │ '0.933'    │ 'Beschreibung'                            │ 'Wie funktioniert eine Prompt-Injection genau?'                       │
│ '01-llm01-prompt-injection.md'                    │ '0.918'    │ 'Arten von … › Direkte Prompt Injections' │ 'Was passiert genau bei einer direkten Prompt Injection?'             │
│ '02-llm02-offenlegung-sensibler-informationen.md' │ '0.910'    │ 'Beschreibung'                            │ 'Können Sicherheitsmaßnahmen durch Prompt Injection umgangen werden?' │
Original chunk for rank 1:
LLM01:2025 Prompt Injection › Beschreibung
…
```

**What does it mean?**

- Each chunk gets `QUESTIONS_PER_CHUNK` vectors: 199 chunks, 597 vectors. `Chunks not yet indexed: 0` means no chunk was skipped. If some are missing, the index is searchable anyway.
- One LLM call per chunk: 199 calls and about 600,000 tokens, on average about 3,000 per chunk for three short questions. A large part of that is the reasoning model's thinking. That is why Part 4 is by far the slowest part of the lesson; how long it takes on reference hardware is in [docs/trainer.md](../../docs/trainer.md#pre-flight-checklist) (for trainers, contains solutions).
- Similarities are higher than in Parts 1 to 3 (up to 0.93 instead of 0.89): question meets question, both phrased alike.
- Rank 3 shows the weakness: the question "Können Sicherheitsmaßnahmen durch Prompt Injection umgangen werden?" (can safeguards be bypassed through prompt injection?) fits well, but its chunk is the description of LLM02 (sensitive information) and mentions prompt injection only in a subordinate clause. A generated question can make a side aspect bigger than it is in the chunk.
- A RAG prompt would get the chunk's text ("Original chunk for rank 1"), not the question that found it.

**Try it:** the tasks in the header of `04-question-generation-chunking.ts`. Watch the `question` column: which generated question found the chunk?

**Pitfalls**

- Exit code 1 although the run finished: at least one chunk was skipped. It is missing from the index until a new run succeeds.
- Resuming only checks document and position, never the text. After changed documents, a changed prompt or a different `QUESTIONS_PER_CHUNK` you must delete the index file.
- With `FULL_CORPUS = false` Part 4 covers only `EXAMPLE_DOCUMENT`. Whatever is already in the index stays there and is searched.
- The questions are German because the prompt asks for it. E5 is multilingual; an English `DEMO_QUESTION` should still find the German questions (not tested).

**When it fails**

| Message | Fix |
|---|---|
| `…, chunk N: Model response could not be used; skipped.` | The model returned no matching JSON. Run `npm run l04:4` again; only the missing chunks are retried. |
| Preceded by `ERROR LLM: Call failed – Cause: Unexpected end of JSON input` after a long wait | The answer was empty; presumably the reasoning model only thought. Run again. If the same chunks keep failing, they stay out; the search works with the rest. |
| Many skipped chunks, `Chunks with unusable model responses in this run: N` | Usually `SHOW_THINKING=true`: the thinking then precedes the JSON ([docs/decisions.md](../../docs/decisions.md#show-thinking)). Clear the switch or set `false`, run Part 4 again; skipped chunks are retried. |
| `Cannot load the question index …. Check the file and QUESTIONS_PER_CHUNK, or regenerate it …` | The file does not match `QUESTIONS_PER_CHUNK` or is damaged. Reset the value, or delete the file and regenerate it. |
| `No saved entries; search skipped.` | The index is empty, usually because all chunks were skipped. See above. |

> **Deep dive:** Why Part 4 does not ask the server for structured output but requests JSON in the prompt and checks it with zod: [docs/decisions.md](../../docs/decisions.md#kein-structured-output). Why `FULL_CORPUS = true` is the default: [docs/decisions.md](../../docs/decisions.md#full-corpus). The question index only appends and notices no changes; how to solve that in production is in [docs/production.md](../../docs/production.md).

## Part 5 – Search small, deliver big (parent document)

**In one sentence:** Part 5 searches small pieces (children) and delivers the whole section (parent) that the best piece comes from.

**Steps**

1. **Build children** (KERN 1). Every section from the `headings` index is a parent. It is split into equal children of about `CHILD_SIZE` characters. Every child starts with its parent's heading path.
2. **Search the children** (KERN 2). Only the children are embedded and compared with the question.
3. **Child → parent** (KERN 3). Only the best child per parent counts. The first `TOP_K` distinct parents are delivered, each in full.

**What you see**

```text
Parents: 199 sections from …/indexes/headings__text-embedding-multilingual-e5-base.json
199 parents → 357 children of about 300 characters
Embedding calls: 12, LLM calls: 0
Top 5 children for “Wie begrenze ich Prompt Injection?” (what the search compares):
│ similarity │ section                                                                   │ preview                                   │
│ '0.885'    │ 'Präventions- und Mitigationsstrategien › 1. Begrenzen Sie das Modellv…'  │ 'Geben Sie spezifische Anweisungen zur…'  │
│ …                                                                                                                                  │
│ '0.877'    │ 'Beschreibung'                                                            │ 'noriert. Entwickelnde können Schutzm…'   │
│ '0.874'    │ 'Beschreibung'                                                            │ 'Eine Prompt-Injection-Schwachstelle …'   │
Delivered: 5 parents from the top 20 children (4365 characters of context instead of 1933 for 5 children)
│ similarity │ section                                                                   │ child characters │ parent characters │
│ '0.885'    │ 'Präventions- und Mitigationsstrategien › 1. Begrenzen Sie das Modellv…'  │ 443              │ 443               │
│ '0.881'    │ 'Präventions- und Mitigationsstrategien › 5. Fordern Sie manuelle Frei…'  │ 279              │ 279               │
│ '0.879'    │ 'Arten von Prompt Injection-Schwachstellen › Direkte Prompt Injections'   │ 523              │ 523               │
│ '0.877'    │ 'Beschreibung'                                                            │ 344              │ 1843              │
│ '0.871'    │ 'Arten von Prompt Injection-Schwachstellen › Indirekte Prompt Injections' │ 396              │ 1277              │
```

**What does it mean?**

- The child decides whether a section is found. The parent decides what goes into the prompt.
- A short parent stays a single child; then child and parent are equally long.
- Two of the best five children come from the same parent (`Beschreibung`). It is delivered only once; in exchange the parent of a later child moves up.
- More context costs: the `Delivered:` line compares the parents' characters with the children's, and so the tokens in the prompt.
- Part 5 writes no index. Every run embeds the children again. How children are cut and stored in production: [docs/production.md](../../docs/production.md).

**Try it:** the tasks in the header of `05-parent-document.ts`. Watch the columns `child characters` and `parent characters`.

**Pitfalls**

- A preview like `noriert. Entwickelnde …` is correct: children are cut by characters, even mid-word. The heading path keeps the context.
- The similarity in the second table belongs to the best child. The parent itself was never compared with the question.
- The search fetches `CHILD_CANDIDATES` children, more than `TOP_K`, because several can belong to the same parent. If that is not enough, it delivers fewer than `TOP_K` parents.

**When it fails**

| Message | Fix |
|---|---|
| `Cannot load index …/headings__….json (headings). Generate it with npm run l04:0, then npm run l04:2.` | Run `npm run l04:2` first (and `l04:0` once before that). |
| `The index … is invalid or outdated. Regenerate the chunks with npm run l04:0, then regenerate the index with npm run l04:2.` | The index comes from an older version. Run `npm run l04:2` again. |

## What you take away

1. Small chunks with a single topic hit more precisely. The heading path makes them understandable on their own.
2. Each way of cutting costs differently: structure only embeddings, topic shifts a second round of embeddings, questions one LLM call per chunk.
3. What is searched and what is delivered may differ: question → chunk in Part 4, child → parent in Part 5.

## What's next

Lessons 05 to 08 read the indexes from Parts 1 to 4; which lesson reads which is in [docs/architecture.md](../../docs/architecture.md#data-flow).

Next: [Lesson 05 – Retrieval strategies](../05-retrieval-strategies/README.md). It searches the `headings` index and shows how top-k, MMR, metadata filters and a score threshold change the hits.
