# Lektion 05 – Retrieval-Strategien

[English](README.md)

**Lernziel:** Du verstehst, nach welchen Regeln eine Suche die Chunks auswählt, die später im Prompt landen: nach Rang (Top-k), nach Vielfalt (MMR), nach Metadaten (Filter) und nach Mindest-Ähnlichkeit (Schwellenwert). Du siehst, was jede Regel kann und was nicht, warum Zugriffsrechte vor der Suche gefiltert werden und wie du einen Schwellenwert an einem Fragen-Set ausmisst, statt ihn zu raten.

| Teil | Datei | npm-Skript | Lernziel | Braucht |
| --- | --- | --- | --- | --- |
| 1 | `01-top-k.ts` | `npm run l05:1` | Top-k: die besten k Chunks nach Ähnlichkeit | LM Studio (E5), Index aus `l04:2` |
| 2 | `02-mmr.ts` | `npm run l05:2` | MMR: Relevanz gegen Vielfalt abwägen | wie Teil 1 |
| 3 | `03-metadata-filter.ts` | `npm run l05:3` | Metadaten-Filter: vor oder nach der Suche, Zugriffsrechte | wie Teil 1 |
| 4 | `04-score-threshold.ts` | `npm run l05:4` | Schwellenwert: nach Mindest-Ähnlichkeit abschneiden | wie Teil 1 |
| 5 | `05-full-demo.ts` | `npm run l05:5` | Alle Strategien nebeneinander (auch Parent-Document aus Lektion 04, Teil 5) und der Schwellenwert, kalibriert an `question-set.json` | wie Teil 1 |

`retrieval.ts` ist das gemeinsame Hilfsmodul der Teile (Index laden und die MMR-Auswahl, die Teil 5 nutzt; Teil 2 behält eine identische Kopie in seiner eigenen Datei, damit du sie dort lesen kannst), kein eigener Teil. Ranking und Indexdateien liegen in [`shared/index.ts`](../shared/index.ts).

**Reihenfolge:** Erzeuge vorher die Chunks (`npm run l04:0`) und den Überschriften-Index (`npm run l04:2`); alle fünf Teile durchsuchen diesen einen Index. Geh die Teile von 1 bis 5 durch: Teil 2 bis 5 setzen Top-k aus Teil 1 voraus. Jeder Teil läuft einmal durch, schreibt seine Tabellen ins Terminal und endet; es gibt keinen Chat. Du brauchst nur das E5-Modell in LM Studio, kein Chat-Modell und kein Open WebUI. Burp ist optional.

**Wozu diese Lektion:** Lektion 04 hat die Indizes gebaut und am Ende jedes Teils die besten drei Chunks gesucht. Lektion 07 (RAG) gibt die gefundenen Chunks dem Sprachmodell als Kontext. Dazwischen steht die Frage, welche Chunks die Suche liefern soll. Hier siehst du das ohne Sprachmodell: Jede Tabelle zeigt, was in den Prompt käme.

**Messwerte:** Die Beispielwerte in den Dateien (`LAMBDA_VALUES` in Teil 2, `THRESHOLDS` in Teil 4) sind mit E5 an diesem Index gemessen. Mit einem anderen Embedding-Modell oder anderen Dokumenten verschieben sie sich.

**Sicherheitshinweis:** Der Zugriffsfilter in Teil 3 ist die Stelle, an der Zugriffsrechte durchgesetzt werden: im Code der Suche, vor der Suche, nicht im Prompt. Welche Zugriffsgruppen ein Nutzer lesen darf, bestimmt der Server aus der Anmeldung, nie die Anfrage. Die Tabelle `no filter` und die Zeile "x of y chunks searchable" zeigen absichtlich interne Dateinamen und Zahlen; das sind Lehrausgaben, die ein Nutzer nicht sehen dürfte. Ein Schwellenwert (Teil 4) und MMR (Teil 2) sind Qualitätsregeln und schützen vor nichts.

## Grundbegriffe

