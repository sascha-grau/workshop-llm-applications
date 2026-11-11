# Lektion 06 – Hybrid-Suche und Reranking

[English](README.md)

**Lernziel:** Du lädst die Indizes aus Lektion 04 in eine Vektordatenbank (Qdrant) und durchsuchst sie auf drei Arten: nach Stichwörtern (BM25), nach Bedeutung (Vektoren) und nach beidem zusammen (Hybrid-Suche mit RRF). Du siehst, was ein Sprachmodell zusätzlich beiträgt, entweder indem es die Treffer neu sortiert (Reranking) oder die Frage umformuliert (Multi-Query), und was das kostet.

| Teil | Datei | npm-Skript | Lernziel | Braucht |
| --- | --- | --- | --- | --- |
| 1 | `01-collection-load.ts` | `npm run l06:1` | Indizes in Qdrant laden und einen BM25-Volltextindex anlegen | Qdrant, Index aus `l04:2` (weitere Indizes optional) |
| 2 | `02-keywords-search.ts` | `npm run l06:2` | Keyword-Suche mit BM25: findet genaue Begriffe, versteht keine Bedeutung | Qdrant, Collections aus Teil 1 |
| 3 | `03-vector-search.ts` | `npm run l06:3` | Vektorsuche in Qdrant neben BM25: jede versagt, wo die andere trifft; eine Jahreszahl in der Frage wird zum Metadaten-Filter (`VERSION_QUESTIONS`) | wie Teil 2, dazu LM Studio (E5) |
| 4 | `04-hybrid-rrf.ts` | `npm run l06:4` | Hybrid-Suche: beide Listen über die Ränge mit RRF verbinden | wie Teil 3 |
| 5 | `05-reranking.ts` | `npm run l06:5` | Reranking: ein Sprachmodell sortiert die Treffer neu, mit Kosten je Kandidat | wie Teil 3, dazu Chat-Modell |
| 6 | `06-multiquery.ts` | `npm run l06:6` | Multi-Query: Frage umformulieren, mit jeder Fassung suchen, mit RRF vereinen | wie Teil 5 |
| 7 | `07-full-demo.ts` | `npm run l06:7` | Alle Verfahren nebeneinander, samt Kosten | wie Teil 5 |

`hybrid.ts` ist das gemeinsame Hilfsmodul aller Teile (Verbindung zu Qdrant, Collection-Namen), kein eigener Teil. Ranking und Indexdateien liegen in [`shared/index.ts`](../shared/index.ts).

**Reihenfolge:** Erzeuge vorher die Chunks (`npm run l04:0`) und den Überschriften-Index (`npm run l04:2`); die anderen Indizes (`l04:1`, `l04:3`, `l04:4`) sind optional, Teil 1 überspringt fehlende mit einem Hinweis. Starte Qdrant mit `docker run -d --name qdrant -p 127.0.0.1:6333:6333 qdrant/qdrant:v1.20.0`; die Adresse steht als `QDRANT_URL` in `.env`. Das `127.0.0.1:` hält Qdrant auf deinem eigenen Rechner (es hat hier keine Anmeldung, und ein einfaches `-p 6333:6333` würde es für alle im Netzwerk veröffentlichen); die Version ist passend zum Client festgelegt, und der BM25-Volltextindex mit `scoring: true` braucht ein aktuelles Qdrant. Führe dann Teil 1 einmal aus: Er füllt die Collections, die alle späteren Teile lesen. Geh die Teile von 1 bis 7 durch: Jeder baut auf dem vorigen auf. Jeder Teil läuft einmal durch, schreibt seine Tabellen ins Terminal und endet; es gibt keinen Chat. Teil 1 und 2 brauchen weder LM Studio noch ein Modell. Teil 3 und 4 brauchen das E5-Modell in LM Studio, Teil 5 bis 7 zusätzlich das Chat-Modell. Kein Teil braucht Open WebUI. Burp ist optional.

**Wozu diese Lektion:** Lektion 05 hat nur mit Vektoren gesucht. Das klappt bei Fragen in den Worten des Dokuments, verwischt aber genaue Begriffe wie "PoisonGPT", und eine umgangssprachliche Frage kann weit vom passenden Chunk landen. Hier siehst du, warum keine der beiden Suchen allein verlässlich ist, wie man sie kombiniert und was ein Sprachmodell vor oder nach der Suche beitragen kann.

**Kein Zugriffsfilter in dieser Lektion:** Die Suchen in Teil 2 bis 7 fragen Qdrant bewusst ohne Zugriffsfilter ab, damit sie übersichtlich bleiben. Sie sehen deshalb auch den internen Anhang (`internal`), und Teil 5 bis 7 können ihn in den Prompts für Reranking und Multi-Query an das Chat-Modell schicken. Lektion 07 ergänzt `PUBLIC_FILTER` (OWASP LLM02 und LLM08).

