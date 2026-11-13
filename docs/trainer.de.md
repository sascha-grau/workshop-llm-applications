# Trainer-Notizen

*English version: [trainer.md](trainer.md)*

Ablauf, Vorbereitung, Lösungen und Gesprächspunkte für die Trainerin oder den Trainer. Die Aufgaben selbst stehen in den Dateiköpfen der Lektionsdateien; hier stehen nur die erwarteten Ergebnisse. Zeitangaben ohne Modell und Datum sind Planungswerte, keine Messungen. Gemessene Laufzeiten und erwartete Ergebnisse stammen aus der Generalprobe am 2026-11-13: LM Studio auf einer RTX 3080 Ti, Chat `qwen3.5-4b` (Kontext 8192, Max Concurrent Predictions 1), `text-embedding-multilingual-e5-base`, `text-embedding-embeddinggemma-300m-qat`, Qdrant 1.20.0. Teilnehmer-Laptops ohne vergleichbare GPU sind langsamer. Wenige Zeilen aus einem früheren Lauf sind in den Lektionstabellen markiert.

## Vorab-Checkliste

| Prüfen | So | Ok, wenn |
|---|---|---|
| Node 22.19 oder neuer | `node --version` | Version ≥ 22.19 |
| Pakete | `npm ci` (braucht Zugang zur npm-Registry) | Ohne Fehler; `npm audit`-Funde sind bekannt (Wurzel-README) |
| E5-Tokenizer | `npm run tokenizer:fetch` (einmal, braucht Internet) | "E5 tokenizer ready for offline use" |
| `.env` | `cp .env.example .env`, Identifier aus LM Studio eintragen (`lms ps`) | `REMOTE_MODEL_NAME`, `REMOTE_EMBEDDING_MODEL_NAME`, `REMOTE_EMBEDDING_GEMMA_MODEL_NAME` passen zu LM Studio; `SHOW_THINKING` und `ALL_DOCUMENTS` leer |
| LM Studio | Chat-Modell mit Max Concurrent Predictions 1 laden (`lms load <identifier> --parallel 1`; Standard 4 teilt den Kontext, siehe Wurzel-README), dazu E5 und EmbeddingGemma; Server starten | `curl http://localhost:1234/v1/models` listet alle drei; `lms ps` zeigt beim Chat-Modell Parallel 1 |
| Erster Aufruf | `npm run l01:1` | Antwort erscheint Token für Token |
| Docker und Qdrant | `docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.20.0` | `http://localhost:6333/dashboard` öffnet sich |
| Open WebUI | Befehl aus der Wurzel-README (`v0.13.3`, Port 3000, `--add-host`) | Admin-Konto angelegt; Ollama-Verbindung auf die Fassade |
| Burp | Listener `127.0.0.1:8080`, Intercept **aus**, CA als DER exportieren, `openssl x509 -inform der -in burp.der -out burp.pem`, `BURP_CA_CERT=burp.pem` | `npm run l01:3` mit `BURP_PROXY_URL=http://localhost:8080` zeigt Anfragen in der HTTP-History |
| Indizes vorab bauen | `npm run l04:0`, prüfen mit `npm run l04:0 -- --verify` (erwartet `counted_with: tokenizer` und 69 Chunks), dann `l04:1`, `l04:2`, `l04:3`, `l04:4` | Vier Dateien unter `indexes/` |
| Qdrant befüllen | `npm run l06:1` | Vier Collections im Dashboard |
| promptfoo-Probelauf | `npm run l08:5 -- --filter-first-n 1` | Bericht unter `results/lesson-08-promptfoo/` |

