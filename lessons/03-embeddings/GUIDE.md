# Lesson 03 – Embeddings: Guide

*Deutsche Fassung: [GUIDE.de.md](GUIDE.de.md)* · Overview and start: [README.md](README.md)

## What is this about?

An embedding model turns a text into a long list of numbers that describes its meaning. Texts with similar meaning get similar lists of numbers, even if they share hardly a word. With that you find the texts that match a question without the keywords having to match.

Comparison: a map of meanings. Every sentence gets a place; "chamomile tea after work" lies close to "a hot drink to relax" and far away from the train timetable.

## Where are we?

```text
L02 Tool calls ──► [ L03 Embeddings ] ──► L04 Chunking ──► L05 Retrieval ──► … ──► L07 RAG
                          ▲ you are here

Text ──► embedding model (E5) ──► vector [0.03, -0.01, …]   (768 numbers for E5)

Question ── "query: …"   ──► vector ──┐
Passage ─── "passage: …" ──► vector ──┴──► cosine similarity ──► ranking
```

From Lesson 04 on you embed the sections of the OWASP documents this way; Lessons 05 to 08 search in them.

## New terms

| Term | In one sentence | Example |
|---|---|---|
| Embedding, vector | An embedding model turns a text into a vector: a list of numbers that describes its meaning. | E5 returns 768 numbers per text. |
| Cosine similarity | Measures how similar the direction of two vectors is, as a number between -1 and 1. | 1 = same direction |
| Prefix (role) | A lead-in before the text that tells the model whether it is a search query or a stored document. | E5: `query: ` and `passage: ` |
| Semantic search | Finding texts by meaning instead of by keywords. | "hot drink" finds "chamomile tea" |
| RAG | Retrieval-augmented generation: search for matching passages and give them to the language model as context. | Lesson 07 |

## Check first

- [ ] LM Studio is running, the E5 model (`REMOTE_EMBEDDING_MODEL_NAME`) is loaded.
- [ ] For Parts 2 and 3: EmbeddingGemma is loaded too, its identifier is in `REMOTE_EMBEDDING_GEMMA_MODEL_NAME`. Both models run on the same server as the chat model.
- [ ] Burp is optional. If `BURP_PROXY_URL` is set, Burp must be running (Intercept off).

