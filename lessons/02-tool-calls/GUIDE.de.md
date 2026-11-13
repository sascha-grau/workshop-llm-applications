# Lektion 02 – Tool-Calls: Guide

*English version: [GUIDE.md](GUIDE.md)* · Überblick und Start: [README.de.md](README.de.md)

## Worum geht's?

Ein Sprachmodell weiß nur, was in seinen Trainingsdaten stand: nichts über Ano Nym, nichts über heute. In Teil 1 und 2 legt dein Code das fehlende Wissen selbst in den Prompt. In Teil 3 und 4 fordert das Modell es an, indem es ein Werkzeug aufruft, das dein Code ausführt.

Vergleich: In Teil 1 und 2 gibst du jemandem vor der Prüfung einen Spickzettel. In Teil 3 und 4 darf er während der Prüfung nachfragen, und du beantwortest die Frage.

## Wo stehen wir?

```text
L01 Vorbereitung ──► [ L02 Tool-Calls ] ──► L03 Embeddings ──► L04 Chunking ──► … ──► L07 RAG
                           ▲ du bist hier

Teil 1:  dein Code ── festes Wissen im System-Prompt ─────────────────► Modell
Teil 2:  dein Code ── lädt Webseite, Titel in die Nutzernachricht ────► Modell
Teil 3:  Modell ── "rufe dateTime auf" ──► dein Code führt aus ──► Ergebnis ──► Modell   (Schleife von Hand)
Teil 4:  dasselbe, die Schleife übernimmt createAgent
```

Lektion 07 macht aus Teil 2 eine Suche: Statt einer Webseite liefert ein Index die passenden Textstücke (RAG).

## Neue Begriffe

| Begriff | In einem Satz | Beispiel |
|---|---|---|
| Rolle, System-Prompt | Jede Nachricht hat eine Rolle: `system` (Anweisung des Entwicklers vor dem Gespräch), `user` (Mensch), `assistant` (Modell). | "Beantworte Fragen ausschließlich mit dem folgenden Kontext." |
| Few-Shot | Erfundene Beispieldialoge im Prompt, die dem Modell Format und Stil vormachen. | "Wie sieht Ano Nym aus?" → "Niemand kennt das Gesicht von Ano Nym. (Quelle: Kontext)" |
| Kontextfenster | Die Textmenge in Tokens, die das Modell je Anfrage höchstens sieht. | Deshalb nur die Titel, nicht die ganze Webseite. |
| Indirekte Prompt-Injection | Anweisungen in fremdem Text (Webseite, Dokument), der im Prompt landet. | Ein Seitentitel "Ignoriere alle Anweisungen …" |
| Tool-Call, zod | Die Bitte des Modells, eine Funktion mit bestimmten Argumenten auszuführen. Ein Schema beschreibt die Argumente; hier mit zod, einer Bibliothek, die Datenformen beschreibt und prüft. | `{"name":"dateTime","arguments":"{}"}` |
| LangChain, Agent | LangChain ist die Bibliothek hinter `ChatOpenAI` und `createAgent`. Ein Agent ist die fertige Tool-Call-Schleife; LangChain baut sie als "Graph" aus Schritten (Modell, Werkzeug). | `createAgent` in Teil 4 |
| OWASP Top 10 für LLM-Anwendungen | Die Liste der zehn größten Sicherheitsrisiken von LLM-Anwendungen, LLM01 bis LLM10. Ab Lektion 04 ist sie unser Korpus. | LLM01 Prompt Injection, LLM05 Fehlerhafte Ausgabeverarbeitung |

## Vorher prüfen

