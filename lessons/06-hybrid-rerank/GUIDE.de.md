# Lektion 06 – Hybrid-Suche und Reranking: Guide

*English version: [GUIDE.md](GUIDE.md)* · Überblick und Start: [README.de.md](README.de.md)

## Worum geht's?

Lektion 05 hat nur mit Vektoren gesucht. Das klappt bei Fragen in den Worten des Dokuments, verwischt aber genaue Begriffe wie "PoisonGPT", und eine umgangssprachliche Frage kann weit vom passenden Chunk landen. Hier lädst du die Indizes in eine Vektordatenbank (Qdrant), suchst nach Stichwörtern und nach Bedeutung, verbindest beide und lässt ein Sprachmodell vor oder nach der Suche helfen.

Vergleich: Ein Register im Buch findet genau das Wort, das du suchst, aber keine Synonyme. Ein Kollege, der das Buch kennt, versteht, was du meinst, ist aber bei Eigennamen unsicher. Fragst du beide und nimmst, worin sie sich einig sind, liegst du öfter richtig.

Jedes Verfahren löst ein anderes Problem und kostet anderes. Am Ende vergleicht Teil 7 alle nebeneinander.

## Wo stehen wir?

```text
L04 Chunking ──► L05 Retrieval ──► [ L06 Qdrant/Hybrid ] ──► L07 RAG ──► L08 Evaluierung
                                          ▲ du bist hier

indexes/*.json (L04) ──Teil 1──► Qdrant: 4 Collections, je Vektoren + BM25-Volltextindex
                                        │  gesucht wird in headings__<Modell> (INDEX_STRATEGY)
                                        ▼
            ┌─ Teil 2: Keyword-Suche (BM25) ──┐
 Frage ─────┤                                 ├─ Teil 4: Hybrid (RRF) ─► Teil 5: Reranking (LLM)
            └─ Teil 3: Vektorsuche ───────────┘
 Frage ──LLM──► Fassungen ──► je eine Vektorsuche ──► Teil 6: Multi-Query (RRF)
                                       Teil 7: alles nebeneinander, samt Kosten
```

## Neue Begriffe

| Begriff | In einem Satz | Beispiel |
|---|---|---|
| Collection, Punkt, Payload | Eine Collection ist in Qdrant, was eine Tabelle in einer Datenbank ist; ein Punkt ist ein Eintrag mit ID, Vektor und Payload (Chunk-Text und Metadaten). | `headings__text-embedding-multilingual-e5-base`, Punkt `#61` |
| BM25 | Klassische Volltextsuche: zählt die Wörter der Frage im Chunk, gewichtet seltene Wörter höher (IDF) und gleicht die Länge aus. Der Wert ist nach oben offen. | `'BM25 score': '5.146'` |
| Stemmer, Stoppwörter | Der Stemmer führt Wortformen auf einen Stamm zurück; Stoppwörter ("die", "und") zählen nicht. Snowball ist ein verbreitetes, regelbasiertes Verfahren dafür. | "Maßnahmen" und "Maßnahme" ergeben denselben Begriff. |
| Hybrid-Suche, RRF | Eine Keyword-Liste und eine Vektor-Liste werden zu einem Ergebnis verbunden. RRF (Reciprocal Rank Fusion) zählt dabei nur die Ränge. | `1 / (RRF_K + Rang)` je Liste |
| Reranking (pointwise) | Ein Sprachmodell liest Frage und Chunk zusammen und vergibt einen Wert; jeder Kandidat wird für sich bewertet. | `{"score": 7}` |
| Multi-Query | Das Sprachmodell schreibt die Frage mehrfach in der Sprache des Korpus neu; jede Fassung sucht, RRF vereint die Listen. | "unbeabsichtigte Datenlecks" statt "ausplaudern" |

## Vorher prüfen

