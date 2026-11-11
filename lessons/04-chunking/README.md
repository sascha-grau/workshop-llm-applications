# Lesson 04 – Chunking

[Deutsch](README.de.md)

**Learning goal:** You understand why documents are split into chunks, build indexes from them, and see how the way you cut changes the search.

| Part | File | npm script | Learning goal | Requires |
| --- | --- | --- | --- | --- |
| 0 | `00-prepare-chunks.ts` | `npm run l04:0` | Cut the OWASP documents once into chunks under 512 tokens | LM Studio (E5), Burp is not used |
| 1 | `01-prepared-chunks.ts` | `npm run l04:1` | Build and search an index from the prepared chunks | Part 0, LM Studio (E5) |
| 2 | `02-heading-chunking.ts` | `npm run l04:2` | Cut at headings | Part 0, LM Studio (E5) |
| 3 | `03-semantic-chunking.ts` | `npm run l04:3` | Cut where the topic changes (percentile) | Part 0, LM Studio (E5) |
| 4 | `04-question-generation-chunking.ts` | `npm run l04:4` | Search with generated questions (multi-vector index) | Part 0, LM Studio (chat and E5) |
| 5 | `05-parent-document.ts` | `npm run l04:5` | Search small pieces, deliver the whole section (parent document) | Index from `l04:2`, LM Studio (E5) |

`chunking.ts` and `formats.ts` are helper modules (shared functions, file formats: manifest version and manifest schema), not parts of their own. Reading and writing the index and the ranking live in [`shared/index.ts`](../shared/index.ts) because Lessons 05 to 07 use them too; the parts import them from there directly.

**Order:** Run Part 0 first; it creates the chunk files (they are not in the repository). After that you can run Parts 1 to 4 in any order; each writes its own index to `indexes/`. Part 5 writes no index; it reads the one from `l04:2`. Lessons 05 to 07 read these indexes: Lesson 05 the one from `l04:2` in all parts, Lesson 06 loads all of them into Qdrant (`npm run l06:1`), and Lesson 07 uses the one from `l04:2` for Part 1, `l04:3` for Part 2, `l04:4` for Part 3 (Parts 4 to 7 use `l04:2` again). Old chunks or indexes are rejected with a message; regenerate them in that case.

**Part 0 is long:** `00-prepare-chunks.ts` has almost 500 lines. The trainer runs it; you only need to read the lines marked `// KERN:` (the cutting loop, the budget check and the detection of inputs that are too long). The rest is safeguarding.

**Verifying Part 0 and help:** `npm run l04:0 -- --verify` checks the existing chunks against the source documents and the token limit without creating new ones (depending on the counting method, this costs another round of requests to the embedding endpoint). `npm run l04:0 -- --help` prints brief usage help. The `--` separates the npm options from those of the program. If `chunks/` already exists, a normal run aborts instead of overwriting anything: use `--verify` or move the folder.

**Part 4 and the corpus:** By default (`FULL_CORPUS = false` in `04-question-generation-chunking.ts`), Part 4 indexes only `01-llm01-prompt-injection.md`. For the whole corpus, set `FULL_CORPUS = true` and restart; the first run takes many minutes because the chat model writes questions for every chunk. Finished chunks stay in the index, so an interruption costs at most the chunk in progress. Lesson 07, Part 3 then also finds questions about the other documents.

## Chat language

The prompt in Part 4 that generates the questions (`04-question-generation-chunking.ts`) asks for German questions (`Alle Fragen müssen auf Deutsch sein.`, All questions must be in German), so the generated questions print in German. `DEMO_QUESTION` in `chunking.ts` is German (`Wie begrenze ich Prompt Injection?`, How do I limit prompt injection?). You may replace it with an English question: E5 is multilingual, so it should still match the German chunks (retrieval quality was not tested).

## Key terms