- [ ] [Lektion 01](../01-preparation/GUIDE.de.md) läuft: LM Studio mit Chat-Modell, Open WebUI mit Ollama-Verbindung auf die Fassade.
- [ ] Es läuft kein anderer Teil mit Fassade (gleicher Port, `FACADE_PORT`).
- [ ] Für Teil 2: Internet. Mit gesetztem `BURP_PROXY_URL` auch `BURP_CA_CERT` ([Burp einrichten](../../README.de.md#burp-einrichten)).
- [ ] `SHOW_THINKING` in `.env` ist leer. In Teil 3 blieben die Denkschritte sonst im Verlauf, den das Modell in der nächsten Runde liest.

Alle Ausgaben unten: gemessen am 2026-11-13 mit LM Studio und `qwen3.5-4b` (Workshop-Standard, [Modelle](../../README.de.md#modelle) in der Wurzel-README). Ausnahme sind die Anfragen an das Modell (so mitgeschnitten, wie Burp sie zeigt, Header weggelassen), das Beispiel in Teil 1 und die Werkzeugaufrufe in Teil 3 und 4: Sie stammen aus einem früheren Lauf am selben Tag mit `qwen3.8-4b-q4` auf einem anderen OpenAI-kompatiblen Server und sind markiert. Mit einem anderen Server oder Modell weichen Zahlen und Antworten ab; der Ablauf bleibt gleich. Zeitstempel sind gekürzt (`…`).

## Teil 1 – Wissen und Few-Shot im Prompt

**In einem Satz:** Dein Code legt Fakten über Ano Nym in den System-Prompt und zeigt dem Modell mit zwei Beispielen, wie eine Antwort aussehen soll.

**Ablauf**

1. **Wissen** (KERN 1). Drei Sätze über Ano Nym stehen als Text im Code, nicht im Modell.
2. **System-Prompt** (KERN 2). Er verlangt, nur aus dem Kontext zu antworten, und erlaubt ausdrücklich "steht nicht darin". Beides hält das Modell davon ab, Fakten zu erfinden.
3. **Few-Shot** (KERN 3). Zwei erfundene Frage-Antwort-Paare zeigen das Format samt "(Quelle: Kontext)".
4. **Reihenfolge** (KERN 4). System-Prompt, dann die Beispiele, dann das echte Gespräch. Ein System-Prompt aus Open WebUI wird an deinen angehängt, weil die meisten Modelle nur einen akzeptieren.

Die Antwort endet mit einer Quellenliste, die der Code anhängt (`formatSourceList`), nicht das Modell.

**Das siehst du**

Beide Blöcke dieses Teils stammen aus dem früheren Lauf mit `qwen3.8-4b-q4`.

Die Anfrage an das Modell nach der Frage "Was macht Ano Nym?" (gekürzt):

```json
{"model":"qwen3.8-4b-q4","temperature":0,"stream":false,"messages":[
 {"role":"system","content":"Beantworte Fragen ausschließlich mit dem folgenden Kontext. Steht die Antwort nicht darin, sage das offen. Antworte auf Deutsch.\nFüge keine eigene Quellenliste an, da die Anwendung sie anhängt.\n\nKontext [1]:\nAno Nym ist ein geheimnisvoller Ethical Hacker. …"},
 {"role":"user","content":"Wie sieht Ano Nym aus?"},
 {"role":"assistant","content":"Niemand kennt das Gesicht von Ano Nym. (Quelle: Kontext)"},
 {"role":"user","content":"Wo findet Ano Nym Sicherheitslücken?"},
 {"role":"assistant","content":"In Webanwendungen und Sprachmodellen. (Quelle: Kontext)"},
 {"role":"user","content":"Was macht Ano Nym?"}]}
```

Die Antwort in Open WebUI:

```text
Ano Nym ist ein geheimnisvoller Ethical Hacker, der Sicherheitslücken in Webanwendungen und Sprachmodellen findet und diese verantwortungsvoll an die Betreiber meldet. Er veröffentlicht Berichte nur unter diesem Pseudonym und tritt nie persönlich auf Konferenzen auf. (Quelle: Kontext)

---
**Quellen**
- `[1] Kontext im System-Prompt (Ano Nym)`
```

**Was bedeutet das?**

- Der System-Prompt mit dem ganzen Wissen geht bei jeder Anfrage mit. Das Modell merkt sich zwischen zwei Anfragen nichts.
- Zwischen System-Prompt und deiner Frage stehen vier Nachrichten, die nie jemand geschrieben hat: die Few-Shot-Beispiele. Für das Modell sehen sie aus wie ein echtes früheres Gespräch.
- Die Antwort hat dieselbe Form wie die beiden Beispielantworten, samt "(Quelle: Kontext)" am Ende.
- Alles unter `---` stammt vom Code. Die Liste zeigt, was dem Modell geliefert wurde, nicht, was es verwendet hat.
- `temperature: 0` steht in der Anfrage: Das Modell wählt immer das wahrscheinlichste Token. Das macht Antworten fast wiederholbar.

**Probier aus:** die Aufgaben im Kopf von `01-knowledge-and-few-shot.ts`. Achte darauf, was das Modell mit einer Frage macht, deren Antwort nicht im Kontext steht.

**Stolperfallen**

- Die Quellenliste hängt der Code an, weil kleine Modelle unzuverlässig zitieren. Ein Modell, das den Kontext ignoriert, bekommt sie trotzdem.
- Open WebUI schickt frühere Antworten samt Quellenliste zurück. `withoutSourceLists` entfernt die alten Listen, sonst kopiert das Modell sie in die nächste Antwort.
- Hilfsanfragen von Open WebUI (Titel und Tags für den Chat, sie beginnen mit `### Task:`) bekommen weder Beispiele noch Quellenliste. Sonst stünde "(Quelle: Kontext)" im Chat-Titel. In Burp sehen diese Anfragen deshalb anders aus.
- Einen System-Prompt aus den Einstellungen von Open WebUI übernimmt der Code ungeprüft. Das ist hier in Ordnung, weil du selbst der Nutzer bist; siehe Vertiefung.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `FACADE_PORT 11435 is in use. …` | Ein anderer Teil läuft noch. Mit Strg+C beenden. |
| Open WebUI zeigt `lesson-02-part-1` nicht | Steht `Facade ready` im Log? Verbindung wie in [Lektion 01](../01-preparation/GUIDE.de.md) prüfen. |

> **Vertiefung:** System-Prompts aus Open WebUI kommen vom Client und sind nicht vertrauenswürdig. Eine Mehrbenutzer-Anwendung verwirft sie, und Zugriffsschutz hängt nie vom Prompt ab: [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion).

## Teil 2 – Aktuelle Daten aus dem Web als Kontext

**In einem Satz:** Dein Code lädt die Startseite von Hacker News, legt nur die Titel in den Prompt und lässt das Modell daraus antworten.

**Ablauf**

1. **Laden** (KERN 1). `loadHackerNewsTitles` ruft die Seite ab, mit Zeitlimit und Größenlimit, und behält nur die Titel (`span.titleline > a`). Die ganze Seite wäre fast nur Markup und würde das Kontextfenster füllen. Ein Cache verhindert, dass jede Anfrage die Seite neu lädt.
2. **Markieren** (KERN 2). `buildContext` setzt die Titel zwischen `<scraped-context>`-Tags und sagt dem Modell, dass es die Schlagzeilen von heute sind.
3. **Einfügen** (KERN 3). Der Kontext kommt vor die letzte Nutzernachricht (`withLastUserContext`), nicht in eine eigene Nachricht. So wechseln sich die Rollen ab; manche Modelle lehnen zwei `user`-Nachrichten in Folge ab.

**Das siehst du**

Das Log nach der Frage "Was sind gerade die Top-Themen auf Hacker News?":

```text
… INFO Hacker News: Call started
… INFO Hacker News headlines loaded { count: 30, durationMs: … }
… INFO Hacker News: Call completed { durationMs: … }
… INFO Model: Call started { messages: 1 }
… INFO Model: Call completed { messages: 1, durationMs: … }
```

Die Anfrage an das Modell (gekürzt; früherer Lauf mit `qwen3.8-4b-q4` und der Frage "Welche drei Themen stehen heute ganz oben auf Hacker News?"):

```json
{"model":"qwen3.8-4b-q4","temperature":0,"stream":false,"messages":[
 {"role":"system","content":"Beantworte Fragen ausschließlich mit dem folgenden Kontext. … Zitiere im Text mit [1], aber füge keine eigene Quellenliste an, da die Anwendung sie anhängt."},
 {"role":"user","content":"Kontext [1] (die Titel der Hacker-News-Startseite von heute, also die aktuellen Nachrichten):\n<scraped-context>\nJensen Huang resigns\nRust 1.100\nGemini 4 Hydrogen and Orchestrator\n…\n</scraped-context>\n\nWelche drei Themen stehen heute ganz oben auf Hacker News?"}]}
```

Die Antwort in Open WebUI:

```text
Basierend auf dem bereitgestellten Kontext [1], der die Titel der Hacker-News-Startseite von heute auflistet, sind die aktuellen Themen unter anderem die Resignation des Nvidia-Chefs Jensen Huang sowie ein Petition der Mitarbeiter zur Wiederherstellung seiner Position. Ein weiterer großer Punkt ist ein globaler Microsoft-Ausfall, bei dem Outlook und 365 nach 12 Stunden immer noch nicht wieder verfügbar sind [1]. Zudem werden technische Themen wie Rust 1.100, neue KI-Modelle (z.B. Gemini 4 Hydrogen) und LLMs auf kleinen Geräten diskutiert. Auch Sicherheitsaspekte wie ein RCE-Vulnerability bei Postgres oder der Hack von TSMC sind in den aktuellen Titeln enthalten [1].

---
**Quellen**
- `[1] https://news.ycombinator.com`
```

**Was bedeutet das?**

- `count: 30`: Die Startseite hat 30 Titel. Nur diese Zeilen gehen in den Prompt, kein HTML.
- Der Kontext steht in der Nutzernachricht vor deiner Frage, nicht im System-Prompt. Für das Modell sieht es aus, als hättest du die Titel selbst mitgeschickt.
- Die Antwort fasst mehrere Titel zusammen und kann dabei ergänzen, was in keinem Titel steht, etwa wen Jensen Huang leitet. Ob ein Detail aus dem Kontext oder aus dem Trainingswissen stammt, zeigt nur der Kontext selbst (in Burp). Das Modell mischt beides; "ausschließlich" im System-Prompt verringert das nur.
- Diesmal steht `[1]` im Text, wie der System-Prompt verlangt. Darauf verlassen kann sich der Code nicht: Im früheren Lauf fehlte es. Deshalb hängt der Code die Quellenliste selbst an.
- Die Titel sind englisch, die Antwort ist deutsch: Der System-Prompt verlangt Deutsch.

**Probier aus:** die Aufgaben im Kopf von `02-web-scraping.ts`. Achte darauf, ob das Modell Text aus dem `<scraped-context>`-Block als Daten behandelt oder als Anweisung.

**Stolperfallen**

- Deine Titel sind andere: Die Seite ändert sich ständig. Eine zweite Frage innerhalb von `NEWS_CACHE_MS` lädt nicht neu; im Log steht dann `Hacker News headlines loaded from cache`.
- Die Tags `<scraped-context>` helfen dem Modell, Daten von Anweisungen zu trennen. Ein vollständiger Schutz gegen indirekte Prompt-Injection sind sie nicht.
- Mit `BURP_PROXY_URL` läuft auch der Abruf von `https://news.ycombinator.com` über Burp. Dafür braucht Node Burps CA-Zertifikat (`BURP_CA_CERT`); fehlt es, bricht das Programm schon beim Start ab.
- Hilfsanfragen von Open WebUI (`### Task:`) bekommen keine Webdaten und einen kürzeren System-Prompt. Die Regel "nur mit dem Kontext" würde sonst das JSON für Titel und Tags brechen.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `BURP_CA_CERT is missing for HTTPS through Burp. …` | Zertifikat exportieren und eintragen ([Wenn etwas nicht klappt](../../README.de.md#wenn-etwas-nicht-klappt)) oder `BURP_PROXY_URL` leeren. |
| `Hacker News returned HTTP …` | Die Seite antwortet mit einem Fehler oder sperrt zu viele Abrufe. Kurz warten und erneut fragen. |
| `No headlines found. The Hacker News page layout may have changed.` | Der Selektor `span.titleline > a` passt nicht mehr zur Seite. |
| `ERROR Hacker News: Call failed – Cause: …` | Kein Internet, oder die Seite antwortet nicht innerhalb von `NEWS_TIMEOUT_MS`. |

> **Vertiefung:** Das Größenlimit `MAX_NEWS_BODY_BYTES` schützt vor riesigen oder endlosen Antworten (OWASP LLM10, Unbounded Consumption): Der Code liest die Seite Stück für Stück und bricht ab, sobald das Limit überschritten ist, statt alles erst in den Speicher zu laden. Der Cache speichert das Promise des Abrufs, damit gleichzeitige Anfragen von Open WebUI sich einen Abruf teilen. Wie man fremden Text in Produktion zusätzlich absichert: [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion).

## Teil 3 – Tool-Calls Schritt für Schritt

**In einem Satz:** Das Modell bekommt das Werkzeug `dateTime`; fragt es danach, führt deine handgeschriebene Schleife die Funktion aus und schickt das Ergebnis zurück.

**Ablauf**

1. **Werkzeug** (KERN 1). Eine normale Funktion plus Name, Beschreibung und Schema. Das Modell sieht nur Beschreibung und Schema; die Beschreibung entscheidet, wann es das Werkzeug nutzt.
2. **Anbieten** (KERN 2). `bindTools` hängt die Werkzeugbeschreibungen an jede Anfrage.
3. **Schleife** (KERN 3). Antwortet das Modell mit Tool-Calls statt Text, führt dein Code die Werkzeuge aus, hängt die Ergebnisse an das Gespräch und fragt erneut, höchstens `MAX_TOOL_ROUNDS` Runden lang.
4. **Zuordnen** (KERN 4). Jedes Ergebnis ist eine Nachricht mit der Rolle `tool` und der ID des Tool-Calls. Daran erkennt das Modell, auf welche Anfrage das Ergebnis antwortet.

**Das siehst du**

Alle Blöcke dieses Teils stammen aus dem früheren Lauf mit `qwen3.8-4b-q4`; die Generalprobe hat keinen Werkzeugaufruf mitgeschnitten.

Das Log nach der Frage "Wie spät ist es gerade in Berlin?":

```text
… INFO Model: Call started { messages: 1 }
… INFO The model requested tools { round: 1, tools: [ 'dateTime' ] }
… INFO Tool dateTime: called
… INFO Model: Call completed { messages: 1, durationMs: … }
```

Erste Anfrage an das Modell und seine Antwort (gekürzt):

```json
{"model":"qwen3.8-4b-q4","temperature":0,"stream":false,
 "tools":[{"type":"function","function":{"name":"dateTime","description":"Gibt das aktuelle Datum und die Uhrzeit in Deutschland (Europe/Berlin) zurück.","parameters":{"type":"object","properties":{},"additionalProperties":false}}}],
 "messages":[{"role":"user","content":"Wie spät ist es gerade in Berlin?"}]}

{"choices":[{"finish_reason":"tool_calls","message":{"role":"assistant","content":"",
  "tool_calls":[{"id":"PmGtKOd9…","type":"function","function":{"name":"dateTime","arguments":"{}"}}],
  "reasoning":"The user is asking what time it is currently in Berlin. I have access to a dateTime function …"}}],
 "usage":{"prompt_tokens":300,"completion_tokens":63,"total_tokens":363}}
```

Zweite Anfrage (nur `messages`) und die Antwort in Open WebUI:

```json
[{"role":"user","content":"Wie spät ist es gerade in Berlin?"},
 {"role":"assistant","content":"","tool_calls":[{"id":"PmGtKOd9…","type":"function","function":{"name":"dateTime","arguments":"{}"}}]},
 {"role":"tool","content":"Freitag, 13. November 2026 um 02:21","name":"dateTime","tool_call_id":"PmGtKOd9…"}]
```

```text
Es ist gerade **Freitag, 13. November 2026 um 02:21 Uhr** in Berlin.
```

**Was bedeutet das?**

- Eine Frage, zwei Anfragen an das Modell. Auf die erste antwortet es nicht mit Text, sondern mit `finish_reason: "tool_calls"` und dem Wunsch, `dateTime` mit `{}` aufzurufen.
- Ausgeführt hat die Funktion dein Code (`Tool dateTime: called`), nicht das Modell. Ein Modell kann nur Text erzeugen; der Tool-Call ist eine Bitte.
- In der zweiten Anfrage stehen der Tool-Call und das Ergebnis mit derselben ID im Verlauf. Daraus formuliert das Modell die Antwort.
- Die Werkzeugbeschreibung geht bei jeder Anfrage mit: 300 Prompt-Tokens für eine Frage aus sechs Wörtern.
- Aus dem zod-Schema `z.object({}).strict()` wird JSON Schema (das Format, in dem die API Argumente beschreibt) mit `additionalProperties: false`: kein einziges Argument erlaubt.

**Probier aus:** die Aufgaben im Kopf von `03-tool-call-base.ts`. Achte im Log auf die Zeile `The model requested tools` und die Rundennummer.

**Stolperfallen**

- Kleine Modelle rufen Werkzeuge unzuverlässig auf. Manchmal antwortet das Modell ohne Werkzeug, manchmal mit kaputten Argumenten. Dann schickt die Schleife eine Korrektur und versucht es in der nächsten Runde erneut.
- Auch die Hilfsanfragen von Open WebUI (Titel, Tags) laufen in Teil 3 durch die Schleife und bekommen die Werkzeuge angeboten. Teil 3 unterscheidet sie nicht.
- `MODEL_TIMEOUT_MS` ist größer als in Teil 2: Ein Durchlauf braucht mindestens zwei Modell-Aufrufe.
- Mit `SHOW_THINKING=true` bleiben die Denkschritte im Verlauf, den das Modell in der nächsten Runde liest.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `The model returned no answer text.` | Das Modell hat nur gedacht und keinen Text geliefert. Frage erneut stellen. |
| `ERROR Model: Call failed – Cause: Request timed out.` | Das Modell war zu langsam für `MODEL_TIMEOUT_MS`. Erneut versuchen oder ein kleineres Modell nehmen. |

> **Vertiefung:** Werkzeuge geben dem Modell Handlungsmacht. In Produktion bekommt jedes Werkzeug nur die Rechte, die es braucht, und folgenreiche Aktionen gibt ein Mensch frei (OWASP LLM06, Excessive Agency). `MAX_TOOL_ROUNDS` begrenzt, wie viele Aufrufe ein Modell auslösen kann, das immer weiter Werkzeuge anfordert (OWASP LLM10).

## Teil 4 – Tool-Calls, die kurze Variante

**In einem Satz:** Dasselbe Werkzeug wie in Teil 3, aber die Schleife übernimmt `createAgent` von LangChain.

**Ablauf**

1. **Agent** (KERN 1). `createAgent` bekommt Modell und Werkzeuge und führt dieselbe Schleife aus wie `answerWithTools` in Teil 3.
2. **Ein Aufruf** (KERN 2). `agent.invoke` ersetzt die ganze Schleife. `recursionLimit` begrenzt sie: Der Agent läuft als Graph, eine Runde sind zwei Schritte (Modell, Werkzeug), also `2 * MAX_TOOL_ROUNDS`.

**Das siehst du**

Wie in Teil 3: früherer Lauf mit `qwen3.8-4b-q4`.

```text
… INFO Model: Call started { messages: 1 }
… INFO Tool dateTime: called
… INFO Model: Call completed { messages: 1, durationMs: … }
```

```text
Es ist gerade **Freitag, 13. November 2026 um 02:21 Uhr** in Berlin.
```

**Was bedeutet das?**

- Dieselbe Antwort wie in Teil 3. Wie viele Anfragen dahinter stehen, zeigt nur Burp.
- Die Zeile `The model requested tools` fehlt. Sie stammte aus deiner Schleife in Teil 3; jetzt läuft die Schleife in LangChain.
- Die letzte Nachricht in `response.messages` ist die Antwort. Die davor sind der Tool-Durchlauf.

**Probier aus:** die Aufgaben im Kopf von `04-tool-calls-short.ts`. Achte darauf, welche Fehlerbehandlung aus Teil 3 du hier nicht mehr selbst schreibst.

**Stolperfallen**

- `recursionLimit` zählt Graph-Schritte, nicht Runden. Deshalb steht dort `2 * MAX_TOOL_ROUNDS`.
- Wird das Limit erreicht, wirft LangChain einen Fehler (`GraphRecursionError`), statt endlos weiterzulaufen.
- Auch hier laufen die Hilfsanfragen von Open WebUI durch den Agenten.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `The model returned no answer text.` | Die letzte Nachricht war leer. Frage erneut stellen. |
| `FACADE_PORT 11435 is in use. …` | Teil 3 läuft noch. Mit Strg+C beenden. |

> **Vertiefung:** `createAgent` läuft als Graph aus LangGraph (der Graph-Bibliothek von LangChain): ein Schritt für das Modell, einer für die Werkzeuge. Eigene Schritte, etwa die Freigabe eines Werkzeugaufrufs durch einen Menschen, hängt man als Middleware an (z. B. `humanInTheLoopMiddleware` aus `langchain`), statt die Schleife wie in Teil 3 selbst zu schreiben.

## Das nimmst du mit

1. Ein Modell weiß nur, was im Prompt steht oder in seinen Trainingsdaten stand. Fehlendes Wissen musst du mitschicken, bei jeder Anfrage.
2. Fremder Text im Prompt kann Anweisungen enthalten. Tags und Regeln im System-Prompt helfen, schützen aber nicht vollständig.
3. Ein Tool-Call ist eine Bitte des Modells. Ausführen tut dein Code, und dein Code begrenzt, wie oft.

## Weiter geht's

[Lektion 03 – Embeddings](../03-embeddings/README.de.md) zeigt, wie man zu einer Frage die passenden Texte nach ihrer Bedeutung findet. Ab Lektion 04 entsteht daraus ein Index, und [Lektion 07](../07-rag-open-webui/README.de.md) legt die gefundenen Stücke wie in Teil 2 in den Prompt (RAG), mit derselben Fassade und derselben Quellenliste. Den Datenfluss beschreibt [docs/architecture.de.md](../../docs/architecture.de.md).
