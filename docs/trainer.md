# Trainer notes

*Deutsche Fassung: [trainer.de.md](trainer.de.md)*

Schedule, preparation, solutions and talking points for the trainer. The tasks themselves live in the headers of the lesson files; this page only gives the expected results. Times without model and date are planning values, not measurements. Measured run times and expected results come from the dress rehearsal on 2026-11-13: LM Studio on an RTX 3080 Ti, chat `qwen3.5-4b` (context 8192, Max Concurrent Predictions 1), `text-embedding-multilingual-e5-base`, `text-embedding-embeddinggemma-300m-qat`, Qdrant 1.20.0. Participant laptops without a comparable GPU are slower. The few rows from an earlier run are marked in the lesson tables.

## Pre-flight checklist

| Check | How | Ok when |
|---|---|---|
| Node 22.19 or newer | `node --version` | Version ≥ 22.19 |
| Packages | `npm ci` (needs access to the npm registry) | No errors; `npm audit` findings are known (root README) |
| E5 tokenizer | `npm run tokenizer:fetch` (once, needs internet) | "E5 tokenizer ready for offline use" |
| `.env` | `cp .env.example .env`, enter the identifiers from LM Studio (`lms ps`) | `REMOTE_MODEL_NAME`, `REMOTE_EMBEDDING_MODEL_NAME`, `REMOTE_EMBEDDING_GEMMA_MODEL_NAME` match LM Studio; `SHOW_THINKING` and `ALL_DOCUMENTS` empty |
| LM Studio | Load the chat model with Max Concurrent Predictions 1 (`lms load <identifier> --parallel 1`; the default 4 shares the context, see root README), plus E5 and EmbeddingGemma; start the server | `curl http://localhost:1234/v1/models` lists all three; `lms ps` shows Parallel 1 for the chat model |
| First call | `npm run l01:1` | Answer appears token by token |
| Docker and Qdrant | `docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.20.0` | `http://localhost:6333/dashboard` opens |
| Open WebUI | Command from the root README (`v0.13.3`, port 3000, `--add-host`) | Admin account created; Ollama connection to the facade |
| Burp | Listener `127.0.0.1:8080`, Intercept **off**, export the CA as DER, `openssl x509 -inform der -in burp.der -out burp.pem`, `BURP_CA_CERT=burp.pem` | `npm run l01:3` with `BURP_PROXY_URL=http://localhost:8080` shows requests in the HTTP history |
| Pre-build indexes | `npm run l04:0`, check with `npm run l04:0 -- --verify` (expect `counted_with: tokenizer` and 69 chunks), then `l04:1`, `l04:2`, `l04:3`, `l04:4` | Four files under `indexes/` |
| Fill Qdrant | `npm run l06:1` | Four collections in the dashboard |
| promptfoo smoke test | `npm run l08:5 -- --filter-first-n 1` | Report under `results/lesson-08-promptfoo/` |

