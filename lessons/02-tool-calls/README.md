# Lesson 02 – Tool calls

[Deutsch](README.de.md) · Explanations, expected output and pitfalls: [GUIDE.md](GUIDE.md)

**Learning goal:** You give a model knowledge it does not have: first by hand in the prompt (Parts 1 and 2), then through tools the model requests itself and your code runs (Parts 3 and 4). The lesson's name describes the goal; the first two parts lead up to it.

## Parts

| Part | File | Start | Shows | Requires |
|---|---|---|---|---|
| 1 | [`01-knowledge-and-few-shot.ts`](01-knowledge-and-few-shot.ts) | `npm run l02:1` | Roles, system prompt, few-shot (`lesson-02-part-1`) | LM Studio with a chat model, Open WebUI; Burp optional |
| 2 | [`02-web-scraping.ts`](02-web-scraping.ts) | `npm run l02:2` | A web page as context, indirect prompt injection (`lesson-02-part-2`) | like Part 1, plus internet; with Burp `BURP_CA_CERT` |
| 3 | [`03-tool-call-base.ts`](03-tool-call-base.ts) | `npm run l02:3` | Tool-call loop by hand (`lesson-02-part-3`) | like Part 1 |
| 4 | [`04-tool-calls-short.ts`](04-tool-calls-short.ts) | `npm run l02:4` | The same loop with `createAgent` (`lesson-02-part-4`) | like Part 1 |

The tasks are in the header of each file.

## Order and dependencies

- **Before:** [Lesson 01](../01-preparation/README.md). Open WebUI needs the Ollama connection to the facade.
- **Parts 1 → 4** in order. You compare Part 4 with Part 3.
- **One part at a time:** all parts use the facade port (`FACADE_PORT`) and run until you stop them with Ctrl+C.
- **Burp** is optional. If `BURP_PROXY_URL` is set, Burp must be running (Intercept off); Part 2 then needs `BURP_CA_CERT` because the web page is loaded over HTTPS ([Setting up Burp](../../README.md#setting-up-burp)).

## Further reading

- [GUIDE.md](GUIDE.md): terms, flow per part, real output, pitfalls, security notes, chat language
- [docs/production.md](../../docs/production.md): what the workshop simplifies, e.g. system prompts from Open WebUI
- [docs/architecture.md](../../docs/architecture.md): data flow across all lessons
- [docs/trainer.md](../../docs/trainer.md) (for trainers, contains solutions): preparation, timings
- Error messages: [Troubleshooting](../../README.md#troubleshooting) in the root README

Back to the [overview](../../README.md).