**Dauer der Vorarbeit:** `l04:4` brauchte für den ganzen Korpus (199 Chunks) 4623 s, also etwa 77 Minuten (Generalprobe). Baue den Fragen-Index deshalb vorab und gib ihn weiter. Wer ohne ihn arbeitet: Setze `FULL_CORPUS = false` in `lessons/04-chunking/04-question-generation-chunking.ts` (nur `EXAMPLE_DOCUMENT`). Ein abgebrochener Lauf setzt fort und ergänzt nur fehlende Chunks. `l04:0` bis `l04:3` dauern Sekunden; die Zahl der Anfragen steht in [`lessons/04-chunking/GUIDE.de.md`](../lessons/04-chunking/GUIDE.de.md#teil-0--chunks-vorbereiten) → „Teil 0“ (Vertiefung).

### Ports

| Port | Dienst |
|---|---|
| 1234 | LM Studio (`/v1`) |
| 8080 | Burp-Listener (deshalb Open WebUI nicht auf 8080) |
| 3000 | Open WebUI (Container-Port 8080) |
| 11435 | Ollama-Fassade (`FACADE_PORT`): immer nur ein Chat-Teil (L01 Teil 2–3, L02 Teil 1–4, L07) |
| 6333 | Qdrant samt Dashboard |

### Auf den USB-Stick

| Was | Wozu | Achtung |
|---|---|---|
| `indexes/` (vier JSON-Dateien) | Spart `l04:1` bis `l04:4`, vor allem die lange Fragengenerierung | Der Dateiname enthält `REMOTE_EMBEDDING_MODEL_NAME` (in LM Studio z. B. `headings__text-embedding-multilingual-e5-base.json`). Teilnehmende brauchen denselben Identifier und dasselbe E5-Modell, sonst "Cannot load index" bzw. unpassende Vektoren. |
| `.cache/tokenizers/` (E5-Tokenizer, rund 16 MB) | `l04:0` zählt exakt, auch ohne Internet | Ordner in den Repo-Root kopieren; ohne ihn lädt `l04:0` aus dem Netz oder fällt auf den Server zurück |
| `content/owasp-genai-top-10/chunks/` samt `manifest.json` | Teil 1 bis 4 von Lektion 04 laufen ohne `l04:0` | Nur mit demselben `REMOTE_EMBEDDING_MODEL_NAME` erzeugt wie bei den Teilnehmenden (das Manifest nennt das Modell; sonst scheitert `--verify`). Einfacher: Teilnehmende starten `npm run l04:0` selbst; mit `.cache/tokenizers/` entstehen dieselben Chunks in Sekunden. `l04:0` bricht ab, wenn `chunks/` existiert. Lizenz CC BY-SA 4.0 (Wurzel-README, "Lizenz"): Quelle nennen. |
| `results/lesson-08-promptfoo/05-promptfoo-strategies.html` (voller Lauf von L08, Teil 5) | Aufgabe 1 und 2 von Teil 5; Teilnehmende starten selbst nur `--filter-first-n 1` | Bericht vom selben Modell wie im Workshop, vorher erzeugen |
| Optional: GGUF-Dateien der Modelle | Schwaches WLAN | Identifier in LM Studio prüfen |

Nach dem Kopieren startet jede Person selbst `npm run l06:1` (bettet nichts neu ein, braucht nur Qdrant).

### Gemeinsamer Trainer-Server

Teilen sich rund 20 Personen einen Modell-Server (Wurzel-README, "Variante: Trainer-Server"), stauen sich Chat-Aufrufe. Planung:

| Aufgabe | Last je Lauf | Im Workshop |
|---|---|---|
| L04, Teil 0: Neuschnitt mit `TOKEN_LIMIT_OVERRIDE` | Hunderte Embedding-Anfragen (Zahl: Guide Teil 0) | Demo durch den Trainer |
| L04, Teil 4, Aufgabe mit `QUESTIONS_PER_CHUNK` | Ein Chat-Aufruf je Chunk des Beispieldokuments | Demo oder paarweise |
| L06, Teil 5–7; L07, Teil 9–10 | Mehrere Chat-Aufrufe je Frage (Reranking mit Denken, Fassungen) | Paarweise; L07, Teil 9 (Minuten je Frage) als Demo |
| L08, Teil 2 und 3 | Antwort plus zwei Urteile je Lauf, mit ganzem Kontext | Paarweise |
| L08, Teil 5 | Voller Lauf: alle Zellen mit Antwort und mehreren Urteilen | Auf einem geteilten Server Demo (vorab gelaufen); Teilnehmende nur `--filter-first-n 1`. Mit eigener GPU starten sie den vollen Lauf selbst (siehe Lektion 08). |
| L08, Teil 6 | Eine Antwort und ein Urteil je Frage, über die Fassade | Paarweise mit `--filter-first-n 1` |
| Alle Teile nur mit Embeddings (L03, L04 Teil 1–3, L05, L08 Teil 1 und 4) | Leicht | Allein |

## Schalter: Standard und Zurücksetzen

Viele Aufgaben ändern Konstanten. Bleibt eine geändert, verfälscht sie spätere Lektionen. Schnellster Überblick: `git status` und `git diff --stat lessons/`; zurücksetzen mit `git checkout -- <datei>`. `.env` ist nicht im Repo und muss von Hand geleert werden.

| Schalter | Datei | Standard | Wirkt bis | Zurücksetzen |
|---|---|---|---|---|
| `SHOW_THINKING` | `.env` | leer | JSON-Teile in L04, L06, L07, L08 | leeren |
| `ALL_DOCUMENTS` | `.env` (überschreibt die Konstante) | leer | nur Ausgabe L04, Teil 1–3 | leeren |
| `BURP_PROXY_URL` | `.env` | leer | alle Programme ab L01, Teil 3 | leeren, wenn Burp nicht läuft |
| `TOKEN_LIMIT_OVERRIDE` | `lessons/04-chunking/00-prepare-chunks.ts` | `undefined` | Chunks und damit alle Indizes | `undefined`; die 256er-`chunks/` löschen und die beiseitegelegten `chunks-512/` zurück in `chunks/` umbenennen. Ohne Sicherung: `l04:0`, dann `l04:1`–`l04:4`, `l06:1` |
| `EXAMPLE_DOCUMENT` | `lessons/04-chunking/chunking.ts` | `'01-llm01-prompt-injection.md'` | Ausgabe L04; `l04:4` bei `FULL_CORPUS = false` | Wert zurück |
| `ALL_DOCUMENTS` | `lessons/04-chunking/chunking.ts` | `false` | nur Ausgabe | Wert zurück und `.env` leeren |
| `DEMO_QUESTION` | `lessons/04-chunking/chunking.ts` | `'Wie begrenze ich Prompt Injection?'` | nur Ausgabe L04 | Wert zurück |
| Überschriftentiefe `#{1,3}` | `splitByHeadings` in `chunking.ts` | `#{1,3}` | Index `headings` (L05–L08), `questions` | zurück, `l04:2`; Fragen-Index löschen und `l04:4`; `l06:1` |
| `SUBSET` | `lessons/04-chunking/02-heading-chunking.ts` | `[]` | Index `headings` (L05–L08) | `[]`, `l04:2`, `l06:1` |
| `DISTANCE_PERCENTILE` | `03-semantic-chunking.ts` | `95` | Index `semantic` (L06, Teil 1; L07, Teil 2; L08, Teil 5) | `95`, `l04:3`, `l06:1` |
| `QUESTIONS_PER_CHUNK`, Fragen-Prompt | `04-question-generation-chunking.ts` | `3` | Index `questions` | zurück, neue Indexdatei löschen, `.bak` zurückbenennen |
| `FULL_CORPUS` | `04-question-generation-chunking.ts` | `true` | Index `questions` | `true`, `l04:4` (setzt fort) |
| `CHILD_SIZE` | L04, Teil 5; L07, Teil 4 | `300` | nur dieser Teil | Wert zurück |
| `ALLOWED_ACCESS_GROUPS` | `05-retrieval-strategies/03-metadata-filter.ts` | `['public']` | nur dieser Teil | Wert zurück |
| `question-set.json` | `lessons/05-retrieval-strategies/` | 12 Fragen + `withoutSource` | `l05:5`, `l08:1`–`l08:6` | `git checkout -- lessons/05-retrieval-strategies/question-set.json` |
| `TEXT_INDEX` (Stemmer) | `06-hybrid-rerank/01-collection-load.ts` | `german` | alle Collections | zurück, `l06:1` |
| `INDEX_STRATEGY` | `06-hybrid-rerank/hybrid.ts` | `'headings'` | L06, Teil 2–7, **L07, Teil 8–11 und `l08:6`** | zurück, Teile neu starten |
| `ENABLE_INJECTION_DEMO` | `07-rag-open-webui/01-heading-rag.ts` | `false` | `l07:1` | `false` |
| `RERANK_THINKING` | `06-hybrid-rerank/05-reranking.ts`, `06-hybrid-rerank/99-full-demo.ts` | `true` | `l06:5`, `l06:7` | `true` |
| `RERANK_THINKING` | `07-rag-open-webui/qdrant-retrieval.ts` | `true` | `l07:9`, `l07:11` (`lesson-07-rerank`) | `true`, neu starten |
| `TOP_K`, `LAMBDA`, `FETCH_K`, `SCORE_THRESHOLD`, `CANDIDATES`, `VARIANT_COUNT`, `ALLOWED_SOURCES` | jeweilige Datei in L05–L07; `demo.ts` | siehe Datei | nur diese Datei | Wert zurück |
| `TOP_K` | `08-evaluations/01-…`, `03-…`, `04-regression.ts` | `5` | Messung; L08, Teil 4 vergleicht mit gespeicherten Läufen | `5`; ggf. `results/lesson-08-regression/` leeren |
| `QUESTION_ID`, `EXPAND_SECTIONS` | `08-evaluations/03-correctness.ts` | `'F-01'`, `true` | nur Teil 3 | Werte zurück |
| `INVENTED_ANSWER`, `QUESTION`, Sätze im `JUDGE_SYSTEM_PROMPT` | `08-evaluations/02-faithfulness.ts` | siehe Datei | nur Teil 2 | `git checkout -- <datei>` |
| `topK` unter `config`, Provider-`id` | `05-promptfoo-strategies.yaml`, `06-promptfoo-black-box.yaml` | ohne `topK` (= 5), `lesson-07-hybrid` | Teil 5, 6 | `git checkout -- <datei>` |

**Tipp:** Kopiere den fertigen Fragen-Index vor Lektion 04 (`indexes/questions__*.json`). Die Aufgabe zu `QUESTIONS_PER_CHUNK` lässt ihn in `*.bak` umbenennen und danach zurückbenennen; geht das schief, sparst du mit deiner Kopie den langen Neuaufbau.

## Häufige Stolperfallen

| Symptom | Ursache | Lösung |
|---|---|---|
| Befehle aus dem Dateikopf scheitern unter Windows | POSIX-Syntax | Tabelle "Windows" unten |
| `Context size has been exceeded`, vor allem in L08, Teil 5 | Chat-Modell mit Standard Max Concurrent Predictions 4 geladen; die Plätze teilen sich den Kontext | Mit `--parallel 1` neu laden (Wurzel-README, "LM Studio einrichten"). Kontext erhöhen scheiterte in der Generalprobe am Grafikspeicher. |
| Antworten sehr langsam, Judge läuft in Timeout | Laptop ohne GPU | Trainer-Server (Wurzel-README, "Variante: Trainer-Server"), vorab gebaute Indizes, `npm run l08:5 -- --filter-first-n 1` |
| Modell denkt trotz `reasoning_effort: 'none'` | Manche Server ignorieren den Wert (Kommentar in `evaluation.ts`, `promptfoo-judge.ts`) | Code verbirgt das Denken trotzdem; `max_tokens` im Judge-Block muss es mit abdecken. Bei "truncated (finish_reason: length)" zuerst `max_tokens` im Judge-Block erhöhen, dann ein anderes Modell nehmen |
| JSON-Fehler, leere Fragen, "no usable verdict", Multi-Query bricht ab | `SHOW_THINKING=true` (gewollt, [decisions](decisions.de.md#show-thinking)) | In `.env` leeren. Betroffen: L04, Teil 4; L06, Teil 5, 6, 7; L07, Teil 3 (indirekt: der Fragen-Index bekommt keine neuen Fragen) und Teil 9–11; L08, Teil 2, 3 (5 und 6 unzuverlässig) |
| "FACADE_PORT 11435 is in use" | Zweiter Chat-Teil (L01, L02, L07) läuft noch | Mit Strg+C beenden; nur ein Teil zur Zeit |
| "The request through Burp failed or timed out" | Intercept in Burp ist an | Intercept aus |
| "Cannot load index … (strategie)" | Index fehlt | Tabelle "Fehlende Artefakte" unten |
| "The chunk manifest is invalid or outdated" | Alte Chunks oder `TOKEN_LIMIT_OVERRIDE` geändert | `TOKEN_LIMIT_OVERRIDE` auf `undefined`. Existiert `chunks-512/`: die neuen `chunks/` löschen und `chunks-512/` zurückbenennen; sonst `chunks/` löschen und `npm run l04:0` |
| "The Qdrant collection … does not exist" | Frischer Container | `npm run l06:1` |
| L07, Teil 8–11 suchen im falschen Index | `INDEX_STRATEGY` in `hybrid.ts` nach L06, Teil 2 nicht zurückgesetzt | auf `'headings'` |
| promptfoo endet mit Exit-Code 100 und Stacktrace | Zellen mit ERROR ("judge format error") | Kein Absturz; Bericht ist geschrieben |
| `npx promptfoo view` im WLAN erreichbar | Lauscht auf allen Schnittstellen (Kopf von `05-promptfoo-strategies.yaml`) | Nach dem Ansehen Strg+C |

### Fehlende Artefakte

Wer welches Artefakt liest: [architecture.de.md](architecture.de.md#wer-welchen-index-liest).

| Fehlt | Skript |
|---|---|
| Chunks | `npm run l04:0` |
| Index `prepared` | `npm run l04:1` |
| Index `headings` | `npm run l04:2` |
| Index `semantic` | `npm run l04:3` |
| Index `questions` | `npm run l04:4` |
| Qdrant-Collections | `npm run l06:1` |
| Fassade für `l08:6` | `npm run l07:11` oder `npm run l07:8` in zweitem Terminal |

### Windows

| Zweck | bash | PowerShell | cmd |
|---|---|---|---|
| `.env` anlegen | `cp .env.example .env` | `Copy-Item .env.example .env` | `copy .env.example .env` |
| Stacktrace | `DEBUG=1 npm run l01:3` | `$env:DEBUG=1; npm run l01:3` (danach `Remove-Item Env:DEBUG`) | `set DEBUG=1 && npm run l01:3` |
| Chunks beiseitelegen | `mv content/owasp-genai-top-10/chunks content/owasp-genai-top-10/chunks-512` | `Rename-Item content\owasp-genai-top-10\chunks chunks-512` | `ren content\owasp-genai-top-10\chunks chunks-512` |
| Fragen-Index beiseitelegen (Dateiname mit deinem Modell) | `mv indexes/questions__<modell>.json indexes/questions__<modell>.json.bak` | `Rename-Item indexes\questions__<modell>.json questions__<modell>.json.bak` | `ren indexes\questions__<modell>.json questions__<modell>.json.bak` |
| Burp-CA umwandeln | `openssl …` | in Git Bash | in Git Bash |

Ohne Shell: im Explorer von VS Code die Datei oder den Ordner wählen und F2 drücken. `npm run …` und `npm run l08:5 -- --filter-first-n 1` funktionieren in allen Shells. Mit `FACADE_HOST=0.0.0.0` unter Windows in `06-promptfoo-black-box.yaml` `127.0.0.1` eintragen (Kommentar dort).

## Ablauf zwei Tage

Annahmen: Zeiten je Lektion wie unten ("Dauer (Planung)"), also Erklären plus Aufgaben; die Programme selbst laufen laut Generalprobe meist Sekunden. Ausnahmen: Reranking mit Denken braucht in L06, Teil 5 knapp 2 Minuten je Lauf und in L07, Teil 9 rund 2,5 Minuten je Frage; Teil 9 zeigt der Trainer vor, während die Gruppe Teil 10 vorbereitet. Langsamere Laptops brauchen mehr Puffer: dann Aufgaben paarweise und die Vertiefungsstunde an Tag 2 als Reserve.

| Tag 1 | Block | Läuft im Hintergrund |
|---|---|---|
| 09:00–10:00 | Ankommen, Vorab-Checkliste (LM Studio mit Parallel 1, Docker, Open WebUI, Burp), USB-Artefakte kopieren | – |
| 10:00–10:45 | Lektion 01 – Vorbereitung | – |
| 10:45–11:00 | Pause | Teilnehmende ohne USB-Stick: `npm run l04:0` bis `l04:3` (Sekunden) |
| 11:00–12:15 | Lektion 02 – Tool-Calls | – |
| 12:15–13:15 | Mittag | Teilnehmende ohne Fragen-Index: `l04:4` mit `FULL_CORPUS = false` |
| 13:15–14:00 | Lektion 03 – Embeddings | – |
| 14:00–15:30 | Lektion 04 – Chunking | – |
| 15:30–15:45 | Pause | `docker start qdrant`, `npm run l06:1` (Sekunden; nach Lektion 04, falls Indizes neu gebaut) |
| 15:45–16:45 | Lektion 05 – Retrieval-Strategien | – |
| 16:45–17:00 | Rückblick | Trainer am Abend: voller `npm run l08:5` für den Bericht (Generalprobe: 6 min 59 s) |

| Tag 2 | Block | Läuft im Hintergrund |
|---|---|---|
| 09:00–09:15 | Routine: `git status`, `.env`-Schalter prüfen, Qdrant läuft | – |
| 09:15–10:30 | Lektion 06 – Hybrid-Suche und Reranking | – |
| 10:30–10:45 | Pause | Open WebUI und Fassade prüfen |
| 10:45–12:15 | Lektion 07 – RAG mit Open WebUI | Teil 9 als Demo des Trainers |
| 12:15–13:15 | Mittag | Teilnehmende mit eigener GPU: voller `npm run l08:5` |
| 13:15–14:45 | Lektion 08 – Evaluierung | – |
| 14:45–15:00 | Pause | – |
| 15:00–16:00 | Reserve und Vertiefung: offene Aufgaben, [production.de.md](production.de.md) | – |
| 16:00–16:30 | Abschluss, Fragen | – |

Am Vorabend des Workshops baut der Trainer alle Indizes (`l04:4` etwa 77 Minuten) und füllt Qdrant.

## Lektionen

Die Tabellen folgen den Aufgaben im Dateikopf (Nummer = Aufgabe). Laufzeiten und erwartete Ergebnisse stammen aus der Generalprobe (siehe oben), sofern nicht anders vermerkt. Zeilen mit "früherer Lauf" wurden nicht neu gemessen; sie stammen vom 2026-11-13 mit `qwen3.8-4b-q4` über einen OpenAI-kompatiblen Server. Zeilen ohne Zahl ("ablesen") sind nicht gemessen. Ausgaben ohne Aufgabe stehen im Guide der Lektion ("Das siehst du").

### 01 – Vorbereitung

| | |
|---|---|
| Dauer (Planung) | 45 Minuten: Teil 1 10, Teil 2 15, Teil 3 20 |
| Laufzeit (Generalprobe) | Teil 1 9 s, Teil 2 24 s je Frage; Teil 3 nicht gemessen (Burp) |
| Vorab | Chat-Modell in LM Studio, Open WebUI mit Ollama-Verbindung auf `http://127.0.0.1:11435` (Docker: `host.docker.internal`, `FACADE_HOST=0.0.0.0`), Burp |
| Gesprächspunkte | Streaming Token für Token; die Fassade gibt sich als Ollama aus; Burp zeigt den API-Schlüssel im Klartext (Screenshots schwärzen); mit `SHOW_THINKING=true` denkt `qwen3.5-4b` auf Englisch in mehreren nummerierten Entwürfen |

| Teil, Aufgabe | Erwartetes Ergebnis |
|---|---|
| 1.1 | Keine feste Lösung; die Antwort läuft Token für Token ein. |
| 1.2 | `temperature: 1.5` ändert die Wortwahl von Lauf zu Lauf (ablesen). |
| 1.3 | Mit `invoke` erscheint die Antwort erst am Ende, auf einmal. `modelText(response)` nehmen: `.text` allein ließe die Denkschritte auch mit `SHOW_THINKING=true` weg. |
| 2.1 | Je Nachricht `HTTP request started/completed` und `Model: Call started/completed`. Mit curl gemessen: zweimal `GET /api/tags`, eine `POST /api/chat`, `messages: 1`; aus Open WebUI kommen zusätzlich Hilfsanfragen (siehe 2.3). |
| 2.2 | Der neue `ADVERTISED_MODEL` erscheint nach Neuladen im Dropdown. |
| 2.3 | Ganzer Verlauf, dazu Hilfsanfragen von Open WebUI mit `### Task:` (Titel, Tags). |
| 3.1 | Im JSON-Body (`messages`) der Anfrage an `/v1/chat/completions` (früherer Lauf). |
| 3.2 | Das Modell beantwortet den geänderten Text. Zum Ändern bleibt Zeit bis `MODEL_TIMEOUT_MS`, dann bricht der Aufruf ab (früherer Lauf). |
| 3.3 | Burp zeigt viele `data:`-Zeilen statt eines JSON-Objekts (früherer Lauf). |

### 02 – Tool-Calls

| | |
|---|---|
| Dauer (Planung) | 75 Minuten: Teil 1 15, Teil 2 25, Teil 3 20, Teil 4 15 |
| Laufzeit (Generalprobe) | Teil 1 47 s, Teil 2 16 s, Teil 3 4 s, Teil 4 4 s |
| Vorab | Internet für Teil 2; bei gesetztem `BURP_PROXY_URL` auch `BURP_CA_CERT`. Alle vier Teile nutzen `FACADE_PORT`: immer nur einer läuft. |
| Gesprächspunkte | Wissen in den Prompt vs. Werkzeug; indirekte Prompt-Injection (LLM01); Ausgabe-Behandlung (LLM05); kleine Modelle sind schwach bei Werkzeugaufrufen |

| Teil, Aufgabe | Erwartetes Ergebnis |
|---|---|
| 1.1 | "Im vorliegenden Text steht nichts darüber, wie alt Ano Nym ist." Richtige Absage, aber ohne die Endung "(Quelle: Kontext)" der Beispiele; die angehängte Liste nennt "[1] Kontext im System-Prompt (Ano Nym)". |
| 1.2 | Ohne die Beispiele gehen Format und "(Quelle: Kontext)" verloren oder schwanken. |
| 1.3 | Der System-Prompt steht als erste Nachricht im Body; mit `temperature` 1 schwanken die Antworten (früherer Lauf). |
| 2.1 | Der Abruf von `news.ycombinator.com` steht in der HTTP-History (früherer Lauf). Generalprobe: 30 Titel, die Antwort zitiert dreimal [1]. |
| 2.2 | Die Anweisung kann wirken; ohne `<scraped-context>` eher. |
| 2.3 | Der Browser lädt die Bild-URL samt Frage (Netzwerk-Tab), Burp sieht das nicht: Er sieht nur den Verkehr von Node. Abhilfe: Bilder und Links aus Modellausgaben nicht darstellen oder nur erlaubte Ziele; die Quellenliste des Workshops nutzt deshalb Inline-Code (`formatSourceList`). |
| 3.1 | `tools` in der Anfrage, `tool_calls` in der Antwort (früherer Lauf). |
| 3.2 | Vorher: Auf "Würfle eine Zahl zwischen 1 und 6." kommt kein Tool-Call; das Modell erfindet "4 🎲", bei `temperature` 0 jedes Mal dieselbe Zahl. Mit dem Werkzeug: In `toolsByName` gehört `[randomNumber.name, randomNumber]`. |
| 3.3 | Das Werkzeug läuft, danach Fehler "The model was still requesting tools after 1 rounds." (früherer Lauf). |
| 4.1 | Gleich bis auf `"name":"model"`, das LangChain an die Assistenten-Nachricht mit `tool_calls` hängt; beide Teile schicken zwei Modell-Anfragen (früherer Lauf). |
| 4.2 | `answerWithTools` hatte 62 Zeilen. Der Agent übernimmt die Schleife: Werkzeug nach Namen finden, Ergebnis per Tool-Call-ID zuordnen, Rundenlimit (`recursionLimit`). |
| 4.3 | Ein Eintrag im Array `tools`; vorher erfindet auch Teil 4 die Würfelzahl (siehe 3.2). |

### 03 – Embeddings

| | |
|---|---|
| Dauer (Planung) | 45 Minuten: Teil 1 10, Teil 2 15, Teil 3 20 |
| Laufzeit (Generalprobe) | Teil 1 unter 1 s, Teil 2 1 s, Teil 3 1 s |
| Vorab | E5 und EmbeddingGemma geladen |
| Gesprächspunkte | Kosinus misst Richtung; bei E5 liegen auch unpassende Texte hoch, die Reihenfolge zählt; Präfixe `query: `/`passage: ` |

| Teil, Aufgabe | Erwartetes Ergebnis |
|---|---|
| 1.1 | "Der Regionalzug nach Hamburg fährt ab Montag eine halbe Stunde früher ab." ergab 0,762: deutlich gesunken, aber über 0,5 (früherer Lauf). |
| 1.2 | 1,000. |
| 1.3 | Der Vektor steht als Zahlenliste in der Antwort (`encodingFormat: 'float'`). |
| 2.1, 2.2 | Keine feste Lösung; die Reihenfolge prüfen. |
| 2.3 | Abstand Platz 3 → 4: E5 0,051 (0,814 → 0,763), Gemma 0,258 (0,502 → 0,244). Gemma trennt deutlich schärfer. |
| 3.1 | Treffer auf Platz 1 ohne → mit Präfix: E5 Index A 7 → 8, Index B 0 → 5; Gemma A 7 → 8, B 1 → 4. Am meisten bringen die Präfixe in Index B. |
| 3.2 | Keine feste Lösung. |
| 3.3 | Index B: E5 2, Gemma 2, also schlechter als mit richtigen Präfixen, besser als ohne (früherer Lauf). |

### 04 – Chunking

| | |
|---|---|
| Dauer (Planung) | 90 Minuten mit vorab gebauten Indizes: Teil 0 15, Teil 1 15, Teil 2 15, Teil 3 15, Teil 4 15, Teil 5 15 |
| Laufzeit (Generalprobe) | Teil 0 1 s (`--verify` 1 s), Teil 1 1 s, Teil 2 2 s, Teil 3 6 s, Teil 4 4623 s für den ganzen Korpus (deshalb vorab), Teil 5 2 s |
| Zu Beginn | `git status` (geänderte Dateien aus früheren Aufgaben?); in `.env` `SHOW_THINKING`, `ALL_DOCUMENTS`, `BURP_PROXY_URL` prüfen. Ein seit Lektion 01 gesetztes `SHOW_THINKING=true` bricht still `l04:4`, L06 Teil 5–7, L07 Teil 3 (indirekt) und 9–11 sowie L08. |
| Vorab | Chunks und alle vier Indizes; eigene Kopie des Fragen-Index |
| Gesprächspunkte | Token-Limit und exakte Zählung mit dem Tokenizer (`counting_method` im Manifest); Struktur vs. Bedeutung vs. generierte Fragen; Multi-Vektor-Index; Small-to-Big; `headings` ist die Grundlage von Lektion 05 bis 08 |

| Teil, Aufgabe | Erwartetes Ergebnis |
|---|---|
| 0.1 | `--001` endet nach "Beschreibung", `--002` beginnt mit "Arten von Prompt Injection-Schwachstellen": Schnitt an einer Abschnitts- bzw. Absatzgrenze. |
| 0.2 | `tokenizer`: exakt gezählt mit dem lokalen E5-Tokenizer (69 Chunks, 173 bis 512 Tokens). `embeddings-overflow`/`embeddings-usage`: Der Server zählt. `character-estimate`: nur geschätzt. |
| 0.3 | Deutlich mehr Chunks. Bleibt der Wert gesetzt, lehnen Teil 1 bis 4 das Manifest ab (Limit ≠ 512). |
| 1.1 | Die Treffer liegen im Dokument zu Prompt Injection (dort steht Jailbreaking). |
| 1.2 | Ablesen; Ergebnis hängt vom gewählten Dokument ab. |
| 1.3 | Die Linklisten `--007` und `--008` mit 2,8 bzw. 2,9 Zeichen je Token (URLs zerfallen in viele kleine Tokens); Minimum im Korpus 2,51 (früherer Lauf). |
| 2.1 | Teil 1, Rang 1: `--003` (0,871) mischt Multimodalität und erste Maßnahmen, ein gemittelter Vektor. Teil 2, Rang 1: "1. Begrenzen Sie das Modellverhalten" (0,885), ein kleiner Chunk mit einem Thema. |
| 2.2 | Weniger, größere Chunks; Treffer werden gemischter (ablesen). |
| 2.3 | Einbetten deutlich schneller (ein Dokument statt zwölf). |
| 3.1 | Mehr semantische Schnitte in langen Dokumenten; kurze bleiben gleich (ablesen). |
| 3.2 | Bei 100 ist die Schwelle das Maximum; kein Abstand ist größer, also kein Schnitt. |
| 3.3 | 81 statt 12 Aufrufe: 69 Fenster-Anfragen (eine je vorbereitetem Chunk) plus 12 Chunk-Anfragen (eine je Dokument). |
| 4.1 | Nur `EXAMPLE_DOCUMENT` wird bearbeitet; es hat 24 Chunks. In der Generalprobe brauchte dieses Dokument mit 3 Fragen je Chunk 481 s, mit 5 Fragen eher länger: Demo oder paarweise. Treffer nicht zwingend besser. |
| 4.2 | Gute Fragen nennen das Thema des Chunks; zu allgemeine passen auf viele. Im Prompt konkrete Begriffe aus dem Chunk verlangen. |
| 4.3 | Die Suche Frage gegen Frage trifft oft besser als Teil 2 (ablesen). |
| 5.1 | Kurze Parents sind ein einziges Kind; lange gewinnen viel (z. B. "Beschreibung" 344 → 1843 Zeichen). Kontext 4365 statt 1933 Zeichen für fünf Kinder; die fünf Parents sind dieselben wie in Teil 2. |
| 5.2 | 150: mehr Kinder, oft dieselben Parents; 600: weniger Kinder, Ähnlichkeiten näher an Teil 2 (ablesen). |
| 5.3 | Ablesen; über die Kinder kann ein Abschnitt neu dazukommen. |

### 05 – Retrieval-Strategien

| | |
|---|---|
| Dauer (Planung) | 60 Minuten: Teil 1 10, Teil 2 15, Teil 3 15, Teil 4 10, Teil 5 10 |
| Laufzeit (Generalprobe) | Teil 1 1 s, Teil 2 1 s, Teil 3 unter 1 s, Teil 4 1 s, Teil 5 2 s. Keine Aufgabe braucht "(Demo)". |
| Zu Beginn | `git status`; in `.env` `SHOW_THINKING`, `ALL_DOCUMENTS`, `BURP_PROXY_URL` prüfen. |
| Vorab | Index `headings`; kein Chat-Modell nötig |
| Gesprächspunkte | Top-k liefert immer k; MMR tauscht Relevanz gegen Vielfalt; Pre- vs. Post-Filter; ein Schwellenwert gilt nur für ein Modell |

| Teil, Aufgabe | Erwartetes Ergebnis |
|---|---|
| 1.1 | Alle Top 8 aus `01-llm01-prompt-injection.md`, Abstände ≤ 0,009, kein Sprung: Top-k sagt nicht, wie viele Treffer gut sind. |
| 1.2 | Trotzdem k Treffer, bei 0,781 bis 0,790. |
| 1.3 | Ablesen; je größer k, desto länger der Kontext. |
| 2.1 | λ 0,6 wählt dasselbe wie λ 1. Erst λ 0,5 ändert die Auswahl: Top-k-Rang 14 (`07-llm07`, 0,853) und Rang 12 (`01-llm01`, Filter, 0,856), aus zwei Dokumenten. |
| 2.2 | `FETCH_K = TOP_K`: nur die Reihenfolge ändert sich. 50 mit kleinem λ: unpassende Chunks rutschen hinein. |
| 2.3 | Ablesen; kleineres λ deckt mehr Dokumente ab. |
| 3.1 | Ohne Filter: Rang 1 "Projektsponsoren" (0,830) und Rang 3 "Projektsponsoren › Silver" (0,807), beide intern. Post-Filter: 1 Treffer (Rang 2), Pre-Filter: 3 (0,807/0,806/0,793). |
| 3.2 | Bei `mitigation sections` bleiben nur Abschnitte unter "Präventions- und Mitigationsstrategien"; Beschreibungen und Beispiele fallen weg. |
| 3.3 | Die Treffer aus dem Anhang kommen hinzu. |
| 4.1 | 0,82 trennt die beiden Fragen; 0,5 lässt alles durch, 0,88 verwirft auch gute Treffer (2 von 5 bleiben; Rang 3 fällt, obwohl er nur 0,002 unter Rang 2 liegt). Schlechtester Treffer der ersten Frage 0,866, bester der zweiten 0,790: Abstand 0,076. |
| 4.2, 4.3 | Ablesen. Die WLAN-Frage lässt sich meist nicht sauber abtrennen. |
| 5.1 | MMR liefert andere Abschnitte (Ein-/Ausgabefilter, Szenario 1, `07-llm07`); Parent-Document den meisten Kontext ("Beschreibung" auf Rang 1, 0,896, 1843 Zeichen). |
| 5.2 | F-11 (Antwort nur im internen Anhang) erreicht nur 0,804. "best elsewhere" > "best expected" nur bei F-05 (0,860/0,843) und F-09 (0,839/0,830). |
| 5.3 | Die Frage ohne Quelle liegt bei 0,825, F-00 bis F-10 ab etwa 0,839: 0,83 trennt weiter. Nach der Aufgabe `question-set.json` zurücksetzen, sonst misst Lektion 08 mit. |

### 06 – Hybrid-Suche und Reranking

| | |
|---|---|
| Dauer (Planung) | 75 Minuten: Teil 1 10, Teil 2 10, Teil 3 10, Teil 4 15, Teil 5 10, Teil 6 10, Teil 7 10 |
| Laufzeit (Generalprobe) | Teil 1 8 s, Teil 2–4 je höchstens 1 s, Teil 5 102 s mit Denken (mit `RERANK_THINKING = false` etwa 1 s), Teil 6 27 s, Teil 7 93 s (vor Einführung von `RERANK_THINKING`; mit Denken länger) |
| Vorab | Qdrant läuft, `npm run l06:1`; ab Teil 5 Chat-Modell |
| Gesprächspunkte | BM25 findet genaue Begriffe, Vektoren Umschreibungen; RRF zählt Ränge, nicht Werte; Reranking findet nichts Neues und kostet je Kandidat einen Aufruf; Burp sieht Qdrant nicht; Lektion 06 ist bewusst ungefiltert. Achtung: #37 und #44 haben auf RRF-Platz 8 exakt denselben Wert (1/60) und wechseln sich von Lauf zu Lauf ab; Ergebnisse in Teil 5 und 7 schwanken deshalb. |

| Teil, Aufgabe | Erwartetes Ergebnis |
|---|---|
| 1.1 | Payload: `text`, `source`, `position`, `version`, `accessGroup`, je nach Index `headingPath` oder `chunkFile`; in `questions__…` zusätzlich `generatedQuestion` (597 Punkte, mehrere teilen einen Chunk-Text). |
| 1.2 | Nein: Die Collection wird gelöscht und neu angelegt. |
| 1.3 | Mit englischem Stemmer findet "Maßnahme" "Maßnahmen" nicht mehr zuverlässig (ablesen). |
| 2.1 | Stoppwörter zählen 0. Umgangssprachliche Frage: "Kundendaten", "Firmengeheimnisse", "ausplaudern" 0 (nicht im Korpus), nur "Chatbot" (8) und "Versehen" (1). Die Wetterfrage trifft nur "heute" (1) und bekommt den höchsten BM25-Wert (Vorwort): bedeutungslos. |
| 2.2 | BM25 findet den Fachbegriff zuverlässiger als die Vektorsuche (ablesen). |
| 2.3 | Größere Chunks, andere Zählung und BM25-Werte. Unbedingt zurück auf `'headings'`. |
| 3.1 | 768 Zahlen; kein Wort der Frage steht in der Anfrage an Qdrant. |
| 3.2 | "PoisonGPT": Beide setzen #61 (`03-llm03`, Szenario 2) auf Rang 1, BM25 deutlich, Vektor knapp. Umgangssprachlich: Jede Suche hat einen `02-llm02`-Treffer auf Rang 1 (#37 BM25, #44 Vektor, 0,860). |
| 3.3 | 2024: keine Treffer (alle Chunks tragen `version` 2025); 2025 = ohne Filter. |
| 4.1 | "RRF by hand" = "RRF Qdrant". |
| 4.2 | Umgangssprachlich fehlen beide Rang-1-Treffer (#37, #44, `02-llm02`) in den Hybrid-Top-5; #158 (`09-llm09`, BM25 Rang 1, Vektor Rang 4) gewinnt. |
| 4.3 | Klein: die Spitzenplätze einer Liste setzen sich durch; groß: flacher (ablesen). |
| 5.1 | Kandidaten nach RRF: #158, #96, #145, #19, #159, #147, #118, #44. Nach dem Reranking: #19 = 2 (Rang 4 → 1), #118 = 1 (7 → 2), alle anderen 0; die `09-llm09`-Chunks fallen ab. 8 Aufrufe, 15 280 Tokens, davon 13 335 Denken. |
| 5.2 | Ablesen: Größeres Limit kostet mehr Tokens, Bewertungen ändern sich. |
| 5.3 | Rund 1 s statt rund 100 s, 1611 Tokens ohne Denken. Alle Bewertungen kommen an, aber fast alle 0: Ohne Denken sortiert das Reranking kaum um. Danach zurück auf `true`. |
| 6.1 | Datenexfiltration, PII, Trade Secrets, DLP, Prompt Injection, Vertraulichkeit, Security Hardening, Compliance, Datenlecks, Governance. |
| 6.2 | Je Spalte ein `02-llm02`-Treffer (#44; in der Multi-Query-Spalte Rang 3). Kein Treffer steht in allen vier Listen; die Top 5 (#115, #58, #44, #9, #159) stehen in je drei. |
| 6.3 | Ablesen: mehr Fassungen kosten mehr Zeit. |
| 7.1 | Bei der umgangssprachlichen Frage ist Hybrid schlechter als beide Einzelsuchen: Es verliert beide `02-llm02`-Treffer (Top 5: #158, #96, #145, #19, #159). |
| 7.2 | Hängt vom Gleichstand auf Platz 8 ab. Im gemessenen Lauf stand #37 dort und stieg mit Wert 3 auf Rang 1 (8 Aufrufe, 15 086 Tokens). Multi-Query hält #44 immer in den Top 5 (Rang 3, 1 Aufruf, 3124 Tokens), für etwa ein Fünftel der Tokens. |
| 7.3 | Keine feste Lösung. |

### 07 – RAG mit Open WebUI

| | |
|---|---|
| Dauer (Planung) | 90 Minuten: Teil 1 20, Teil 2–3 10, Teil 4 10, Teil 5–7 15, Teil 8–10 20, Teil 11 15 |
| Laufzeit (Generalprobe) | Teil 1 29 s, 2 12 s, 3 45 s, 4 23 s, 5 14 s, 6 46 s, 7 43 s, 8 12 s je Lauf; Teil 9 rund 153 s je Frage (Bewertungen mit Denken), Teil 10 rund 42 s, Teil 11 (Hybrid) rund 8 s je Antwort |
| Zu Beginn | `git status`; in `.env` `SHOW_THINKING`, `ALL_DOCUMENTS`, `BURP_PROXY_URL` prüfen. |
| Vorab | Indizes `headings`, `semantic`, `questions`; für Teil 8–11 Qdrant und `l06:1`; Open WebUI auf die Fassade |
| Gesprächspunkte | RAG von Ende zu Ende; die Quellenliste hängt der Code an, nicht das Modell; Pre-Filter in `loadRagIndex`; nur ein Teil zur Zeit (Port); Teil 9 dauert Minuten je Frage (Demo); Teil 11 nutzt Kopien der Werte (`demo.ts`) |

| Teil, Aufgabe | Erwartetes Ergebnis |
|---|---|
| 1.1 | Gemessen mit "Wetter heute": "Die bereitgestellten Quellen enthalten keine Informationen zum Wetter heute [1], [2] und [3]." Darunter trotzdem drei Quellen aus `00-vorwort` (zweimal "Das deutsche Übersetzungsteam", einmal "Was ist neu …"): Top-k liefert immer k. |
| 1.2 | `TOP_K` 1: kurze Antwort, nur [1]; 8: länger, Zitate bis höchstens [8]. |
| 1.3 | Ein kleines Modell kann kippen; ob es nur "HALLO" sagt, schwankt (ablesen). |
| 2.1, 2.2 | Ablesen; ein semantischer Chunk allein reicht selten für alle Maßnahmen. |
| 3.1 | Mit der Aufgabenfrage nicht gemessen. Mit "Wie begrenze ich Prompt Injection?" liefert Teil 3 LLM01 "Beschreibung", LLM01 "Direkte Prompt Injections" und LLM02 "Beschreibung"; die Antwort nennt keine Liste von Maßnahmen. |
| 3.2 | Ein Chunk reicht selten für die ganze Liste der Maßnahmen. |
| 4.1 | [1] bis [3] wie in Teil 1, dazu "Beschreibung" und "Indirekte Prompt Injections" als ganze Abschnitte. |
| 4.2 | Die Zeile `Parent-document index ready` meldet mehr Kinder (Standard: 194 Parents, 347 Kinder). |
| 4.3 | Ablesen; kleine Kinder finden Details in langen Abschnitten eher. |
| 5.1 | [1] "1. Begrenzen …", [2] "Direkte Prompt Injections", [3] "3. Filter für Ein- und Ausgaben" (alle LLM01). Gegenüber Teil 1 fällt "5. Manuelle Freigabe" weg, "3. Filter" kommt hinzu. |
| 5.2 | `LAMBDA` 1 entspricht Teil 1; 0,1 holt Quellen, die kaum noch passen. |
| 5.3 | Ohne zusätzliche Kandidaten gibt es nichts umzuordnen außer der Reihenfolge. |
| 6.1 | Quellen nur aus LLM01 ("Indirekte Prompt Injections", Szenario 6, Szenario 3): Der Filter liefert immer `TOP_K` Chunks aus dem erlaubten Dokument. Das Modell wird aufgerufen, sagt, die Quellen enthalten nichts zur Lieferkette, und beschreibt dann Prompt Injection. |
| 6.2 | Mit `03-llm03-lieferkette.md` kommen echte Antworten zur Lieferkette. |
| 6.3 | Feste Antwort `NO_SOURCES_ANSWER` ohne Modellaufruf: `loadRagIndex` hat den Anhang schon entfernt, der Filter lässt nichts übrig. |
| 7.1 | Mit einer ähnlichen Frage ("ausplaudern") kam die Frage durch, mit 5 Quellen (vier Referenzlinks aus LLM02/07/06/05 und LLM07 "1. Trennen Sie sensible Daten vom System Prompt"); die Antwort stützte sich vor allem auf Linktitel. |
| 7.2 | Kein Wert trennt beide Fragen sauber: Die Wetterfrage bekommt bei 0,83 die feste Antwort ohne Quellen; niedrige Werte lassen sie durch, hohe verwerfen auch die beantwortbare Frage. |
| 8.1 | Hybrid: [1] LLM03 Szenario 2, [2] LLM04 Referenzlinks, [3] LLM03 Referenzlinks, [4] LLM04 "Gängige Beispiele", [5] LLM02 Referenzlinks ([3] und [4] können tauschen, gleicher Fusionswert). Der Fachbegriff wird getroffen. |
| 8.2 | Bei Alltagssprache hilft BM25 kaum (ablesen). |
| 8.3 | Mit 3 Kandidaten je Liste können Quellen fehlen (ablesen). |
| 9.1 | Bewertungen: Punkt 61 → 6, 73 → 1, 76 → 1, alle anderen 0. Quellen: [1] LLM03 Szenario 2, [2] LLM03 Referenzlinks, [3] LLM04 "Beschreibung" (steigt von Hybrid-Rang 7 auf), [4] LLM04 Referenzlinks, [5] LLM04 "Gängige Beispiele". LLM02 Referenzlinks (Punkt 44, `{"score": 0}` in Burp) fällt weg. Rund 153 s je Frage. |
| 9.2 | In Lektion 07 nicht gemessen; nach Lektion 06, 5.3: Antwort nach Sekunden, Bewertungen in Burp fast alle 0, Quellen ≈ Reihenfolge von Teil 8. Danach zurück auf `true`. |
| 9.3 | Ohne zusätzliche Kandidaten wählt Reranking nichts ab, es sortiert nur um. |
| 10.1 | [1] LLM07 "Beschreibung", [2] LLM04 Szenario 1, [3] LLM02 "2. Offenlegung proprietärer Algorithmen", [4] LLM03 "4. Anfälliges vortrainiertes Modell", [5] LLM04 Szenario 3: nur [1] passt, die Fassungen driften zu Vergiftung und Lieferkette. Rund 42 s. |
| 10.2 | Mehr Fassungen: längere Wartezeit, wenig neue Quellen (ablesen). |
| 10.3 | Die Fassungen stehen nur in Burp (die Logzeile nennt Anzahl und Längen). Bei einem Wort driften sie eher ab (ablesen). |
| 11.1 | Zehn Modelle im Dropdown; `lesson-07-hybrid` antwortet wie Teil 8 in rund 8 s, `lesson-07-rerank` braucht Minuten. |
| 11.2 | Es fehlen `lesson-07-hybrid`, `-rerank`, `-multiquery`; die WARN-Zeile nennt `Start Qdrant; npm run l06:1`. |
| 11.3 | Ja: Die Quellenliste von `lesson-07-headings` hat nur noch einen Eintrag, ohne dass eine Teil-Datei geändert wurde. |

### 08 – Evaluierung

| | |
|---|---|
| Dauer (Planung) | 90 Minuten: Einstieg 5, Teil 1 10, Teil 2 15, Teil 3 15, Teil 4 10, Teil 5 25, Teil 6 10 |
| Laufzeit (Generalprobe) | Teil 1 unter 1 s, Teil 2 4 s, Teil 3 6 s, Teil 4 1 s, Teil 5 voll 6 min 59 s, Teil 6 mit `--filter-first-n 1` etwa 22 s; Judge-Check in Teil 2 und 3 bestanden |
| Zu Beginn | `git status`; in `.env` `SHOW_THINKING`, `ALL_DOCUMENTS`, `BURP_PROXY_URL` prüfen. |
| Teil 5 und 6 im Workshop | Mit eigener GPU starten Teilnehmende den vollen `npm run l08:5` selbst. Auf langsamen Laptops oder einem geteilten Server zeigt der Trainer den vorab erzeugten Bericht, und Teilnehmende starten nur `--filter-first-n 1`. |
| Vorab | Index `headings` (Teil 1–4), alle vier (Teil 5); für Teil 6 Qdrant, `l06:1` und `l07:11` in zweitem Terminal (`l07:8` reicht ohne Aufgabe 2) |
| Messlauf | Ergebnis des vollen Laufs von Teil 5 steht nur im Guide: [`lessons/08-evaluations/GUIDE.de.md`](../lessons/08-evaluations/GUIDE.de.md#messlauf-2026-11-13) |
| Gesprächspunkte | Suche ohne Sprachmodell messen (billig, wiederholbar); ein Judge braucht eine Gegenprobe; quellentreu ≠ korrekt; FAIL ≠ ERROR; Black Box sieht nur die Antwort; mit elf Fragen kein klarer Sieger |

| Teil, Aufgabe | Erwartetes Ergebnis |
|---|---|
| 1.1 | F-05 auf Rang 0, F-09 auf Rang 3, alle anderen auf Rang 1 (Trefferquote 0,92, MRR 0,86). |
| 1.2 | Bei `TOP_K` 1 sind Trefferquote und MRR gleich. Größeres k hebt die Trefferquote, den MRR kaum. |
| 1.3 | Rang ablesen; danach löschen (geteilte Datei). |
| 2.1 | "yes" für die echte, "no" für die erfundene Antwort, `Judge check passed`; kleine Modelle schwanken zwischen Läufen. |
| 2.2 | Mit den Schutzsätzen bleibt das Urteil "no"; ohne sie kann es kippen, muss aber nicht (ablesen). |
| 2.3 | Ja: "steht nicht im Kontext" ist quellentreu, aber nicht hilfreich. |
| 3.1 | F-05: Judge sagt "no"; Ursache ist die Suche, nicht das Modell. |
| 3.2 | Teil 2 wertet die ehrliche Absage als quellentreu und meldet deshalb "Judge check FAILED" (gewollt); Teil 3 wertet sie als nicht korrekt. Man braucht beide Messungen. |
| 3.3 | Ohne Unterabschnitte (5 Chunks) nennt die Antwort nur 3 der 7 Maßnahmen von F-01; der Judge sagt zu Recht "no". Ursache: die Suche ([decisions](decisions.de.md#expand-sections)). Vergleich: F-01 bei `corpus:headings` in Teil 5. |
| 4.1 | Beide Kennzahlen "unchanged" (die Suche ist deterministisch). |
| 4.2 | Die Trefferquote sinkt eher als der MRR; "Regression: …", sobald eine Kennzahl um mehr als `TOLERANCE` sinkt. |
| 4.3 | Warnung: Die Läufe sind nicht vergleichbar, weil sich die Zahl der Fragen geändert hat. |
| 5.1 | `corpus:questions` hat die höchste Trefferquote und den höchsten MRR und findet als einzige F-05 (auf Rang 2). `corpus:headings` passt zu Teil 1. Zahlen: Messlauf im Guide. |
| 5.2 | F-01 bis F-03: Die Antwort nennt nur einen Teil der Liste. Im Messlauf scheitert `faithful` inzwischen häufiger als `correct`. FAIL vs. ERROR: [decisions](decisions.de.md#eigene-faithful-pruefung). |
| 5.3 | Die Trefferquote kann nur gleich bleiben oder sinken (Top 3 ⊂ Top 5). |
| 6.1 | Ähnlich oder besser als `corpus:headings`; mit elf Fragen ist der Unterschied klein. Probelauf mit `--filter-first-n 1`: PASS. |
| 6.2 | Mit `--filter-first-n 1` läuft nur F-00; sie wird nicht unbedingt abgelehnt. Eine Ablehnung zeigt der Trainer als Demo mit mehr Fragen; abgelehnte Fragen scheitern dann bei `correct`. |
| 6.3 | `mrr` und `faithful`: Die API liefert weder Ränge noch Kontext. |

Weitere Fragen der Teilnehmenden beantwortet `lessons/08-evaluations/FAQ.de.md`.
