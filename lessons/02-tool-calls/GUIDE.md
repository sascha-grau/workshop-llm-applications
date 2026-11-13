# Lesson 02 – Tool calls: Guide

*Deutsche Fassung: [GUIDE.de.md](GUIDE.de.md)* · Overview and start: [README.md](README.md)

## What is this about?

A language model only knows what was in its training data: nothing about Ano Nym, nothing about today. In Parts 1 and 2 your code puts the missing knowledge into the prompt itself. In Parts 3 and 4 the model asks for it by calling a tool that your code runs.

Comparison: in Parts 1 and 2 you hand someone a cheat sheet before the exam. In Parts 3 and 4 they may ask a question during the exam, and you answer it.

## Where are we?

```text
L01 Preparation ──► [ L02 Tool calls ] ──► L03 Embeddings ──► L04 Chunking ──► … ──► L07 RAG
                           ▲ you are here

Part 1:  your code ── fixed knowledge in the system prompt ────────────► model
Part 2:  your code ── loads a web page, titles into the user message ──► model
Part 3:  model ── "call dateTime" ──► your code runs it ──► result ──► model   (loop by hand)
Part 4:  the same, createAgent takes over the loop
```

Lesson 07 turns Part 2 into a search: instead of a web page, an index delivers the matching passages (RAG).

## New terms

