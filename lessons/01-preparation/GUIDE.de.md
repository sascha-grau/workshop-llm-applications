# Lektion 01 – Vorbereitung: Guide

*English version: [GUIDE.md](GUIDE.md)* · Überblick und Start: [README.de.md](README.de.md)

## Worum geht's?

Du rufst zum ersten Mal ein Sprachmodell aus eigenem Code auf. Danach setzt du eine Chat-Oberfläche davor und schaust zu, was dabei über die Leitung geht. Am Ende steht die Umgebung, mit der alle weiteren Lektionen arbeiten.

Vergleich: ein Telefonat. In Teil 1 rufst du das Modell direkt an. In Teil 2 stellt eine Vermittlung (die Fassade) die Anrufe aus Open WebUI zu deinem Programm durch. In Teil 3 hörst du mit Burp mit.

## Wo stehen wir?

```text
[ L01 Vorbereitung ] ──► L02 Tool-Calls ──► L03 Embeddings ──► L04 Chunking ──► … ──► L08 Evaluierung
        ▲ du bist hier

Teil 1:  dein Programm ──────────────────────────────────────► LM Studio (Chat-Modell)
Teil 2:  Open WebUI ──► Fassade + dein Programm ─────────────► LM Studio
Teil 3:  Open WebUI ──► Fassade + dein Programm ──► Burp ────► LM Studio
```

## Neue Begriffe

| Begriff | In einem Satz | Beispiel |
|---|---|---|
| Sprachmodell (LLM) | Ein Programm, das zu einem Text die wahrscheinlich nächsten Wortstücke erzeugt. | Das Chat-Modell in LM Studio (`REMOTE_MODEL_NAME`) |
| Token | Das Wortstück, in dem ein Modell liest und schreibt. Ein Wort kann aus mehreren Tokens bestehen. | Eine Zeile im Antwort-Stream in Teil 2 |
| Streaming | Die Antwort kommt stückweise, sobald sie entsteht, statt am Ende auf einmal. | Der Text läuft Wort für Wort durch die Konsole. |
| Reasoning-Modell, Denkschritte | Ein Modell, das vor der Antwort Denkschritte (Reasoning) schreibt. Der Server schickt sie getrennt von der Antwort. | Das Feld `reasoning` in Teil 3 |
| Fassade | Ein kleiner Server in deinem Programm, der sich gegenüber Open WebUI wie Ollama verhält (ein verbreiteter lokaler Modell-Server). | Modell `lesson-01-part-2` in Open WebUI |
| Proxy (Burp) | Ein Programm zwischen deinem Code und dem Server, das jede HTTP-Anfrage anzeigt. | Proxy → HTTP history in Burp |

## Vorher prüfen