**Preparation time:** `l04:4` took 4623 s for the whole corpus (199 chunks), about 77 minutes (dress rehearsal). So build the question index beforehand and hand it out; whoever works without it: set `FULL_CORPUS = false` in `lessons/04-chunking/04-question-generation-chunking.ts` (only `EXAMPLE_DOCUMENT`). An interrupted run resumes and adds only missing chunks. `l04:0` to `l04:3` take seconds; the number of requests is in [`lessons/04-chunking/GUIDE.md`](../lessons/04-chunking/GUIDE.md#part-0--preparing-chunks) → "Part 0" (deep dive).

### Ports

| Port | Service |
|---|---|
| 1234 | LM Studio (`/v1`) |
| 8080 | Burp listener (so Open WebUI must not use 8080) |
| 3000 | Open WebUI (container port 8080) |
| 11435 | Ollama facade (`FACADE_PORT`): only one chat part at a time (L01 Parts 2–3, L02 Parts 1–4, L07) |
| 6333 | Qdrant including dashboard |

### On the USB stick

| What | Why | Watch out |
|---|---|---|
| `indexes/` (four JSON files) | Saves `l04:1` to `l04:4`, above all the long question generation | The file name contains `REMOTE_EMBEDDING_MODEL_NAME` (in LM Studio e.g. `headings__text-embedding-multilingual-e5-base.json`). Participants need the same identifier and the same E5 model, otherwise "Cannot load index" or mismatched vectors. |
| `.cache/tokenizers/` (E5 tokenizer, about 16 MB) | `l04:0` counts exactly, even without internet | Copy the folder into the repo root; without it `l04:0` downloads it or falls back to the server |
| `content/owasp-genai-top-10/chunks/` including `manifest.json` | Parts 1 to 4 of Lesson 04 run without `l04:0` | Only if created with the participants' `REMOTE_EMBEDDING_MODEL_NAME` (the manifest names the model; otherwise `--verify` fails). Simpler: participants run `npm run l04:0` themselves; with `.cache/tokenizers/` the same chunks appear in seconds. `l04:0` stops if `chunks/` exists. License CC BY-SA 4.0 (root README, "License"): give attribution. |
| `results/lesson-08-promptfoo/05-promptfoo-strategies.html` (full run of L08, Part 5) | Tasks 1 and 2 of Part 5; participants run only `--filter-first-n 1` themselves | A report from the same model as in the workshop, created beforehand |
| Optional: the models' GGUF files | Weak Wi-Fi | Check identifiers in LM Studio |

After copying, everyone runs `npm run l06:1` themselves (embeds nothing, only needs Qdrant).

### Shared trainer server

When about 20 people share one model server (root README, "Variant: trainer server"), chat calls queue up. Plan:

| Task | Load per run | In the workshop |
|---|---|---|
| L04, Part 0: re-chunking with `TOKEN_LIMIT_OVERRIDE` | Hundreds of embedding requests (count: guide Part 0) | Trainer demo |
| L04, Part 4, task with `QUESTIONS_PER_CHUNK` | One chat call per chunk of the example document | Demo or pair work |
| L06, Parts 5–7; L07, Parts 9–10 | Several chat calls per question (reranking with thinking, variants) | Pair work; L07, Part 9 (minutes per question) as a demo |
| L08, Parts 2 and 3 | Answer plus two verdicts per run, with the whole context | Pair work |
| L08, Part 5 | Full run: every cell with an answer and several verdicts | On a shared server a demo (run beforehand); participants only `--filter-first-n 1`. With their own GPU they run the full run themselves (see Lesson 08). |
| L08, Part 6 | One answer and one verdict per question, through the facade | Pair work with `--filter-first-n 1` |
| All embedding-only parts (L03, L04 Parts 1–3, L05, L08 Parts 1 and 4) | Light | Alone |

## Switches: default and reset

Many tasks change constants. If one stays changed, it skews later lessons. Quickest overview: `git status` and `git diff --stat lessons/`; reset with `git checkout -- <file>`. `.env` is not in the repo and must be emptied by hand.

| Switch | File | Default | Affects | Reset |
|---|---|---|---|---|
| `SHOW_THINKING` | `.env` | empty | JSON parts in L04, L06, L07, L08 | empty it |
| `ALL_DOCUMENTS` | `.env` (overrides the constant) | empty | output of L04, Parts 1–3 only | empty it |
| `BURP_PROXY_URL` | `.env` | empty | all programs from L01, Part 3 | empty it when Burp is not running |
| `TOKEN_LIMIT_OVERRIDE` | `lessons/04-chunking/00-prepare-chunks.ts` | `undefined` | chunks and thus all indexes | `undefined`; delete the 256-token `chunks/` and rename the set-aside `chunks-512/` back to `chunks/`. Without a backup: `l04:0`, then `l04:1`–`l04:4`, `l06:1` |
| `EXAMPLE_DOCUMENT` | `lessons/04-chunking/chunking.ts` | `'01-llm01-prompt-injection.md'` | output of L04; `l04:4` with `FULL_CORPUS = false` | restore |
| `ALL_DOCUMENTS` | `lessons/04-chunking/chunking.ts` | `false` | output only | restore and empty `.env` |
| `DEMO_QUESTION` | `lessons/04-chunking/chunking.ts` | `'Wie begrenze ich Prompt Injection?'` | output of L04 only | restore |
| Heading depth `#{1,3}` | `splitByHeadings` in `chunking.ts` | `#{1,3}` | index `headings` (L05–L08), `questions` | restore, `l04:2`; delete the question index and run `l04:4`; `l06:1` |
| `SUBSET` | `lessons/04-chunking/02-heading-chunking.ts` | `[]` | index `headings` (L05–L08) | `[]`, `l04:2`, `l06:1` |
| `DISTANCE_PERCENTILE` | `03-semantic-chunking.ts` | `95` | index `semantic` (L06, Part 1; L07, Part 2; L08, Part 5) | `95`, `l04:3`, `l06:1` |
| `QUESTIONS_PER_CHUNK`, question prompt | `04-question-generation-chunking.ts` | `3` | index `questions` | restore, delete the new index file, rename `.bak` back |
| `FULL_CORPUS` | `04-question-generation-chunking.ts` | `true` | index `questions` | `true`, `l04:4` (resumes) |
| `CHILD_SIZE` | L04, Part 5; L07, Part 4 | `300` | that part only | restore |
| `ALLOWED_ACCESS_GROUPS` | `05-retrieval-strategies/03-metadata-filter.ts` | `['public']` | that part only | restore |
| `question-set.json` | `lessons/05-retrieval-strategies/` | 12 questions + `withoutSource` | `l05:5`, `l08:1`–`l08:6` | `git checkout -- lessons/05-retrieval-strategies/question-set.json` |
| `TEXT_INDEX` (stemmer) | `06-hybrid-rerank/01-collection-load.ts` | `german` | all collections | restore, `l06:1` |
| `INDEX_STRATEGY` | `06-hybrid-rerank/hybrid.ts` | `'headings'` | L06, Parts 2–7, **L07, Parts 8–11 and `l08:6`** | restore, restart the parts |
| `ENABLE_INJECTION_DEMO` | `07-rag-open-webui/01-heading-rag.ts` | `false` | `l07:1` | `false` |
| `RERANK_THINKING` | `06-hybrid-rerank/05-reranking.ts`, `06-hybrid-rerank/99-full-demo.ts` | `true` | `l06:5`, `l06:7` | `true` |
| `RERANK_THINKING` | `07-rag-open-webui/qdrant-retrieval.ts` | `true` | `l07:9`, `l07:11` (`lesson-07-rerank`) | `true`, restart |
| `TOP_K`, `LAMBDA`, `FETCH_K`, `SCORE_THRESHOLD`, `CANDIDATES`, `VARIANT_COUNT`, `ALLOWED_SOURCES` | the respective file in L05–L07; `demo.ts` | see file | that file only | restore |
| `TOP_K` | `08-evaluations/01-…`, `03-…`, `04-regression.ts` | `5` | measurement; L08, Part 4 compares with saved runs | `5`; empty `results/lesson-08-regression/` if needed |
| `QUESTION_ID`, `EXPAND_SECTIONS` | `08-evaluations/03-correctness.ts` | `'F-01'`, `true` | Part 3 only | restore |
| `INVENTED_ANSWER`, `QUESTION`, sentences in `JUDGE_SYSTEM_PROMPT` | `08-evaluations/02-faithfulness.ts` | see file | Part 2 only | `git checkout -- <file>` |
| `topK` under `config`, provider `id` | `05-promptfoo-strategies.yaml`, `06-promptfoo-black-box.yaml` | no `topK` (= 5), `lesson-07-hybrid` | Parts 5, 6 | `git checkout -- <file>` |

**Tip:** Copy the finished question index before Lesson 04 (`indexes/questions__*.json`). The task on `QUESTIONS_PER_CHUNK` has it renamed to `*.bak` and back afterwards; if that goes wrong, your copy saves the long rebuild.

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Commands from a file header fail on Windows | POSIX syntax | "Windows" table below |
| `Context size has been exceeded`, mainly in L08, Part 5 | Chat model loaded with the default Max Concurrent Predictions 4; the slots share the context | Reload with `--parallel 1` (root README, "Setting up LM Studio"). Raising the context failed on GPU memory in the dress rehearsal. |
| Answers very slow, judge times out | Laptop without GPU | Trainer server (root README, "Variant: trainer server"), pre-built indexes, `npm run l08:5 -- --filter-first-n 1` |
| Model thinks despite `reasoning_effort: 'none'` | Some servers ignore the value (comment in `evaluation.ts`, `promptfoo-judge.ts`) | The code still hides the thinking; `max_tokens` in the judge block must cover it too. On "truncated (finish_reason: length)" first raise `max_tokens` in the judge block, then try another model |
| JSON errors, no new questions, "no usable verdict", multi-query aborts | `SHOW_THINKING=true` (on purpose, [decisions](decisions.md#show-thinking)) | Empty it in `.env`. Affected: L04, Part 4; L06, Parts 5, 6, 7; L07, Part 3 (indirectly: the question index gets no new questions) and Parts 9–11; L08, Parts 2, 3 (5 and 6 unreliable) |
| "FACADE_PORT 11435 is in use" | A second chat part (L01, L02, L07) is still running | Stop it with Ctrl+C; one part at a time |
| "The request through Burp failed or timed out" | Intercept in Burp is on | Turn Intercept off |
| "Cannot load index … (strategy)" | Index missing | "Missing artefacts" table below |
| "The chunk manifest is invalid or outdated" | Old chunks or `TOKEN_LIMIT_OVERRIDE` changed | Set `TOKEN_LIMIT_OVERRIDE` to `undefined`. If `chunks-512/` exists: delete the new `chunks/` and rename `chunks-512/` back; otherwise delete `chunks/` and run `npm run l04:0` |
| "The Qdrant collection … does not exist" | Fresh container | `npm run l06:1` |
| L07, Parts 8–11 search the wrong index | `INDEX_STRATEGY` in `hybrid.ts` not reset after L06, Part 2 | set to `'headings'` |
| promptfoo ends with exit code 100 and a stack trace | Cells with ERROR ("judge format error") | Not a crash; the report is written |
| `npx promptfoo view` reachable on Wi-Fi | Listens on all interfaces (header of `05-promptfoo-strategies.yaml`) | Ctrl+C after viewing |

### Missing artefacts

Who reads which artefact: [architecture.md](architecture.md#who-reads-which-index).

| Missing | Script |
|---|---|
| Chunks | `npm run l04:0` |
| Index `prepared` | `npm run l04:1` |
| Index `headings` | `npm run l04:2` |
| Index `semantic` | `npm run l04:3` |
| Index `questions` | `npm run l04:4` |
| Qdrant collections | `npm run l06:1` |
| Facade for `l08:6` | `npm run l07:11` or `npm run l07:8` in a second terminal |

### Windows

| Purpose | bash | PowerShell | cmd |
|---|---|---|---|
| Create `.env` | `cp .env.example .env` | `Copy-Item .env.example .env` | `copy .env.example .env` |
| Stack trace | `DEBUG=1 npm run l01:3` | `$env:DEBUG=1; npm run l01:3` (then `Remove-Item Env:DEBUG`) | `set DEBUG=1 && npm run l01:3` |
| Set chunks aside | `mv content/owasp-genai-top-10/chunks content/owasp-genai-top-10/chunks-512` | `Rename-Item content\owasp-genai-top-10\chunks chunks-512` | `ren content\owasp-genai-top-10\chunks chunks-512` |
| Set question index aside (file name with your model) | `mv indexes/questions__<model>.json indexes/questions__<model>.json.bak` | `Rename-Item indexes\questions__<model>.json questions__<model>.json.bak` | `ren indexes\questions__<model>.json questions__<model>.json.bak` |
| Convert Burp CA | `openssl …` | in Git Bash | in Git Bash |

Without a shell: select the file or folder in the VS Code Explorer and press F2. `npm run …` and `npm run l08:5 -- --filter-first-n 1` work in every shell. With `FACADE_HOST=0.0.0.0` on Windows, put `127.0.0.1` into `06-promptfoo-black-box.yaml` (comment there).

## Two-day schedule

Assumptions: times per lesson as below ("Duration (plan)"), i.e. explanation plus tasks; according to the dress rehearsal the programs themselves mostly run for seconds. Exceptions: reranking with thinking takes almost 2 minutes per run in L06, Part 5 and about 2.5 minutes per question in L07, Part 9; the trainer demonstrates Part 9 while the group prepares Part 10. Slower laptops need more buffer: then do tasks in pairs and use the deep-dive hour on day 2 as a reserve.

| Day 1 | Block | Runs in the background |
|---|---|---|
| 09:00–10:00 | Arrival, pre-flight checklist (LM Studio with Parallel 1, Docker, Open WebUI, Burp), copy USB artefacts | – |
| 10:00–10:45 | Lesson 01 – Preparation | – |
| 10:45–11:00 | Break | Participants without the USB stick: `npm run l04:0` to `l04:3` (seconds) |
| 11:00–12:15 | Lesson 02 – Tool calls | – |
| 12:15–13:15 | Lunch | Participants without a question index: `l04:4` with `FULL_CORPUS = false` |
| 13:15–14:00 | Lesson 03 – Embeddings | – |
| 14:00–15:30 | Lesson 04 – Chunking | – |
| 15:30–15:45 | Break | `docker start qdrant`, `npm run l06:1` (seconds; after Lesson 04 in case indexes were rebuilt) |
| 15:45–16:45 | Lesson 05 – Retrieval strategies | – |
| 16:45–17:00 | Review | Trainer in the evening: full `npm run l08:5` for the report (dress rehearsal: 6 min 59 s) |

| Day 2 | Block | Runs in the background |
|---|---|---|
| 09:00–09:15 | Routine: `git status`, check `.env` switches, Qdrant running | – |
| 09:15–10:30 | Lesson 06 – Hybrid search and reranking | – |
| 10:30–10:45 | Break | Check Open WebUI and the facade |
| 10:45–12:15 | Lesson 07 – RAG with Open WebUI | Part 9 as a trainer demo |
| 12:15–13:15 | Lunch | Participants with their own GPU: full `npm run l08:5` |
| 13:15–14:45 | Lesson 08 – Evaluation | – |
| 14:45–15:00 | Break | – |
| 15:00–16:00 | Reserve and deep dive: open tasks, [production.md](production.md) | – |
| 16:00–16:30 | Wrap-up, questions | – |

On the evening before the workshop the trainer builds all indexes (`l04:4` about 77 minutes) and fills Qdrant.

## Lessons

The tables follow the tasks in the file headers (number = task). Run times and expected results come from the dress rehearsal (see above) unless noted otherwise. Rows marked "earlier run" were not re-measured; they come from 2026-11-13 with `qwen3.8-4b-q4` over an OpenAI-compatible server. Rows without a number ("read it off") were not measured. Output that belongs to no task is in the lesson's guide ("What you see").

### 01 – Preparation

| | |
|---|---|
| Duration (plan) | 45 minutes: Part 1 10, Part 2 15, Part 3 20 |
| Run time (dress rehearsal) | Part 1 9 s, Part 2 24 s per question; Part 3 not measured (Burp) |
| Beforehand | Chat model in LM Studio, Open WebUI with an Ollama connection to `http://127.0.0.1:11435` (Docker: `host.docker.internal`, `FACADE_HOST=0.0.0.0`), Burp |
| Talking points | Streaming token by token; the facade pretends to be Ollama; Burp shows the API key in clear text (redact screenshots); with `SHOW_THINKING=true`, `qwen3.5-4b` thinks in English in several numbered drafts |

| Part, task | Expected result |
|---|---|
| 1.1 | No fixed solution; the answer arrives token by token. |
| 1.2 | `temperature: 1.5` changes the wording from run to run (read it off). |
| 1.3 | With `invoke` the answer appears only at the end, all at once. Use `modelText(response)`: plain `.text` would drop the thinking even with `SHOW_THINKING=true`. |
| 2.1 | Per message `HTTP request started/completed` and `Model: Call started/completed`. Measured with curl: `GET /api/tags` twice, one `POST /api/chat`, `messages: 1`; Open WebUI adds helper requests (see 2.3). |
| 2.2 | The new `ADVERTISED_MODEL` appears in the dropdown after reloading. |
| 2.3 | The whole history, plus Open WebUI helper requests with `### Task:` (title, tags). |
| 3.1 | In the JSON body (`messages`) of the request to `/v1/chat/completions` (earlier run). |
| 3.2 | The model answers the edited text. You have until `MODEL_TIMEOUT_MS` to edit before the call aborts (earlier run). |
| 3.3 | Burp shows many `data:` lines instead of one JSON object (earlier run). |

### 02 – Tool calls

| | |
|---|---|
| Duration (plan) | 75 minutes: Part 1 15, Part 2 25, Part 3 20, Part 4 15 |
| Run time (dress rehearsal) | Part 1 47 s, Part 2 16 s, Part 3 4 s, Part 4 4 s |
| Beforehand | Internet for Part 2; with `BURP_PROXY_URL` set also `BURP_CA_CERT`. All four parts use `FACADE_PORT`: only one runs at a time. |
| Talking points | Knowledge in the prompt vs. a tool; indirect prompt injection (LLM01); output handling (LLM05); small models are weak at tool calls |

| Part, task | Expected result |
|---|---|
| 1.1 | "Im vorliegenden Text steht nichts darüber, wie alt Ano Nym ist." (The text says nothing about Ano Nym's age.) A correct refusal, but without the examples' "(Quelle: Kontext)" ending; the appended list names "[1] Kontext im System-Prompt (Ano Nym)". |
| 1.2 | Without the examples, the format and "(Quelle: Kontext)" get lost or vary. |
| 1.3 | The system prompt is the first message in the body; with `temperature` 1 the answers vary (earlier run). |
| 2.1 | The fetch of `news.ycombinator.com` is in the HTTP history (earlier run). Dress rehearsal: 30 titles, the answer cites [1] three times. |
| 2.2 | The instruction may work; more likely without `<scraped-context>`. |
| 2.3 | The browser loads the image URL including the question (network tab); Burp does not see it, as it only sees Node's traffic. Remedy: do not render images and links from model output, or allow only known targets; the workshop's source list uses inline code for this reason (`formatSourceList`). |
| 3.1 | `tools` in the request, `tool_calls` in the response (earlier run). |
| 3.2 | Before: "Würfle eine Zahl zwischen 1 und 6." (Roll a number between 1 and 6.) triggers no tool call; the model invents "4 🎲", the same number every time at `temperature` 0. With the tool: `toolsByName` needs `[randomNumber.name, randomNumber]`. |
| 3.3 | The tool runs, then the error "The model was still requesting tools after 1 rounds." (earlier run). |
| 4.1 | Identical except for `"name":"model"`, which LangChain adds to the assistant message with `tool_calls`; both parts send two model requests (earlier run). |
| 4.2 | `answerWithTools` had 62 lines. The agent takes over the loop: find the tool by name, match results by tool-call ID, round limit (`recursionLimit`). |
| 4.3 | One entry in the `tools` array; before that, Part 4 also invents the dice number (see 3.2). |

### 03 – Embeddings

| | |
|---|---|
| Duration (plan) | 45 minutes: Part 1 10, Part 2 15, Part 3 20 |
| Run time (dress rehearsal) | Part 1 under 1 s, Part 2 1 s, Part 3 1 s |
| Beforehand | E5 and EmbeddingGemma loaded |
| Talking points | Cosine measures direction; with E5 even unrelated texts score high, order matters; prefixes `query: `/`passage: ` |

| Part, task | Expected result |
|---|---|
| 1.1 | "Der Regionalzug nach Hamburg fährt ab Montag eine halbe Stunde früher ab." (The regional train to Hamburg leaves half an hour earlier from Monday.) gave 0.762: clearly lower, but above 0.5 (earlier run). |
| 1.2 | 1.000. |
| 1.3 | The vector is a list of numbers in the response (`encodingFormat: 'float'`). |
| 2.1, 2.2 | No fixed solution; check the order. |
| 2.3 | Gap rank 3 → 4: E5 0.051 (0.814 → 0.763), Gemma 0.258 (0.502 → 0.244). Gemma separates much more sharply. |
| 3.1 | Hits at rank 1 without → with prefixes: E5 index A 7 → 8, index B 0 → 5; Gemma A 7 → 8, B 1 → 4. The prefixes help most in index B. |
| 3.2 | No fixed solution. |
| 3.3 | Index B: E5 2, Gemma 2, so worse than with correct prefixes, better than none (earlier run). |

### 04 – Chunking

| | |
|---|---|
| Duration (plan) | 90 minutes with pre-built indexes: Part 0 15, Part 1 15, Part 2 15, Part 3 15, Part 4 15, Part 5 15 |
| Run time (dress rehearsal) | Part 0 1 s (`--verify` 1 s), Part 1 1 s, Part 2 2 s, Part 3 6 s, Part 4 4623 s for the whole corpus (hence beforehand), Part 5 2 s |
| At the start | `git status` (files changed by earlier tasks?); check `SHOW_THINKING`, `ALL_DOCUMENTS`, `BURP_PROXY_URL` in `.env`. A `SHOW_THINKING=true` left on since Lesson 01 silently breaks `l04:4`, L06 Parts 5–7, L07 Part 3 (indirectly) and 9–11, and L08. |
| Beforehand | Chunks and all four indexes; your own copy of the question index |
| Talking points | Token limit and exact counting with the tokenizer (`counting_method` in the manifest); structure vs. meaning vs. generated questions; multi-vector index; small-to-big; `headings` is the basis of Lessons 05 to 08 |

| Part, task | Expected result |
|---|---|
| 0.1 | `--001` ends after "Beschreibung" (Description), `--002` starts with "Arten von Prompt Injection-Schwachstellen" (Types of prompt injection vulnerabilities): a cut at a section or paragraph boundary. |
| 0.2 | `tokenizer`: counted exactly with the local E5 tokenizer (69 chunks, 173 to 512 tokens). `embeddings-overflow`/`embeddings-usage`: the server counts. `character-estimate`: estimated only. |
| 0.3 | Clearly more chunks. If the value stays set, Parts 1 to 4 reject the manifest (limit ≠ 512). |
| 1.1 | The hits lie in the prompt-injection document (jailbreaking is covered there). |
| 1.2 | Read it off; the result depends on the chosen document. |
| 1.3 | The link lists `--007` and `--008` with 2.8 and 2.9 characters per token (URLs break into many small tokens); corpus minimum 2.51 (earlier run). |
| 2.1 | Part 1, rank 1: `--003` (0.871) mixes multimodality and the first mitigations, an averaged vector. Part 2, rank 1: "1. Begrenzen Sie das Modellverhalten" (Constrain model behaviour, 0.885), a small single-topic chunk. |
| 2.2 | Fewer, larger chunks; hits become more mixed (read it off). |
| 2.3 | Embedding much faster (one document instead of twelve). |
| 3.1 | More semantic cuts in long documents; short ones stay the same (read it off). |
| 3.2 | At 100 the threshold is the maximum; no distance is larger, so no cut. |
| 3.3 | 81 instead of 12 calls: 69 window requests (one per prepared chunk) plus 12 chunk requests (one per document). |
| 4.1 | Only `EXAMPLE_DOCUMENT` is processed; it has 24 chunks. In the dress rehearsal this document took 481 s with 3 questions per chunk, likely longer with 5: demo or pair work. Hits not necessarily better. |
| 4.2 | Good questions name the chunk's topic; too general ones fit many. Ask for concrete terms from the chunk in the prompt. |
| 4.3 | Question-to-question search often hits better than Part 2 (read it off). |
| 5.1 | Short parents are a single child; long ones gain a lot (e.g. "Beschreibung" 344 → 1843 characters). Context 4365 instead of 1933 characters for five children; the five parents are the same as in Part 2. |
| 5.2 | 150: more children, often the same parents; 600: fewer children, similarities closer to Part 2 (read it off). |
| 5.3 | Read it off; through the children a new section may appear. |

### 05 – Retrieval strategies

| | |
|---|---|
| Duration (plan) | 60 minutes: Part 1 10, Part 2 15, Part 3 15, Part 4 10, Part 5 10 |
| Run time (dress rehearsal) | Part 1 1 s, Part 2 1 s, Part 3 under 1 s, Part 4 1 s, Part 5 2 s. No task needs "(Demo)". |
| At the start | `git status`; check `SHOW_THINKING`, `ALL_DOCUMENTS`, `BURP_PROXY_URL` in `.env`. |
| Beforehand | Index `headings`; no chat model needed |
| Talking points | Top-k always returns k; MMR trades relevance for diversity; pre- vs. post-filter; a threshold holds for one model only |

| Part, task | Expected result |
|---|---|
| 1.1 | All top 8 from `01-llm01-prompt-injection.md`, gaps ≤ 0.009, no jump: top-k does not tell how many hits are good. |
| 1.2 | Still k hits, at 0.781 to 0.790. |
| 1.3 | Read it off; the larger k, the longer the context. |
| 2.1 | λ 0.6 picks the same as λ 1. Only λ 0.5 changes the selection: top-k rank 14 (`07-llm07`, 0.853) and rank 12 (`01-llm01`, filter, 0.856), from two documents. |
| 2.2 | `FETCH_K = TOP_K`: only the order changes. 50 with a small λ: unrelated chunks slip in. |
| 2.3 | Read it off; a smaller λ covers more documents. |
| 3.1 | Without a filter: rank 1 "Projektsponsoren" (0.830) and rank 3 "Projektsponsoren › Silver" (0.807), both internal. Post-filter: 1 hit (rank 2), pre-filter: 3 (0.807/0.806/0.793). |
| 3.2 | With `mitigation sections` only sections under "Präventions- und Mitigationsstrategien" remain; descriptions and examples drop out. |
| 3.3 | The appendix hits are added. |
| 4.1 | 0.82 separates the two questions; 0.5 lets everything through, 0.88 also drops good hits (2 of 5 remain; rank 3 drops although it is only 0.002 below rank 2). Worst hit of question 1 0.866, best of question 2 0.790: gap 0.076. |
| 4.2, 4.3 | Read it off. The Wi-Fi question usually cannot be separated cleanly. |
| 5.1 | MMR returns other sections (input/output filters, scenario 1, `07-llm07`); parent document gives the most context ("Beschreibung" at rank 1, 0.896, 1843 characters). |
| 5.2 | F-11 (answer only in the internal appendix) reaches only 0.804. "best elsewhere" > "best expected" only for F-05 (0.860/0.843) and F-09 (0.839/0.830). |
| 5.3 | The no-source question scores 0.825, F-00 to F-10 start at about 0.839: 0.83 still separates them. Reset `question-set.json` after the task, otherwise Lesson 08 measures with it. |

### 06 – Hybrid search and reranking

| | |
|---|---|
| Duration (plan) | 75 minutes: Part 1 10, Part 2 10, Part 3 10, Part 4 15, Part 5 10, Part 6 10, Part 7 10 |
| Run time (dress rehearsal) | Part 1 8 s, Parts 2–4 at most 1 s each, Part 5 102 s with thinking (about 1 s with `RERANK_THINKING = false`), Part 6 27 s, Part 7 93 s (before `RERANK_THINKING` existed; longer with thinking) |
| Beforehand | Qdrant running, `npm run l06:1`; chat model from Part 5 |
| Talking points | BM25 finds exact terms, vectors find paraphrases; RRF counts ranks, not scores; reranking finds nothing new and costs one call per candidate; Burp does not see Qdrant; Lesson 06 is unfiltered on purpose. Watch out: #37 and #44 have exactly the same value at RRF slot 8 (1/60) and alternate from run to run, so results in Parts 5 and 7 vary. |

| Part, task | Expected result |
|---|---|
| 1.1 | Payload: `text`, `source`, `position`, `version`, `accessGroup`, depending on the index `headingPath` or `chunkFile`; in `questions__…` also `generatedQuestion` (597 points, several share one chunk text). |
| 1.2 | No: the collection is deleted and recreated. |
| 1.3 | With the English stemmer "Maßnahme" no longer reliably finds "Maßnahmen" (read it off). |
| 2.1 | Stop words count 0. Colloquial question: "Kundendaten", "Firmengeheimnisse", "ausplaudern" 0 (not in the corpus), only "Chatbot" (8) and "Versehen" (1). The weather question matches only "heute" (1) and gets the highest BM25 score (preface): meaningless. |
| 2.2 | BM25 finds the technical term more reliably than vector search (read it off). |
| 2.3 | Larger chunks, different counts and BM25 scores. Set it back to `'headings'`. |
| 3.1 | 768 numbers; no word of the question is in the request to Qdrant. |
| 3.2 | "PoisonGPT": both rank #61 (`03-llm03`, scenario 2) first, BM25 clearly, vector narrowly. Colloquial: each search has one `02-llm02` hit at rank 1 (#37 BM25, #44 vector, 0.860). |
| 3.3 | 2024: no hits (all chunks carry `version` 2025); 2025 = no filter. |
| 4.1 | "RRF by hand" = "RRF Qdrant". |
| 4.2 | For the colloquial question both rank-1 hits (#37, #44, `02-llm02`) are missing from the hybrid top 5; #158 (`09-llm09`, BM25 rank 1, vector rank 4) wins. |
| 4.3 | Small: one list's top ranks win; large: flatter (read it off). |
| 5.1 | Candidates by RRF: #158, #96, #145, #19, #159, #147, #118, #44. After reranking: #19 = 2 (rank 4 → 1), #118 = 1 (7 → 2), all others 0; the `09-llm09` chunks drop. 8 calls, 15,280 tokens, 13,335 of them thinking. |
| 5.2 | Read it off: a larger limit costs more tokens, ratings change. |
| 5.3 | About 1 s instead of about 100 s, 1611 tokens without thinking. All ratings arrive, but almost all are 0: without thinking, reranking barely re-sorts. Set it back to `true` afterwards. |
| 6.1 | Datenexfiltration, PII, Trade Secrets, DLP, Prompt Injection, Vertraulichkeit, Security Hardening, Compliance, Datenlecks, Governance. |
| 6.2 | One `02-llm02` hit per column (#44; rank 3 in the multi-query column). No hit is in all four lists; the top 5 (#115, #58, #44, #9, #159) are in three each. |
| 6.3 | Read it off: more variants cost more time. |
| 7.1 | For the colloquial question hybrid is worse than either single search: it loses both `02-llm02` hits (top 5: #158, #96, #145, #19, #159). |
| 7.2 | Depends on the tie at slot 8. In the measured run #37 sat there and rose to rank 1 with a score of 3 (8 calls, 15,086 tokens). Multi-query always keeps #44 in the top 5 (rank 3, 1 call, 3124 tokens), for about a fifth of the tokens. |
| 7.3 | No fixed solution. |

### 07 – RAG with Open WebUI

| | |
|---|---|
| Duration (plan) | 90 minutes: Part 1 20, Parts 2–3 10, Part 4 10, Parts 5–7 15, Parts 8–10 20, Part 11 15 |
| Run time (dress rehearsal) | Part 1 29 s, 2 12 s, 3 45 s, 4 23 s, 5 14 s, 6 46 s, 7 43 s, 8 12 s per run; Part 9 about 153 s per question (ratings with thinking), Part 10 about 42 s, Part 11 (hybrid) about 8 s per answer |
| At the start | `git status`; check `SHOW_THINKING`, `ALL_DOCUMENTS`, `BURP_PROXY_URL` in `.env`. |
| Beforehand | Indexes `headings`, `semantic`, `questions`; for Parts 8–11 Qdrant and `l06:1`; Open WebUI pointed at the facade |
| Talking points | RAG end to end; the code appends the source list, not the model; pre-filter in `loadRagIndex`; one part at a time (port); Part 9 takes minutes per question (demo); Part 11 uses copies of the values (`demo.ts`) |

| Part, task | Expected result |
|---|---|
| 1.1 | Measured with "weather today": "Die bereitgestellten Quellen enthalten keine Informationen zum Wetter heute [1], [2] und [3]." (The sources contain no information on today's weather.) Still three sources from `00-vorwort` below it ("Das deutsche Übersetzungsteam" twice, "Was ist neu …" once): top-k always returns k. |
| 1.2 | `TOP_K` 1: short answer, only [1]; 8: longer, citations up to at most [8]. |
| 1.3 | A small model can tip; whether it only says "HALLO" varies (read it off). |
| 2.1, 2.2 | Read it off; one semantic chunk alone rarely covers all measures. |
| 3.1 | Not measured with the task question. With "Wie begrenze ich Prompt Injection?" Part 3 returns LLM01 "Beschreibung", LLM01 "Direkte Prompt Injections" and LLM02 "Beschreibung"; the answer gives no list of measures. |
| 3.2 | One chunk rarely covers the whole list of measures. |
| 4.1 | [1] to [3] as in Part 1, plus "Beschreibung" and "Indirekte Prompt Injections" as whole sections. |
| 4.2 | The line `Parent-document index ready` reports more children (default: 194 parents, 347 children). |
| 4.3 | Read it off; small children find details in long sections more easily. |
| 5.1 | [1] "1. Begrenzen …", [2] "Direkte Prompt Injections", [3] "3. Filter für Ein- und Ausgaben" (all LLM01). Compared with Part 1, "5. Manuelle Freigabe" drops out and "3. Filter" comes in. |
| 5.2 | `LAMBDA` 1 matches Part 1; 0.1 pulls in sources that barely fit. |
| 5.3 | Without additional candidates there is nothing to reorder but the order. |
| 6.1 | Sources only from LLM01 ("Indirekte Prompt Injections", scenario 6, scenario 3): the filter always returns `TOP_K` chunks from the allowed document. The model is called, says the sources contain nothing on the supply chain, and then describes prompt injection. |
| 6.2 | With `03-llm03-lieferkette.md` real supply-chain answers come. |
| 6.3 | Fixed answer `NO_SOURCES_ANSWER` without a model call: `loadRagIndex` already removed the appendix, so the filter leaves nothing. |
| 7.1 | With a similar question ("ausplaudern") the question got through with 5 sources (four reference-link sections from LLM02/07/06/05 and LLM07 "1. Trennen Sie sensible Daten vom System Prompt"); the answer relied mainly on link titles. |
| 7.2 | No value separates both questions cleanly: at 0.83 the weather question gets the fixed answer without sources; low values let it through, high ones also reject the answerable question. |
| 8.1 | Hybrid: [1] LLM03 scenario 2, [2] LLM04 reference links, [3] LLM03 reference links, [4] LLM04 "Gängige Beispiele", [5] LLM02 reference links ([3] and [4] may swap, equal fusion value). The technical term is hit. |
| 8.2 | For everyday language BM25 barely helps (read it off). |
| 8.3 | With 3 candidates per list sources can go missing (read it off). |
| 9.1 | Ratings: point 61 → 6, 73 → 1, 76 → 1, all others 0. Sources: [1] LLM03 scenario 2, [2] LLM03 reference links, [3] LLM04 "Beschreibung" (rises from hybrid rank 7), [4] LLM04 reference links, [5] LLM04 "Gängige Beispiele". LLM02 reference links (point 44, `{"score": 0}` in Burp) drops out. About 153 s per question. |
| 9.2 | Not measured in Lesson 07; based on Lesson 06, 5.3: answer after seconds, ratings in Burp almost all 0, sources ≈ the order of Part 8. Set it back to `true` afterwards. |
| 9.3 | Without additional candidates reranking drops nothing, it only reorders. |
| 10.1 | [1] LLM07 "Beschreibung", [2] LLM04 scenario 1, [3] LLM02 "2. Offenlegung proprietärer Algorithmen", [4] LLM03 "4. Anfälliges vortrainiertes Modell", [5] LLM04 scenario 3: only [1] fits; the variants drift towards poisoning and the supply chain. About 42 s. |
| 10.2 | More variants: longer wait, few new sources (read it off). |
| 10.3 | The variants are only in Burp (the log line gives count and lengths). With a single word they tend to drift (read it off). |
| 11.1 | Ten models in the dropdown; `lesson-07-hybrid` answers like Part 8 in about 8 s, `lesson-07-rerank` takes minutes. |
| 11.2 | `lesson-07-hybrid`, `-rerank`, `-multiquery` are missing; the WARN line names `Start Qdrant; npm run l06:1`. |
| 11.3 | Yes: the source list of `lesson-07-headings` has one entry, without changing any part file. |

### 08 – Evaluation

| | |
|---|---|
| Duration (plan) | 90 minutes: intro 5, Part 1 10, Part 2 15, Part 3 15, Part 4 10, Part 5 25, Part 6 10 |
| Run time (dress rehearsal) | Part 1 under 1 s, Part 2 4 s, Part 3 6 s, Part 4 1 s, Part 5 full 6 min 59 s, Part 6 with `--filter-first-n 1` about 22 s; judge check passed in Parts 2 and 3 |
| At the start | `git status`; check `SHOW_THINKING`, `ALL_DOCUMENTS`, `BURP_PROXY_URL` in `.env`. |
| Parts 5 and 6 in the workshop | Participants with their own GPU run the full `npm run l08:5` themselves. On slow laptops or a shared server the trainer shows the report created beforehand, and participants run only `--filter-first-n 1`. |
| Beforehand | Index `headings` (Parts 1–4), all four (Part 5); for Part 6 Qdrant, `l06:1` and `l07:11` in a second terminal (`l07:8` is enough without task 2) |
| Measured run | The result of the full Part 5 run lives only in the guide: [`lessons/08-evaluations/GUIDE.md`](../lessons/08-evaluations/GUIDE.md#measurement-run-2026-11-13) |
| Talking points | Measure search without a language model (cheap, repeatable); a judge needs a control case; faithful ≠ correct; FAIL ≠ ERROR; a black box sees only the answer; with eleven questions there is no clear winner |

| Part, task | Expected result |
|---|---|
| 1.1 | F-05 at rank 0, F-09 at rank 3, all others at rank 1 (hit ratio 0.92, MRR 0.86). |
| 1.2 | At `TOP_K` 1 hit ratio and MRR are equal. A larger k raises the hit ratio, the MRR barely. |
| 1.3 | Read the rank; delete the question afterwards (shared file). |
| 2.1 | "yes" for the real answer, "no" for the invented one, `Judge check passed`; small models fluctuate between runs. |
| 2.2 | With the protective sentences the verdict stays "no"; without them it may tip, but need not (read it off). |
| 2.3 | Yes: "not in the context" is faithful but not helpful. |
| 3.1 | F-05: the judge says "no"; the cause is the search, not the model. |
| 3.2 | Part 2 rates the honest refusal as faithful and therefore reports "Judge check FAILED" (by design); Part 3 rates it not correct. You need both measurements. |
| 3.3 | Without subsections (5 chunks) the answer names only 3 of the 7 measures of F-01; the judge rightly says "no". Cause: the search ([decisions](decisions.md#expand-sections)). Compare: F-01 in `corpus:headings` in Part 5. |
| 4.1 | Both measures "unchanged" (the search is deterministic). |
| 4.2 | The hit ratio drops sooner than the MRR; "Regression: …" as soon as a measure drops by more than `TOLERANCE`. |
| 4.3 | Warning: the runs are not comparable because the number of questions changed. |
| 5.1 | `corpus:questions` has the highest hit ratio and MRR and is the only one to find F-05 (at rank 2). `corpus:headings` matches Part 1. Numbers: measured run in the guide. |
| 5.2 | F-01 to F-03: the answer names only part of the list. In the measured run `faithful` now fails more often than `correct`. FAIL vs. ERROR: [decisions](decisions.md#eigene-faithful-pruefung). |
| 5.3 | The hit ratio can only stay or drop (top 3 ⊂ top 5). |
| 6.1 | Similar to or better than `corpus:headings`; with eleven questions the difference is small. Trial run with `--filter-first-n 1`: PASS. |
| 6.2 | With `--filter-first-n 1` only F-00 runs; it is not necessarily rejected. The trainer shows a rejection as a demo with more questions; rejected questions then fail `correct`. |
| 6.3 | `mrr` and `faithful`: the API returns neither ranks nor context. |

Further participant questions are answered in `lessons/08-evaluations/FAQ.md`.