**Burp und Qdrant:** Burp sieht die Anfragen an Qdrant nicht: Der Qdrant-Client nutzt einen eigenen Verbindungspool, den die Proxy-Einstellung nicht erreicht (siehe `hybrid.ts`). Die Aufrufe an Embedding- und Chat-Modell zeigt Burp weiterhin. Qdrant beobachtest du in seinem Dashboard unter `<QDRANT_URL>/dashboard`, zum Beispiel `http://localhost:6333/dashboard`.

**Messwerte:** BM25-Werte und Kosinus-Ähnlichkeiten sind nicht miteinander vergleichbar (BM25 ist nach oben offen, Kosinus liegt bei E5 meist zwischen 0,7 und 0,9). Vergleiche die Reihenfolge der Treffer, nicht die Werte. Die Teile mit Modell (5 bis 7) hängen vom Chat-Modell ab; ein kleines Modell bewertet ungleichmäßiger. Reranking macht für jede Frage einen Chat-Aufruf je Kandidat (`CANDIDATES`, standardmäßig 8): lokal unproblematisch, bei einer bezahlten API kostet es Geld.

## Grundbegriffe

- **Collection:** in Qdrant das, was eine Tabelle in einer Datenbank ist. Teil 1 legt je Index aus Lektion 04 eine Collection an; ihr Name enthält Strategie und Embedding-Modell. Eine Collection ist eine Kopie ihrer Indexdatei: Ändert sich die Datei, lade sie neu (Teil 1).
- **Punkt und Payload:** ein Punkt ist ein Eintrag einer Collection, mit ID, Vektor und Payload. Die Payload enthält den Chunk-Text und seine Metadaten. Im Fragen-Index ist jeder Punkt eine generierte Frage (Teil 1).
- **BM25:** ein klassisches Verfahren der Volltextsuche. Es zählt, wie oft die Wörter der Frage in einem Chunk vorkommen, gewichtet seltene Wörter höher und gleicht die Länge des Chunks aus. Es findet genaue Begriffe, die ein Embedding verwischen kann, versteht aber keine Bedeutung. Der Wert ist eine Summe von Gewichten, keine Ähnlichkeit zwischen 0 und 1 (Teil 1 und 2).
- **Stemmer und Stoppwörter:** Der Stemmer führt Wortformen auf einen Stamm zurück, sodass "Maßnahmen" und "Maßnahme" denselben Begriff ergeben. Stoppwörter ("die", "der", "und") zählen nicht mit (Teil 1).
- **IDF (Inverse Document Frequency):** das Gewicht eines Worts in BM25. Je weniger Chunks ein Wort enthalten, desto höher sein Gewicht (Teil 2).
- **Vektorsuche:** vergleicht den Vektor der Frage mit dem Vektor jedes Chunks per Kosinus-Ähnlichkeit. Sie findet Bedeutung ohne gemeinsames Wort, liefert aber immer `TOP_K` Treffer, auch wenn keiner passt (Teil 3).
- **Hybrid-Suche:** verbindet eine Keyword-Liste und eine Vektor-Liste zu einem Ergebnis, hier in einer einzigen Anfrage an Qdrant (Teil 4).
- **RRF (Reciprocal Rank Fusion):** Jede Liste gibt einem Chunk `1 / (RRF_K + Rang)`, mit Rang ab 0 wie in Qdrant; die Beiträge werden addiert. Nur der Rang zählt, nicht der Wert, daher stören die nicht vergleichbaren Werte von BM25 und Kosinus nicht. RRF belohnt Einigkeit und prüft nicht, ob ein Chunk die Frage beantwortet (Teil 4).
- **Metadaten-Filter aus der Frage (Teil 3):** eine harte Regel auf ein Payload-Feld statt eines Hinweises im Vektor. Hier wird eine Jahreszahl in der Frage (`OWASP 2024`) zum Filter auf `version`, und nur der Rest der Frage wird eingebettet. Der Korpus enthält nur die Ausgabe 2025, der Filter auf 2024 liefert also nichts, und das ist die ehrliche Antwort.
- **Reranking:** Ein Sprachmodell liest Frage und Chunk zusammen und bewertet den Chunk. Pointwise heißt: Jeder Kandidat wird für sich bewertet. Es sortiert nur um: Was nicht unter den Kandidaten steht, kommt nicht in den Prompt. Es kostet einen Modellaufruf je Kandidat. Ein Cross-Encoder ist ein kleines, eigens dafür trainiertes Modell (Teil 5).
- **Multi-Query:** Das Sprachmodell schreibt die Frage mehrfach in der Sprache des Korpus neu, die Suche läuft mit jeder Fassung, und RRF führt die Listen zusammen. Die Originalfrage bleibt eine der Listen. Es kostet einen Modellaufruf und mehrere Embeddings je Frage und hängt am Modell: Eine schlechte Umformulierung führt die Suche in die falsche Richtung (Teil 6).

## Aufgaben

Die Aufgaben stehen auch am Anfang jeder Datei; maßgeblich sind die Dateiköpfe.

### Teil 1 – `01-collection-load.ts`

