# Lesson 01 – Preparation

[Deutsch](README.de.md) · Explanations, expected output and pitfalls: [GUIDE.md](GUIDE.md)

**Learning goal:** You call a language model from TypeScript, plug your program into a chat interface (Open WebUI) as a model, and see in Burp what really goes over the wire. After that, the environment is ready for all further lessons.

## Parts

| Part | File | Start | Shows | Requires |
|---|---|---|---|---|
| 1 | [`01-hello-llm.ts`](01-hello-llm.ts) | `npm run l01:1` | Send a prompt, stream the answer token by token | LM Studio with a chat model |
| 2 | [`02-open-webui.ts`](02-open-webui.ts) | `npm run l01:2` | The program as model `lesson-01-part-2` in Open WebUI (facade) | like Part 1, plus Open WebUI |
| 3 | [`03-burp-proxy.ts`](03-burp-proxy.ts) | `npm run l01:3` | Requests and responses in Burp's HTTP history (model `lesson-01-part-3`) | like Part 2, plus Burp |

The tasks are in the header of each file.

## Order and dependencies

- **Parts 1 → 3** in order; each builds on the previous one.
- **Parts 2 and 3** run until you stop them with Ctrl+C. Both use the facade port (`FACADE_PORT`), so only one runs at a time.
- **Burp** is optional. For Part 3 you set `BURP_PROXY_URL` in `.env`; once the address is set, Burp must be running (Intercept off). Without Burp, leave it empty.
- **Setup** (Node, LM Studio, `.env`, Open WebUI, Burp) is in the [root README](../../README.md#setup), connecting Open WebUI to the facade under [Connecting Open WebUI to the facade](../../README.md#connecting-open-webui-to-the-facade-from-lesson-01-part-2).

## Further reading

- [GUIDE.md](GUIDE.md): terms (token, streaming, reasoning model, facade, proxy), flow per part, real output, pitfalls
- [lessons/shared/README.md](../shared/README.md): the shared modules (facade, Burp, logging)
- [docs/architecture.md](../../docs/architecture.md): data flow across all lessons
- [docs/decisions.md](../../docs/decisions.md) and [docs/production.md](../../docs/production.md): rationale and simplifications
- [docs/trainer.md](../../docs/trainer.md) (for trainers, contains solutions): preparation, timings
- Error messages: [Troubleshooting](../../README.md#troubleshooting) in the root README

Back to the [overview](../../README.md).