- [ ] Qdrant läuft: siehe [Qdrant einrichten](../../README.de.md#qdrant-einrichten) in der Wurzel-README (Docker, nur an `127.0.0.1`). Die Adresse steht als `QDRANT_URL` in `.env`.
- [ ] Der Index `headings` existiert (`npm run l04:0`, dann `npm run l04:2`). Die anderen drei Indizes sind optional.
- [ ] Für Teil 3 bis 7 läuft LM Studio mit E5, für Teil 5 bis 7 zusätzlich mit dem Chat-Modell (`REMOTE_MODEL_NAME`).
- [ ] `SHOW_THINKING` in `.env` ist leer oder `false`. Sonst steht das Denken vor dem JSON: In Teil 5 scheitern die Bewertungen, Teil 6 bricht ab, Teil 7 trifft beides ([warum](../../docs/decisions.de.md#show-thinking)).
- [ ] Burp ist optional. Er sieht die Aufrufe an Embedding- und Chat-Modell, aber nie die Anfragen an Qdrant: Der Qdrant-Client nutzt einen eigenen Verbindungspool, den die Proxy-Einstellung nicht erreicht. Qdrant beobachtest du im Dashboard unter `<QDRANT_URL>/dashboard`.

Alle Ausgaben unten: gemessen am 2026-11-13 mit LM Studio, `qwen3.5-4b` (Chat, Teil 5 bis 7) und `text-embedding-multilingual-e5-base` (Workshop-Standard) sowie Qdrant 1.20.0. Mit einem anderen Server oder Modell weichen Zahlen und Antworten ab. Log-Zeilen, Zeiten und Tabellenrahmen sind gekürzt (`…`).

## Teil 1 – Die Indizes in Qdrant laden

**In einem Satz:** Teil 1 kopiert die fertigen Vektoren aller vier Indizes aus Lektion 04 in je eine Qdrant-Collection und legt daneben einen BM25-Volltextindex an.

Bisher war der Vektorspeicher eine JSON-Datei, die jedes Programm ganz lädt und mit jedem Eintrag vergleicht. Eine Vektordatenbank hält die Vektoren dauerhaft, durchsucht sie mit einem Index und kann zusätzlich Volltextsuche.

**Ablauf**

1. **Index laden** (KERN 1). Die Vektoren liegen fertig in der Indexdatei; nichts wird neu eingebettet. Fehlt eine Datei, überspringt das Programm sie mit einem Hinweis.
2. **Collection neu anlegen** (KERN 2). Eine vorhandene Collection gleichen Namens wird gelöscht und neu angelegt. Die Dimension kommt aus der Datei, die Distanz ist Kosinus wie bisher.
3. **Volltextindex** (KERN 3) auf dem Feld `text`, mit deutschem Stemmer und deutschen Stoppwörtern (`TEXT_INDEX`).
4. **Punkte schreiben** (KERN 4). ID ist die Position in der Indexdatei, die Payload alles außer dem Vektor. Danach zeigt das Programm Zahl der Punkte, Einstellungen des Volltextindex und die Felder eines Punkts.

**Das siehst du**

```text
Index prepared: 69 entries from …/indexes/prepared__text-embedding-multilingual-e5-base.json, dimension 768
Collection prepared__text-embedding-multilingual-e5-base: 69 points from 69 index entries
…
Index headings: 199 entries from …/indexes/headings__text-embedding-multilingual-e5-base.json, dimension 768
Collection headings__text-embedding-multilingual-e5-base: 199 points from 199 index entries
Full-text index on text: {"type":"text","tokenizer":"word","stopwords":"german","stemmer":{"type":"snowball","language":"german"},"scoring":{"type":"bm25"}}
Payload fields of point #0: text, source, position, headingPath, version, accessGroup
Index semantic: 230 entries from …/indexes/semantic__text-embedding-multilingual-e5-base.json, dimension 768
…
Index questions: 597 entries from …/indexes/questions__text-embedding-multilingual-e5-base.json, dimension 768
Collection questions__text-embedding-multilingual-e5-base: 597 points from 597 index entries
…
```

**Was bedeutet das?**

- Alle vier Indizes landen in Qdrant, aber Teil 2 bis 7 suchen nur in `headings__…`. Welche Collection gesucht wird, steuert `INDEX_STRATEGY` in `hybrid.ts`.
- Ein Punkt je Indexeintrag. Die Payload-Felder sind die Metadaten aus Lektion 04; welche es gibt, hängt vom Index ab.
- `"scoring":{"type":"bm25"}` bestätigt: Qdrant speichert, was BM25 zum Rechnen braucht.
- `dimension 768` kommt aus der Indexdatei. Ein anderes Embedding-Modell bekommt eine eigene Collection, weil sein Name im Collection-Namen steht.

**Probier aus:** die Aufgaben im Kopf von `01-collection-load.ts`. Achte im Dashboard auf die Felder der Payload und vergleiche die Collections untereinander.

**Stolperfallen**

- Eine Collection ist eine Kopie ihrer Indexdatei, kein Ersatz. Ändert sich eine Indexdatei, lade sie hier neu (`npm run l06:1`).
- Burp zeigt bei diesem Teil nichts, auch wenn er läuft. Das ist richtig: Teil 1 spricht nur mit Qdrant.
- Eine Änderung an `TEXT_INDEX` wirkt erst nach einem neuen Lauf von Teil 1. Bis dahin sucht Qdrant mit dem alten Volltextindex.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Qdrant is not reachable at …. Start it (docker run …) or fix QDRANT_URL in .env.` | Qdrant starten (`docker start qdrant`, beim ersten Mal siehe [Qdrant einrichten](../../README.de.md#qdrant-einrichten)) oder `QDRANT_URL` prüfen. |
| `Skipping semantic: Cannot load index …` | Kein Fehler, solange `headings` geladen wird. Den fehlenden Index erzeugt das genannte npm-Skript. |
| Teil 1 scheitert beim Anlegen des Volltextindex | Das Qdrant ist zu alt für BM25 mit `scoring`. Die Version aus der Wurzel-README verwenden. |

> **Vertiefung:** Warum der Workshop JSON-Indizes und Qdrant nebeneinander nutzt: [docs/decisions.de.md](../../docs/decisions.de.md#json-index-und-qdrant). Was eine Vektordatenbank in Produktion zusätzlich leistet (Index für die Nachbarsuche, einzelne Einträge aktualisieren, Anmeldung): [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion).

## Teil 2 – Keyword-Suche mit BM25

**In einem Satz:** Teil 2 sucht ganz ohne Embedding im Volltextindex und zeigt, für welche Fragen das gut und für welche es schlecht ist.

**Ablauf**

1. **Wörter zählen** (KERN 1). Für jedes Wort der Frage zählt Qdrant, in wie vielen Chunks es steht, mit demselben Stemmer und denselben Stoppwörtern wie der Volltextindex. Ein seltenes Wort zählt in BM25 viel, ein häufiges wenig, ein Stoppwort oder ein unbekanntes Wort gar nicht.
2. **Suchen** (KERN 2). `query.text` mit `using: 'text'` sucht im Volltextindex statt auf den Vektoren und liefert höchstens `TOP_K` Chunks, sortiert nach BM25-Wert.

**Das siehst du**

```text
Keyword search (BM25) for “PoisonGPT”
Chunks per word (after stemmer and stop words): PoisonGPT 3
Hits: 3 of at most 5
│ rank │ point │ BM25 score │ file                                           │ section                                                              │
│ 1    │ 61    │ '5.146'    │ '03-llm03-lieferkette.md'                      │ 'Beispiele für Angriffsszenarien › Szenario 2: Direkte Manipulation' │
│ 2    │ 73    │ '3.409'    │ '03-llm03-lieferkette.md'                      │ 'Referenzlinks'                                                      │
│ 3    │ 84    │ '3.084'    │ '04-llm04-poisoning-von-daten-und-modellen.md' │ 'Referenzlinks'                                                      │
Keyword search (BM25) for “Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?”
Chunks per word (after stemmer and stop words): Kann 0 · mein 0 · Chatbot 8 · aus 0 · Versehen 1 · Kundendaten 0 · …
Hits: 5 of at most 5
│ 1    │ 37    │ '5.235'    │ '02-llm02-offenlegung-sensibler-informationen.md' │ 'Präventions- und Mitigationsstrategien › Föderiertes Lernen …' │
│ …
Keyword search (BM25) for “Wie wird das Wetter heute?”
Chunks per word (after stemmer and stop words): Wie 0 · wird 0 · das 0 · Wetter 0 · heute 1
Hits: 1 of at most 5
│ 1    │ 1     │ '6.176'    │ '00-vorwort-der-projektleiter.md' │ 'Was ist neu in den Top 10 von 2025' │
```

**Was bedeutet das?**

- `0` in der Zählung heißt: Stoppwort oder im Korpus nicht vorhanden. Solche Wörter tragen nichts zum BM25-Wert bei.
- BM25 liefert nur Chunks mit mindestens einem Wort der Frage. Deshalb kann die Liste kürzer als `TOP_K` sein oder leer.
- Ein BM25-Wert ist eine Summe von Gewichten, nach oben offen. Ein einzelnes seltenes Wort kann einen höheren Wert ergeben als mehrere passende. Vergleiche die Reihenfolge, nicht den Wert, und nie mit einer Kosinus-Ähnlichkeit.
- `point` ist die ID aus Teil 1, also die Position in der Indexdatei. Teil 3 bis 7 nennen Treffer mit dieser Nummer.

**Probier aus:** die Aufgaben im Kopf von `02-keywords-search.ts`. Achte auf die Zeile `Chunks per word` und darauf, ob die Treffer zur Bedeutung der Frage passen.

**Stolperfallen**

- Eine umgangssprachliche Frage ("ausplaudern") trifft andere Wörter als das Dokument ("Offenlegung"). Dafür braucht es die Vektorsuche aus Teil 3.
- Die Suche in Teil 2 bis 7 läuft bewusst ohne Zugriffsfilter, der Übersicht halber. Sie sieht auch den internen Anhang. Lektion 07 ergänzt den Filter (`PUBLIC_FILTER`).
- `INDEX_STRATEGY` gibt es zweimal: in `hybrid.ts` (diese Lektion, wirkt auch auf Lektion 07 ab Teil 8 und auf `npm run l08:6`) und in `lessons/05-retrieval-strategies/retrieval.ts`. Beide sind unabhängig ([Namensfallen](../../docs/architecture.de.md#namensfallen)).

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `The Qdrant collection headings__… does not exist. Load it with npm run l06:1.` | Erst `npm run l06:1`. |
| `Qdrant is not reachable at …` | wie in Teil 1 |

> **Vertiefung:** BM25 und die Gewichtung seltener Wörter (IDF, Inverse Document Frequency) beschreibt Robertson und Zaragoza (2009) unter [Weiterlesen](../../docs/production.de.md#weiterlesen). In Produktion sind Hybrid-Suchen aus BM25 und Vektoren verbreitet, weil Fachbegriffe, Produktnamen und Fehlernummern im Embedding leicht untergehen.

## Teil 3 – Vektorsuche in Qdrant, neben BM25

**In einem Satz:** Teil 3 sucht in Qdrant mit Vektoren, stellt das Ergebnis neben BM25 und macht aus einer Jahreszahl in der Frage einen Filter.

**Ablauf**

1. **Vom Text zum Vektor** (KERN 1). Die Frage geht an das Embedding-Modell, zurück kommt eine Liste von Zahlen. Nur diese Liste geht an Qdrant; Qdrant kennt kein Embedding-Modell.
2. **Vektorsuche** (KERN 2). Statt `{ text }` bekommt `query` den Fragevektor. Ohne `using` sucht Qdrant auf den Vektoren, mit Kosinus wie in Lektion 05. Die Tabelle zeigt je Rang den Treffer beider Suchen als `#Punkt Dokument Wert`.
3. **Filter aus der Frage** (KERN 3). Nennt eine Frage aus `VERSION_QUESTIONS` eine Jahreszahl, wird sie zum Filter auf das Payload-Feld `version` (wie in Lektion 05, Teil 3). Eingebettet wird nur der Rest der Frage.

**Das siehst du**

```text
1. To the embedding model text-embedding-multilingual-e5-base: “query: Wie verhindere ich, dass mein Chatbot vertrauliche Daten verrät?”
   Back: a vector with 768 numbers: [0.0004, 0.0507, 0.0167, 0.0338, 0.0280, -0.0258, … 762 more]
2. To Qdrant, collection headings__text-embedding-multilingual-e5-base:
   {"query":"[0.0004, 0.0507, 0.0167, 0.0338, 0.0280, -0.0258, … 762 more]","limit":5,"with_payload":true}
│ rank │ hit                   │
│ 1    │ '#44 02-llm02 0.854'  │
│ …
Top 5 for “PoisonGPT” (#point document score):
│ rank │ keyword (BM25)       │ vector               │
│ 1    │ '#61 03-llm03 5.146' │ '#61 03-llm03 0.856' │
│ 2    │ '#73 03-llm03 3.409' │ '#84 04-llm04 0.851' │
│ 3    │ '#84 04-llm04 3.084' │ '#29 01-llm01 0.846' │
│ 4    │ ''                   │ '#44 02-llm02 0.843' │
│ 5    │ ''                   │ '#96 05-llm05 0.843' │
Top 5 for “Kann mein Chatbot aus Versehen …?” (#point document score):
│ 1    │ '#37 02-llm02 5.235'  │ '#44 02-llm02 0.860'  │
│ …
Vector search for “Welche Risiken nennt OWASP 2024 für die Lieferkette?”: version 2024, embedded text “Welche Risiken nennt OWASP für die Lieferkette?”
Filter: {"must":[{"key":"version","match":{"value":"2024"}}]} → 0 of at most 5 hits
│ rank │ no filter            │ version 2024 │
│ 1    │ '#48 03-llm03 0.865' │ ''           │
│ …
Vector search for “Welche Risiken nennt OWASP 2025 für die Lieferkette?”: version 2025, embedded text “…”
│ …
```

**Was bedeutet das?**

- Die Anfrage an Qdrant enthält nur Zahlen. Deshalb müssen Frage und Chunks mit demselben Modell eingebettet sein; Qdrant könnte einen Fehler nicht bemerken.
- Die Vektorsuche liefert immer `TOP_K` Treffer, auch für ein einzelnes Wort. Ihre Werte liegen eng beieinander; der Abstand sagt kaum etwas.
- BM25 setzt einen genauen Begriff deutlich nach vorn und schweigt, wenn kein Wort passt (leere Zellen).
- Die Zeile `embedded text` zeigt: Die Jahreszahl ist aus dem eingebetteten Text genommen. Im Vektor hätte sie die Suche nur ein wenig verschoben; als Filter ist sie eine harte Regel.

**Probier aus:** die Aufgaben im Kopf von `03-vector-search.ts`. Achte darauf, in welcher Spalte das Dokument steht, das die Frage beantwortet.

**Stolperfallen**

- Die Werte der beiden Spalten sind nicht vergleichbar: BM25 ist nach oben offen, Kosinus liegt bei E5 meist zwischen 0,7 und 0,9. Teil 4 verbindet die Listen deshalb über die Ränge.
- Eine leere Zelle ist kein Fehler: Diese Suche hat weniger Treffer.
- Liefert ein Filter nichts, ist das die ehrliche Antwort ("dazu gibt es keine Dokumente"), nicht ein Fall für die ähnlichsten Treffer ohne Filter.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Model API directly: The model server is unreachable or timed out. …` | LM Studio starten, E5 laden, `REMOTE_MODEL_BASE_URL` prüfen. |
| Meldungen zu Qdrant | wie in Teil 1 und 2 |

> **Vertiefung:** Filter aus der Frage abzuleiten heißt in der Literatur oft "Self-Query": In Produktion übernimmt das meist ein Sprachmodell, das die Frage in Suchtext und Filter zerlegt. Hier reicht ein regulärer Ausdruck. Warum Filter vor der Suche laufen: [docs/decisions.de.md](../../docs/decisions.de.md#pre-filter).

## Teil 4 – Hybrid-Suche mit RRF

**In einem Satz:** Teil 4 lässt Qdrant BM25- und Vektorliste in einer Anfrage holen und mit RRF über die Ränge zu einer Liste verbinden.

**Ablauf**

1. **Hybrid in einer Anfrage** (KERN 1). `prefetch` holt beide Listen mit je `CANDIDATES_PER_LIST` Kandidaten, `query: { rrf }` fusioniert sie auf dem Server zu den besten `TOP_K`.
2. **Nachrechnen** (KERN 2). Jede Liste gibt einem Chunk `1 / (RRF_K + Rang)`, mit Rang ab 0 wie in Qdrant; die Beiträge werden addiert. Fehlt ein Chunk in einer Liste, bekommt er von ihr nichts. Ein Beispiel: Rang 0 in der einen und Rang 4 in der anderen Liste ergibt 1/60 + 1/64 ≈ 0,0323.
3. **Spitzenplätze prüfen** (KERN 3). Unter jeder Tabelle steht, ob Platz 0 jeder Einzelliste in den Hybrid-Top-k gelandet ist.

**Das siehst du**

```text
Hybrid search (RRF, k = 60) for “PoisonGPT” – rank from 0 in both lists, RRF by hand next to Qdrant’s score:
│ rank │ hit            │ keyword rank │ vector rank │ RRF by hand │ RRF Qdrant │
│ 1    │ '#61 03-llm03' │ 0            │ 0           │ '0.0333'    │ '0.0333'   │
│ 2    │ '#84 04-llm04' │ 2            │ 1           │ '0.0325'    │ '0.0325'   │
│ 3    │ '#73 03-llm03' │ 1            │ 8           │ '0.0311'    │ '0.0311'   │
│ 4    │ '#29 01-llm01' │ '–'          │ 2           │ '0.0161'    │ '0.0161'   │
│ 5    │ '#44 02-llm02' │ '–'          │ 3           │ '0.0159'    │ '0.0159'   │
Rank 0 keyword: #61 03-llm03, in the hybrid top 5: yes
Rank 0 vector: #61 03-llm03, in the hybrid top 5: yes
Hybrid search (RRF, k = 60) for “Kann mein Chatbot aus Versehen …?” – …
│ 1    │ '#158 09-llm09' │ 1            │ 4           │ '0.0320'    │ '0.0320'   │
│ …
Rank 0 keyword: #37 02-llm02, in the hybrid top 5: no
Rank 0 vector: #44 02-llm02, in the hybrid top 5: no
```

**Was bedeutet das?**

- `–` in einer Rang-Spalte heißt: Der Chunk steht in dieser Liste nicht unter den ersten `CANDIDATES_PER_LIST`. Er bekommt dann nur den Beitrag der anderen Liste, ungefähr die Hälfte.
- RRF belohnt Einigkeit. Ein Chunk auf Rang 1 und 2 (1/61 + 1/62) schlägt einen, der nur in einer Liste auf Rang 0 steht (1/60).
- Die RRF-Werte liegen dicht beieinander. Bei `RRF_K` = 60 ist Platz 0 nur wenig mehr wert als Platz 5.
- RRF braucht keinen Modellaufruf außer dem Embedding der Frage.

**Probier aus:** die Aufgaben im Kopf von `04-hybrid-rrf.ts`. Achte auf die Zeilen `Rank 0 …` und darauf, wie weit die beiden Rang-Spalten auseinanderliegen.

**Stolperfallen**

- RRF findet nichts, was in keiner Liste unter den ersten `CANDIDATES_PER_LIST` steht.
- RRF prüft nicht, ob ein Chunk die Frage beantwortet. Zwei Listen können sich auch bei einem unpassenden Chunk einig sein. Das prüft erst das Reranking in Teil 5.
- Die Ränge zählen ab 0, die Spalte `rank` ab 1. Die Formel nutzt die Ränge ab 0, wie Qdrant.

**Wenn es hakt:** dieselben Meldungen wie in Teil 3.

> **Vertiefung:** RRF und der Wert 60 für die Konstante stammen von Cormack, Clarke und Büttcher (2009), siehe [Weiterlesen](../../docs/production.de.md#weiterlesen). Andere Fusionen gewichten die normierten Werte beider Listen; das braucht Werte, die sich vergleichen lassen, und eine Gewichtung, die man ausmessen muss. RRF kommt ohne beides aus.

## Teil 5 – Reranking mit dem Sprachmodell

**In einem Satz:** Ein Sprachmodell liest Frage und Chunk zusammen, bewertet jeden Hybrid-Treffer von 0 bis 10 und sortiert neu.

Die Vektorsuche bettet Frage und Chunk getrennt ein und vergleicht nur Vektoren. Beim Reranking sieht das Modell beide Texte zugleich.

**Ablauf**

1. **Kandidaten** (KERN 1). Die Hybrid-Suche aus Teil 4 liefert die besten `CANDIDATES` Chunks.
2. **Bewerten** (KERN 2). Pointwise: Für jeden Kandidaten ein Chat-Aufruf mit der Frage und den ersten `TEXT_LIMIT` Zeichen des Chunks, alle parallel. Mit `RERANK_THINKING` (Standard) denkt das Modell vor jeder Bewertung. Es antwortet mit JSON `{"score": …}`; ein Schema prüft die Antwort.
3. **Neu sortieren** (KERN 3). Absteigend nach der Zahl des Modells. Bei gleicher Zahl bleibt die Reihenfolge von RRF. Eine unbrauchbare Antwort landet hinter den bewerteten.

**Das siehst du**

```text
Reranking the hybrid top 8 for “Kann mein Chatbot aus Versehen …?” (#point document score):
Cost: 8 LLM calls, 15280 tokens, … s
│ rank │ before (RRF)           │ after (LLM 0–10)  │
│ 1    │ '#158 09-llm09 0.0320' │ '#19 01-llm01 2'  │
│ 2    │ '#96 05-llm05 0.0311'  │ '#118 07-llm07 1' │
│ 3    │ '#145 09-llm09 0.0311' │ '#158 09-llm09 0' │
│ 4    │ '#19 01-llm01 0.0310'  │ '#96 05-llm05 0'  │
│ …
│ 8    │ '#44 02-llm02 0.0167'  │ '#44 02-llm02 0'  │
```

**Was bedeutet das?**

- `before` zeigt RRF-Werte, `after` die Zahl des Modells. Die beiden Spalten haben verschiedene Einheiten.
- Beide Spalten enthalten dieselben acht Chunks. Reranking sortiert nur um; was nicht unter den Kandidaten ist, kommt auch danach nicht in den Prompt.
- Viele gleiche Zahlen (hier mehrfach `0`) sind bei einem kleinen Modell normal. Bei Gleichstand entscheidet die RRF-Reihenfolge.
- Die Kostenzeile zählt Aufrufe und Tokens. Jede Frage kostet `CANDIDATES` Aufrufe; bei einer bezahlten API ist das Geld, lokal Wartezeit.
- Die meisten Tokens sind Denkschritte (Reasoning-Tokens): Die Antwort selbst ist nur `{"score": …}`, davor denkt das Modell bei jeder Bewertung. Das macht die Bewertungen langsam und teuer.

**Probier aus:** die Aufgaben im Kopf von `05-reranking.ts`. Achte auf die Kostenzeile und darauf, wie weit ein Chunk zwischen `before` und `after` wandert.

**Stolperfallen**

- Ein `–` statt einer Zahl in `after` heißt: Der Aufruf ist gescheitert, oder die Antwort war kein gültiges JSON oder lag außerhalb von 0 bis 10. Das Log davor zeigt den Grund.
- Pointwise heißt: Jeder Aufruf sieht nur einen Chunk. Die Zahlen verschiedener Aufrufe sind deshalb nicht genau aufeinander abgestimmt.
- `RERANK_THINKING` ist nicht `SHOW_THINKING`. Der Schalter lässt das Modell denken; das Programm entfernt die Denkschritte, bevor es das JSON liest. `SHOW_THINKING=true` stellt sie dagegen vor das JSON, und die Bewertungen scheitern.
- Reranking schickt Chunk-Text an das Chat-Modell. Weil Lektion 06 ohne Zugriffsfilter sucht, kann das auch der interne Anhang sein.
- Der Chunk-Text ist fremder Text im Prompt und könnte Anweisungen enthalten. Die RAG-Prompts in Lektion 07 rahmen ihn deshalb in eigenen Tags (`<retrieved_context>`); siehe [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion).

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `– N answer(s) unusable, kept behind the rated ones` | Meist `SHOW_THINKING=true`: Das Denken steht vor dem JSON. Schalter leeren oder `false`, Teil 5 erneut starten. Steht im Log `Context size has been exceeded`, siehe nächste Zeile. |
| `ERROR LLM: Call failed – … Context size has been exceeded.` | Die parallelen Aufrufe teilen sich den Kontext des Chat-Modells in LM Studio. Das Chat-Modell mit Parallel 1 neu laden (Ladeeinstellung „Max Concurrent Predictions“) und Teil 5 erneut starten. |
| `ERROR LLM: Call failed – …` für einzelne Punkte | Das Modell hat kein passendes JSON geliefert. Erneut starten; bleibt es, ein anderes Chat-Modell laden. |
| Die Bewertungen dauern sehr lange, das Programm scheint zu hängen | Mit `RERANK_THINKING` normal: Das Modell denkt vor jeder Bewertung, und LM Studio mit Parallel 1 arbeitet die Aufrufe nacheinander ab. Abwarten; die Log-Zeilen `LLM: Call completed` zeigen den Fortschritt. |
| `ERROR LLM: Call failed – …` mit einer Zeitüberschreitung (timed out) | Das Zeitlimit der Bewertung (`timeout` beim Aufruf von `createJsonChatModel`) ist abgelaufen. Das kommt nur mit Parallel größer als 1 oder auf einem langsameren Rechner vor: Parallel 1 einstellen, sonst `timeout` erhöhen. |
| Meldungen zu Qdrant oder dem Modell-Server | wie in Teil 1 und 3 |

> **Vertiefung:** Mit Denkschritten bewertet ein kleines Modell meist sinnvoller, braucht aber ein Vielfaches an Tokens und Zeit. Wie groß der Unterschied ist, zeigt die dritte Aufgabe; warum `RERANK_THINKING` trotzdem der Standard ist: [docs/decisions.de.md](../../docs/decisions.de.md#rerank-denken). In der Praxis übernimmt ein kleines, eigens trainiertes Modell das Reranking (Cross-Encoder): Es liest Frage und Chunk zusammen und gibt direkt einen Relevanzwert aus, ohne Prompt und ohne JSON, das geprüft werden muss. Es gibt leichtgewichtige Modelle dafür, z. B. Qwen3-Reranker-0.6B mit 0,6 Milliarden Parametern. Siehe [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion). Warum Teil 5 den Server nicht um strukturierte Ausgabe bittet: [docs/decisions.de.md](../../docs/decisions.de.md#kein-structured-output).

## Teil 6 – Multi-Query

**In einem Satz:** Das Sprachmodell formuliert die Frage mehrfach in der Fachsprache des Korpus um; jede Fassung sucht, und RRF führt die Listen zusammen.

Reranking kann nur umsortieren, was die Suche schon gefunden hat. Multi-Query setzt früher an: bei der Frage.

**Ablauf**

1. **Umformulieren** (KERN 1). Ein Chat-Aufruf liefert `VARIANT_COUNT` sachliche Fassungen mit Fachbegriffen der IT-Sicherheit, als JSON.
2. **Einbetten und suchen** (KERN 2). Originalfrage und Fassungen werden in einer Anfrage eingebettet; jede sucht für sich. Die Originalfrage bleibt eine der Listen, damit abdriftende Fassungen sie nicht verdrängen.
3. **Fusionieren** (KERN 3). Ein `prefetch` je Vektor, RRF über alle Listen, wie in Teil 4, nur mit mehr als zwei.

**Das siehst du**

```text
Multi-query for “Kann mein Chatbot aus Versehen …?” (rewriting: 1 LLM call, … s):
Variant 1: Wie lässt sich das Risiko einer unbeabsichtigten Datenexfiltration durch Generative AI-Modelle im Hinblick auf PII und Trade Secrets bewerten, …?
Variant 2: Welche Bedrohungsvektoren wie Prompt Injection könnten zu einer Verletzung der Vertraulichkeit sensibler Daten führen …?
Variant 3: Wie kann die Compliance bei der Verarbeitung von Kundendaten in LLM-basierten Chatbots gewährleistet werden, um unbeabsichtigte Datenlecks zu verhindern …?
Original question against multi-query (4 vectors, RRF k = 60) (#point document score):
│ rank │ original question (vector) │ multi-query (4 vectors, RRF) │ found by       │
│ 1    │ '#44 02-llm02 0.860'       │ '#115 06-llm06 0.049'        │ '3 of 4 lists' │
│ 2    │ '#96 05-llm05 0.850'       │ '#58 03-llm03 0.046'         │ '3 of 4 lists' │
│ 3    │ '#127 07-llm07 0.846'      │ '#44 02-llm02 0.045'         │ '3 of 4 lists' │
│ …
```

**Was bedeutet das?**

- Lies die Fassungen immer mit. Sie zeigen, in welche Richtung das Modell die Suche lenkt.
- `found by` zählt, in wie vielen Einzellisten ein Treffer steht. Ein Chunk, den mehrere Fassungen finden, steigt nach oben.
- Die RRF-Werte sind höher als in Teil 4, weil vier Listen beitragen statt zwei. Sie sind nur innerhalb einer Tabelle vergleichbar.
- Multi-Query kostet einen Chat-Aufruf und mehrere Embeddings je Frage. Die Fassungen hängen am Modell und an seiner Laune; ein zweiter Lauf kann andere liefern.

**Probier aus:** die Aufgaben im Kopf von `06-multiquery.ts`. Achte auf die Fachbegriffe in den Fassungen und auf die Spalte `found by`.

**Stolperfallen**

- Die linke Spalte ist die reine Vektorsuche mit der Originalfrage, nicht die Hybrid-Suche aus Teil 4. Multi-Query nutzt hier nur Vektoren.
- Eine schlechte Umformulierung führt die Suche in die falsche Richtung. Die Originalfrage als eigene Liste dämpft das, verhindert es aber nicht.
- Liefert das Modell eine falsche Zahl an Fassungen oder kein JSON, bricht der Lauf ab. Es gibt keinen Ersatzwert wie in Teil 5.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `ERROR LLM: Call failed – …`, danach Abbruch | Meist `SHOW_THINKING=true` oder eine Antwort mit falscher Zahl an Fassungen. Schalter leeren oder `false`, erneut starten. |
| Meldungen zu Qdrant oder dem Modell-Server | wie in Teil 1 und 3 |

> **Vertiefung:** Verwandte Verfahren lassen das Modell statt Fragen eine hypothetische Antwort schreiben und mit deren Vektor suchen (HyDE). Alle teilen die Schwäche: Sie hängen an der Qualität des Modells und kosten einen Aufruf vor jeder Suche. Wie `SHOW_THINKING` JSON-Antworten stört: [docs/decisions.de.md](../../docs/decisions.de.md#show-thinking).

## Teil 7 – Alle Verfahren im Vergleich (`99-full-demo.ts`)

**In einem Satz:** Teil 7 lässt alle Verfahren dieser Lektion auf denselben zwei Fragen laufen und zeigt ihre Kosten.

Die Datei heißt `99-full-demo.ts`, ist aber Teil 7 und startet mit `npm run l06:7`.

**Ablauf**

1. **Drei Suchen** (KERN 1). Für den Fachbegriff (`TECHNICAL_TERM`) und die umgangssprachliche Frage (`COLLOQUIAL_QUESTION`) je BM25, Vektor und Hybrid in einer Tabelle.
2. **Reranking** (KERN 2) der Hybrid-Treffer zur umgangssprachlichen Frage, wie in Teil 5.
3. **Multi-Query** (KERN 3) zur umgangssprachlichen Frage, wie in Teil 6. Der Vektor der Originalfrage aus Schritt 1 bleibt eine der Listen.

**Das siehst du**

```text
Top 5 for “PoisonGPT” (#point document score) – fusion: RRF in Qdrant (k = 60)
│ rank │ keyword (BM25)       │ vector               │ hybrid (RRF)         │
│ 1    │ '#61 03-llm03 5.146' │ '#61 03-llm03 0.856' │ '#61 03-llm03 0.033' │
│ …
Top 5 for “Kann mein Chatbot aus Versehen …?” (#point document score) – fusion: RRF in Qdrant (k = 60)
│ 1    │ '#37 02-llm02 5.235'  │ '#44 02-llm02 0.860'  │ '#158 09-llm09 0.032' │
│ …
Reranking the hybrid top 8 for “…” (LLM, pointwise 0–10) – cost: 8 LLM calls, 15086 tokens, … s
│ rank │ before (RRF)          │ after (LLM 0–10)  │
│ 1    │ '#158 09-llm09 0.032' │ '#37 02-llm02 3'  │
│ 2    │ '#96 05-llm05 0.031'  │ '#19 01-llm01 2'  │
│ …
│ 8    │ '#37 02-llm02 0.017'  │ '#147 09-llm09 0' │
Multi-query for “…”:
Variant 1: …
Multi-query cost: 1 LLM calls, 3124 tokens, … s – 4 vectors, fusion: RRF in Qdrant (k = 60)
│ rank │ original question (vector) │ multi-query (4 vectors, RRF) │
│ 1    │ '#44 02-llm02 0.860'       │ '#115 06-llm06 0.049'        │
│ …
```

**Was bedeutet das?**

- Die drei Spalten in Schritt 1 nutzen dieselbe Frage. Unterschiede kommen nur aus dem Verfahren.
- Die Kostenzeilen vergleichen die beiden Verfahren mit Sprachmodell: Reranking braucht einen Aufruf je Kandidat, Multi-Query einen je Frage.
- Die Zahlen des Modells schwanken zwischen Läufen und Modellen. Vergleiche Teil 5 und Teil 7: dieselbe Suche, nicht immer dieselben Bewertungen.
- Welche Kombination sich lohnt, entscheiden deine Fragen. Teil 7 zeigt, wie man das an Beispielen prüft, bevor man ein Verfahren einbaut.

**Probier aus:** die Aufgaben im Kopf von `99-full-demo.ts`. Achte auf die Treffer aus `02-llm02-offenlegung-sensibler-informationen.md` in jeder Spalte.

**Stolperfallen**

- Die Werte in der Spalte `hybrid (RRF)` haben drei Nachkommastellen; Teil 4 zeigt vier. Gleich aussehende Werte können sich in der vierten Stelle unterscheiden.
- Die Hybrid-Suche holt mehr Treffer als die Tabelle zeigt, damit das Reranking acht Kandidaten hat.
- Platz 8 der Kandidaten kann zwischen Teil 5 und Teil 7 wechseln, hier #37 und #44. Beide stehen nur in einer Liste auf Rang 0 und haben genau denselben RRF-Wert (1/60); bei Gleichstand ist die Reihenfolge nicht garantiert.
- Die Werte in Teil 7 sind Kopien der Konstanten aus Teil 4 bis 6. Änderst du sie dort, ändert sich Teil 7 nicht.

**Wenn es hakt:** dieselben Meldungen wie in Teil 5 und 6.

> **Vertiefung:** Lektion 07, Teil 8 bis 10 baut Hybrid-Suche, Reranking und Multi-Query in die RAG-Fassade ein, dann mit Zugriffsfilter an jeder Teilsuche. Was im Workshop gegenüber einer Produktionsumgebung vereinfacht ist: [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion).

## Das nimmst du mit

1. BM25 findet genaue Begriffe, die Vektorsuche Bedeutung. Keine ist allein verlässlich.
2. RRF verbindet Listen über die Ränge, ohne Modellaufruf, und belohnt Einigkeit.
3. Ein Sprachmodell hilft vor der Suche (Multi-Query) oder danach (Reranking); beides kostet Aufrufe, und Reranking findet nichts Neues.

## Weiter geht's

- [Lektion 07 – RAG mit Open WebUI](../07-rag-open-webui/README.de.md) gibt die Treffer einem Sprachmodell als Kontext. Ab Teil 8 sucht sie in der Collection aus Teil 1 dieser Lektion, gesteuert über `INDEX_STRATEGY` in `hybrid.ts`.
- [Lektion 08](../08-evaluations/README.de.md), Teil 6 misst die laufende Fassade aus Lektion 07, die auf diesen Collections sucht.
- Wer welche Collection liest, steht in [docs/architecture.de.md](../../docs/architecture.de.md).
