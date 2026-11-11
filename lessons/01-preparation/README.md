# Lesson 01 – Preparation

[Deutsch](README.de.md)

**Learning goal:** You call a language model from TypeScript, connect it to a chat interface (Open WebUI), and see in Burp what really goes over the wire. After that, the environment is ready for all further lessons.

| Part | File | npm script | Learning goal | Requires |
| --- | --- | --- | --- | --- |
| 1 | `01-hello-llm.ts` | `npm run l01:1` | Send a prompt, stream the answer token by token | LM Studio |
| 2 | `02-open-webui.ts` | `npm run l01:2` | Offer the program as model `lesson-01-part-2` in Open WebUI (facade) | LM Studio, Open WebUI |
| 3 | `03-burp-proxy.ts` | `npm run l01:3` | Read requests and responses in Burp's HTTP history (model `lesson-01-part-3`) | LM Studio, Open WebUI, Burp |

**Order:** Start with Part 1 and work through the parts in order; each builds on the previous one. `BURP_PROXY_URL` is empty in `.env.example`, so Burp is optional. For Part 3, set `BURP_PROXY_URL=http://localhost:8080` in `.env` (Burp's default listener). Once it is set, Burp must be running (Intercept off); without Burp, leave it empty.

Setup (Node, LM Studio, `.env`, Open WebUI, Burp): see the [root README](../../README.md). Infrastructure: [`lessons/shared/README.md`](../shared/README.md).

## Key terms

- **Token:** a word fragment (about 3-4 characters); the model reads and produces text token by token.
- **Streaming:** the answer arrives piece by piece instead of all at once at the end.
- **`temperature`:** controls how random the word choice is; 0 means as repeatable as possible.
- **Ollama API facade:** a small server (port `FACADE_PORT`) that behaves like Ollama and hands every chat message to your program, so the program shows up as a model in Open WebUI.
- **Proxy (Burp):** sits between program and server and shows every HTTP request; the HTTP history also shows the `Authorization: Bearer ...` header, i.e. the API key in clear text, so redact it before sharing screenshots or project files.

## Tasks

Translated from the `Aufgabe` block at the top of each file; the file headers remain the source.

### Part 1 – `01-hello-llm.ts`

1. Change the question in `model.stream(...)` and restart.
2. Set `temperature: 1.5` on the `ChatOpenAI` object and ask the same thing several times. What changes? (`temperature` controls how random the word choice is; 0 = as repeatable as possible.)
3. Replace `model.stream` with `await model.invoke(...)` and print `.text`. When do you see the answer?

### Part 2 – `02-open-webui.ts`

1. Start the program, select `lesson-01-part-2` in Open WebUI and ask a question.
2. Change `ADVERTISED_MODEL` and reload Open WebUI. What is the model called now?
3. Add a `console.log(chatRequest.messages)` in `postApiChat`. What all does Open WebUI send along? (Open WebUI also sends its own helper requests for titles and tags; they start with `### Task:`.)

### Part 3 – `03-burp-proxy.ts`

1. Ask a question in Open WebUI and find the request in Burp's HTTP history. Where is your text?
2. In Burp, switch "Intercept on", change your question in the request and forward it. Does the model answer the changed question?
3. Try streaming: set `disableStreaming` to `false` and replace the two lines in the handler with the commented-out block below the handler. What does the answer look like in Burp now?
