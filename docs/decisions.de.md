# Entscheidungen

*English version: [decisions.md](decisions.md)*

Kurze Entscheidungsprotokolle: Kontext, Entscheidung, Folgen. Jede Überschrift ist zugleich der Anker; Code-Kommentare und Guides verlinken z. B. auf `#judge-huelle`. Die Anker sind in beiden Sprachfassungen gleich.

| Anker | Thema |
|---|---|
| [kein-structured-output](#kein-structured-output) | JSON per Prompt; nur der Judge von `faithful` versucht `json_schema` |
| [judge-huelle](#judge-huelle) | `promptfoo-judge.ts` als Hülle um den Judge |
| [eigene-faithful-pruefung](#eigene-faithful-pruefung) | Eigene Prüfung `faithful` statt `context-faithfulness` |
| [fassade-gepinnt](#fassade-gepinnt) | `ollama-api-facade-js` auf eine feste Version gepinnt |
| [npm-audit-funde](#npm-audit-funde) | Bekannte `npm audit`-Funde über die Fassade |
| [json-index-und-qdrant](#json-index-und-qdrant) | JSON-Index im Speicher und Qdrant nebeneinander |
| [pre-filter](#pre-filter) | Zugriffsfilter vor der Suche |
| [show-thinking](#show-thinking) | `SHOW_THINKING=true` heißt "alles zeigen" |
| [all-documents](#all-documents) | `ALL_DOCUMENTS` ändert nur die Ausgabe |
| [expand-sections](#expand-sections) | Lektion 08, Teil 3 erweitert um Unterabschnitte |
| [full-corpus](#full-corpus) | `FULL_CORPUS = true` als Standard |
| [exakter-tokenizer](#exakter-tokenizer) | Lektion 04, Teil 0 zählt mit dem lokalen E5-Tokenizer |
| [rerank-denken](#rerank-denken) | Reranking-Bewertungen mit Denkschritten (`RERANK_THINKING`) |

## kein-structured-output

**Kein `withStructuredOutput`, kein `response_format`**

**Kontext:** Mehrere Teile brauchen JSON vom Chat-Modell: Fragen in Lektion 04, Teil 4, Bewertungen und Fassungen in Lektion 06/07, Urteile in Lektion 08. Mit einem JSON-Schema in der Anfrage lieferte der frühere Workshop-Server mit einem Reasoning-Modell das JSON im Feld `reasoning` und ließ `content` leer; LangChain scheiterte mit "Unexpected end of JSON input". Mit LM Studio ist das nicht erneut geprüft.

**Entscheidung:** Der Prompt verlangt nur JSON. `stripJsonFence` entfernt einen Markdown-Zaun, ein zod-Schema prüft das Ergebnis. Belege: Kommentare in `lessons/04-chunking/04-question-generation-chunking.ts` und `lessons/08-evaluations/evaluation.ts`.

**Folgen:** Ungültiges JSON ist ein normaler Fall: Lektion 04, Teil 4 überspringt den Chunk, Reranking fällt auf -1 zurück, Multi-Query bricht die Frage ab, Lektion 08 meldet "no usable verdict" bzw. "judge format error".

**Änderung für `faithful`:** Auf LM Studio scheiterten fünf Zellen von Lektion 08, Teil 5 an ungültigem JSON des Judge (`qwen3.5-4b`, gemessen am 2026-11-13): zweimal stand ein verirrtes Backtick hinter dem JSON, dreimal standen unmaskierte ASCII-Anführungszeichen neben „…“ in einem Text. Deshalb fordert `promptfoo-faithfulness.ts` bei ausgeschaltetem Denken strikte strukturierte Ausgabe (`json_schema`). Ist sie leer oder ungültig oder lehnt der Server `response_format` ab, gilt der bisherige Klartext-Prompt mit derselben zod-Prüfung (zwei Formatversuche plus ein Versuch für den Rückfall; das Modellobjekt merkt sich den Klartextmodus). Das JSON wird nie aus dem Feld `reasoning` gelesen. Belege: Auf LM Studio lief der volle Lauf ohne `ERROR` (vorher fünf). Auf dem Server des Autors (`qwen3.8-4b-q4`, ignoriert `reasoning_effort: none`) liegt das JSON bei strukturierter Ausgabe im Feld `reasoning`, der Rückfall greift, und ein Einzeltest lief ohne Fehler. Für Chat-Antworten und alle anderen JSON-Aufrufe bleibt es beim Prompt.

## judge-huelle

**Judge-Hülle `promptfoo-judge.ts`**

**Kontext:** promptfoo setzt `{{ env.X }}` als Text ein. Sein OpenAI-Adapter liest `config.showThinking ?? true`; der Text "false" wäre also wahr, und "Thinking: …" stünde vor jeder Ausgabe von `llm-rubric`. Teil 5 hat zwei Judge-Prüfungen (`correct`, `faithful`), die bisher unterschiedlich konfiguriert waren.

**Entscheidung:** Ein eigener Provider verpackt `openai:chat:<Modell>`. Er setzt `showThinking` als echten Boolean aus `SHOW_THINKING` und ohne Denken `reasoning_effort: 'none'`. Ein einziger YAML-Judge-Block gilt für `correct` und `faithful`; `faithful` baut sein LangChain-Modell aus denselben Werten. Ein gemeinsames `timeout` im Judge-Block (am 2026-11-12 von 5 auf 10 Minuten erhöht) gilt für beide, mit eigener Meldung "The judge did not answer within … s".

**Folgen:** Ein anderes Judge-Modell ändert man an einer Stelle je YAML-Datei. Teil 5 und 6 müssen ihren Block gleich halten. Ignoriert ein Server `reasoning_effort`, muss `max_tokens` im Judge-Block auch das Denken abdecken; wie sich `max_tokens` und `timeout` ergeben, steht im [Guide von Lektion 08, Teil 5](../lessons/08-evaluations/GUIDE.de.md#teil-5--chunking-strategien-mit-promptfoo) (Vertiefung).

## eigene-faithful-pruefung

**Eigene Prüfung `faithful` statt `context-faithfulness`**

**Kontext:** Die eingebaute Prüfung `context-faithfulness` von promptfoo las Klartext-Urteile. Denkschritte des Judge gerieten in die Aussagenlisten, und Formatfehler zählten still als 0 ("Could not parse context-faithfulness verdicts").

**Entscheidung:** `lessons/08-evaluations/promptfoo-faithfulness.ts` arbeitet in zwei Schritten wie RAGAS: Aussagen extrahieren (`{"statements": […]}`), dann jede gegen den Kontext prüfen (`{"verdicts": […]}`). Beide Antworten prüft ein striktes zod-Schema; je Schritt gibt es einen zweiten Versuch mit Rückmeldung, danach ERROR "judge format error". Keine Aussagen ergibt 1.

**Folgen:** FAIL heißt jetzt "Aussagen nicht gedeckt", ERROR heißt "Judge hielt das Format nicht ein". Die Begründung je Aussage steht im HTML-Bericht (`promptfoo-scores.ts`).

## fassade-gepinnt

**Fassade fest auf `ollama-api-facade-js` 1.0.7**

**Kontext:** `asStream` der Fassade verwirft Stücke aus reinem Leerraum und schiebt Absätze zusammen. Die rohe Express-Antwort ist nicht öffentlich erreichbar.

**Entscheidung:** `stream.ts` liest das private Feld `response` per `Reflect.get` und streamt selbst (NDJSON). Die Version steht exakt in `package.json`; `facade.ts` (`EXPECTED_FACADE_VERSION`), `prepareFacade` und `rawResponse` prüfen Version und Form.

**Folgen:** Ein Update der Fassade braucht eine Prüfung von `stream.ts`. Die `npm audit`-Funde über die Fassade bleiben ([npm-audit-funde](#npm-audit-funde)).

## npm-audit-funde

**Bekannte `npm audit`-Funde über die Fassade**

**Kontext:** `npm audit` meldet 4 Funde (`langsmith` bis 0.5.26, `zod` unter 4.6.6 (hier 3.25) und `uuid` unter 11.1.1). Sie kommen nur über `ollama-api-facade-js` 1.0.7, die neueste Version und die, an der der Workshop festhält ([fassade-gepinnt](#fassade-gepinnt)); sie hängt von `@langchain/core` 0.3 ab. Eine kompatible Korrektur gibt es nicht: Sie bräuchte Sprünge auf neue Hauptversionen, die die Fassade kaputt machen.

**Entscheidung:** Die Funde werden hingenommen. `npm audit fix` ändert nichts, `npm audit fix --force` wird nie ausgeführt. `package.json` legt über `overrides` feste Versionen von `langsmith`, `zod` und `undici` fest, soweit das kompatibel ist. Das Risiko ist gering: Die Fassade läuft nur auf localhost, LangSmith-Tracing ist aus, und die betroffenen Funktionen sind im Workshop nicht erreichbar.

**Folgen:** Keine `LANGSMITH_*`- und keine `LANGCHAIN_TRACING*`-Variablen setzen, auch nicht im Shell-Profil. Ein echtes Beispiel für einen Zielkonflikt in der Lieferkette ([LLM03](../content/owasp-genai-top-10/03-llm03-lieferkette.md)).

## json-index-und-qdrant

**JSON-Index im Speicher und Qdrant nebeneinander**

**Kontext:** Lektion 04 und 05 sollen zeigen, was eine Vektorsuche ist, ohne Infrastruktur. Hybrid-Suche (BM25) und Fusion brauchen eine echte Datenbank.

**Entscheidung:** Lektion 04, 05, 07 (Teil 1 bis 7) und 08 lesen JSON-Dateien und vergleichen mit jedem Eintrag (`rankEntries`). Ab Lektion 06 und in Lektion 07, Teil 8 bis 11 kommt Qdrant dazu; `l06:1` kopiert die fertigen Vektoren, bettet nichts neu ein.

**Folgen:** Eine Collection ist eine Kopie ihrer Indexdatei: Nach einem neuen Index `npm run l06:1` erneut. Teile ohne Qdrant laufen ohne Docker.

## pre-filter

**Zugriffsfilter vor der Suche**

**Kontext:** Ein Filter nach der Suche lässt weniger als k Treffer übrig oder, falsch platziert, interne Chunks in den Prompt. In Qdrant bildet jede Teilsuche (`prefetch`) eine eigene Kandidatenliste vor der Fusion.

**Entscheidung:** `isPublicChunk` filtert beim Laden, vor dem Ranking (`loadPublicIndex`, `loadRagIndex`). In Qdrant steht `PUBLIC_FILTER` an jedem `prefetch` und an der fusionierten Anfrage (`qdrant-retrieval.ts`). Lektion 06 sucht bewusst ungefiltert, der Übersicht halber.

**Folgen:** Was nicht lesbar ist, kann nie im Kontext landen. Ein neuer Suchweg muss den Filter selbst mitbringen.

## show-thinking

**`SHOW_THINKING=true` heißt "alles zeigen"**

**Kontext:** Reasoning-Modelle liefern Denkschritte im Feld `reasoning` oder als `<think>`-Block. Wer das Denken sehen will, will es überall sehen, auch vor JSON-Antworten.

**Entscheidung:** Ausdrückliche Wahl des Autors: Mit `true` stellen `modelText` und `withoutThinking` die Denkschritte als `<think>…</think>` vor jede Antwort, auch vor solche, die als JSON gelesen werden. Standard ist aus.

**Folgen:** Mit `true` scheitern gewollt: Lektion 04, Teil 4, Lektion 06, Teil 5, 6 und Voll-Demo, Lektion 07, Teil 9 bis 11, Lektion 08, Teil 2 und 3; Teil 5 und 6 werden unzuverlässig. Die vollständige Liste steht in `.env.example`.

## all-documents

**`ALL_DOCUMENTS` ändert nur die Ausgabe**

**Kontext:** Teil 1 bis 3 von Lektion 04 zeigen sonst nur `EXAMPLE_DOCUMENT`. Ein Schalter, der auch den Index verkleinert, würde Lektion 05 bis 08 unbemerkt verändern.

**Entscheidung:** `ALL_DOCUMENTS` (Konstante in `chunking.ts`, Standard `false`) steuert nur die Detailtabellen. Ein Wert in `.env` (`true`/`false`) überschreibt die Konstante; das Programm meldet das. Den Umfang des Index steuert allein `SUBSET` (Teil 2) bzw. `FULL_CORPUS` (Teil 4).

**Folgen:** Wer `ALL_DOCUMENTS` zurücksetzt, muss auch `.env` leeren.

## expand-sections

**Lektion 08, Teil 3: Unterabschnitte dazunehmen**

**Kontext:** Die Kernaussage zu F-01 nennt sieben Maßnahmen. Die fünf besten Treffer enthielten nur drei davon; der Judge sagte zu Recht "nicht korrekt", obwohl der Fehler bei der Suche lag.

**Entscheidung:** `retrieveContext` in `evaluation.ts` nimmt mit `expandSections` Unterabschnitte derselben Treffer dazu, begrenzt auf 6 je Treffer und 12 insgesamt; ein Treffer an der Dokumentwurzel wird nicht erweitert. `EXPAND_SECTIONS = true` in `03-correctness.ts`.

**Folgen:** Teil 3 misst den Judge, nicht die Suche. Teil 5 erweitert nicht; seine Spalte `correct` ist deshalb strenger.

## full-corpus

**`FULL_CORPUS = true` als Standard**

**Kontext:** Bis zum 2026-11-12 baute Lektion 04, Teil 4 den Fragen-Index nur für ein Dokument. Lektion 08, Teil 5 brauchte dafür eine Sonderspalte mit Teilmenge der Fragen.

**Entscheidung:** `FULL_CORPUS = true` in `04-question-generation-chunking.ts`: Fragen für den ganzen Korpus. `false` nimmt nur `EXAMPLE_DOCUMENT`.

**Folgen:** Der erste Lauf dauert lange (siehe [trainer.de.md](trainer.de.md)); vorab bauen. Alle vier Spalten in Teil 5 sind vergleichbar. Der Lauf ist fortsetzbar.

## exakter-tokenizer

**Lektion 04, Teil 0 zählt mit dem lokalen E5-Tokenizer**

**Kontext:** Teil 0 muss wissen, wie viele Tokens ein Chunk hat. LM Studio hat keinen Zähl-Endpunkt; im Probelauf meldete `usage.prompt_tokens` den Wert 0 und zu lange Eingaben wurden still gekürzt. Teil 0 fiel auf `character-estimate` zurück und lieferte 351, 369 oder 391 kleine Chunks statt 69, 199 oder 230.

**Entscheidung:** Teil 0 zählt exakt und lokal mit dem Tokenizer von `intfloat/multilingual-e5-base` (Paket `@huggingface/tokenizers` 0.2.0, 87 KB, keine Abhängigkeiten, keine Install-Skripte; Transformers.js hätte rund 446 MB ONNX-Laufzeit mitgebracht). Die Tokenizer-Dateien sind auf eine unveränderliche Revision festgelegt und per SHA256 geprüft. Start- und End-Token und das Präfix `passage: ` zählen mit. Die Methode `tokenizer` hat Vorrang vor `embeddings-overflow`, `embeddings-usage` und `character-estimate`. Geprüft: 69 von 69 Zahlen gleich denen des Servers; die 69 Chunk-Dateien sind byte-gleich.

**Folgen:** Eine zusätzliche Abhängigkeit und ein einmaliger Download von rund 16 MB (`npm run tokenizer:fetch`); danach läuft alles offline, der Ordner `.cache/tokenizers/` lässt sich kopieren. Lässt sich der Tokenizer nicht laden, warnt `l04:0` mit der Abhilfe und fällt auf die Server-Methoden oder die Schätzung zurück. Das Manifest bleibt Version 3; ältere exakte Manifeste gelten weiter.

## rerank-denken

**Reranking-Bewertungen mit Denkschritten**

**Kontext:** Das Reranking (Lektion 06, Teil 5 und Voll-Demo, Lektion 07, Teil 9 bis 11) lässt das Chat-Modell jeden Treffer mit 0 bis 10 bewerten. Ohne Denkschritte (`reasoning_effort: none`) bewertete das 4B-Modell fast alles mit 0 (gemessen am 2026-11-13 mit LM Studio). Mit Denkschritten sind die Noten sinnvoll, doch jede Bewertung dauert etwa 30 s. LM Studio mit "Parallel 1" arbeitet die acht gleichzeitigen Anfragen nacheinander ab; das frühere Zeitlimit von 60 s lief ab.

**Entscheidung:** `RERANK_THINKING = true` ist der Standard, in `05-reranking.ts`, `99-full-demo.ts` und `qdrant-retrieval.ts`. Die Bewertungsaufrufe haben 600 s Zeitlimit. Beide Fälle laufen über den gemeinsamen Helfer `createJsonChatModel` (`lessons/shared/chat-model.ts`), der `reasoning_effort: none` sendet, außer bei `thinking: true` oder `SHOW_THINKING=true`; Lektion 08 nutzt denselben Helfer.

**Folgen:** Lektion 07, Teil 9 braucht pro Frage Minuten. Der Schalter zeigt den Zielkonflikt live: `false` ist schnell, aber das Reranking sortiert kaum um. Ein stärkeres Modell oder ein Reranker-Modell (siehe [production.de.md](production.de.md)) löst das besser.