- **Retrieval:** zu einer Frage die passenden Chunks aus dem Index holen. Eine Retrieval-Strategie ist die Regel, welche Chunks dabei übrig bleiben.
- **Top-k:** alle Chunks nach Kosinus-Ähnlichkeit zur Frage sortieren und die besten k behalten. Liefert immer genau k Chunks, auch wenn keiner passt (Teil 1).
- **Rauschen:** Chunks im Prompt, die nichts zur Antwort beitragen. Sie machen den Prompt länger und die Antwort langsamer und können das Modell ablenken.
- **MMR (Maximal Marginal Relevance):** wählt die Treffer einzeln nacheinander und zieht jedem Kandidaten Punkte ab, wenn er einem schon gewählten Chunk ähnelt. `LAMBDA` wägt ab: 1 ist reines Top-k, 0 achtet nur auf Vielfalt. `FETCH_K` ist die Zahl der Kandidaten, aus denen MMR auswählt (Teil 2).
- **Redundanz:** die höchste Ähnlichkeit eines Kandidaten zu einem schon gewählten Chunk; hoch heißt "das wurde schon gesagt" (Teil 2).
- **Metadaten-Filter:** eine harte Regel auf den Metadaten eines Chunks (Dokument, Überschriftenpfad, Zugriffsgruppe). Was der Filter ausschließt, kann die Suche nie liefern (Teil 3).
- **Pre-Filter / Post-Filter:** vor der Suche filtern (dann sucht Top-k nur im erlaubten Rest) oder danach (dann fehlen Treffer, und der gesperrte Text war schon Teil des Ergebnisses). Für Zugriffsrechte immer vorher (Teil 3).
- **Zugriffsgruppe:** `public` oder `internal`, in den Metadaten jedes Chunks seit Lektion 04. Der Anhang gilt als `internal` und steht stellvertretend für ein Dokument, das nicht jeder lesen darf.
- **Schwellenwert (Score Threshold):** nur Chunks mit einer Mindest-Ähnlichkeit bleiben. Die Zahl der Treffer ist offen, auch null ist möglich. Der passende Wert hängt vom Embedding-Modell ab und muss ausgemessen werden (Teil 4).
- **Kalibrierung / Fragen-Set:** den Schwellenwert ausmessen, statt ihn zu raten. `question-set.json` enthält Fragen, die der Korpus beantwortet (je mit ihren erwarteten Dokumenten), und eine Frage ohne Antwort (`withoutSource`). Ein guter Schwellenwert lässt alle beantwortbaren Fragen durch und hält die ohne Antwort auf; er gilt nur für dieses Modell und diesen Korpus (Teil 5).

## Aufgaben

Die Aufgaben stehen auch am Anfang jeder Datei; maßgeblich sind die Dateiköpfe.

### Teil 1 – `01-top-k.ts`

1. Vergleiche die Tabellen für die Werte in `TOP_K_VALUES`. Aus wie vielen Dokumenten stammen die acht Treffer, und sagen einige von ihnen fast dasselbe? Zeigt die Spalte "gap to previous" einen deutlichen Sprung, an dem die passenden Treffer enden? (Erwartung: nein, die Werte liegen dicht beieinander. Top-k verrät also nicht, wie viele Treffer gut sind.)
2. Ändere `QUESTION` in eine Frage, die die Dokumente nicht beantworten können (z. B. "Wie wird das Wetter morgen?"). Wie viele Treffer liefert Top-k, und wie hoch sind die Ähnlichkeiten im Vergleich zur ersten Frage?
3. Stelle eine Frage, deren Antwort in mehreren Dokumenten steht (z. B. "Welche Risiken entstehen durch zu viele Berechtigungen?"). Welches k brauchst du, damit alle passenden Dokumente unter den Treffern sind, und wie lang wird der Kontext dabei?

### Teil 2 – `02-mmr.ts`