You need neither a chat model nor Open WebUI in this lesson. All output below: measured on 2026-11-13 with LM Studio, `text-embedding-multilingual-e5-base` (E5) and `text-embedding-embeddinggemma-300m-qat` (EmbeddingGemma), the workshop default ([Models](../../README.md#models) in the root README). With another server or model, including another quantization (a more or less compressed version of the same model), the numbers differ; the order usually stays the same. Timestamps are shortened (`…`).

All example texts are German. E5 is multilingual: the query of Part 2 in English ("How can I relax with a hot drink after work?") put the three matching German passages first and the two distractors last in a test on the same day.

## Part 1 – Your first embedding

**In one sentence:** The program sends two sentences to E5 and prints the cosine similarity of their vectors: one call, one number.

**Flow**

1. **Embed** (KERN 1). `embedDocuments` sends both sentences in one request and gets one vector per sentence. Both sentences get the prefix `query: `: two equal sentences are compared here, not a question with a document.
2. **Compare** (KERN 2). `cosineSimilarity` computes how similar the direction of the two vectors is.

The two sentences share almost no word: "Nach einem langen Arbeitstag freute sich Lisa auf eine Tasse heißen Kamillentee." (after a long day at work Lisa looked forward to a cup of hot chamomile tea) and "Entspannung nach einem anstrengenden Tag mit einem warmen Getränk." (relaxing after a tiring day with a warm drink). A keyword search would not connect them.

**What you see**

```text
$ npm run l03:1
… INFO Model API directly: reachable { status: 200 }
… INFO Embedding: Call started { model: 'text-embedding-multilingual-e5-base' }
Cosine similarity: 0.868
… INFO Embedding: Call completed { model: 'text-embedding-multilingual-e5-base', durationMs: … }
```

**What does it mean?**

- 0.868 means the two vectors point in a very similar direction. The model recognizes that both sentences are about relaxing with a warm drink.
- On its own the number says little. Whether 0.868 is a lot only shows in the comparison with other texts in Part 2.
- An embedding call is fast and needs no chat model. That is why you can embed thousands of texts in advance.

**Try it:** the tasks in the header of `01-hello-embeddings.ts`. Before each change, think about which value you expect.

**Pitfalls**

- In Burp the vectors are readable lists of numbers because the code sets `encodingFormat: 'float'`. Without it, the OpenAI client asks for base64-encoded vectors.
- Without a prefix, E5's similarities get worse. Part 3 measures how much.

**If it gets stuck**

| Message | Fix |
|---|---|
| `Model API directly: The model server is unreachable or timed out. …` | Start the LM Studio server, check `REMOTE_MODEL_BASE_URL`. |
| `404` or `400` with the model name in the cause | `REMOTE_EMBEDDING_MODEL_NAME` does not match the identifier in LM Studio, or E5 is not loaded. |
| `The setting REMOTE_EMBEDDING_MODEL_NAME is missing from .env (template: .env.example).` | Copy the entry from `.env.example`. |

> **Deep dive:** The model is [multilingual-e5-base](https://huggingface.co/intfloat/multilingual-e5-base). It is multilingual: an English question also finds German texts. The cosine similarity lives in [`shared/embeddings.ts`](../shared/embeddings.ts) because later lessons use it too. Literature on E5: [docs/production.md](../../docs/production.md#further-reading).

## Part 2 – Sorting passages by meaning

**In one sentence:** A search query is compared with five stored passages, and the passages are sorted by similarity, once with E5 and once with EmbeddingGemma.

**Flow**

1. **Embed with roles** (KERN 1). The query gets the model's query prefix (`embedQuery`), the passages get the passage prefix (`embedDocuments`). Each model has its own prefixes; both are in `embeddings.ts`.
2. **Sort** (KERN 2). For each passage compute the cosine similarity to the query and sort in descending order.

Three passages match the query in content (chamomile tea, cocoa, herbal tea) but share hardly any words with it. Two are distractors (train timetable, tomatoes).

**What you see**

```text
Model: text-embedding-multilingual-e5-base
Query: Wie kann ich mich nach Feierabend bei einem heißen Getränk entspannen?
Passages ranked by cosine similarity:
1. 0.844 – Ein gemütlicher Abend mit Kräutertee und einem guten Buch sorgt für Erholung.
2. 0.826 – Eine Tasse warmer Kakao auf dem Sofa hilft Paul, die Anstrengungen des Tages zu vergessen.
3. 0.814 – Lisa genießt Kamillentee und lässt den stressigen Bürotag ruhig ausklingen.
4. 0.763 – Im Garten wachsen Tomaten besonders gut an sonnigen Standorten.
5. 0.727 – Der neue Fahrplan bietet zusätzliche Zugverbindungen zwischen Berlin und Hamburg.
…
Model: text-embedding-embeddinggemma-300m-qat
Query: Wie kann ich mich nach Feierabend bei einem heißen Getränk entspannen?
Passages ranked by cosine similarity:
1. 0.633 – Ein gemütlicher Abend mit Kräutertee und einem guten Buch sorgt für Erholung.
2. 0.561 – Eine Tasse warmer Kakao auf dem Sofa hilft Paul, die Anstrengungen des Tages zu vergessen.
3. 0.502 – Lisa genießt Kamillentee und lässt den stressigen Bürotag ruhig ausklingen.
4. 0.244 – Im Garten wachsen Tomaten besonders gut an sonnigen Standorten.
5. 0.187 – Der neue Fahrplan bietet zusätzliche Zugverbindungen zwischen Berlin und Hamburg.
```

**What does it mean?**

- Both models put the three matching passages first and the distractors last. That is semantic search: found by meaning, not by shared words.
- With E5 the distractors score high too: tomatoes 0.763, timetable 0.727. An E5 value around 0.75 does not mean "matches a little". The order matters, not the value.
- EmbeddingGemma's values are much lower overall. Every model has its own scale; you do not compare values of two models with each other.
- The search from Lesson 04 on uses exactly this pattern: embed the question, compare it with all stored vectors, take the best ones.

**Try it:** the tasks in the header of `02-comparisons.ts`. Watch the gaps between neighbouring ranks, not just the order.

**Pitfalls**

- If one model fails, the other still runs; the program then ends with exit code 1.
- Both models run on the same server with the same address and the same API key, just under different names.

**If it gets stuck**

| Message | Fix |
|---|---|
| `ERROR Embedding: Call failed – …` with the Gemma name | EmbeddingGemma is not loaded, or `REMOTE_EMBEDDING_GEMMA_MODEL_NAME` does not match the identifier in LM Studio. |
| `The embedding server returned … vectors for … texts.` | The server did not embed all texts. Restart LM Studio. |

> **Deep dive:** [EmbeddingGemma](https://huggingface.co/google/embeddinggemma-300m) uses task prefixes instead of `query: ` and `passage: `: `task: search result | query: ` for the query and `title: none | text: ` for documents. Such prefixes come from the model card; if you switch models, you have to switch them too.

## Part 3 – What the prefixes bring

**In one sentence:** The same search runs without and with prefixes, and the program counts how often the correct answer lands at rank 1.

**Flow**

1. **Cases and indexes** (KERN 1). Each of the eight cases has a query, a similar question from another user (distractor) and the correct answer. Index A contains only the eight answers. Index B also contains the eight similar questions.
2. **Two variants** (KERN 2). All entries and queries are embedded once without a prefix and once with the model's prefixes.
3. **Count the rank** (KERN 3). For each query: at which rank is the correct answer in Index B? For Index A the program simply skips the similar questions.

The similar question looks deceptively like the query but does not answer it. That is a typical problem when FAQ entries or chat histories end up in the index.

**What you see**

```text
E5: For how many of the 8 queries is the correct answer ranked first?
│ (index)        │ Index A: answers only │ Index B: answers + similar questions │
│ without prefix │ 7                     │ 0                                    │
│ with prefix    │ 8                     │ 5                                    │
E5, Index B: rank and score of the correct answer, and score of the best similar question
│ (index)                                            │ without prefix                           │ with prefix                              │
│ Wie schütze ich mein LLM vor Prompt Injection?     │ 'Rank 2 | Answer 0.865 | Question 0.918' │ 'Rank 2 | Answer 0.868 | Question 0.881' │
│ Darf ein Passwort im System-Prompt stehen?         │ 'Rank 2 | Answer 0.892 | Question 0.936' │ 'Rank 1 | Answer 0.897 | Question 0.865' │
│ Wie verhindere ich, dass mein Agent zu viel darf?  │ 'Rank 4 | Answer 0.848 | Question 0.872' │ 'Rank 1 | Answer 0.848 | Question 0.839' │
│ …                                                                                                                                         │

Gemma: For how many of the 8 queries is the correct answer ranked first?
│ (index)        │ Index A: answers only │ Index B: answers + similar questions │
│ without prefix │ 7                     │ 1                                    │
│ with prefix    │ 8                     │ 4                                    │
Gemma, Index B: rank and score of the correct answer, and score of the best similar question
│ Was bedeutet Datenvergiftung?                      │ 'Rank 2 | Answer 0.717 | Question 0.922' │ 'Rank 2 | Answer 0.668 | Question 0.742' │
│ Warum halluziniert mein Modell?                    │ 'Rank 4 | Answer 0.528 | Question 0.580' │ 'Rank 1 | Answer 0.527 | Question 0.411' │
│ …                                                                                                                                         │
```

**What does it mean?**

- The first table per model: rows are the variants, columns the indexes, each number says for how many of the eight queries the correct answer is at rank 1.
- The second table shows Index B in detail. "Rank 2 | Answer 0.892 | Question 0.936" means: the correct answer is at rank 2 with 0.892, and a similar question overtook it with 0.936.
- Take "Darf ein Passwort im System-Prompt stehen?" (may a password be in the system prompt?) with E5: with the prefix the answer's value stays almost the same (0.892 → 0.897), the similar question's drops (0.936 → 0.865). The prefix separates question-to-question from question-to-answer.
- Without a prefix, a question resembles another question more than its answer. The prefixes tell the model that a query is looking for an answer here.

**Try it:** the tasks in the header of `03-prefixes.ts`. Read both tables per model: first the count, then the rows in which the rank changes.

**Pitfalls**

- Eight cases are a small sample. A single case moves the count by one in eight.
- The prefix belongs to the input to the model, not to the stored text. If you change it, every entry must be embedded again; vectors with and without prefix do not fit together.
- The answers of the other cases count as wrong answers for a query. They can also land ahead of the correct one.

**If it gets stuck**

| Message | Fix |
|---|---|
| Only one of the two tables appears, exit code 1 | One model is not loaded. The error line above names the model. |

> **Deep dive:** E5 was trained with exactly these prefixes: `query: ` for queries and `passage: ` for documents; for symmetric tasks (comparing two texts of the same kind, as in Part 1) the model card recommends `query: ` for both. Lesson 04 uses both: `passage: ` for the chunks, `query: ` for the search question and for comparing neighbouring sentences. Literature: Wang et al. (2022), see [docs/production.md](../../docs/production.md#further-reading).

## What you take away

1. An embedding captures the meaning of a text in a vector. Similar meaning means similar direction, even without shared words.
2. The order counts, not the value: every model has its own scale, and with E5 unrelated texts score high too.
3. Query and passage prefixes belong to the model. They help decide whether an answer is found or a similar question.

## What's next

[Lesson 04 – Chunking](../04-chunking/README.md) splits the OWASP documents into pieces, embeds each with E5 and `passage: ` and stores everything in an index. From there every lesson searches that index with `query: `. The data flow is described in [docs/architecture.md](../../docs/architecture.md).
