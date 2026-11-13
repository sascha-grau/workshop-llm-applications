# Lektion 04 – Chunking: Guide

*English version: [GUIDE.md](GUIDE.md)* · Überblick und Start: [README.de.md](README.de.md)

## Worum geht's?

Ein ganzes Dokument ist für einen einzigen Vektor zu lang und zu gemischt im Thema. Deshalb zerlegst du die zwölf OWASP-Dokumente (zusammen: der **Korpus**) in Stücke, bettest jedes einzeln ein und legst alles in einem Index ab. Wie du schneidest, entscheidet, ob die Suche später die Stelle findet, die die Frage beantwortet.

Vergleich: Ein Fachbuch mit Register. Niemand liest das ganze Buch, um eine Antwort zu finden; man schlägt die Seite nach. Die Chunks sind die Seiten, der Index ist das Register.

## Wo stehen wir?

```text
L03 Embeddings ──► [ L04 Chunking ] ──► L05 Retrieval ──► L06 Qdrant/Hybrid ──► L07 RAG ──► L08 Evaluierung
                         ▲ du bist hier

content/owasp-genai-top-10/NN-*.md   (12 Dokumente)
        │  Teil 0: schneiden, bis jedes Stück in 512 Tokens passt
        ▼
content/owasp-genai-top-10/chunks/   (69 Chunk-Dateien + manifest.json)
        │
        ├─ Teil 1: unverändert einbetten ────────► indexes/prepared__<Modell>.json
        ├─ Teil 2: an Überschriften schneiden ───► indexes/headings__<Modell>.json ──► Teil 5 (Kinder, nur im Speicher)
        ├─ Teil 3: an Themensprüngen schneiden ──► indexes/semantic__<Modell>.json
        └─ Teil 4: Fragen erzeugen lassen (LLM) ─► indexes/questions__<Modell>.json
                                                        │
                                                        ▼
                                          Lektion 05 bis 08 lesen diese Dateien
```

## Neue Begriffe

| Begriff | In einem Satz | Beispiel |
|---|---|---|
| Chunk | Ein Stück eines Dokuments, das einen eigenen Vektor bekommt. | `01-llm01-prompt-injection--003.md` |
| Token | Das Wortstück, in dem ein Modell Text zählt; E5 liest höchstens 512 je Eingabe. | Normaler deutscher Text: etwa 4 Zeichen je Token. |
| Index | Eine Datei mit Text, Metadaten und Vektor je Chunk. | `indexes/headings__text-embedding-multilingual-e5-base.json` |
| Metadaten | Angaben zur Herkunft eines Chunks, die mit ihm gespeichert werden. | `source`, `position`, `headingPath`, `accessGroup` |
| Manifest | Das Inhaltsverzeichnis der Chunks aus Teil 0, mit Prüfsummen und Token-Zahlen. | `chunks/manifest.json` |
| Top-k | Die `k` Chunks, die der Frage am ähnlichsten sind. | Lektion 04 zeigt die besten `DEFAULT_TOP_K`. |
| Reasoning-Modell | Ein Chat-Modell, das vor der Antwort „denkt“; das kostet Zeit und Tokens, und steht das Denken vor einer JSON-Antwort, ist das JSON kaputt. | `qwen3.5-4b` |

## Vorher prüfen