1. Vergleiche die Tabellen für die Werte in `LAMBDA_VALUES`. Bei welchem Wert ändert sich nur die Reihenfolge, ab welchem weicht die Auswahl von Top-k ab, und welche Top-k-Plätze fallen dafür weg? Passen die neuen Chunks besser oder schlechter zur Frage?
2. Setze `FETCH_K` auf denselben Wert wie `TOP_K`. Was ändert `LAMBDA` dann noch, und warum? Setze `FETCH_K` danach auf 50: Passen die Treffer bei kleinem `LAMBDA` noch zur Frage?
3. Stelle eine Frage, deren Antwort in mehreren Dokumenten steht (z. B. "Welche Risiken entstehen durch zu viele Berechtigungen?"). Mit welchem `LAMBDA` deckt die Auswahl mehr Dokumente ab als Top-k mit demselben `TOP_K`?

### Teil 3 – `03-metadata-filter.ts`

1. Vergleiche die Tabellen für die Einträge in `FILTERS`. Welche Treffer liefert die Suche ohne Filter, die ein Nutzer ohne Zugriff auf interne Dokumente nicht sehen dürfte? Wie viele Treffer bleiben, wenn derselbe Filter erst nach der Suche läuft?
2. Ändere `QUESTION` in "Wie begrenze ich Prompt Injection?" und vergleiche die Tabellen der Filter `access groups public` und `mitigation sections`. Welche Abschnitte fallen weg? (Erwartung: Es bleiben nur Abschnitte unter "Präventions- und Mitigationsstrategien"; Beschreibungen und Beispiele fallen weg, auch wenn sie der Frage ähnlicher sind.)
3. Ergänze in `FILTERS` einen eigenen Filter, der nur lesbare Chunks aus einem Dokument zulässt, z. B. diese Zeile: `'only LLM06': (metadata) => mayRead(metadata) && metadata.source === '06-llm06-uebermaessige-handlungsfreiheit.md',`. Stelle dann eine Frage zu einem anderen Dokument (z. B. die aus Aufgabe 2). Was liefert die Suche, und woran erkennst du, dass die Treffer nicht passen? Lass `mayRead` nie weg: Ohne die Zugriffsprüfung findet dein Filter auch interne Chunks.
4. Setze `QUESTION` zurück auf "Welche Unternehmen sind Sponsoren des Projekts?" und `ALLOWED_ACCESS_GROUPS` auf `['public', 'internal']` (eine Mitarbeiterin statt eines Gasts). Welche Treffer kommen beim Zugriffsfilter hinzu?

### Teil 4 – `04-score-threshold.ts`

1. Vergleiche die beiden Fragen in `QUESTIONS`. Welcher Wert aus `THRESHOLDS` lässt bei der ersten Frage Treffer durch und bei der zweiten keinen? Wie groß ist der Abstand zwischen dem schlechtesten Treffer der ersten und dem besten der zweiten Frage?
2. Ergänze in `QUESTIONS` eine eigene Frage, die die Dokumente beantworten (z. B. "Welche Risiken entstehen durch zu viele Berechtigungen?"). Lässt der Schwellenwert aus Aufgabe 1 auch hier die passenden Treffer durch?
3. Ergänze eine Frage, die nach Sicherheit klingt, aber nicht in den Dokumenten steht (z. B. "Wie sichere ich mein WLAN zu Hause ab?"). Findest du einen Schwellenwert, der sie von allen beantwortbaren Fragen trennt?

### Teil 5 – `05-full-demo.ts`

1. Vergleiche die fünf Tabellen: Welche Strategie liefert Chunks aus anderen Abschnitten als Top-k, und welche liefert den meisten Kontext?
2. Lies die Kalibrierung: Welche Fragen erreichen `THRESHOLD` nicht, obwohl die Antwort im Korpus steht? Bei welchen liegt die beste Ähnlichkeit in einem anderen Dokument höher als in den erwarteten (`best elsewhere` größer als `best expected`)?
3. Ergänze in `question-set.json` eine eigene Frage mit ihren erwarteten Dokumenten und passe `THRESHOLD` so an, dass alle Fragen mit Antwort durchkommen und `withoutSource` nicht.

Zurück zur [Übersicht](../../README.de.md).