- **Chunk:** a piece of a document that gets its own embedding vector; a whole document is too long and too mixed in topic for one vector.
- **Heading chunking:** cutting at the Markdown headings (`#{1,3}` in `splitByHeadings`), so each section becomes a chunk that starts with its heading path (Part 2).
- **Semantic chunking:** the embedding model finds the topic jumps itself: neighbouring sentence windows are embedded, their distance is 1 minus cosine similarity, and cuts are made at distances above the percentile threshold (`DISTANCE_PERCENTILE = 95`; the 95th percentile is the value below which 95 % of the distances lie). Short documents (fewer than 4 distances) are cut only at headings (Part 3).
- **Question generation / multi-vector index:** the chat model writes `QUESTIONS_PER_CHUNK` (3) questions per chunk; each question becomes its own search vector pointing to the original chunk text, so the search compares question with question (Part 4).
- **Index file:** the JSON file under `indexes/` that stores chunk text, metadata and vector; Lessons 05 to 07 read it.
- **Parent document / small-to-big:** the search compares the question with small pieces (children, about `CHILD_SIZE` = 300 characters, each starting with its heading path) and delivers the whole section they come from (the parent). The child decides whether a section is found, the parent what ends up in the prompt (Part 5).
- **Top-k:** the `k` chunks most similar to the question; the lesson uses `DEFAULT_TOP_K` = 3 for the hits it prints. Lesson 05 examines the rule.
- **No overlap:** the chunks do not overlap. Part 0 cuts at paragraph, list-item and sentence boundaries, every chunk gets its heading chain in front, and the manifest check requires the pieces to follow each other without gap or overlap (`Gap or overlap in source coverage`). So a chunk keeps its context without repeating text from its neighbour.
- **Token limit:** the E5 model reads at most 512 tokens per input (a token is a word fragment); Part 0 checks every chunk, including the prefix `passage: `, against this limit.

## Tasks

Translated from the `Aufgabe` block at the top of each file; the file headers remain the source.

### Part 0 – `00-prepare-chunks.ts`

1. Check the generated chunks with `npm run l04:0 -- --verify`. The program compares source, checksums and token counts and prints `minimum_tokens` and `maximum_tokens` (smallest and largest token count).
2. Set `TOKEN_LIMIT_OVERRIDE` at the top to 256, delete `content/owasp-genai-top-10/chunks/` and restart: there are clearly more chunks. Then set `TOKEN_LIMIT_OVERRIDE` back to `undefined`, delete `chunks/` and run `npm run l04:0` again. Otherwise Parts 1 to 5 do not match the chunks.
3. Open `content/owasp-genai-top-10/chunks/manifest.json` and read `format_version` (3), `counting_method` and `counting`: how did your server count, and what does that mean for how reliable the numbers are?

### Part 1 – `01-prepared-chunks.ts`

1. Change `DEMO_QUESTION` in `chunking.ts` (e.g. `Was ist ein Jailbreak?` (What is a jailbreak?)). Are the hits still in the right document?
2. Change `EXAMPLE_DOCUMENT` in `chunking.ts` to another document from the manifest. How many chunks does it have, and how many characters per token? Reset the value afterwards; Parts 2 to 4 use it (Part 4 builds the question index with it, which Lesson 07, Part 3 reads).
3. Look at the "characters per token" column: which chunks are clearly below 4? What is in them (hint: link lists)? (Only meaningful if `counting_method` in the manifest is not `character-estimate`; with `character-estimate` every value is about 1.)

### Part 2 – `02-heading-chunking.ts`

1. Change the heading depth: in `splitByHeadings` (`chunking.ts`), change both occurrences of `#{1,3}` to `#{1,2}`. How does the number of chunks change, and what happens to the hits?
2. Put a document name into `SUBSET` (e.g. the one from `EXAMPLE_DOCUMENT`) so embedding runs faster. Afterwards set `SUBSET` back to `[]` and rerun `npm run l04:2`, otherwise Lessons 05 to 07 know only this document.
3. Change `DEMO_QUESTION` in `chunking.ts` and compare the top three hits (`DEFAULT_TOP_K`) with Part 1.

### Part 3 – `03-semantic-chunking.ts`

1. Change `DISTANCE_PERCENTILE` from 95 to 80. How many semantic cuts and chunks does the output show now? (For a short document nothing may change: see Key terms above.)
2. Set the value to 100. How many semantic cuts remain, and why? (Hint: a cut is made only where distance > threshold.)
3. Compare the number of embedding calls with Part 2, and the chunk beginnings in the table.

### Part 4 – `04-question-generation-chunking.ts`

1. Change `QUESTIONS_PER_CHUNK` from 3 to 5, delete the index file `indexes/questions__*.json` and restart. Do the hits get better, and how much longer does the run take?
2. Read the printed questions: which are good, which too general? Adjust the prompt, delete the index and compare.
3. Change `DEMO_QUESTION` in `chunking.ts` to a question that a chunk answers without using its words. Does the question search find it better than the chunk-text search (Part 2)?

### Part 5 – `05-parent-document.ts`

1. Compare the two tables: how many of the best children belong to the same parent, and how much longer is the delivered context than the children alone?
2. Set `CHILD_SIZE` to 150 and then to 600. How do the number of children, the similarities and the delivered parents change?
3. Compare the delivered parents with the hits from Part 2 (`npm run l04:2`). Does the search over children find other sections for `DEMO_QUESTION`?

Back to the [overview](../../README.md).