1. Öffne das Dashboard (`<QDRANT_URL>/dashboard`, z. B. `http://localhost:6333/dashboard`) und sieh dir die Collections an: Welche Felder hat die Payload eines Punkts, und worin unterscheiden sich die Punkte der Collection `questions__…` von denen der anderen?
2. Starte das Programm ein zweites Mal. Warum bleibt die Zahl der Punkte je Collection gleich, statt sich zu verdoppeln?
3. Setze in `TEXT_INDEX` die Sprache des Stemmers auf `english` und lade neu. Suche im Dashboard (Tab "Search" mit einem Filter auf `text`) nach "Maßnahme": Werden Chunks mit "Maßnahmen" noch gefunden?

### Teil 2 – `02-keywords-search.ts`

1. Vergleiche die beiden Fragen in `QUESTIONS`: Welche Wörter der zweiten Frage zählen nicht (0 Chunks), und passen ihre Treffer zur Frage?
2. Ergänze in `QUESTIONS` einen Fachbegriff aus einem Dokument (z. B. "LoRA" oder "Slopsquatting") und vergleiche mit der Vektorsuche aus Lektion 05, Teil 1 (`QUESTION` dort ändern): Welche Suche findet den Begriff zuverlässiger?
3. Setze `INDEX_STRATEGY` in `hybrid.ts` auf `prepared` und starte neu. Wie ändern sich die Zählung je Wort und die BM25-Werte, wenn die Chunks größer sind?

### Teil 3 – `03-vector-search.ts`

1. Vergleiche die beiden Spalten für "PoisonGPT": Welche Suche findet das Szenario, in dem der Begriff vorkommt, und was liefert die andere?
2. Vergleiche die Spalten für die umgangssprachliche Frage: Wie viele Treffer beider Suchen stammen aus `02-llm02-offenlegung-sensibler-informationen.md`?
3. Ergänze in `QUESTIONS` eine Frage, in der ein Fachbegriff und eine Umschreibung vorkommen (z. B. "Wie schütze ich mich vor Slopsquatting, wenn mein Assistent Pakete vorschlägt?"). Welche Treffer stehen in beiden Spalten?
4. Lies die Ausgabe von Schritt 0: Wie viele Zahlen hat der Fragevektor, und welches Wort der Frage findest du in der Anfrage an Qdrant wieder?
5. Vergleiche die Suchen zu den beiden Fragen in `VERSION_QUESTIONS`: Was liefert der Filter auf 2024, was der auf 2025, und wie unterscheidet sich 2025 von der Suche ohne Filter?

### Teil 4 – `04-hybrid-rrf.ts`

1. Vergleiche die Spalten "RRF by hand" und "RRF Qdrant": Stimmen sie überein? Rechne einen Wert mit der Formel oben selbst nach.
2. Lies die Zeilen "Rank 0 …" unter jeder Tabelle: Welcher Spitzenplatz einer Liste fehlt in den Hybrid-Top-k, und woran liegt es (Rang in der anderen Liste)?
3. Setze `RRF_K` auf 1 und danach auf 1000. Wie ändert sich die Reihenfolge, und welche Liste setzt sich bei kleinem `RRF_K` durch?

### Teil 5 – `05-reranking.ts`

1. Vergleiche die beiden Spalten: Welche Chunks steigen auf, welche fallen ab? Lies in Burp die Antwort des Modells zu einem Chunk, der stark gefallen ist.
2. Setze `TEXT_LIMIT` auf 150 und danach auf 1500. Wie ändern sich die Zahlen, die Tokens und die Zeit?
3. Ändere `QUESTION` in "PoisonGPT". Hilft das Reranking bei einer Frage aus nur einem Wort?

### Teil 6 – `06-multiquery.ts`

1. Lies die Fassungen: Welche Fachbegriffe hat das Modell eingesetzt, die in der Originalfrage fehlen? Findest du sie in den Überschriften der Treffer wieder?
2. Vergleiche die Spalten: Wie viele Treffer stammen in jeder Spalte aus `02-llm02-offenlegung-sensibler-informationen.md`, und welche Treffer finden alle Listen?
3. Setze `VARIANT_COUNT` auf 1 und danach auf 5. Lohnen sich mehr Fassungen, gemessen an der Zeit?

### Teil 7 – `07-full-demo.ts`

1. Vergleiche die drei Spalten in Schritt 1 für beide Fragen: Bei welcher Frage hilft die Hybrid-Suche gegenüber der besseren der beiden Einzelsuchen?
2. Vergleiche die Kosten von Reranking und Multi-Query: Welches Verfahren verändert die Treffer zur umgangssprachlichen Frage stärker, gemessen an den Treffern aus `02-llm02-offenlegung-sensibler-informationen.md`?
3. Ersetze `COLLOQUIAL_QUESTION` durch eine eigene Frage aus dem Fragen-Set von Lektion 05 (`question-set.json`) und entscheide, welche Kombination du für sie einsetzen würdest.

Zurück zur [Übersicht](../../README.de.md).
