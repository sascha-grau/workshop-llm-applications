# Gemeinsame Module (`lessons/shared/`)

[English](README.md) · Datenfluss, Verträge und bekannte Grenzen: [docs/architecture.de.md](../../docs/architecture.de.md)

Modul-Referenz der Infrastruktur, die alle Lektionen teilen: Einstellungen, Logging, Burp, Ollama-Fassade, Embeddings, Index.

## Wann muss ich hier lesen?

Meist nie: Jede Lektion erklärt selbst, was ihr Lernziel braucht. Lies hier nach, wenn eine Meldung auf ein Modul zeigt, wenn du ein Paket aktualisieren willst oder wenn du Logs und Bildschirm teilst. Meldungen und ihre Lösung stehen in der Wurzel-README unter [Wenn etwas nicht klappt](../../README.de.md#wenn-etwas-nicht-klappt).

## Module

In der Reihenfolge, in der die Lektionen sie brauchen. "Seit" nennt den ersten Teil, der das Modul direkt oder über ein anderes Modul lädt.

| Modul | Zweck in einem Satz | Wichtige Exporte | Seit | Besonderheit |
|---|---|---|---|---|
| `config.ts` | Liest `.env` und prüft jede Einstellung erst beim ersten Lesen. | `remoteModel`, `remoteEmbeddingModel`, `settings`, `optionalBooleanEnv` | 01, Teil 1 | Optionale Schalter `ALL_DOCUMENTS` und `SHOW_THINKING` liest `optionalBooleanEnv` (leer, `true`/`false`, auch `1`/`0`, `yes`/`no`; leer = es gilt die Konstante im Code), `SHOW_THINKING` als `settings.showThinking`. Alte `.env`-Namen melden sich mit einem Hinweis auf den neuen Namen. Bedeutung: [show-thinking](../../docs/decisions.de.md#show-thinking), [all-documents](../../docs/decisions.de.md#all-documents) |
| `startup.ts` | Rahmen jedes Programms. | `runMain` | 01, Teil 1 | Ein Fehler wird eine englische Zeile `<what failed> – Cause: <why>` mit Exit-Code 1; den Stacktrace gibt es mit `DEBUG`. Ein Abbruch durch dich ist nur INFO (`Request cancelled.`). |
| `logging.ts` | Logzeilen mit Zeitstempel, abgleichbar mit Burps HTTP-History. | `log`, `logError`, `logInvocation`, `logHttpRequests`, `isAbortError` | 01, Teil 1 | Regel: nur Metadaten, nie Prompts oder Modelltext. Ausnahme sind Fehlermeldungen von Bibliotheken und Server; sie können Teile einer Anfrage zitieren, geschwärzt wird nur `REMOTE_MODEL_API_KEY`. Vor dem Teilen ansehen. |
| `text.ts` | Antwort, Denkschritte, JSON-Zaun und Quellenliste aus Modelltext. | `modelText`, `modelReasoning`, `stripThinking`, `stripJsonFence`, `formatSourceList`, `withoutSourceLists` | 01, Teil 1 | LangChain verwirft das Feld `reasoning`; die Chat-Clients setzen `__includeRawResponse: true`, `modelReasoning` liest die Rohantwort. `stripThinking` endet am ersten `</think>`, damit ein eingeschleustes Tag die Antwort nicht löscht. `formatSourceList` setzt jede Überschrift (fremde Daten, OWASP LLM05) in einen Inline-Code-Span; das Format ist ein [Vertrag](../../docs/architecture.de.md#verträge) mit Lektion 08, Teil 6. |
| `stream.ts` | Schickt Antworten als NDJSON-Stream an Open WebUI und meldet "Stopp". | `sendChatStream`, `withoutThinking`, `requestAbortSignal` | 01, Teil 1 | Eigener Stream statt `asStream` der Fassade, die Stücke aus reinem Leerraum verwirft. `withoutThinking` hält ein mögliches Tag-Ende zurück, damit ein über zwei Stücke verteiltes `<think>` erkannt wird. Liest ein privates Feld der Fassade, siehe `facade.ts`. |
| `facade.ts` | Version und Module des Pakets `ollama-api-facade-js`. | `EXPECTED_FACADE_VERSION`, `facadeRequire`, `facadeVersion` | 01, Teil 2 | Fest auf `ollama-api-facade-js` 1.0.7 (ohne `^` in `package.json`), weil `stream.ts` das private Feld `response` liest. Ein Update braucht eine Prüfung von `stream.ts`: [fassade-gepinnt](../../docs/decisions.de.md#fassade-gepinnt) |
| `server.ts` | Bereitet die Fassade vor, beantwortet Fehler und startet sie. | `prepareFacade`, `logHttpErrors`, `listenWithLogging` | 01, Teil 2 | Sicherheit: `prepareFacade` weist fremde Host-Header mit 403 ab (DNS-Rebinding); erlaubt sind `localhost`, IP-Adressen, `host.docker.internal`, `host.containers.internal` und `FACADE_HOST`. Die Fassade hat keine Anmeldung, also nur an `127.0.0.1` binden. |
| `messages.ts` | Wandelt die Nachrichten der Fassade für LangChain um. | `toPlainMessages`, `splitSystemPrompts`, `isOpenWebUITask`, `withLastUserContext` | 01, Teil 2 | Sicherheit: Ein unbekannter Nachrichtentyp wirft, statt still zur Rolle `system` zu werden. Hilfsanfragen (`### Task:`) bekommen in den Lektionen einen kleineren System-Prompt mit Leitplanke; ein vorangestelltes `### Task:` umgeht nichts Wichtiges. |
| `abort.ts` | Bricht das Warten auf APIs ohne Abbruchsignal ab. | `abortable` | 01, Teil 2 | Nur das Warten endet. Embedding-Aufrufe und Qdrant-Anfragen laufen nach "Stopp" auf dem Server weiter ([bekannte Grenzen](../../docs/architecture.de.md#bekannte-grenzen)). |
| `diagnostics.ts` | Prüft beim Start Modell-Server und Burp. | `checkModelServer`, `checkService` | 01, Teil 2 | Prüft `/models` über Burp und direkt; der Vergleich zeigt, ob Server oder Burp klemmt. Sicherheit: Über Burp kommt zuerst Burps Willkommensseite ohne API-Schlüssel, damit der Schlüssel nie an einen fremden Dienst auf Burps Port geht. |
| `proxy.ts` | Leitet ausgehende Anfragen über Burp, wenn `BURP_PROXY_URL` gesetzt ist. | `useBurpIfConfigured`, `getBurpDispatcher`, `requireBurpCertificate` | 01, Teil 3 | Burps CA aus `BURP_CA_CERT` kommt zu den normalen Root-Zertifikaten dazu; HTTPS über Burp ohne CA bricht mit Anleitung ab. Clients mit eigenem Agent umgehen Burp, so der Qdrant-Client ([bekannte Grenzen](../../docs/architecture.de.md#bekannte-grenzen)). |
| `paths.ts` | Pfade relativ zum Repo-Root. | `repoRoot`, `rootPath`, `contentDirectory`, `indexesDirectory` | 01, Teil 3 | Programme laufen aus jedem Ordner; nur `.env` lädt Node relativ zum Arbeitsverzeichnis. |
| `chat-model.ts` | Erzeugt Chat-Clients für Antworten, die als JSON gelesen werden. | `createJsonChatModel` | 06, Teil 5 | Sendet `reasoning_effort: none`, außer mit `thinking: true` oder `SHOW_THINKING=true`; ohne Wiederholungen und Streaming. Die Bewertungen in Lektion 06/07 setzen `RERANK_THINKING` (Standard `true`), siehe [rerank-denken](../../docs/decisions.de.md#rerank-denken). |
| `embeddings.ts` | E5-Modell, Präfixe, Kosinus-Ähnlichkeit, Embedding-Client. | `e5Model`, `embeddingQuery`, `cosineSimilarity`, `createEmbeddings` | 03, Teil 1 | `embeddingQuery` setzt `query: ` davor und kürzt auf `QUERY_CHARACTER_LIMIT`. Der Client sendet Fließkommazahlen und Zeilenumbrüche unverändert (lesbar in Burp) und wiederholt nichts ([Vereinfachungen](../../docs/production.de.md)). |
| `index.ts` | Liest und schreibt Indexdateien, rankt Treffer, legt die Zugriffsregel fest. | `readIndex`, `writeIndex`, `rankEntries`, `uniqueChunks`, `isPublicChunk`, `INTERNAL_DOCUMENTS` | 04, Teil 1 | Format mit `INDEX_FORMAT_VERSION` und zod-Schema, atomar geschrieben, Modellname im Dateinamen. `isPublicChunk` filtert vor der Suche: [pre-filter](../../docs/decisions.de.md#pre-filter). Der JSON-Index im Speicher ist eine [Vereinfachung](../../docs/production.de.md). |

## Weiterlesen

| Thema | Wo |
|---|---|
| Wer welche Datei schreibt und liest, Verträge, bekannte Grenzen, Namensfallen | [docs/architecture.de.md](../../docs/architecture.de.md) |
| Begründungen (Fassaden-Version, `SHOW_THINKING`, `ALL_DOCUMENTS`, Pre-Filter) | [docs/decisions.de.md](../../docs/decisions.de.md) |
| Was in Produktion anders wäre (JSON-Index, keine Wiederholungen, kein Tokenizer) | [docs/production.de.md](../../docs/production.de.md) |
| Regeln für Kommentare und Markierungen im Code | [docs/conventions.de.md](../../docs/conventions.de.md) |