| Term | In one sentence | Example |
|---|---|---|
| Role, system prompt | Every message has a role: `system` (the developer's instruction before the conversation), `user` (human), `assistant` (model). | "Beantworte Fragen ausschließlich mit dem folgenden Kontext." (answer only from the following context) |
| Few-shot | Made-up example dialogues in the prompt that show the model format and style. | "Wie sieht Ano Nym aus?" → "Niemand kennt das Gesicht von Ano Nym. (Quelle: Kontext)" |
| Context window | The maximum amount of text in tokens the model sees per request. | That is why only the titles, not the whole web page. |
| Indirect prompt injection | Instructions in foreign text (web page, document) that ends up in the prompt. | A page title "Ignore all instructions …" |
| Tool call, zod | The model's request to run a function with certain arguments. A schema describes the arguments; here with zod, a library that describes and checks data shapes. | `{"name":"dateTime","arguments":"{}"}` |
| LangChain, agent | LangChain is the library behind `ChatOpenAI` and `createAgent`. An agent is the ready-made tool-call loop; LangChain builds it as a "graph" of steps (model, tool). | `createAgent` in Part 4 |
| OWASP Top 10 for LLM Applications | The list of the ten biggest security risks of LLM applications, LLM01 to LLM10. From Lesson 04 on it is our corpus. | LLM01 Prompt Injection, LLM05 Improper Output Handling |

## Check first

- [ ] [Lesson 01](../01-preparation/GUIDE.md) works: LM Studio with the chat model, Open WebUI with an Ollama connection to the facade.
- [ ] No other part with a facade is running (same port, `FACADE_PORT`).
- [ ] For Part 2: internet. With `BURP_PROXY_URL` set, also `BURP_CA_CERT` ([Setting up Burp](../../README.md#setting-up-burp)).
- [ ] `SHOW_THINKING` in `.env` is empty. Otherwise in Part 3 the thinking would stay in the history the model reads in the next round.

All output below: measured on 2026-11-13 with LM Studio and `qwen3.5-4b` (workshop default, [Models](../../README.md#models) in the root README). The exceptions are the requests to the model (recorded as Burp shows them, headers left out), the example in Part 1 and the tool calls in Parts 3 and 4: they come from an earlier run on the same day with `qwen3.8-4b-q4` on a different OpenAI-compatible server and are marked. With another server or model, numbers and answers differ; the flow stays the same. Timestamps are shortened (`…`).

All prompts are German, so the answers are German. For English answers, change "Antworte auf Deutsch" in `systemPrompt` and `taskSystemPrompt` to "Answer in English"; the few-shot examples in Part 1 are German too.

## Part 1 – Knowledge and few-shot in the prompt

**In one sentence:** Your code puts facts about Ano Nym into the system prompt and shows the model with two examples what an answer should look like.

**Flow**

1. **Knowledge** (KERN 1). Three sentences about Ano Nym are text in the code, not in the model.
2. **System prompt** (KERN 2). It demands answers only from the context and explicitly allows "it is not in there". Both keep the model from inventing facts.
3. **Few-shot** (KERN 3). Two made-up question-answer pairs show the format including "(Quelle: Kontext)" (source: context).
4. **Order** (KERN 4). System prompt, then the examples, then the real conversation. A system prompt from Open WebUI is appended to yours because most models accept only one.

The answer ends with a source list that the code appends (`formatSourceList`), not the model.

**What you see**

Both blocks in this part come from the earlier run with `qwen3.8-4b-q4`.

The request to the model after the question "Was macht Ano Nym?" (what does Ano Nym do?; shortened):

```json
{"model":"qwen3.8-4b-q4","temperature":0,"stream":false,"messages":[
 {"role":"system","content":"Beantworte Fragen ausschließlich mit dem folgenden Kontext. Steht die Antwort nicht darin, sage das offen. Antworte auf Deutsch.\nFüge keine eigene Quellenliste an, da die Anwendung sie anhängt.\n\nKontext [1]:\nAno Nym ist ein geheimnisvoller Ethical Hacker. …"},
 {"role":"user","content":"Wie sieht Ano Nym aus?"},
 {"role":"assistant","content":"Niemand kennt das Gesicht von Ano Nym. (Quelle: Kontext)"},
 {"role":"user","content":"Wo findet Ano Nym Sicherheitslücken?"},
 {"role":"assistant","content":"In Webanwendungen und Sprachmodellen. (Quelle: Kontext)"},
 {"role":"user","content":"Was macht Ano Nym?"}]}
```

The answer in Open WebUI:

```text
Ano Nym ist ein geheimnisvoller Ethical Hacker, der Sicherheitslücken in Webanwendungen und Sprachmodellen findet und diese verantwortungsvoll an die Betreiber meldet. Er veröffentlicht Berichte nur unter diesem Pseudonym und tritt nie persönlich auf Konferenzen auf. (Quelle: Kontext)

---
**Quellen**
- `[1] Kontext im System-Prompt (Ano Nym)`
```

**What does it mean?**

- The system prompt with all the knowledge goes along with every request. The model remembers nothing between two requests.
- Between the system prompt and your question there are four messages nobody ever wrote: the few-shot examples. To the model they look like a real earlier conversation.
- The answer has the same shape as the two example answers, including "(Quelle: Kontext)" at the end.
- Everything below `---` comes from the code. The list shows what was given to the model, not what it used.
- `temperature: 0` is in the request: the model always picks the most likely token. That makes answers almost repeatable.

**Try it:** the tasks in the header of `01-knowledge-and-few-shot.ts`. Watch what the model does with a question whose answer is not in the context.

**Pitfalls**

- The code appends the source list because small models cite unreliably. A model that ignores the context still gets it.
- Open WebUI sends earlier answers back including their source list. `withoutSourceLists` removes the old lists; otherwise the model copies them into the next answer.
- Helper requests from Open WebUI (title and tags for the chat, they start with `### Task:`) get neither examples nor a source list. Otherwise "(Quelle: Kontext)" would end up in the chat title. That is why these requests look different in Burp.
- The code takes a system prompt from Open WebUI's settings unchecked. That is fine here because you are the only user; see the deep dive.

**If it gets stuck**

| Message | Fix |
|---|---|
| `FACADE_PORT 11435 is in use. …` | Another part is still running. Stop it with Ctrl+C. |
| Open WebUI does not show `lesson-02-part-1` | Does the log show `Facade ready`? Check the connection as in [Lesson 01](../01-preparation/GUIDE.md). |

> **Deep dive:** System prompts from Open WebUI come from the client and cannot be trusted. A multi-user application discards them, and access control never depends on the prompt: [docs/production.md](../../docs/production.md#workshop-simplification--in-production).

## Part 2 – Current data from the web as context

**In one sentence:** Your code loads the Hacker News front page, puts only the titles into the prompt and lets the model answer from them.

**Flow**

1. **Load** (KERN 1). `loadHackerNewsTitles` fetches the page with a time limit and a size limit and keeps only the titles (`span.titleline > a`). The whole page would be almost all markup and would fill the context window. A cache prevents every request from loading the page again.
2. **Mark** (KERN 2). `buildContext` puts the titles between `<scraped-context>` tags and tells the model these are today's headlines.
3. **Insert** (KERN 3). The context goes in front of the last user message (`withLastUserContext`), not into a message of its own. That way the roles alternate; some models reject two `user` messages in a row.

**What you see**

The log after the question "Was sind gerade die Top-Themen auf Hacker News?" (what are the top topics on Hacker News right now?):

```text
… INFO Hacker News: Call started
… INFO Hacker News headlines loaded { count: 30, durationMs: … }
… INFO Hacker News: Call completed { durationMs: … }
… INFO Model: Call started { messages: 1 }
… INFO Model: Call completed { messages: 1, durationMs: … }
```

The request to the model (shortened; earlier run with `qwen3.8-4b-q4` and the question "Welche drei Themen stehen heute ganz oben auf Hacker News?"):

```json
{"model":"qwen3.8-4b-q4","temperature":0,"stream":false,"messages":[
 {"role":"system","content":"Beantworte Fragen ausschließlich mit dem folgenden Kontext. … Zitiere im Text mit [1], aber füge keine eigene Quellenliste an, da die Anwendung sie anhängt."},
 {"role":"user","content":"Kontext [1] (die Titel der Hacker-News-Startseite von heute, also die aktuellen Nachrichten):\n<scraped-context>\nJensen Huang resigns\nRust 1.100\nGemini 4 Hydrogen and Orchestrator\n…\n</scraped-context>\n\nWelche drei Themen stehen heute ganz oben auf Hacker News?"}]}
```

The answer in Open WebUI:

```text
Basierend auf dem bereitgestellten Kontext [1], der die Titel der Hacker-News-Startseite von heute auflistet, sind die aktuellen Themen unter anderem die Resignation des Nvidia-Chefs Jensen Huang sowie ein Petition der Mitarbeiter zur Wiederherstellung seiner Position. Ein weiterer großer Punkt ist ein globaler Microsoft-Ausfall, bei dem Outlook und 365 nach 12 Stunden immer noch nicht wieder verfügbar sind [1]. Zudem werden technische Themen wie Rust 1.100, neue KI-Modelle (z.B. Gemini 4 Hydrogen) und LLMs auf kleinen Geräten diskutiert. Auch Sicherheitsaspekte wie ein RCE-Vulnerability bei Postgres oder der Hack von TSMC sind in den aktuellen Titeln enthalten [1].

---
**Quellen**
- `[1] https://news.ycombinator.com`
```

**What does it mean?**

- `count: 30`: the front page has 30 titles. Only these lines go into the prompt, no HTML.
- The context sits in the user message before your question, not in the system prompt. To the model it looks as if you had sent the titles yourself.
- The answer summarizes several titles and can add what is in no title, such as which company Jensen Huang leads. Whether a detail comes from the context or from training knowledge only the context itself shows (in Burp). The model mixes both; "ausschließlich" (only) in the system prompt merely reduces that.
- This time `[1]` is in the text, as the system prompt asks. The code cannot rely on it: in the earlier run it was missing. That is why the code appends the source list itself.
- The titles are English, the answer is German: the system prompt asks for German.

**Try it:** the tasks in the header of `02-web-scraping.ts`. Watch whether the model treats text from the `<scraped-context>` block as data or as an instruction.

**Pitfalls**

- Your titles are different: the page changes all the time. A second question within `NEWS_CACHE_MS` does not reload; the log then shows `Hacker News headlines loaded from cache`.
- The `<scraped-context>` tags help the model separate data from instructions. They are not complete protection against indirect prompt injection.
- With `BURP_PROXY_URL`, fetching `https://news.ycombinator.com` also goes through Burp. Node needs Burp's CA certificate for that (`BURP_CA_CERT`); if it is missing, the program stops right at startup.
- Helper requests from Open WebUI (`### Task:`) get no web data and a shorter system prompt. The rule "only from the context" would otherwise break the JSON for title and tags.

**If it gets stuck**

| Message | Fix |
|---|---|
| `BURP_CA_CERT is missing for HTTPS through Burp. …` | Export and set the certificate ([Troubleshooting](../../README.md#troubleshooting)) or clear `BURP_PROXY_URL`. |
| `Hacker News returned HTTP …` | The page answers with an error or blocks too many fetches. Wait a moment and ask again. |
| `No headlines found. The Hacker News page layout may have changed.` | The selector `span.titleline > a` no longer matches the page. |
| `ERROR Hacker News: Call failed – Cause: …` | No internet, or the page does not answer within `NEWS_TIMEOUT_MS`. |

> **Deep dive:** The size limit `MAX_NEWS_BODY_BYTES` protects against huge or endless responses (OWASP LLM10, Unbounded Consumption): the code reads the page piece by piece and stops as soon as the limit is exceeded, instead of loading everything into memory first. The cache stores the promise of the fetch so that simultaneous requests from Open WebUI share one fetch. How to protect foreign text further in production: [docs/production.md](../../docs/production.md#workshop-simplification--in-production).

## Part 3 – Tool calls step by step

**In one sentence:** The model gets the tool `dateTime`; when it asks for it, your hand-written loop runs the function and sends the result back.

**Flow**

1. **Tool** (KERN 1). A normal function plus name, description and schema. The model sees only description and schema; the description decides when it uses the tool.
2. **Offer** (KERN 2). `bindTools` attaches the tool descriptions to every request.
3. **Loop** (KERN 3). If the model answers with tool calls instead of text, your code runs the tools, appends the results to the conversation and asks again, for at most `MAX_TOOL_ROUNDS` rounds.
4. **Match** (KERN 4). Each result is a message with the role `tool` and the ID of the tool call. That is how the model knows which request the result answers.

**What you see**

All blocks in this part come from the earlier run with `qwen3.8-4b-q4`; the dress rehearsal recorded no tool call.

The log after the question "Wie spät ist es gerade in Berlin?" (what time is it in Berlin right now?):

```text
… INFO Model: Call started { messages: 1 }
… INFO The model requested tools { round: 1, tools: [ 'dateTime' ] }
… INFO Tool dateTime: called
… INFO Model: Call completed { messages: 1, durationMs: … }
```

First request to the model and its answer (shortened):

```json
{"model":"qwen3.8-4b-q4","temperature":0,"stream":false,
 "tools":[{"type":"function","function":{"name":"dateTime","description":"Gibt das aktuelle Datum und die Uhrzeit in Deutschland (Europe/Berlin) zurück.","parameters":{"type":"object","properties":{},"additionalProperties":false}}}],
 "messages":[{"role":"user","content":"Wie spät ist es gerade in Berlin?"}]}

{"choices":[{"finish_reason":"tool_calls","message":{"role":"assistant","content":"",
  "tool_calls":[{"id":"PmGtKOd9…","type":"function","function":{"name":"dateTime","arguments":"{}"}}],
  "reasoning":"The user is asking what time it is currently in Berlin. I have access to a dateTime function …"}}],
 "usage":{"prompt_tokens":300,"completion_tokens":63,"total_tokens":363}}
```

Second request (only `messages`) and the answer in Open WebUI:

```json
[{"role":"user","content":"Wie spät ist es gerade in Berlin?"},
 {"role":"assistant","content":"","tool_calls":[{"id":"PmGtKOd9…","type":"function","function":{"name":"dateTime","arguments":"{}"}}]},
 {"role":"tool","content":"Freitag, 13. November 2026 um 02:21","name":"dateTime","tool_call_id":"PmGtKOd9…"}]
```

```text
Es ist gerade **Freitag, 13. November 2026 um 02:21 Uhr** in Berlin.
```

**What does it mean?**

- One question, two requests to the model. To the first it does not answer with text but with `finish_reason: "tool_calls"` and the wish to call `dateTime` with `{}`.
- Your code ran the function (`Tool dateTime: called`), not the model. A model can only produce text; the tool call is a request.
- In the second request, the tool call and the result with the same ID are in the history. From that the model phrases the answer.
- The tool description goes along with every request: 300 prompt tokens for a six-word question.
- The zod schema `z.object({}).strict()` becomes JSON Schema (the format in which the API describes arguments) with `additionalProperties: false`: not a single argument allowed.

**Try it:** the tasks in the header of `03-tool-call-base.ts`. Watch the log line `The model requested tools` and its round number.

**Pitfalls**

- Small models call tools unreliably. Sometimes the model answers without the tool, sometimes with broken arguments. Then the loop sends a correction and tries again in the next round.
- The helper requests from Open WebUI (title, tags) also run through the loop in Part 3 and are offered the tools. Part 3 does not tell them apart.
- `MODEL_TIMEOUT_MS` is larger than in Part 2: one pass needs at least two model calls.
- With `SHOW_THINKING=true` the thinking stays in the history the model reads in the next round.

**If it gets stuck**

| Message | Fix |
|---|---|
| `The model returned no answer text.` | The model only thought and delivered no text. Ask again. |
| `ERROR Model: Call failed – Cause: Request timed out.` | The model was too slow for `MODEL_TIMEOUT_MS`. Try again or use a smaller model. |

> **Deep dive:** Tools give the model the power to act. In production every tool gets only the permissions it needs, and a human approves consequential actions (OWASP LLM06, Excessive Agency). `MAX_TOOL_ROUNDS` limits how many calls a model can trigger that keeps requesting tools (OWASP LLM10).

## Part 4 – Tool calls, the short version

**In one sentence:** The same tool as in Part 3, but LangChain's `createAgent` takes over the loop.

**Flow**

1. **Agent** (KERN 1). `createAgent` gets the model and the tools and runs the same loop as `answerWithTools` in Part 3.
2. **One call** (KERN 2). `agent.invoke` replaces the whole loop. `recursionLimit` bounds it: the agent runs as a graph, one round is two steps (model, tool), hence `2 * MAX_TOOL_ROUNDS`.

**What you see**

As in Part 3: earlier run with `qwen3.8-4b-q4`.

```text
… INFO Model: Call started { messages: 1 }
… INFO Tool dateTime: called
… INFO Model: Call completed { messages: 1, durationMs: … }
```

```text
Es ist gerade **Freitag, 13. November 2026 um 02:21 Uhr** in Berlin.
```

**What does it mean?**

- The same answer as in Part 3. Only Burp shows how many requests are behind it.
- The line `The model requested tools` is missing. It came from your loop in Part 3; now the loop runs inside LangChain.
- The last message in `response.messages` is the answer. The ones before it are the tool pass.

**Try it:** the tasks in the header of `04-tool-calls-short.ts`. Watch which error handling from Part 3 you no longer write yourself.

**Pitfalls**

- `recursionLimit` counts graph steps, not rounds. That is why it says `2 * MAX_TOOL_ROUNDS`.
- When the limit is reached, LangChain throws an error (`GraphRecursionError`) instead of running forever.
- Here too, the helper requests from Open WebUI run through the agent.

**If it gets stuck**

| Message | Fix |
|---|---|
| `The model returned no answer text.` | The last message was empty. Ask again. |
| `FACADE_PORT 11435 is in use. …` | Part 3 is still running. Stop it with Ctrl+C. |

> **Deep dive:** `createAgent` runs as a graph from LangGraph (LangChain's graph library): one step for the model, one for the tools. Extra steps, such as a human approving a tool call, are added as middleware (e.g. `humanInTheLoopMiddleware` from `langchain`) instead of writing the loop yourself as in Part 3.

## What you take away

1. A model knows only what is in the prompt or was in its training data. You have to send missing knowledge along, with every request.
2. Foreign text in the prompt can contain instructions. Tags and rules in the system prompt help but do not fully protect.
3. A tool call is a request from the model. Your code runs it, and your code limits how often.

## What's next

[Lesson 03 – Embeddings](../03-embeddings/README.md) shows how to find the texts that match a question by meaning. From Lesson 04 on this becomes an index, and [Lesson 07](../07-rag-open-webui/README.md) puts the passages it finds into the prompt as in Part 2 (RAG), with the same facade and the same source list. The data flow is described in [docs/architecture.md](../../docs/architecture.md).