- [ ] LM Studio läuft, das E5-Modell (`REMOTE_EMBEDDING_MODEL_NAME`) ist geladen. Für Teil 4 auch das Chat-Modell (`REMOTE_MODEL_NAME`).
- [ ] `content/owasp-genai-top-10/chunks/manifest.json` existiert. Wenn nicht: einmal `npm run l04:0` (Teil 0).
- [ ] `SHOW_THINKING` in `.env` ist leer oder `false`. Sonst scheitert Teil 4.
- [ ] `ALL_DOCUMENTS` in `.env` ist leer. Sonst zeigen Teil 1 bis 3 die Tabellen aller zwölf Dokumente statt der Ausgabe unten ([warum nur die Ausgabe](../../docs/decisions.de.md#all-documents)).
- [ ] Die Konstanten stehen auf ihrem Standard (`// Standard:` im Code).

Alle Ausgaben unten: gemessen am 2026-11-13 mit LM Studio, `qwen3.5-4b` (Chat, nur Teil 4) und `text-embedding-multilingual-e5-base` (Workshop-Standard, [Modelle](../../README.de.md#modelle) in der Wurzel-README), Zählmethode `tokenizer`. Mit einem anderen Server oder Modell weichen Zahlen und Antworten ab, vor allem die Fragen in Teil 4; die Muster bleiben. Zeitstempel und Log-Zeilen sind gekürzt (`…`).

## Teil 0 – Chunks vorbereiten

**In einem Satz:** Teil 0 schneidet die zwölf Dokumente so, dass jedes Stück samt Überschriften und dem Präfix `passage: ` in die 512 Tokens von E5 passt.

**Ablauf**

1. **Zählen** (KERN 1). Das Programm zählt die Tokens exakt und lokal mit dem Tokenizer von E5. Fehlt er, fragt es den Server: Es füllt jede Eingabe absichtlich über das Limit auf, liest die Token-Zahl aus der Ablehnung und zieht die Füllung wieder ab.
2. **Passt der Abschnitt?** (KERN 2) Das Budget sind die Tokens, die nach Präfix und Überschriften-Kette noch frei sind. Ein Absatz oder eine Liste, die hineinpasst, bleibt ganz.
3. **Sonst schneiden** (KERN 3). Eine binäre Suche (Kandidaten halbieren, bis der späteste passende Schnitt übrig bleibt) findet die Stelle: zuerst an Listenpunkten, dann an Satzenden, nur zur Not zwischen Wörtern. Danach legt das Programm kleine Nachbarn wieder zusammen, solange sie passen.
4. **Endprüfung** (KERN 4). Jeder fertige Chunk wird noch einmal gezählt. Ist einer doch zu lang, wird nur er mit kleinerem Budget neu geteilt.

**Das siehst du**

Teil 0 läuft im Workshop meist schon vorher. Die Prüfung kannst du jederzeit starten:

```text
$ npm run l04:0 -- --verify
{"counted_with":"tokenizer","chunks":69,"minimum_tokens":173,"maximum_tokens":512}
```

Ein normaler Lauf schreibt vor dieser Zeile eine Zeile je Dokument, zum Beispiel `01-llm01-prompt-injection.md: 8 chunks prepared`. Im vorhandenen Manifest (erzeugt am 2026-11-12) sind es 3, 8, 5, 11, 6, 6, 6, 4, 5, 6, 7 und 2 Chunks für die Dokumente `00` bis `11`.

**Was bedeutet das?**

- `maximum_tokens` 512 heißt: genau am Limit, nicht darüber. Das Programm füllt jeden Chunk so weit wie möglich.
- Jeder Chunk beginnt mit Dokumenttitel und Überschriften-Kette. So ist er auch allein verständlich.
- Die Chunks überlappen sich nicht. Die Prüfung verlangt, dass sie jedes Zeichen der Quelle genau einmal abdecken.
- `counting_method` im Manifest (`counted_with` in der Ausgabe von `--verify`) sagt, wie gezählt wurde. Das Programm probiert die Methoden in dieser Reihenfolge, die erste verfügbare gewinnt:

| Methode | Was passiert | Wie verlässlich |
|---|---|---|
| `tokenizer` | lokaler Tokenizer von E5, kein Server nötig | exakt, ohne Anfragen |
| `embeddings-overflow` | der Server lehnt zu lange Eingaben ab und nennt die Token-Zahl | echte Zählung, eine Anfrage je Zählung |
| `embeddings-usage` | der Server nimmt lange Eingaben an und meldet `usage.prompt_tokens` über dem Limit | echte Zählung |
| `character-estimate` | der Server liefert keine brauchbare Zahl | nur Schätzung mit `ESTIMATE_CHARACTERS_PER_TOKEN` Zeichen je Token, viele kleine Chunks |

**Probier aus:** die Aufgaben im Kopf von `00-prepare-chunks.ts`. Achte darauf, wie stark die Zahl der Chunks vom Limit abhängt.

**Stolperfallen**

- Ein zweiter normaler Lauf bricht ab, statt zu überschreiben. Das ist Absicht; nimm `--verify`.
- Das `--` in `npm run l04:0 -- --verify` trennt die Optionen von npm von denen des Programms.
- `--verify` zählt jeden Chunk neu, mit derselben Methode wie ein normaler Lauf. Mit dem Tokenizer braucht das keinen Server; beim Rückfall auf den Server schickt es wieder Anfragen an den Embedding-Endpunkt.
- Relative Links im Chunk zeigen auf `../…`, weil die Chunks einen Ordner tiefer liegen als die Quelle.
- Im Schätzmodus kann der Server trotzdem still kürzen. Das Programm meldet das mit einer `INFO`- oder `WARN`-Zeile `No reliable token count: …` und macht weiter.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `chunks already exists. Use --verify or move the existing directory first.` | Die Chunks sind schon da. Prüfen mit `--verify`; neu erzeugen nur nach Verschieben von `chunks/`. |
| `The embedding request failed. Check REMOTE_MODEL_BASE_URL, …` | LM Studio starten, E5 laden, Adresse in `.env` prüfen. |
| `The chunk manifest format, settings or document list do not match. Regenerate …` | Manifest passt nicht zu Modell, Limit oder Zählmethode. `chunks/` verschieben, `npm run l04:0`. |
| `The source has changed: …` oder `Chunk content does not match: …` | Quelle oder Chunk wurde bearbeitet. Chunks neu erzeugen. |
| `Local E5 tokenizer unavailable. Falling back to …` | Der Tokenizer ließ sich nicht laden (offline, kein Cache oder beschädigter Cache). Einmal mit Internet `npm run tokenizer:fetch` ausführen; bei Beschädigung `.cache/tokenizers/` löschen. Ohne ihn zählt Teil 0 über den Server oder schätzt nur. |
| `Embedding token count calibration failed. …` | Der Server zählt die Füllung anders als erwartet. Prüfe, ob wirklich das E5-Modell aus `.env.example` geladen ist. |
| `The token limit must be an integer between 1 and 512.` | `TOKEN_LIMIT_OVERRIDE` hat einen ungültigen Wert. |
| `An indivisible Markdown link, code block or heading exceeds the token budget.` | Das Limit ist kleiner als ein einzelner Link oder eine Überschrift. `TOKEN_LIMIT_OVERRIDE` erhöhen. |

> **Vertiefung:** Warum nicht einfach den Server zählen lassen? Im Probelauf am 2026-11-13 mit LM Studio, vor Einführung des Tokenizers, meldete `usage.prompt_tokens` den Wert 0, und zu lange Eingaben wurden still gekürzt. So fiel Teil 0 auf `character-estimate` zurück und lieferte 351, 369 oder 391 kleine Chunks statt 69, 199 oder 230. Der lokale Tokenizer zählt unabhängig vom Server; Begründung und Folgen: [docs/decisions.de.md](../../docs/decisions.de.md#exakter-tokenizer).

> **Vertiefung:** Beim Rückfall auf den Server wird die Zählmethode einmal am Anfang bestimmt: Das Programm schickt `Kalibrierung ` 1024-mal an den Endpunkt und sieht, ob der Server ablehnt oder annimmt. Bei `embeddings-overflow` prüft es zusätzlich, dass jedes Füllstück genau ein Token kostet; sonst wäre die Subtraktion falsch. Ein früherer Testlauf (Testserver, ohne Datum) brauchte für alle zwölf Dokumente etwa 760 Anfragen bei echter Zählung und etwa 350 im Schätzmodus, der dafür viermal so viele Chunks lieferte. 

## Teil 1 – Index aus vorbereiteten Chunks

**In einem Satz:** Teil 1 bettet die 69 Chunks aus Teil 0 unverändert ein, schreibt den Index `prepared` und durchsucht ihn mit `DEMO_QUESTION`.

**Ablauf**

1. **Einbetten** (KERN 1). Ein Vektor je Chunk, alle in einer Anfrage. Vor jedem Text steht `passage: `; der Index speichert den Text ohne dieses Präfix.
2. **Index schreiben** (KERN 2). Je Chunk: Text, Metadaten, Vektor.
3. **Suchen** (KERN 3). Die Frage mit `query: ` einbetten, mit jedem Chunk-Vektor vergleichen (Kosinus-Ähnlichkeit), die besten `DEFAULT_TOP_K` zeigen.

**Das siehst du**

```text
Chunks from 01-llm01-prompt-injection.md (limit: 512 tokens):
│ file                                │ characters │ tokens │ characters per token │ preview                          │
│ '01-llm01-prompt-injection--001.md' │ 1847       │ 452    │ '4.1'                │ 'Eine Prompt-Injection-Schwachst…'│
│ '01-llm01-prompt-injection--003.md' │ 1785       │ 422    │ '4.2'                │ 'Der Aufstieg multimodaler KI, …'│
│ …                                                                                                                    │
│ '01-llm01-prompt-injection--007.md' │ 1438       │ 510    │ '2.8'                │ '1. [ChatGPT Plugin Vulnerabil…' │
│ '01-llm01-prompt-injection--008.md' │ 1334       │ 463    │ '2.9'                │ '10. [Adversarial Machine Lear…' │
Full corpus: 69 chunks, at most 512 tokens, at least 2.51 characters per token
69 chunks in …/indexes/prepared__text-embedding-multilingual-e5-base.json, characters min 562 / average 1626 / max 2329
Top 3 for “Wie begrenze ich Prompt Injection?”:
│ file                                │ similarity │ accessGroup │ section │ preview                                │
│ '01-llm01-prompt-injection--003.md' │ '0.871'    │ 'public'    │ '–'     │ 'Der Aufstieg multimodaler KI, die …'  │
│ '01-llm01-prompt-injection--001.md' │ '0.870'    │ 'public'    │ '–'     │ 'Eine Prompt-Injection-Schwachstelle…' │
│ '01-llm01-prompt-injection--002.md' │ '0.865'    │ 'public'    │ '–'     │ 'Direkte Prompt Injections treten a…'  │
```

**Was bedeutet das?**

- „characters per token“ sagt, wie viel Text ein Token im Schnitt trägt. Normaler deutscher Text liegt bei etwa 4.
- Ähnlichkeiten um 0,87 sind bei E5 normal. Auch schlechte Treffer liegen oft bei 0,7 bis 0,8. Wichtig ist die Reihenfolge, nicht der Wert.
- Ein vorbereiteter Chunk füllt das Token-Limit und enthält oft mehrere Abschnitte. Sein Vektor ist ein Mittelwert über alle.
- Die Spalte `section` zeigt `–`: Die vorbereiteten Chunks haben keinen Überschriftenpfad in den Metadaten. Das ändert Teil 2.

**Probier aus:** die Aufgaben im Kopf von `01-prepared-chunks.ts`. Achte darauf, welche Chunks deutlich unter 4 Zeichen je Token liegen und was in ihnen steht.

**Stolperfallen**

- Die Tabelle zeigt nur `EXAMPLE_DOCUMENT`, eingebettet wird aber der ganze Korpus („Full corpus: 69 chunks“).
- Hat Teil 0 nur geschätzt (`character-estimate`), meldet Teil 1 `Token counts in the manifest are conservative character estimates, …`. Dann folgt „characters per token“ nur aus der Schätzung (`ESTIMATE_CHARACTERS_PER_TOKEN`) und sagt nichts über den Text.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Prepared chunks are missing. Generate them with npm run l04:0.` | Einmal `npm run l04:0`. |
| `The chunk manifest is invalid or outdated. Regenerate the chunks with npm run l04:0.` | Die Chunks stammen aus einer alten Version oder mit anderem Limit (z. B. nach `TOKEN_LIMIT_OVERRIDE`). `chunks/` verschieben, `npm run l04:0`. |
| `Model API directly: The model server is unreachable or timed out. …` | LM Studio starten, `REMOTE_MODEL_BASE_URL` prüfen. |
| `Unknown EXAMPLE_DOCUMENT: … Check manifest.json.` | Den Dateinamen genau so schreiben, wie er im Manifest steht. |

## Teil 2 – An der Dokumentstruktur schneiden

**In einem Satz:** Teil 2 schneidet die vorbereiteten Chunks an jeder Überschrift (`#` bis `###`) weiter; jeder Abschnitt wird ein Chunk, der mit seinem Überschriftenpfad beginnt.

**Ablauf**

1. **An Überschriften schneiden** (KERN 1). `readChunks` ruft `splitByHeadings` in `chunking.ts` auf. Der Pfad (Titel › Abschnitt › Unterabschnitt) steht als erste Zeile im Chunk.
2. **Metadaten** (KERN 2). Neu sind der Überschriftenpfad als Liste und die Zugriffsgruppe: `internal` für den Anhang `11-…`, sonst `public`.
3. Einbetten, Index schreiben und Suchen wie in Teil 1, eine Anfrage je Dokument.

**Das siehst du**

```text
Chunks from 01-llm01-prompt-injection.md:
│ (index) │ characters │ section                                                                        │ preview                         │
│ 0       │ 1843       │ 'Beschreibung'                                                                 │ 'Eine Prompt-Injection-Schwa…'  │
│ 1       │ 523        │ 'Arten von Prompt Injection-Schwachstellen › Direkte Prompt Injections'        │ 'Direkte Prompt Injections t…'  │
│ 2       │ 1277       │ 'Arten von Prompt Injection-Schwachstellen › Indirekte Prompt Injections'      │ 'Indirekte Prompt Injections…'  │
│ 3       │ 745        │ 'Arten von Prompt Injection-Schwachstellen › Indirekte Prompt Injections'      │ 'Der Aufstieg multimodaler K…'  │
│ 5       │ 443        │ 'Präventions- und Mitigationsstrategien › 1. Begrenzen Sie das Modellverhalten'│ 'Geben Sie spezifische Anwei…'  │
│ …       │            │                                                                                │                                 │
│ 21      │ 1434       │ 'Referenzlinks'                                                                │ '1. [ChatGPT Plugin Vulnerab…'  │
│ 22      │ 757        │ 'Referenzlinks'                                                                │ '10. [Adversarial Machine Le…'  │
00-vorwort-der-projektleiter.md: 7 chunks
01-llm01-prompt-injection.md: 24 chunks
…
11-appendix-llm-application-architecture-and-threat-modeling.md: 5 chunks
199 chunks in …/indexes/headings__text-embedding-multilingual-e5-base.json, characters min 130 / average 601 / max 2077
Embedding calls: 12, LLM calls: 0
Top 3 for “Wie begrenze ich Prompt Injection?”:
│ file                           │ similarity │ accessGroup │ section                                                                                │
│ '01-llm01-prompt-injection.md' │ '0.885'    │ 'public'    │ 'Präventions- und Mitigationsstrategien › 1. Begrenzen Sie das Modellverhalten'        │
│ '01-llm01-prompt-injection.md' │ '0.881'    │ 'public'    │ 'Präventions- und Mitigationsstrategien › 5. Fordern Sie manuelle Freigabe für …'      │
│ '01-llm01-prompt-injection.md' │ '0.879'    │ 'public'    │ 'Arten von Prompt Injection-Schwachstellen › Direkte Prompt Injections'                │
```

**Was bedeutet das?**

- Aus 69 Chunks werden 199. Ein Chunk hat im Schnitt 601 statt 1626 Zeichen.
- Teil 2 braucht kein eigenes Token-Limit: Schneiden macht die Chunks aus Teil 0 nur kleiner. Der Preis: Ein Abschnitt, den Teil 0 teilen musste, bleibt zwei Chunks (Zeilen 2 und 3, Zeilen 21 und 22).
- Eine Überschrift ohne eigenen Text wird kein Chunk. „Arten von Prompt Injection-Schwachstellen“ steht nur im Pfad darunter.
- `Embedding calls: 12`: eine Anfrage je Dokument, kein Sprachmodell.

**Probier aus:** die Aufgaben im Kopf von `02-heading-chunking.ts`. Achte darauf, wie sich Platz 1 gegenüber Teil 1 verschiebt.

**Stolperfallen**

- `section` zeigt den Pfad ohne Dokumenttitel; `–` heißt: Text direkt unter dem Titel. Gespeichert ist der volle Pfad als Liste (`headingPath`).
- Die Zugriffsgruppe wird hier nur gespeichert. Gefiltert wird erst ab Lektion 05, Teil 3.
- `splitByHeadings` ist kein Markdown-Parser. Eine Zeile `# …` in einem Codeblock gälte als Überschrift; der Korpus hat keine Codeblöcke.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Unknown document: …. Check SUBSET or EXAMPLE_DOCUMENT against manifest.json.` | Tippfehler in `SUBSET`; die Namen stehen im Manifest. |
| `The index … is empty. Check SUBSET and the chunk corpus before indexing.` | `SUBSET` enthält kein Dokument mit Chunks. |
| `Prepared chunks are missing. …` | Einmal `npm run l04:0`. |

## Teil 3 – Schneiden, wo das Thema wechselt

**In einem Satz:** Teil 3 lässt das Embedding-Modell die Stellen finden, an denen das Thema springt, und schneidet zusätzlich dort.

**Perzentil:** Das Perzentil 95 einer Liste ist der Wert, unter dem 95 % aller Werte liegen. Nur die größten 5 % liegen darüber.

**Ablauf**

1. **Fenster** (KERN 1). Jeder Satz wird zusammen mit Vorgänger und Nachfolger eingebettet, damit ein kurzer Satz nicht allein entscheidet. Fenster reichen nie über eine Überschrift.
2. **Abstand** (KERN 2). Abstand zweier Nachbarfenster = 1 − Kosinus-Ähnlichkeit.
3. **Schwelle** (KERN 3). Die Schwelle ist das Perzentil `DISTANCE_PERCENTILE` aller Abstände des Dokuments. Bei weniger als 4 Abständen gibt es keine.
4. **Schnitt** (KERN 4). Wo der Abstand größer als die Schwelle ist, beginnt ein neuer Chunk. Jede Überschrift beginnt ohnehin einen.
5. Die fertigen Chunks werden in einer zweiten Runde eingebettet, jetzt mit `passage: `.

**Das siehst du**

```text
00-vorwort-der-projektleiter.md: 8 chunks
Distances in 01-llm01-prompt-injection.md: 67 · min 0.000 · median 0.036 · percentile 90 0.061 · percentile 95 0.073 · max 0.089
Cuts: 3 semantic (distance > 0.073) · 27 chunks
Chunks from 01-llm01-prompt-injection.md:
│ number │ file                                │ characters │ preview                                    │
│ 4      │ '01-llm01-prompt-injection--003.md' │ 752        │ 'Der Aufstieg multimodaler KI, die mehr…'  │
│ 5      │ '01-llm01-prompt-injection--003.md' │ 511        │ 'Aufgrund der Natur der generativen KI …'  │
│ 6      │ '01-llm01-prompt-injection--003.md' │ 486        │ 'Geben Sie spezifische Anweisungen zur …'  │
│ …                                                                                                     │
│ 22     │ '01-llm01-prompt-injection--007.md' │ 387        │ '1. [ChatGPT Plugin Vulnerabilities - C…'  │
│ 23     │ '01-llm01-prompt-injection--007.md' │ 358        │ '3. [Not what you’ve signed up for: Com…'  │
│ 24     │ '01-llm01-prompt-injection--007.md' │ 585        │ '[Prompt Injection attack against LLM-i…'  │
…
230 chunks in …/indexes/semantic__text-embedding-multilingual-e5-base.json, characters min 66 / average 560 / max 2081
Embedding calls: 81, LLM calls: 0
Top 3 for “Wie begrenze ich Prompt Injection?”:
│ file                                │ similarity │ section │ preview                                    │
│ '01-llm01-prompt-injection--003.md' │ '0.890'    │ '–'     │ 'Geben Sie spezifische Anweisungen zur …'  │
│ '01-llm01-prompt-injection--004.md' │ '0.880'    │ '–'     │ 'Implementieren Sie Kontrollen, bei den…'  │
│ '01-llm01-prompt-injection--002.md' │ '0.879'    │ '–'     │ 'Direkte Prompt Injections treten auf, …'  │
```

**Was bedeutet das?**

- 67 Abstände, Schwelle 0,073, drei semantische Schnitte. Das Dokument hat 27 Chunks statt 24 in Teil 2: Die meisten Schnitte kommen weiterhin von den Überschriften.
- Die Abstände sind winzig (Median 0,036). E5-Vektoren ähneln sich stark (siehe Lektion 03). Deshalb ist die Schwelle relativ zum Dokument statt fest.
- Kurze Dokumente werden nur an Überschriften geschnitten: Bei weniger als 4 Abständen gibt es keine Schwelle. Und weil das Perzentil ohne Interpolation bestimmt wird, ist es bei wenigen Abständen einfach das Maximum, über dem kein Abstand liegt; mit dem Standardwert von `DISTANCE_PERCENTILE` braucht ein Dokument deshalb mindestens 20 Abstände für einen semantischen Schnitt.
- `Embedding calls` zählt jede Anfrage an E5 in diesem Lauf. `LLM calls: 0`: Ein Sprachmodell ist nicht beteiligt.
- Platz 1 ist derselbe Abschnitt wie in Teil 2 („Geben Sie spezifische Anweisungen …“), gefunden ohne Überschriftenpfad.

**Probier aus:** die Aufgaben im Kopf von `03-semantic-chunking.ts`. Achte auf die Zeile `Cuts:` und darauf, wie sich die Zahl der Chunks mit dem Perzentil ändert.

**Stolperfallen**

- `min 0.000` ist kein Fehler: Zwei Nachbarfenster können fast gleich sein. Auch `-0.000` kommt vor, weil die Kosinus-Ähnlichkeit durch Rundung minimal über 1 liegen kann.
- Mehrere Chunks zeigen dieselbe `file`: Sie stammen aus demselben vorbereiteten Chunk.
- `section` ist `–`, weil semantische Chunks keinen Überschriftenpfad in den Metadaten haben. Die Überschriften stehen aber im Text.
- Die Fenster bekommen `query: `, nicht `passage: `. Fenster mit Fenstern zu vergleichen ist eine symmetrische Aufgabe; dafür sieht E5 das Anfrage-Präfix vor.
- Stücke können sehr klein werden (hier mindestens 66 Zeichen), etwa einzelne Einträge einer Linkliste.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Cuts: 0 semantic (too few sentences for a semantic cut)` | Kein Fehler: Das Dokument hat weniger als 4 Abstände. Wähle ein längeres `EXAMPLE_DOCUMENT`. |
| `The embedding server returned … vectors for … texts.` | Der Server hat nicht alle Texte eingebettet. LM Studio neu starten, Teil 3 erneut starten. |
| `Prepared chunks are missing. …` | Einmal `npm run l04:0`. |

> **Vertiefung:** Das Perzentil berechnet `percentile` in `chunking.ts`, ohne Interpolation. Andere Verfahren nutzen eine feste Schwelle, größere Fenster oder schneiden zu große Stücke nach Größe nach.

## Teil 4 – Suche mit generierten Fragen

**In einem Satz:** Das Chat-Modell schreibt zu jedem Chunk `QUESTIONS_PER_CHUNK` Fragen; jede Frage wird ein eigener Suchvektor, der auf den Chunk-Text zeigt.

**Multi-Vektor-Index:** Ein Index, in dem mehrere Vektoren (hier die Fragen) auf denselben Text zeigen.

**Ablauf**

1. **Prompt** (KERN 1). Das Chat-Modell soll genau `QUESTIONS_PER_CHUNK` kurze Fragen auf Deutsch schreiben, wie ein Nutzer sie stellen würde, und nur JSON liefern. Ein Schema prüft die Antwort.
2. **Einträge** (KERN 2). Ein Eintrag je Frage: gleicher Chunk-Text, gleiche Metadaten, eigene `generatedQuestion`.
3. **Einbetten** (KERN 3). Die Fragen bekommen `query: `, denn sie sind Anfragen. Der Chunk-Text selbst wird nie eingebettet.
4. **Suchen** (KERN 4). Die Nutzerfrage trifft auf generierte Fragen. Stehen mehrere Fragen eines Chunks oben, zählt der Chunk nur einmal.

Die Chunks sind dieselben wie in Teil 2. Nach jedem Chunk wird der Index gespeichert. Ein neuer Lauf überspringt alles, was schon im Index steht.

**Das siehst du**

Ein erster Lauf über den ganzen Korpus (gekürzt). Ein zweiter Lauf findet alle Chunks im Index und meldet je Dokument `0 new chunks, … already indexed and skipped`.

```text
Existing chunks are kept and searched, including those outside the selection. If settings or content change, delete …/questions__text-embedding-multilingual-e5-base.json to rebuild the index.
Chunks per document:   (Tabelle, hier gekürzt: 7, 24, 15, 30, 11, 10, 19, 13, 15, 18, 32, 5)
… INFO LLM: Call started { model: 'qwen3.5-4b', source: '00-vorwort-der-projektleiter.md', position: 0 }
… INFO LLM: Call completed { model: 'qwen3.5-4b', source: '00-vorwort-der-projektleiter.md', position: 0, durationMs: … }
00-vorwort-der-projektleiter.md, chunk 1: Warum wurde die OWASP Top 10 für LLMs aktualisiert? | Welche Gruppe hat an der Liste mitgearbeitet? | Wie wurden die Themen ausgewählt?
…
00-vorwort-der-projektleiter.md: 7 new chunks, 0 chunks already indexed and skipped.
…
11-appendix-llm-application-architecture-and-threat-modeling.md: 5 new chunks, 0 chunks already indexed and skipped.
Indexing in this run: … s
Calls in this run: Embedding 199, LLM 199 · LLM tokens: 596399 (reported for 199/199 calls) · Embedding tokens (estimated): 16801
Chunks not yet indexed: 0
Saved index: 12 documents, 597 vectors
199 chunks in …/indexes/questions__text-embedding-multilingual-e5-base.json, characters min 130 / average 601 / max 2077
Top 3 for “Wie begrenze ich Prompt Injection?”:
│ file                                              │ similarity │ section                                   │ question                                                              │
│ '01-llm01-prompt-injection.md'                    │ '0.933'    │ 'Beschreibung'                            │ 'Wie funktioniert eine Prompt-Injection genau?'                       │
│ '01-llm01-prompt-injection.md'                    │ '0.918'    │ 'Arten von … › Direkte Prompt Injections' │ 'Was passiert genau bei einer direkten Prompt Injection?'             │
│ '02-llm02-offenlegung-sensibler-informationen.md' │ '0.910'    │ 'Beschreibung'                            │ 'Können Sicherheitsmaßnahmen durch Prompt Injection umgangen werden?' │
Original chunk for rank 1:
LLM01:2025 Prompt Injection › Beschreibung
…
```

**Was bedeutet das?**

- Jeder Chunk bekommt `QUESTIONS_PER_CHUNK` Vektoren: 199 Chunks, 597 Vektoren. `Chunks not yet indexed: 0` heißt: Kein Chunk wurde übersprungen. Fehlen welche, ist der Index trotzdem durchsuchbar.
- Ein LLM-Aufruf je Chunk: 199 Aufrufe und rund 600 000 Tokens, im Schnitt etwa 3000 je Chunk für drei kurze Fragen. Ein großer Teil davon sind Denkschritte des Reasoning-Modells. Teil 4 ist deshalb mit Abstand der langsamste Teil der Lektion; wie lange er auf Referenz-Hardware braucht, steht in [docs/trainer.de.md](../../docs/trainer.de.md#vorab-checkliste) (für Trainer, enthält Lösungen).
- Die Ähnlichkeiten liegen höher als in Teil 1 bis 3 (bis 0,93 statt 0,89): Frage trifft Frage, beide ähnlich formuliert.
- Platz 3 zeigt die Schwäche: Die Frage „Können Sicherheitsmaßnahmen durch Prompt Injection umgangen werden?“ passt gut, aber ihr Chunk ist die Beschreibung von LLM02 (sensible Informationen) und erwähnt Prompt Injection nur in einem Nebensatz. Eine generierte Frage kann einen Nebenaspekt größer machen, als er im Chunk ist.
- Ein RAG-Prompt bekäme den Text des Chunks („Original chunk for rank 1“), nicht die Frage, die ihn gefunden hat.

**Probier aus:** die Aufgaben im Kopf von `04-question-generation-chunking.ts`. Achte auf die Spalte `question`: Welche generierte Frage hat den Chunk gefunden?

**Stolperfallen**

- Exit-Code 1, obwohl der Lauf durchlief: Mindestens ein Chunk wurde übersprungen. Er fehlt im Index, bis ein neuer Lauf ihn schafft.
- Fortsetzen prüft nur Dokument und Position, nie den Text. Nach geänderten Dokumenten, geändertem Prompt oder anderem `QUESTIONS_PER_CHUNK` musst du die Indexdatei löschen.
- Mit `FULL_CORPUS = false` behandelt Teil 4 nur `EXAMPLE_DOCUMENT`. Was schon im Index steht, bleibt trotzdem drin und wird durchsucht.
- Die Fragen sind deutsch, weil der Prompt es verlangt. E5 ist mehrsprachig; eine englische `DEMO_QUESTION` sollte die deutschen Fragen trotzdem finden (nicht getestet).

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `…, chunk N: Model response could not be used; skipped.` | Das Modell hat kein passendes JSON geliefert. `npm run l04:4` erneut starten; nur die fehlenden Chunks werden versucht. |
| Davor `ERROR LLM: Call failed – Cause: Unexpected end of JSON input` nach langer Wartezeit | Die Antwort war leer; vermutlich hat das Reasoning-Modell nur gedacht. Erneut starten. Scheitern immer dieselben Chunks, bleiben sie draußen; die Suche funktioniert mit dem Rest. |
| Viele übersprungene Chunks, `Chunks with unusable model responses in this run: N` | Meist `SHOW_THINKING=true`: Das Denken steht dann vor dem JSON ([docs/decisions.de.md](../../docs/decisions.de.md#show-thinking)). Schalter leeren oder `false`, Teil 4 erneut starten; übersprungene Chunks werden erneut versucht. |
| `Cannot load the question index …. Check the file and QUESTIONS_PER_CHUNK, or regenerate it …` | Die Datei passt nicht zu `QUESTIONS_PER_CHUNK` oder ist beschädigt. Wert zurücksetzen oder die Datei löschen und neu erzeugen. |
| `No saved entries; search skipped.` | Der Index ist leer, meist weil alle Chunks übersprungen wurden. Siehe oben. |

> **Vertiefung:** Warum Teil 4 den Server nicht um strukturierte Ausgabe bittet, sondern JSON im Prompt verlangt und mit zod prüft: [docs/decisions.de.md](../../docs/decisions.de.md#kein-structured-output). Warum `FULL_CORPUS = true` der Standard ist: [docs/decisions.de.md](../../docs/decisions.de.md#full-corpus). Der Fragen-Index hängt nur an und bemerkt keine Änderungen; wie man das in Produktion löst, steht in [docs/production.de.md](../../docs/production.de.md).

## Teil 5 – Klein suchen, groß liefern (Parent-Document)

**In einem Satz:** Teil 5 sucht in kleinen Stücken (Kinder) und liefert den ganzen Abschnitt (Parent), aus dem das beste Stück stammt.

**Ablauf**

1. **Kinder bilden** (KERN 1). Jeder Abschnitt aus dem Index `headings` ist ein Parent. Er wird in gleich große Kinder von etwa `CHILD_SIZE` Zeichen geteilt. Jedes Kind beginnt mit dem Überschriftenpfad seines Parents.
2. **In Kindern suchen** (KERN 2). Nur die Kinder werden eingebettet und mit der Frage verglichen.
3. **Kind → Parent** (KERN 3). Je Parent zählt nur das beste Kind. Geliefert werden die ersten `TOP_K` verschiedenen Parents, jeder vollständig.

**Das siehst du**

```text
Parents: 199 sections from …/indexes/headings__text-embedding-multilingual-e5-base.json
199 parents → 357 children of about 300 characters
Embedding calls: 12, LLM calls: 0
Top 5 children for “Wie begrenze ich Prompt Injection?” (what the search compares):
│ similarity │ section                                                                   │ preview                                   │
│ '0.885'    │ 'Präventions- und Mitigationsstrategien › 1. Begrenzen Sie das Modellv…'  │ 'Geben Sie spezifische Anweisungen zur…'  │
│ …                                                                                                                                  │
│ '0.877'    │ 'Beschreibung'                                                            │ 'noriert. Entwickelnde können Schutzm…'   │
│ '0.874'    │ 'Beschreibung'                                                            │ 'Eine Prompt-Injection-Schwachstelle …'   │
Delivered: 5 parents from the top 20 children (4365 characters of context instead of 1933 for 5 children)
│ similarity │ section                                                                   │ child characters │ parent characters │
│ '0.885'    │ 'Präventions- und Mitigationsstrategien › 1. Begrenzen Sie das Modellv…'  │ 443              │ 443               │
│ '0.881'    │ 'Präventions- und Mitigationsstrategien › 5. Fordern Sie manuelle Frei…'  │ 279              │ 279               │
│ '0.879'    │ 'Arten von Prompt Injection-Schwachstellen › Direkte Prompt Injections'   │ 523              │ 523               │
│ '0.877'    │ 'Beschreibung'                                                            │ 344              │ 1843              │
│ '0.871'    │ 'Arten von Prompt Injection-Schwachstellen › Indirekte Prompt Injections' │ 396              │ 1277              │
```

**Was bedeutet das?**

- Das Kind entscheidet, ob ein Abschnitt gefunden wird. Der Parent entscheidet, was im Prompt steht.
- Ein kurzer Parent bleibt ein einziges Kind; dann sind Kind und Parent gleich lang.
- Zwei der besten fünf Kinder stammen aus demselben Parent (`Beschreibung`). Er wird nur einmal geliefert; dafür rückt der Parent eines späteren Kindes nach.
- Mehr Kontext kostet: Die Zeile `Delivered:` vergleicht die Zeichen der Parents mit denen der Kinder, also auch die Tokens im Prompt.
- Teil 5 schreibt keinen Index. Jeder Lauf bettet die Kinder neu ein. Wie man Kinder in Produktion schneidet und speichert: [docs/production.de.md](../../docs/production.de.md).

**Probier aus:** die Aufgaben im Kopf von `05-parent-document.ts`. Achte auf die Spalten `child characters` und `parent characters`.

**Stolperfallen**

- Eine Vorschau wie `noriert. Entwickelnde …` ist richtig: Kinder werden nach Zeichen geschnitten, auch mitten im Wort. Der Überschriftenpfad hält den Bezug.
- Die Ähnlichkeit in der zweiten Tabelle gehört zum besten Kind. Der Parent selbst wurde nie mit der Frage verglichen.
- Die Suche holt `CHILD_CANDIDATES` Kinder, mehr als `TOP_K`, weil mehrere zum selben Parent gehören können. Reicht das nicht, liefert sie weniger als `TOP_K` Parents.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Cannot load index …/headings__….json (headings). Generate it with npm run l04:0, then npm run l04:2.` | Erst `npm run l04:2` (und davor einmal `l04:0`). |
| `The index … is invalid or outdated. Regenerate the chunks with npm run l04:0, then regenerate the index with npm run l04:2.` | Der Index stammt aus einer älteren Version. `npm run l04:2` neu starten. |

## Das nimmst du mit

1. Kleine, thematisch reine Chunks treffen genauer. Der Überschriftenpfad macht sie allein verständlich.
2. Jede Schneide-Art kostet anders: Struktur nur Embeddings, Themensprünge eine zweite Runde Embeddings, Fragen einen LLM-Aufruf je Chunk.
3. Was gesucht wird und was geliefert wird, darf verschieden sein: Frage → Chunk in Teil 4, Kind → Parent in Teil 5.

## Weiter geht's

Lektion 05 bis 08 lesen die Indizes aus Teil 1 bis 4; wer welchen liest, steht in [docs/architecture.de.md](../../docs/architecture.de.md#datenfluss).

Als Nächstes: [Lektion 05 – Retrieval-Strategien](../05-retrieval-strategies/README.de.md). Sie sucht im Index `headings` und zeigt, wie Top-k, MMR, Metadatenfilter und Score-Schwelle die Treffer verändern.
