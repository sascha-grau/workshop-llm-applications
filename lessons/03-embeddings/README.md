# Lesson 03 – Embeddings

[Deutsch](README.de.md)

**Learning goal:** You understand what an embedding is, compare texts with cosine similarity, and see what the prefixes `query: ` and `passage: ` are for. This is the foundation of the search in Lessons 04 to 07.

| Part | File | npm script | Learning goal | Requires |
| --- | --- | --- | --- | --- |
| 1 | `01-hello-embeddings.ts` | `npm run l03:1` | Embed two sentences and measure their similarity | LM Studio (E5), Burp optional |
| 2 | `02-comparisons.ts` | `npm run l03:2` | Sort passages by meaning, compare E5 with EmbeddingGemma | LM Studio (E5 and EmbeddingGemma), Burp optional |
| 3 | `03-prefixes.ts` | `npm run l03:3` | Measure how much the role prefixes matter | LM Studio (E5 and EmbeddingGemma), Burp optional |

`embeddings.ts` is a helper module (the two models with their prefixes), not a part of its own.

**Order:** Work through Parts 1 to 3 in sequence. With E5, even unrelated texts often score 0.7 to 0.8; what matters is the ranking, not the absolute value. The name of the Gemma model is set in `.env` under `REMOTE_EMBEDDING_GEMMA_MODEL_NAME`.

## Key terms

- **Embedding:** an embedding model turns a text into a vector that describes its meaning.
- **Vector:** a long list of numbers; two sentences with similar meaning get vectors pointing in a similar direction, even with almost no shared words.
- **Cosine similarity:** measures that direction as a number between -1 and 1.
- **Query and passage prefixes:** E5 and EmbeddingGemma were trained with prefixes that mark a text's role. E5 uses `query: ` for search queries and `passage: ` for stored documents; EmbeddingGemma has its own (`task: search result | query: ` and `title: none | text: `, see `embeddings.ts`).
- **Ranking over absolute values:** with E5 even unrelated texts often score 0.7 to 0.8, so compare the order, not the absolute values, and do not compare values between models.

## Tasks

Translated from the `Aufgabe` block at the top of each file; the file headers remain the source.

### Part 1 – `01-hello-embeddings.ts`

1. `textA` is `Nach einem langen Arbeitstag freute sich Lisa auf eine Tasse heißen Kamillentee.` (After a long working day, Lisa looked forward to a cup of hot chamomile tea.) and `textB` is `Entspannung nach einem anstrengenden Tag mit einem warmen Getränk.` (Relaxing after a strenuous day with a warm drink.) Replace `textB` with a sentence on a completely different topic (e.g. train timetable). How much does the value drop, and is it still above 0.5?
2. Set `textB` equal to `textA`. Which value do you expect before you start?
3. In Burp, open the response and find the list of numbers of a vector (only with Burp).

### Part 2 – `02-comparisons.ts`

The query is `Wie kann ich mich nach Feierabend bei einem heißen Getränk entspannen?` (How can I relax with a hot drink after work?). Passages 1, 2 and 5 (chamomile tea, hot cocoa, herbal tea with a book) match; passages 3 and 4 (a train timetable between Berlin and Hamburg, tomatoes growing in the garden) are distractors.

1. Add a passage of your own to the `passages` list and predict beforehand which rank it will get. Were you right? You may write it in English, because both models are multilingual.
2. Change the search query into a question about the train timetable. Which passage is on top now?
3. Compare the gap between rank 3 (last matching passage) and rank 4 (first distractor) for E5 and for Gemma. Which model separates matching from non-matching more clearly?

### Part 3 – `03-prefixes.ts`

1. Read the first table: for which model and in which index do the prefixes bring the most hits at rank 1?
2. Add a case of your own with query, similar question and answer to `cases`. Does your similar question displace the answer?
3. In the `withPrefix` variant, swap the query and passage prefixes. Does it get worse than having no prefix at all?

Back to the [overview](../../README.md).
