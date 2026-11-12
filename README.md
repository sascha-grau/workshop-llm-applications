# Workshop: Build LLM Applications Yourself

[Deutsch](README.de.md)

In this workshop you rebuild an LLM application in eight lessons, each made up of several small parts: from the first call to a language model, through a chat in Open WebUI, tool calls, embeddings and retrieval strategies, to a search with source citations (RAG) over the OWASP Top 10 for LLM Applications, and finally you measure how well search and answers work. Along the way you use Burp Suite to watch every request your program sends to the model. You need some JavaScript, but no TypeScript knowledge and no experience with LLM interfaces. Each part of a lesson is a file that starts with a learning goal and a task.

> **Inspiration and thanks:** This workshop is strongly inspired by the heise-conferences workshop [KI mit eigenen Daten richtig umsetzen: RAG, Embeddings und Retrieval-Architekturen bewerten und anwenden](https://heise-conferences.de/workshop/ki-mit-eigenen-daten-richtig-umsetzen-rag-embeddings-und-retrieval-architekturen-bewerten-und-anwenden-UJS49IRR2iSa5D) (in German). Special thanks to the trainer Gregor Biswanger: [YouTube](https://youtube.com/GregorBiswanger) · [LinkedIn](https://www.linkedin.com/pub/gregor-biswanger/11/420/513).

## Conventions

Documentation is available in English (README.md) and German (README.de.md). Code comments, including the learning goal and task at the top of each lesson file, are in German; every lesson README has key terms and tasks; the English ones translate the tasks from the German file headers, which stay authoritative; the chat-language notes are English-only. Identifiers, fields, and log and error messages are in English, as usual in code. Prompts to the model and chat replies in Open WebUI are German, because the source material (the German OWASP edition) is German. Error messages in the troubleshooting section are quoted in their original English wording. Where the English docs quote German text (questions to type, prompt sentences, OWASP titles), an English gloss follows in parentheses. You can chat in English, but some system prompts make the model answer in German; the READMEs of Lessons 02, 04, 07 and 08 say where to change that.

**TypeScript in five lines:** The files are TypeScript; you read them like JavaScript with a few additions.

- `: string` and anything in `<…>` are type annotations. You can ignore them when reading.
- A `!` after an expression means: "is guaranteed not to be `undefined`".
- `as const`, `type …` and `import type` change nothing at runtime.
- `keyof typeof X` means: "one of the keys of X".
- Node runs the files directly and simply strips the types.

## Prerequisites

### Tools

| Tool | Purpose | Link |
| --- | --- | --- |
| Node.js 22.19 or newer | Runs the TypeScript files directly, there is no build step (`engines` in `package.json`). | [nodejs.org/en/download](https://nodejs.org/en/download) |
| LM Studio | Local server for chat and embedding models with an OpenAI-compatible interface, default address `http://localhost:1234/v1`. | [lmstudio.ai](https://lmstudio.ai) · [Server](https://lmstudio.ai/docs/developer/core/server) · [OpenAI compatibility](https://lmstudio.ai/docs/developer/openai-compat) · [Embeddings](https://lmstudio.ai/docs/developer/openai-compat/embeddings) · [CLI `lms`](https://lmstudio.ai/docs/cli) |
| Burp Suite Community | From Lesson 01, Part 3: shows every HTTP request. Optional: without Burp, leave `BURP_PROXY_URL` in `.env` empty (see Setup). | [Download](https://portswigger.net/burp/communitydownload) · [CA certificate](https://portswigger.net/burp/documentation/desktop/external-browser-config/certificate) |
| Open WebUI | From Lesson 01, Part 2: chat interface for the parts with chat (Lesson 01 from Part 2, Lessons 02 and 07). | [openwebui.com](https://openwebui.com) · [Quick Start (Docker)](https://docs.openwebui.com/getting-started/quick-start/) |
| Qdrant | Vector database with full-text search, from Lesson 06 (and Lesson 07, Parts 8 to 11). Runs as a Docker container, see Setting up Qdrant. | [qdrant.tech](https://qdrant.tech) · [Quick Start](https://qdrant.tech/documentation/quickstart/) |
| Docker | Needed for Qdrant (Lesson 06, Lesson 07 Parts 8 to 11) and, optionally, to run Open WebUI as a container. | [Docker Desktop](https://docs.docker.com/get-started/get-docker/) · [Docker Engine (Linux)](https://docs.docker.com/engine/install/) |
| VS Code | Recommended: F5 and Code Runner are preconfigured, but the workshop works without it too. | [code.visualstudio.com](https://code.visualstudio.com) · [Code Runner](https://marketplace.visualstudio.com/items?itemName=formulahendry.code-runner) |

Burp is optional: if `BURP_PROXY_URL` is empty, the programs run directly without Burp. If it is set, Burp must be running (Intercept off). For Lesson 02, Part 2, Node then also needs Burp's CA certificate (`BURP_CA_CERT`, see Troubleshooting below).

### Setting up Burp

You only need this from Lesson 01, Part 3. A detailed guide is available [from PortSwigger](https://portswigger.net/burp/documentation/desktop/getting-started); here are the steps you need:

1. Start Burp and choose "Temporary project" and "Use Burp defaults".
2. By default the proxy listens on `127.0.0.1:8080` (Proxy, Proxy settings). This is the value you set in `BURP_PROXY_URL` (`http://localhost:8080`; it is empty by default).
3. Under Proxy, HTTP history you see every request your program sends.
4. Under Proxy, Intercept you toggle "Intercept is on/off". When it is on, Burp holds every request until you click "Forward". Open WebUI sends several requests per message: forward all of them with "Forward" and then turn Intercept off again.

Warning: Burp's history shows the `Authorization: Bearer …` header, that is, the API key in plain text. Do not share Burp screenshots or project files without redacting it first.

### Models

All models run in LM Studio on one server. The table lists the model card, a GGUF package for LM Studio (GGUF is the file format of the models) and the license.

| Model | Used for | Model card | GGUF | License |
| --- | --- | --- | --- | --- |
| Qwen3.5-4B (Q4_K_M) | Chat model, Lessons 01 to 02, Lesson 04 Part 4, Lesson 06 Parts 5 to 7, Lesson 07 and Lesson 08 Parts 2, 3, 5 and 6 | [lmstudio-community/Qwen3.5-4B-GGUF](https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF) | [lmstudio-community](https://huggingface.co/lmstudio-community/Qwen3.5-4B-GGUF) | Apache-2.0 |
| multilingual-e5-base (Q8_0) | Embedding model, Lessons 03 to 08 | [dinab/multilingual-e5-base-Q8_0-GGUF](https://huggingface.co/dinab/multilingual-e5-base-Q8_0-GGUF) | [dinab (community)](https://huggingface.co/dinab/multilingual-e5-base-Q8_0-GGUF) | MIT |
| EmbeddingGemma 300m (QAT Q4_0) | Comparison model, only Lesson 03, Parts 2 and 3 | [lmstudio-community/embeddinggemma-300m-qat-GGUF](https://huggingface.co/lmstudio-community/embeddinggemma-300m-qat-GGUF) | [lmstudio-community](https://huggingface.co/lmstudio-community/embeddinggemma-300m-qat-GGUF) | Gemma Terms of Use |

`Q4_K_M`, `Q8_0` and `QAT Q4_0` name how strongly a model is compressed (quantized): the number is roughly the bits per weight, so `Q4` is smaller and slightly less precise than `Q8`; QAT means the model was trained with the compression in mind, which loses less quality.

The original model card of EmbeddingGemma ([google/embeddinggemma-300m](https://huggingface.co/google/embeddinggemma-300m)) is gated: you have to sign in to Hugging Face and accept the terms. The GGUF in the table is not gated, you can download it directly. The E5 GGUF comes from a community account (dinab), not from the model's authors: it is a conversion of [intfloat/multilingual-e5-base](https://huggingface.co/intfloat/multilingual-e5-base). The Qwen GGUF comes from lmstudio-community; it is a conversion of [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B).

### Setting up LM Studio

1. Install LM Studio and download the three models from the table (in the app via search, or with `lms get`). If you only do Lessons 01 and 02, you only need the chat model.
2. Load the models (chat model, E5 and, for Lesson 03, Parts 2 and 3, EmbeddingGemma) in LM Studio. In the Developer tab you see an identifier for each loaded model.
3. Start the server in the Developer tab (or with `lms server start`). It listens on port 1234, the address is `http://localhost:1234/v1`.
4. Enter the identifiers in `.env` (see Setup). Write them exactly as LM Studio shows them (Developer tab or `lms ls`). The values in `.env.example` are only placeholders and may not match your identifiers (see below).

All three model names in `.env.example` are placeholders. Copy the identifier that LM Studio shows for the loaded model: with `lms ps` ([docs](https://lmstudio.ai/docs/cli/local-models/ps)), with `lms ls` ([docs](https://lmstudio.ai/docs/cli/local-models/ls)) or from `GET /v1/models` ([docs](https://lmstudio.ai/docs/developer/openai-compat/models)). By default, LM Studio loads models itself on the first request (JIT loading, see [TTL and Auto-Evict](https://lmstudio.ai/docs/developer/core/ttl-and-auto-evict)). The first response then takes longer, and the model only appears in `lms ps` afterwards.

Another OpenAI-compatible server works too, as long as it offers chat and embeddings at the same address.

**Cost note for paid APIs:** the programs set no `maxTokens`, so a paid provider bills whatever length the model produces, and reranking (Lesson 06, Part 5; Lesson 07, Part 9) sends several chat requests in parallel for each question. That is free on a local server but costs money with a paid API: set a spending limit first.

### Hardware

The numbers are rules of thumb. Plan for memory (RAM, or VRAM with a graphics card) of roughly the file size plus some room for the context.

| Model | File size | RAM requirement (rule of thumb) |
| --- | --- | --- |
| Qwen3.5-4B (Q4_K_M) | 2.71 GB | about 4 to 6 GB |
| multilingual-e5-base (Q8_0) | 0.30 GB | under 1 GB |
| EmbeddingGemma 300m (QAT Q4_0) | 0.23 GB | under 1 GB |

The chat model is small enough for most laptops. Small models do answer less well, though, especially for tool calls (Lesson 02, Parts 3 and 4).

### Setting up Qdrant

From Lesson 06 you need a running Qdrant (a vector database). Start it once as a Docker container:

```bash
docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.20.0
```

`127.0.0.1:` on purpose: with a plain `-p 6333:6333` Docker publishes the port on all network interfaces and bypasses the host firewall. This Qdrant has no authentication, so others on the workshop Wi-Fi could read or poison your collection. The version is pinned because it matches the client version (1.20); the BM25 full-text index of Lesson 06 needs a current Qdrant. Later `docker start qdrant` is enough. The address is `QDRANT_URL` in `.env` (default `http://localhost:6333`).

### Starting Open WebUI

If you run Open WebUI as a container, this command starts it (Linux needs the `--add-host` option so the container can reach your machine; on macOS and Windows it is harmless):

```bash
docker run -d --name open-webui -p 127.0.0.1:3000:8080 --add-host=host.docker.internal:host-gateway -v open-webui:/app/backend/data ghcr.io/open-webui/open-webui:v0.13.3
```

Open `http://localhost:3000` and create the admin account on the first login (the first account becomes the administrator; the data stays on your machine in the `open-webui` volume). Port 3000 on purpose: Burp's default listener already uses 8080 (see Troubleshooting). Later `docker start open-webui` is enough. Without Docker: `open-webui serve --port 3000` ([Quick Start](https://docs.openwebui.com/getting-started/quick-start/)). The version is pinned so the UI matches these instructions; newer versions may move menu items.

### Variant: trainer server

If the trainer runs LM Studio on a powerful machine, you do not need any models yourself. The trainer turns on "Serve on Local Network" in LM Studio (or starts `lms server start --bind 0.0.0.0`, see [docs](https://lmstudio.ai/docs/developer/core/server/serve-on-network) and [server settings](https://lmstudio.ai/docs/developer/core/server/settings)). In `.env` you set `REMOTE_MODEL_BASE_URL=http://<trainer-IP>:1234/v1` and the identifiers the trainer gives you. Only the model server then lives with the trainer. The facade (`FACADE_HOST`, `FACADE_PORT`) and Burp keep running on your own machine. Warning: the server is then reachable by everyone on the network, and prompts as well as an API key travel unencrypted over HTTP. Use this only on a network you trust, and stop sharing after the workshop.

## Setup

First check your Node version, it must be at least 22.19:

```bash
node --version
```

Then install the packages and create your `.env`:

```bash
npm ci
cp .env.example .env
```

`npm ci` installs exactly the versions in `package-lock.json` and checks their integrity. Use `npm install` only when you want to change dependencies.

> **Known dependency advisories (`npm audit`):** `npm audit` still reports 4 findings (`langsmith` up to 0.5.26, `zod` below 4.6.6 (here 3.25) and `uuid` below 11.1.1). They come only through `ollama-api-facade-js` 1.0.7, the latest version and the one the workshop pins, which depends on `@langchain/core` 0.3. No compatible fix exists: fixing it needs major version bumps that break the facade, so `npm audit fix` changes nothing here, and you should never run `npm audit fix --force`. We accept them because the exposure is low: the facade only runs on localhost, LangSmith tracing is off (do not set any `LANGSMITH_*` or `LANGCHAIN_TRACING*` variables, also check your shell profile), and the affected functions are not reachable in the workshop. `package.json` additionally pins fixed versions of `langsmith`, `zod` and `undici` via `overrides` where that is compatible. This is a real example of a trade-off in the supply chain (see [LLM03](content/owasp-genai-top-10/03-llm03-lieferkette.md), in German).

On Windows you copy the template like this: `copy .env.example .env` (cmd) or `Copy-Item .env.example .env` (PowerShell). The commands in this README are otherwise written for a POSIX terminal (Linux, macOS, Git Bash). `npm run …` works the same everywhere.

Then open `.env` and adapt the values to your environment: the identifiers of the loaded models from LM Studio, the server address if needed, the Burp port and the API key. Every entry is explained in `.env.example`. The `.env` file is in `.gitignore` and is not checked in.

**With and without Burp:** `BURP_PROXY_URL` is empty in `.env.example`: no proxy, all programs connect directly, and you do not need `BURP_CA_CERT` either. For Lesson 01, Part 3 you opt in and set `BURP_PROXY_URL=http://localhost:8080`. If the address is set and Burp is not running, the programs that use Burp (from Lesson 01, Part 3, except `l04:0`) abort with a Burp message.

The settings at a glance:

| Key | Meaning |
| --- | --- |
| `REMOTE_MODEL_BASE_URL` | Address of the server with `/v1`, for chat and embeddings (LM Studio: `http://localhost:1234/v1`). |
| `REMOTE_MODEL_API_KEY` | Only needed if the server requires a key. LM Studio does not. |
| `REMOTE_MODEL_NAME` | Identifier of the chat model from LM Studio. |
| `SHOW_THINKING` | Optional: `true` shows the thinking of reasoning models (`<think>…</think>`) everywhere instead of hiding it. Empty or `false` is the default. With `true`, the grading in Lesson 08 becomes unreliable. |
| `ALL_DOCUMENTS` | Optional: `true` shows the detail output of Lesson 04, Parts 1 to 3 for all documents (output only, never the index). Overrides the constant in `chunking.ts`; empty means the constant applies. |
| `REMOTE_EMBEDDING_MODEL_NAME` | Identifier of the E5 model. |
| `REMOTE_EMBEDDING_GEMMA_MODEL_NAME` | Identifier of EmbeddingGemma, only for Lesson 03, Parts 2 and 3. |
| `BURP_PROXY_URL`, `BURP_CA_CERT` | Burp proxy and its certificate. Optional: `BURP_PROXY_URL` is empty by default (no proxy), set it to `http://localhost:8080` for Lesson 01, Part 3. |
| `QDRANT_URL` | Address of Qdrant from Lesson 06 on. Default `http://localhost:6333`. |
| `FACADE_HOST`, `FACADE_PORT` | Where the Ollama facade listens. Lesson 08, Part 6 (promptfoo) sends its test questions to this address. |

## Running a program

The workshop consists of eight lessons, each with several parts. Each part is a file that starts with a comment stating the learning goal, prerequisites, start command and task (in German). Full demos are named `99-full-demo.ts` so they stay last when parts are added; they run with the lesson's last npm script (`l05:5`, `l06:7`, `l07:11`). There are three ways to run them:

| Way | How |
| --- | --- |
| npm script | `npm run l01:1` (Lesson 01, Part 1), `npm run l01:2` and so on. The script names are in the overview below. |
| VS Code, F5 | Open the file and press F5 (`.vscode/launch.json`, configuration "Run current file"). Here you can set breakpoints. This works only for `.ts` files; with `.env` or a YAML file open, Node tries to run that file and fails. For the promptfoo configurations of Lesson 08 (Parts 5 and 6), select the configuration "promptfoo: current config" once under Run and Debug, then press F5. |
| Code Runner | Install the extension `formulahendry.code-runner` (VS Code suggests it), then start the file with the play button (`.vscode/settings.json`). |

You do not have to start from a particular folder: all paths are resolved from the repo root (`lessons/shared/paths.ts`). Only `.env` is loaded relative to the working directory (npm scripts) or from the workspace folder (VS Code). So start the scripts in the repo root. The parts with chat run until you stop them with Ctrl+C. `npm run typecheck` checks the types, but is not needed for the lessons.

## Connecting Open WebUI to the facade (from Lesson 01, Part 2)

You only need this from Lesson 01, Part 2, after Setup. The parts with chat (Lesson 01 from Part 2, Lesson 02 and Lesson 07) start a small server, the facade. To Open WebUI it behaves like an Ollama server and passes every chat message on to the program. By default it listens on `127.0.0.1:11435` (`FACADE_HOST`, `FACADE_PORT`). Not Ollama's default port 11434, so that a real Ollama can run alongside.

1. Start the part. The log shows `Facade ready` with the address.
2. In Open WebUI, open the Admin Panel, then Settings, then Connections ("Admin Panel → Settings → Connections"), and add an **Ollama** connection with the address of the facade, e.g. `http://127.0.0.1:11435`.
3. The part appears as a model (`lesson-01-part-2`, `lesson-01-part-3`, `lesson-02-part-1` to `lesson-02-part-4`, `lesson-07-headings`, `lesson-07-semantic`, `lesson-07-questions` and so on; the full list of model names is in [`lessons/07-rag-open-webui/README.md`](lessons/07-rag-open-webui/README.md)). Select it in the chat.

If Open WebUI runs in Docker, the container cannot reach your machine's `127.0.0.1`. In that case set `FACADE_HOST=0.0.0.0` in `.env` and enter `http://host.docker.internal:11435` in Open WebUI (port as in `FACADE_PORT`; Podman: `host.containers.internal`). On Linux the container must be started with `--add-host=host.docker.internal:host-gateway` for this. With `0.0.0.0` the facade is reachable by everyone on the network, and it has no authentication: use this only on a network you trust. On Linux with Docker there is a narrower option: use the IP of the Docker bridge (usually `172.17.0.1`, shown by `ip addr show docker0`) as `FACADE_HOST` instead of `0.0.0.0`.

## The lessons

Each lesson has a folder with its own `README.md`: it contains the learning goal, the parts with their files and a recommended order.

| Lesson | Parts and scripts | Learning goal | Requires |
| --- | --- | --- | --- |
| [01 – Preparation](lessons/01-preparation/README.md) | Part 1 `l01:1` (Hello LLM), Part 2 `l01:2` (Open WebUI), Part 3 `l01:3` (Burp) | You send a prompt to a language model, put a chat interface in front of it and see every request in Burp. | LM Studio (chat model); from Part 2 Open WebUI; Part 3 Burp |
| [02 – Tool calls](lessons/02-tool-calls/README.md) | Part 1 `l02:1` (knowledge and few-shot), Part 2 `l02:2` (web scraping), Part 3 `l02:3` (tool calls by hand), Part 4 `l02:4` (tool calls with `createAgent`) | First you give the model knowledge by hand (Parts 1 and 2), then you let it fetch what it needs itself through a tool call (Parts 3 and 4). | LM Studio (chat model), Open WebUI, Burp optional; Part 2 internet |
| [03 – Embeddings](lessons/03-embeddings/README.md) | Part 1 `l03:1`, Part 2 `l03:2`, Part 3 `l03:3` | You create embeddings, compare texts with cosine similarity and see what the prefixes `query: ` and `passage: ` are for. | LM Studio (E5 model, from Part 2 also EmbeddingGemma), Burp optional |
| [04 – Chunking](lessons/04-chunking/README.md) | Part 0 `l04:0` (create chunks), Parts 1 to 4 `l04:1` to `l04:4` (four ways of cutting and building indexes), Part 5 `l04:5` (parent document) | You split documents into chunks that fit E5's token limit, build indexes from them and see how the way of cutting changes the search. | LM Studio (E5 model, Part 4 also chat model), Burp optional; from Part 1 the chunks from Part 0; Part 5 the index from Part 2 |
| [05 – Retrieval strategies](lessons/05-retrieval-strategies/README.md) | Part 1 `l05:1` (top-k), Part 2 `l05:2` (MMR), Part 3 `l05:3` (metadata filter), Part 4 `l05:4` (score threshold), Part 5 `l05:5` (all compared, with a question set in `question-set.json`) | You compare four rules by which the search selects chunks, see why access rights are filtered before the search, and check the score threshold against a set of test questions (Part 5). | LM Studio (E5 model), Burp optional, index from Lesson 04, Part 2; no chat model, no Open WebUI |
| [06 – Hybrid search and reranking](lessons/06-hybrid-rerank/README.md) | Part 1 `l06:1` (load collection), Part 2 `l06:2` (keywords, BM25), Part 3 `l06:3` (vector search), Part 4 `l06:4` (hybrid with RRF), Part 5 `l06:5` (reranking), Part 6 `l06:6` (multi-query), Part 7 `l06:7` (all compared) | You load the index into Qdrant, search with keywords and vectors, combine both with RRF and see what reranking and multi-query add. | LM Studio (E5 model, from Part 5 also chat model), Qdrant, Burp optional, index from Lesson 04, Part 2; no Open WebUI |
| [07 – RAG](lessons/07-rag-open-webui/README.md) | Parts 1 to 3 `l07:1` to `l07:3` (headings, semantic, generated questions), Parts 4 to 10 `l07:4` to `l07:10` (parent document, MMR, metadata filter, score threshold, hybrid, rerank, multi-query), Part 11 `l07:11` (all in one facade) | You answer questions with source citations by searching for matching chunks and giving them to the model as context (RAG; the code appends the source list). | LM Studio (chat and E5 model), Open WebUI, Burp optional, index from Lesson 04, Part 2, 3 or 4 respectively; Parts 8 to 11 also Qdrant with the collection from `l06:1` |
| [08 – Evaluations](lessons/08-evaluations/README.md) | Part 1 `l08:1` (hit ratio and MRR), Part 2 `l08:2` (faithfulness with an LLM judge), Part 3 `l08:3` (correctness against an expected key point), Part 4 `l08:4` (regression: compare with the previous run), Part 5 `l08:5` (promptfoo: compare chunking strategies), Part 6 `l08:6` (promptfoo: black-box test of the running facade) | You measure instead of judging by eye: the search against a set of test questions, without a language model (cheap, repeatable), an answer's faithfulness to its context with a language model as judge, without a reference answer, and its correctness against the expected key point; every run of the search measurement is saved and compared with the previous one; promptfoo compares the chunking strategies in one table and tests the running facade as a black box. | LM Studio (E5 model, Parts 2, 3, 5 and 6 also chat model), Burp optional, index from Lesson 04, Part 2; Part 5 also the indexes from `l04:1` to `l04:4`, Part 6 also Qdrant and the facade from Lesson 07 (`npm run l07:11`); no Open WebUI |

Lesson 02 is called "Tool calls" because that is what it builds up to: Parts 1 and 2 bring knowledge into the prompt by hand (fixed facts, a fresh web page), after which the model fetches what it needs itself in Parts 3 and 4.

Burp is used from Lesson 01, Part 3, but optional: if `BURP_PROXY_URL` is set, Burp must be running (Intercept off). Lesson 02, Part 2 additionally needs the internet because it fetches a web page, and, if `BURP_PROXY_URL` is set, also `BURP_CA_CERT`, because that page is served over HTTPS.

Lesson 04, Part 0 creates the chunks (roughly 350 to 760 requests to the embedding endpoint, depending on the counting method; the duration depends on your hardware, see the file header). Create them first with `npm run l04:0`. Parts 1 to 4 require them (Part 5 only reads the index from Part 2); Parts 1 to 4 write the indexes to `indexes/` (listed in `.gitignore`, created on the first run). Lesson 05 reads the index from `l04:2` (headings) in all five parts, and so do Parts 1 to 4 of Lesson 08 (Part 5 needs all four indexes, Part 6 the Qdrant collection). Lesson 07 has three basic variants, each reading a different index: `l07:1` the one from `l04:2` (headings), `l07:2` the one from `l04:3` (semantic), `l07:3` the one from `l04:4` (generated questions); Parts 4 to 7 use the index from `l04:2`, Parts 8 to 11 the Qdrant collection from `l06:1`. So start the matching part of Lesson 04 first. Note for `l07:3`: by default (`FULL_CORPUS = false` in `lessons/04-chunking/04-question-generation-chunking.ts`) the question index from `l04:4` covers only `01-llm01-prompt-injection.md`, so `l07:3` only answers questions about that. For the whole corpus, set `FULL_CORPUS = true` and rerun `l04:4` (many minutes). All parts of Lesson 07 share the facade's port, so only one runs at a time.

## Troubleshooting

A program prints errors as a single line in English.

**How to read an error line:** the text before `– Cause:` says what failed, the text after it says why. For network errors the cause is a chain. Example:

```text
ERROR Model: Call failed – Cause: Connection error. – fetch failed – connect ECONNREFUSED 127.0.0.1:1234 { model: '...', durationMs: 11 }
```

Here the model call failed because no connection could be made: nobody is listening on `127.0.0.1:1234` (LM Studio server not started or wrong `REMOTE_MODEL_BASE_URL`). If the Burp port (e.g. `127.0.0.1:8080`) appears there instead, Burp is not running. With `DEBUG` set, the stack trace is added. On Linux, macOS and Git Bash: `DEBUG=1 npm run l01:3`. In PowerShell: `$env:DEBUG=1; npm run l01:3`. In the command prompt (cmd): `set DEBUG=1 && npm run l01:3`.

| Message or symptom | Cause and fix |
| --- | --- |
| `bad option: --env-file-if-exists` or `ERR_UNKNOWN_FILE_EXTENSION ".ts"` | Your Node version is too old. Check with `node --version` and install Node 22.19 or newer. |
| `Burp is not running at http://localhost:8080 – start Burp or clear BURP_PROXY_URL in .env.` | Burp is not started or listens on a different address. Start Burp and check the listener under Proxy, Proxy settings. Without Burp: clear `BURP_PROXY_URL` in `.env`. |
| `<label>: The request through Burp failed or timed out. Check the listener and turn Intercept off.` | Burp is running, but Intercept is on and holding the request. Turn Intercept off (Proxy, Intercept is off). |
| `Something other than Burp answers at http://localhost:8080 (HTTP <status>). Is Open WebUI or another server using that port? Move one of them or fix BURP_PROXY_URL in .env.` | Open WebUI (without Docker, `open-webui serve`) also listens on port 8080, like Burp's default listener and `BURP_PROXY_URL`. The Burp check requests `/models` through the proxy and detects that the answer does not come from Burp, provided the model server is directly reachable. If it is not, you see the message "unreachable or timed out" instead (see below). Move one of the two: e.g. `open-webui serve --port 3000`, or change the Burp listener (Proxy, Proxy settings) and `BURP_PROXY_URL` in `.env`. |
| `<label>: The connectivity check returned HTTP 401. Check the model server and API key.` (or 502) | The server rejects the request, e.g. because of a wrong API key. This also applies with `BURP_PROXY_URL` set: if the path through Burp does not answer with a valid `/models` list, the program checks once directly (`Model API directly`) and reports that error. Check the address and API key in `.env`. For the actual model call (`Model: Call failed`), the cause starts with the HTTP status, e.g. `401 ...`. |
| `<label>: The model server is unreachable or timed out. Check the address and start the server.` or `Model: Call failed – Cause: Connection error. ...` | No connection could be made: the LM Studio server is not started (Developer tab, or `lms server start`) or the address in `REMOTE_MODEL_BASE_URL` is wrong. |
| Model not found (HTTP 404 or 400 in the cause) | `REMOTE_MODEL_NAME` or `REMOTE_EMBEDDING_MODEL_NAME` does not match the identifier on the server, or the model is not loaded. Look for `404` or `400` and the model name in the cause. Load the model and copy the identifier from `lms ps`, `lms ls` or `<BASE_URL>/models`. |
| `The setting REMOTE_MODEL_NAME is missing from .env (template: .env.example).` | A required setting is missing. Compare `.env` with `.env.example`. |
| `The setting REMOTE_EMBEDDING_MODEL has been replaced. Set REMOTE_EMBEDDING_MODEL_NAME in .env (template: .env.example).` | Your `.env` is older. Rename `REMOTE_EMBEDDING_MODEL` to `REMOTE_EMBEDDING_MODEL_NAME` (template: `.env.example`). |
| `REMOTE_EMBEDDING_MODEL_API_KEY is no longer used: chat and embeddings now use REMOTE_MODEL_API_KEY. Remove the old entry from .env.` (similar for `..._BASE_URL`) | The old key is still in `.env` and differs from the new one. Delete it. |
| `The setting BURP_PROXY_URL must be a valid HTTP or HTTPS URL.` | The address is not a valid URL. It must start with `http://` or `https://`, e.g. `http://localhost:8080`. This also applies to `REMOTE_MODEL_BASE_URL`. |
| `FACADE_PORT 11435 is in use. Stop the other lesson or change FACADE_PORT in .env and the Ollama connection in Open WebUI.` | Another lesson or a real Ollama is still running on the port. Stop it with Ctrl+C or pick a different port and enter it in Open WebUI too. |
| `BURP_CA_CERT is missing for HTTPS through Burp. Export Burp’s CA certificate as DER and convert it with openssl x509 -inform der -in burp.der -out burp.pem. Set BURP_CA_CERT=burp.pem or clear BURP_PROXY_URL in .env.` (Lesson 02, Part 2) | Lesson 02, Part 2 fetches an HTTPS page through Burp, and for that Node needs Burp's CA certificate. Export: in Burp, Proxy, Proxy settings, Import / export CA certificate, Certificate in DER format, save as `burp.der`. Then run `openssl x509 -inform der -in burp.der -out burp.pem` in the repo root and set `BURP_CA_CERT=burp.pem` in `.env` (path relative to the repo root). On Windows, Git for Windows ships `openssl`: start Git Bash (or call `openssl.exe` from the `usr\bin` folder of the Git installation). Do not install the certificate in the operating system or browser: the file is enough, only this program trusts it. If you did install it, remove it again after the workshop. Or clear `BURP_PROXY_URL`. |
| `Cannot read BURP_CA_CERT: ... Check the path and read permissions.` | Wrong path or no read permission. The path is relative to the repo root. |
| `Prepared chunks are missing. Generate them with npm run l04:0.` (Lesson 04, Parts 1 to 4) | The chunks are not in the repo, they are generated. Run `npm run l04:0` once (E5 must be loaded in LM Studio). |
| `Cannot load index ... (headings). Generate it with npm run l04:0, then npm run l04:2.` (Lesson 04 Part 5, Lessons 05, 07 and 08) | The index is missing. Run `l04:0` first and then the script named (for Lesson 04 Part 5 and Lessons 05 and 08 always `l04:2`; for Lesson 07 `l04:2`, `l04:3` or `l04:4`, depending on the file). |
| `The index <file> is invalid or outdated. Regenerate the chunks with npm run l04:0, then regenerate the index with npm run l04:N.` or `The chunk manifest is invalid or outdated. Regenerate the chunks with npm run l04:0.` | The file comes from an older version of the program. First regenerate the chunks, then the index, using the script from the message. |
| `Cannot load the question index <file>. Check the file and QUESTIONS_PER_CHUNK, or regenerate it with npm run l04:0 followed by npm run l04:4.` (Lesson 04, Part 4 only) | The question index file does not match `QUESTIONS_PER_CHUNK` or is damaged. Regenerate it with `l04:4` (delete it first). In Lesson 07, Part 3, by contrast, a missing index shows as `Cannot load index ... (questions). Generate it with npm run l04:0, then npm run l04:4.` (see the row above). |
| `The embedding request failed. Check REMOTE_MODEL_BASE_URL, start the LM Studio server and load the model configured in REMOTE_EMBEDDING_MODEL_NAME.` (Lesson 04, Part 0) | The LM Studio server is not running, the address is wrong, or the E5 model is not loaded. For 401, 403, 404 and 429 the status is in the cause after `– Cause:`. A rejection because the input is too long does not count as an error, the program needs it for counting. If the server rejects only the long calibration probe with a different status, the program warns (`No reliable token count: The long calibration probe was rejected (HTTP <status>)…`) and continues with the character estimate. |
| `Qdrant is not reachable at http://localhost:6333/. Start it (docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.20.0) or fix QDRANT_URL in .env.` (Lesson 06, Lesson 07 Parts 8 to 11) | Qdrant is not running or `QDRANT_URL` is wrong. Start it as described in Setting up Qdrant (`docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.20.0`, or `docker start qdrant`). The address in the message is your `QDRANT_URL`. |
| `The Qdrant collection <name> does not exist. Load it with npm run l06:1.` (Lesson 06 Parts 2 to 7, Lesson 07 Parts 8 to 11) | Qdrant runs, but the collection has not been loaded yet (or you started a fresh container). Run `npm run l06:1`; it needs the index from `l04:2` (and `l04:3`, `l04:4` if you want those variants). |
| Open WebUI does not show the model | Is the program running (log `Facade ready`)? Is the address in the Ollama connection correct? For Docker see `host.docker.internal` above. If the log shows `Rejected request with unexpected Host header`, see the row below. |
| `Rejected request with unexpected Host header. Use localhost, an IP address, host.docker.internal or the FACADE_HOST name in the Open WebUI connection.` (HTTP 403) | The Ollama connection in Open WebUI contains a hostname (e.g. `my-laptop.local`). The facade rejects foreign hostnames as protection against DNS rebinding. Enter `localhost`, an IP address or `host.docker.internal` (Podman: `host.containers.internal`), or set the name as `FACADE_HOST`. |
| Response breaks off in Open WebUI | The model was too slow, or you pressed Stop. A cancellation shows as `Request cancelled.` in the log. If the model was too slow: try again or use a smaller model (see Hardware). |

## Repository layout

| Path | Contents |
| --- | --- |
| `lessons/01-…` to `lessons/08-…` | The lessons, one folder each with a `README.md` and one file per part (with learning goal and task). |
| `lessons/shared/` | Shared modules (settings, logging, proxy, facade, embeddings, index, `text.ts` for JSON clean-up). Described in `lessons/shared/README.md`. |
| `content/owasp-genai-top-10/` | The OWASP documents as Markdown (German edition); `npm run l04:0` creates `chunks/`. |
| `lessons/04-chunking/00-prepare-chunks.ts` | Creates the chunks with `npm run l04:0`. |
| `lessons/05-retrieval-strategies/question-set.json` | Test questions with expected source documents, used by `npm run l05:5` to check the score threshold, by `npm run l08:1` to measure hit ratio and MRR, by `npm run l08:3` for the expected key points (correctness), and by `npm run l08:5` and `l08:6` (promptfoo). |
| `lessons/06-hybrid-rerank/` | Hybrid search and reranking on Qdrant (needs the container from Setting up Qdrant). |
| `lessons/08-evaluations/` | Measuring search (hit ratio, MRR) and answers (faithfulness and correctness with an LLM judge), regression comparison and promptfoo configs (Parts 4 to 6); reads the question set from Lesson 05. |
| `indexes/` | Created in Lesson 04 (chunks with vectors as JSON), not in the repo. |
| `results/` | Created in Lesson 08: Part 4 saves measurement runs as JSON, Parts 5 and 6 write HTML reports; not in the repo. promptfoo also keeps its runs under `~/.promptfoo/` (see Lesson 08). |
| `.env.example` | Template for your `.env`. |
| `.vscode/` | Launch configuration (F5) and Code Runner settings. |

## License

The code is under the MIT License (see `LICENSE`; `package.json` refers to it with `SEE LICENSE IN LICENSE`). The directory `content/owasp-genai-top-10/` is excluded: its content comes from the OWASP Top 10 for LLM Applications (OWASP GenAI Security Project, OWASP Foundation) and is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (see also the [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/)). This also applies to the chunks derived from it, which `npm run l04:0` creates in `chunks/` (they are not in the repo). Anyone who redistributes or modifies them must credit the source, indicate changes and pass them on under the same license. The sponsor logos in `content/owasp-genai-top-10/assets/appendix-projektsponsoren.png` are trademarks of their owners and are not covered by CC BY-SA 4.0. The original is available as a PDF from OWASP: [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/). Details are in `content/owasp-genai-top-10/README.md`.