- [ ] Die Einrichtung aus der [Wurzel-README](../../README.de.md#einrichtung) ist erledigt: Node, `npm ci`, `.env`.
- [ ] LM Studio läuft, der Server ist gestartet, das Chat-Modell geladen ([LM Studio einrichten](../../README.de.md#lm-studio-einrichten)). `REMOTE_MODEL_NAME` in `.env` ist genau der Identifier aus LM Studio.
- [ ] Ab Teil 2: Open WebUI läuft ([Open WebUI starten](../../README.de.md#open-webui-starten)).
- [ ] Für Teil 3 (optional): Burp läuft, Intercept ist aus ([Burp einrichten](../../README.de.md#burp-einrichten)).
- [ ] `SHOW_THINKING` in `.env` ist leer.

Alle Ausgaben unten: gemessen am 2026-11-13 mit LM Studio und `qwen3.5-4b` (Workshop-Standard, [Modelle](../../README.de.md#modelle) in der Wurzel-README). Ausnahme ist Teil 3 (Burp): Er stammt aus einem früheren Lauf am selben Tag mit `qwen3.8-4b-q4` auf einem anderen OpenAI-kompatiblen Server. Mit einem anderen Server oder Modell weichen Zahlen und Antworten ab; der Ablauf bleibt gleich. Zeitstempel und Dauern sind gekürzt (`…`).

## Teil 1 – Hallo, Sprachmodell

**In einem Satz:** Dein Programm schickt eine Frage an das Chat-Modell und schreibt die Antwort Stück für Stück in die Konsole.

**Ablauf**

1. **Verbinden** (KERN 1). `ChatOpenAI` aus LangChain (einer Bibliothek für Programme mit Sprachmodellen) spricht die OpenAI-API: ein HTTP-Format für Chat-Anfragen, das auch LM Studio und die meisten lokalen Server anbieten. `baseURL` aus `.env` zeigt auf deinen Server.
2. **Fragen** (KERN 2). `model.stream(…)` schickt die Frage und liefert die Antwort als Folge kleiner Stücke.
3. **Ausgeben** (KERN 3). Jedes Stück wird sofort geschrieben. `withoutThinking` filtert vorher die Denkschritte heraus.

**Das siehst du**

```text
$ npm run l01:1
… INFO Model: Call started { model: 'qwen3.5-4b' }
Ein Sprachmodell ist eine künstliche Intelligenz, die auf riesigen Textmengen trainiert wird, um Muster in der Sprache zu erkennen und vorherzusagen. Es nutzt diese statistischen Zusammenhänge, um sinnvolle Texte zu generieren oder kontextbezogene Antworten auf Fragen zu geben.
… INFO Model: Call completed { model: 'qwen3.5-4b', durationMs: … }
```

Mit `SHOW_THINKING=true` in `.env` (gekürzt):

```text
<think>Thinking Process:

1.  **Analyze the Request:**
    *   Topic: What is a language model (Sprachmodell)?
    *   Constraint: Exactly two sentences (in two Sätze).
    *   Language: German (Erkläre...).
…
3.  **Drafting Sentences (Internal Monologue/Trial):**
    *   *Attempt 1:* Ein Sprachmodell ist eine künstliche Intelligenz, die auf großen Textmengen trainiert wird. …
    *   *Attempt 2:* Ein Sprachmodell lernt aus riesigen Datenmengen, wie Wörter in Sätzen zusammenhängen. …
    *   *Attempt 3:* Ein Sprachmodell ist ein Algorithmus, der statistische Muster in Sprache erkennt und vorhersagt. …
…
7.  **Final Output Generation.** (Matches the refined draft).
…
</think>Ein Sprachmodell ist eine künstliche Intelligenz, die auf großen Textmengen trainiert wird, um statistische Muster in Sprache zu erkennen. Damit kann es dann automatisch Texte generieren, vervollständigen oder Fragen beantworten.
```

↺ Danach `SHOW_THINKING` in `.env` wieder leeren (ab Lektion 04 bricht `true` JSON-Schritte).

**Was bedeutet das?**

- Zwei Log-Zeilen rahmen den Aufruf ein: `Call started` und `Call completed`. Alles dazwischen ist die Antwort des Modells. Log-Zeilen sind englisch, die Antwort ist deutsch, weil die Frage deutsch ist.
- Nach `Call started` passiert eine Weile nichts, dann läuft der Text zügig durch. In der Pause schreibt das Reasoning-Modell seine Denkschritte, die der Code standardmäßig weglässt.
- Mit `SHOW_THINKING=true` siehst du sie: englisch, lang, mit mehreren Entwürfen. Die eigentliche Antwort steht hinter `</think>`.
- Die beiden Läufe antworten verschieden, obwohl Modell und Frage gleich sind. Das Modell wählt jedes Token nach Wahrscheinlichkeit; dieselbe Frage ergibt nicht wörtlich dieselbe Antwort.

**Probier aus:** die Aufgaben im Kopf von `01-hello-llm.ts`. `temperature` steuert, wie zufällig das Modell unter den wahrscheinlichen Tokens wählt; 0 heißt so gleichbleibend wie möglich. Achte darauf, wann der erste Text erscheint.

**Stolperfallen**

- Denkschritte kosten Zeit, auch wenn du sie nicht siehst. Deshalb dauert selbst eine kurze Antwort einige Sekunden.
- Die Antwort steht ohne Anführungszeichen direkt zwischen den Log-Zeilen. Das ist so gewollt: Der Code schreibt die Stücke ohne Zeilenumbruch hintereinander.
- `response.text` einer fertigen Antwort enthält nie die Denkschritte. `modelText` aus [`shared/text.ts`](../shared/text.ts) richtet sich nach `SHOW_THINKING`.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `ERROR Model: Call failed – Cause: Connection error. – fetch failed – connect ECONNREFUSED 127.0.0.1:1234 …` | Der LM-Studio-Server läuft nicht, oder `REMOTE_MODEL_BASE_URL` stimmt nicht. Server starten, Adresse prüfen. |
| `404` oder `400` mit dem Modellnamen in der Ursache | `REMOTE_MODEL_NAME` passt nicht zum Identifier in LM Studio, oder das Modell ist nicht geladen. |
| `The setting REMOTE_MODEL_NAME is missing from .env (template: .env.example).` | `.env` fehlt oder ist unvollständig. Mit `.env.example` vergleichen. |
| `The setting SHOW_THINKING in .env must be empty, true or false (also 1/0, yes/no), got "…".` | Wert in `.env` korrigieren. |

Alle weiteren Meldungen: [Wenn etwas nicht klappt](../../README.de.md#wenn-etwas-nicht-klappt) in der Wurzel-README.

> **Vertiefung:** Der Server schickt die Denkschritte in einem eigenen Feld (`reasoning`, bei manchen Servern `reasoning_content`) oder als `<think>`-Block im Text. LangChain verwirft das Feld; deshalb setzt der Code `__includeRawResponse: true` und liest die Rohantwort selbst. Warum `SHOW_THINKING=true` auch vor JSON-Antworten steht und spätere Lektionen damit scheitern: [docs/decisions.de.md](../../docs/decisions.de.md#show-thinking). Das Workshop-Modell ist [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B).

## Teil 2 – Open WebUI als Chat-Oberfläche

**In einem Satz:** Dein Programm startet die Fassade, die Open WebUI für einen Ollama-Server hält; jede Chat-Nachricht landet bei deinem Code und geht von dort an LM Studio.

**Ablauf**

1. **Fassade** (KERN 1). `createOllamaApiFacade` beantwortet die Anfragen, die Open WebUI an Ollama stellt. `GET /api/tags` liefert die Modellliste mit dem Namen aus `ADVERTISED_MODEL`.
2. **Handler** (KERN 2). `postApiChat` registriert deinen Code für `POST /api/chat`. Er bekommt die Nachrichten aus Open WebUI.
3. **Weiterreichen** (KERN 3). Dein Code fragt das Modell und schickt die Antwort Stück für Stück an Open WebUI zurück (`sendChatStream`).

**Das siehst du**

Das Log nach dem Start und nach einer Frage („Wie begrenze ich Prompt Injection?“). Statt Open WebUI hat hier ein Skript mit `curl` angefragt: zweimal die Modellliste (Warten auf den Start, Modellname), dann die Frage.

```text
$ npm run l01:2
… INFO Model API directly: reachable { status: 200 }
… INFO Facade ready { address: 'http://127.0.0.1:11435', advertisedModel: 'lesson-01-part-2' }
… INFO HTTP request started { requestId: 1, method: 'GET', path: '/api/tags' }
… INFO HTTP request completed { requestId: 1, status: 200, durationMs: … }
… INFO HTTP request started { requestId: 2, method: 'GET', path: '/api/tags' }
… INFO HTTP request completed { requestId: 2, status: 200, durationMs: … }
… INFO HTTP request started { requestId: 3, method: 'POST', path: '/api/chat' }
… INFO Model: Call started { messages: 1 }
… INFO Model: Call completed { messages: 1, durationMs: … }
… INFO HTTP request completed { requestId: 3, status: 200, durationMs: … }
```

Was die Fassade auf `POST /api/chat` zurückschickt: eine Zeile je Stück Text. Die Form der Zeilen (Inhalt ausgelassen):

```text
$ curl -s http://127.0.0.1:11435/api/chat -H 'Content-Type: application/json' \
    -d '{"model":"lesson-01-part-2","messages":[{"role":"user","content":"Wie begrenze ich Prompt Injection?"}],"stream":true}'
{"created_at":"…","message":{"role":"assistant","content":"…"},"done":false}
{"created_at":"…","message":{"role":"assistant","content":"…"},"done":false}
…
{"done":true}
```

Die Antwort, zusammengesetzt (gekürzt):

```text
Prompt Injection ist ein Sicherheitsrisiko bei Large Language Models (LLMs), bei dem ein Angreifer versuchen kann, die Systemanweisungen des Modells zu umgehen oder zu überschreiben, um schädlichen Inhalt zu generieren oder sensible Daten preiszugeben.

Hier sind die effektivsten Strategien, um Prompt Injection zu begrenzen und zu verhindern:

### 1. Trennung von System- und Benutzerkontext (Prompt Engineering)
…
### 4. Modell-Auswahl und Konfiguration
…
*   **Sichere Modelle:** Nutzen Sie Modelle, die explizit für Sicherheit trainiert wurden (z.B. Anthropic's Claude mit "Guardrails", OpenAI's GPT-4o mit Sicherheitsfiltern).
…
### 7. Monitoring und Logging
…
```

**Was bedeutet das?**

- `GET /api/tags` fragt die Modellliste ab. So findet Open WebUI `lesson-01-part-2`.
- `messages: 1` ist die Zahl der Nachrichten, die dein Handler bekommen hat.
- Jede Zeile der Antwort ist ein eigenes JSON-Objekt mit einem Stück Text (NDJSON); `done: true` beendet den Stream. Open WebUI setzt die Stücke zusammen.
- Die Stücke sind Tokens. Ein längeres Wort kommt oft in mehreren Zeilen an.
- Die Antwort ist lang und allgemein. Das Modell kennt die OWASP-Dokumente des Workshops nicht und antwortet aus seinem Trainingswissen, samt ungeprüfter Produktempfehlungen. Wie du ihm Kontext mitgibst, zeigt Lektion 02; dieselbe Frage mit gefundenen OWASP-Abschnitten beantwortet Lektion 07.

**Probier aus:** die Aufgaben im Kopf von `02-open-webui.ts`. Achte auf die Log-Zeilen, die eine einzige Chat-Nachricht auslöst.

**Stolperfallen**

- Das Programm endet nicht von selbst. Die Fassade wartet auf Anfragen, bis du Strg+C drückst.
- Pro Chat-Nachricht erscheinen im Log oft mehrere `POST /api/chat`. Das ist kein Fehler; was dahintersteckt, zeigt Aufgabe 3.
- Die Fassade lauscht auf `FACADE_PORT`, nicht auf Ollamas Standardport. So kann ein echtes Ollama daneben laufen.
- Die Fassade hat keine Anmeldung und ist deshalb nur unter `127.0.0.1` erreichbar. Läuft Open WebUI in Docker, gilt der Abschnitt [Open WebUI mit der Fassade verbinden](../../README.de.md#open-webui-mit-der-fassade-verbinden-ab-lektion-01-teil-2) der Wurzel-README.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `FACADE_PORT 11435 is in use. Stop the other lesson or change FACADE_PORT in .env and the Ollama connection in Open WebUI.` | Ein anderer Teil läuft noch. Beende ihn mit Strg+C. Es läuft immer nur ein Teil mit Fassade. |
| Open WebUI zeigt das Modell nicht | Steht `Facade ready` im Log? Ist die Verbindung in Open WebUI eine **Ollama**-Verbindung auf die Adresse aus dem Log? |
| `Rejected request with unexpected Host header. …` (HTTP 403) | In der Verbindung steht ein Rechnername. Nimm `localhost`, eine IP-Adresse oder `host.docker.internal`. |
| `Request cancelled.` | Kein Fehler: Du hast in Open WebUI auf Stopp geklickt. |

> **Vertiefung:** Die Fassade kommt aus dem Paket `ollama-api-facade-js`. Warum der Workshop ihr eigenes Streaming ersetzt und die Version fest auf 1.0.7 steht: [docs/decisions.de.md](../../docs/decisions.de.md#fassade-gepinnt). `prepareFacade` in [`shared/server.ts`](../shared/server.ts) lässt nur bekannte Host-Header zu (Schutz vor DNS-Rebinding). Alles unter `lessons/shared/` beschreibt [lessons/shared/README.de.md](../shared/README.de.md).

## Teil 3 – Den Datenverkehr in Burp beobachten

**In einem Satz:** Derselbe Chat-Server wie in Teil 2, aber jede Anfrage deines Programms an das Modell läuft über Burp, und du liest sie in der HTTP-History.

**Ablauf**

1. **Über Burp** (KERN 1). `setGlobalDispatcher` leitet jede ausgehende Anfrage dieses Programms über den Proxy aus `BURP_PROXY_URL`. Ist der Wert leer, bleibt alles direkt.
2. **Ganze Antworten** (KERN 2). `disableStreaming: true` lässt den Server die Antwort in einem Stück schicken. Das liest sich in Burp leichter.

Beim Start prüft das Programm beide Wege zum Modell-Server: über Burp und direkt.

**Das siehst du**

Alle Blöcke dieses Teils stammen aus dem früheren Lauf mit `qwen3.8-4b-q4`; die Generalprobe hat Burp nicht mitgeschnitten. Mit LM Studio steht in `model` dein Identifier.

```text
$ npm run l01:3
… INFO Model API through Burp: reachable { status: 200 }
… INFO Model API directly: reachable { status: 200 }
… INFO Facade ready { address: 'http://127.0.0.1:11435', advertisedModel: 'lesson-01-part-3' }
```

In Burp unter Proxy → HTTP history die Anfrage an `/v1/chat/completions` nach der Frage „Nenne die Hauptstadt von Frankreich. Nur ein Wort.“ (Header gekürzt, Schlüssel geschwärzt, Nachrichten ausgelassen):

```text
POST /v1/chat/completions HTTP/1.1
Authorization: Bearer sk-…
User-Agent: langchainjs-openai/1.0.0 (…)
Content-Type: application/json

{"model":"qwen3.8-4b-q4","stream":false,"messages":[…]}
```

Die Antwort darauf (gekürzt):

```json
{"object":"chat.completion","model":"qwen3.8-4b-q4","choices":[{"index":0,"finish_reason":"stop",
 "message":{"role":"assistant","content":"Paris",
  "reasoning":"Thinking Process:\n\n1.  The user asks for the capital of France …"}}],
 "usage":{"prompt_tokens":21,"completion_tokens":92,"total_tokens":113}}
```

**Was bedeutet das?**

- Zwei Prüfzeilen beim Start: Der Modell-Server ist über Burp und direkt erreichbar. Scheitert nur der Weg über Burp, liegt es an Burp.
- `Authorization: Bearer …` ist dein API-Schlüssel im Klartext. Schwärze ihn, bevor du Screenshots oder Burp-Projekte teilst.
- `content` ist die Antwort („Paris“), `reasoning` sind die Denkschritte. Open WebUI zeigt nur `content`, solange `SHOW_THINKING` leer ist.
- `usage` zählt Tokens: 21 für die Frage, 92 erzeugt. Fast alles davon sind Denkschritte für ein einziges Wort.
- Open WebUI bekommt die Antwort trotzdem als Stream, nur aus einem Stück.

**Probier aus:** die Aufgaben im Kopf von `03-burp-proxy.ts`. Achte darauf, welche Teile der Anfrage aus Open WebUI stammen und welche dein Programm hinzufügt.

**Stolperfallen**

- Ohne `BURP_PROXY_URL` läuft Teil 3 wie Teil 2, und Burp bleibt leer. Das ist kein Fehler.
- Burp zeigt nur, was dein Programm verschickt: die Anfragen an den Modell-Server. Den Verkehr zwischen Open WebUI und der Fassade siehst du dort nicht.
- Beim Start stehen in der History `GET http://burp/` und `GET /v1/models`. Das sind die Prüfungen, keine Chat-Anfragen. Die erste geht ohne API-Schlüssel an Burp selbst, damit der Schlüssel nie an einen fremden Dienst auf Burps Port gerät.
- Mit Intercept hält Burp jede Anfrage fest, bis du „Forward“ klickst. Nach `MODEL_TIMEOUT_MS` bricht der Modell-Aufruf ab.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Burp is not running at http://localhost:8080 – start Burp or clear BURP_PROXY_URL in .env.` | Burp starten oder `BURP_PROXY_URL` leeren. |
| `Model API through Burp: The request through Burp failed or timed out. Check the listener and turn Intercept off.` | Intercept in Burp ausschalten. |
| `Something other than Burp answers at http://localhost:8080 (HTTP …). …` | Ein anderer Dienst belegt Burps Port, oft Open WebUI ohne Docker. Einen der beiden verschieben ([Wenn etwas nicht klappt](../../README.de.md#wenn-etwas-nicht-klappt)). |

> **Vertiefung:** Den Proxy-Dispatcher baut `getBurpDispatcher` in [`shared/proxy.ts`](../shared/proxy.ts); ab Lektion 02 erledigt `useBurpIfConfigured` dasselbe in einer Zeile. Die Programme wiederholen fehlgeschlagene Anfragen nicht (`maxRetries: 0`), damit Burp keine Doppelanfragen zeigt. In Produktion wiederholt man vorübergehende Fehler: [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion).

## Das nimmst du mit

1. Ein Aufruf eines Sprachmodells ist eine HTTP-Anfrage mit JSON: Modellname und Nachrichten hin, Antwort und Denkschritte zurück.
2. Die Fassade macht aus deinem Programm ein „Modell“ für Open WebUI. Dein Code sitzt zwischen Chat und Modell und kann alles verändern.
3. Burp zeigt alles, was dein Programm verschickt, auch den API-Schlüssel.

## Weiter geht's

Fassade und Burp nutzt du ab jetzt in jedem Teil mit Chat. [Lektion 02 – Tool-Calls](../02-tool-calls/README.de.md) gibt dem Modell Wissen, das es nicht hat: erst von Hand im Prompt, dann über Werkzeuge, die es selbst anfordert. Den Weg aller Daten durch den Workshop beschreibt [docs/architecture.de.md](../../docs/architecture.de.md).
