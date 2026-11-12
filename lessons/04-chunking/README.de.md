# Lektion 04 – Chunking

[English](README.md)

**Lernziel:** Du verstehst, warum man Dokumente in Chunks teilt, baust daraus Indizes und siehst, wie die Art des Schneidens die Suche verändert.

| Teil | Datei | npm-Skript | Lernziel | Braucht |
| --- | --- | --- | --- | --- |
| 0 | `00-prepare-chunks.ts` | `npm run l04:0` | Die OWASP-Dokumente einmalig in Chunks unter 512 Tokens schneiden | LM Studio (E5), Burp wird nicht genutzt |
| 1 | `01-prepared-chunks.ts` | `npm run l04:1` | Index aus den vorbereiteten Chunks bauen und durchsuchen | Teil 0, LM Studio (E5) |
| 2 | `02-heading-chunking.ts` | `npm run l04:2` | An Überschriften schneiden | Teil 0, LM Studio (E5) |
| 3 | `03-semantic-chunking.ts` | `npm run l04:3` | Schneiden, wo das Thema wechselt (Perzentil) | Teil 0, LM Studio (E5) |
| 4 | `04-question-generation-chunking.ts` | `npm run l04:4` | Suche mit generierten Fragen (Multi-Vektor-Index) | Teil 0, LM Studio (Chat und E5) |
| 5 | `05-parent-document.ts` | `npm run l04:5` | Klein suchen, groß liefern (Parent-Document) | Index aus `l04:2`, LM Studio (E5) |

`chunking.ts` und `formats.ts` sind Hilfsmodule (gemeinsame Funktionen, Dateiformate: Manifest-Version und Manifest-Schema), keine eigenen Teile. Index lesen, schreiben und Ranking liegen in [`shared/index.ts`](../shared/index.ts), weil auch Lektion 05 bis 08 sie nutzen; die Teile importieren sie von dort direkt.

**Reihenfolge:** Starte zuerst Teil 0, er erzeugt die Chunk-Dateien (sie liegen nicht im Repository). Danach kannst du Teil 1 bis 4 in beliebiger Reihenfolge laufen lassen; jeder schreibt einen eigenen Index nach `indexes/`. Teil 5 schreibt keinen Index, er liest den aus `l04:2`. Lektion 05 bis 08 lesen diese Indizes: Lektion 05 in allen Teilen den aus `l04:2`, Lektion 06 lädt alle in Qdrant (`npm run l06:1`), und Lektion 07 nutzt den aus `l04:2` für Teil 1, `l04:3` für Teil 2, `l04:4` für Teil 3 (Teil 4 bis 7 nehmen wieder `l04:2`); Lektion 08 liest den aus `l04:2`. Alte Chunks oder Indizes werden mit einer Meldung abgelehnt; erzeuge sie dann neu.

**Teil 0 ist lang:** `00-prepare-chunks.ts` hat fast 500 Zeilen. Die Trainerin oder der Trainer führt es aus; du musst nur die mit `// KERN:` markierten Zeilen lesen (die Schnittschleife, die Budget-Prüfung und die Erkennung zu langer Eingaben). Der Rest ist Absicherung.

**Teil 0 prüfen und Hilfe:** `npm run l04:0 -- --verify` prüft die vorhandenen Chunks gegen die Quelldokumente und das Token-Limit, ohne neue zu erzeugen (je nach Zählmethode kostet das noch einmal Anfragen an den Embedding-Endpunkt). `npm run l04:0 -- --help` zeigt eine Kurzhilfe. Das `--` trennt die npm-Optionen von denen des Programms. Existiert `chunks/` schon, bricht ein normaler Lauf ab, statt etwas zu überschreiben: Nutze `--verify` oder verschiebe den Ordner.

**Teil 4 und der Korpus:** Standardmäßig ist `FULL_CORPUS = true` in `04-question-generation-chunking.ts`, Teil 4 schreibt also Fragen für den ganzen Korpus; das dauert bei einem ersten Lauf viele Minuten, weil das Chat-Modell für jeden Chunk Fragen schreibt. Lektion 07, Teil 3 findet dann Fragen zu allen Dokumenten. Für einen schnellen Lauf setze `FULL_CORPUS = false`: Teil 4 behandelt dann nur `EXAMPLE_DOCUMENT` (`01-llm01-prompt-injection.md`), und Lektion 07, Teil 3 findet nur Fragen zu Dokumenten, die schon im Index stehen. Fertige Chunks bleiben im Index, ein Abbruch kostet höchstens den Chunk in Arbeit.

## Grundbegriffe

- **Chunk:** ein Stück eines Dokuments, das einen eigenen Embedding-Vektor bekommt; ein ganzes Dokument ist für einen Vektor zu lang und thematisch zu gemischt.
- **Überschriften-Chunking:** an den Markdown-Überschriften schneiden (`#{1,3}` in `splitByHeadings`), sodass jeder Abschnitt ein Chunk wird, der mit seinem Überschriftenpfad beginnt (Teil 2).
- **Semantisches Chunking:** Das Embedding-Modell findet die Themensprünge selbst: Benachbarte Satzfenster werden eingebettet, ihr Abstand ist 1 minus Kosinus-Ähnlichkeit, und geschnitten wird bei Abständen über der Perzentil-Schwelle (`DISTANCE_PERCENTILE = 95`; das 95. Perzentil ist der Wert, unter dem 95 % der Abstände liegen). Kurze Dokumente (weniger als 4 Abstände) werden nur an Überschriften geschnitten (Teil 3).
- **Fragengenerierung / Multi-Vektor-Index:** Das Chat-Modell schreibt pro Chunk `QUESTIONS_PER_CHUNK` (3) Fragen; jede Frage wird zu einem eigenen Suchvektor, der auf den ursprünglichen Chunk-Text zeigt, sodass die Suche Frage mit Frage vergleicht (Teil 4).
- **Indexdatei:** die JSON-Datei unter `indexes/`, die Chunk-Text, Metadaten und Vektor speichert; Lektion 05 bis 08 lesen sie.
- **Parent-Document / Small-to-Big:** Die Suche vergleicht die Frage mit kleinen Stücken (Kinder, etwa `CHILD_SIZE` = 300 Zeichen, jedes beginnt mit seinem Überschriftenpfad) und liefert den ganzen Abschnitt, aus dem sie stammen (den Parent). Das Kind entscheidet, ob ein Abschnitt gefunden wird, der Parent, was im Prompt steht (Teil 5).
- **Top-k:** die `k` Chunks, die der Frage am ähnlichsten sind; die Lektion nutzt `DEFAULT_TOP_K` = 3 für die ausgegebenen Treffer. Lektion 05 untersucht die Regel.
- **Keine Überlappung:** Die Chunks überlappen sich nicht. Teil 0 schneidet an Absatz-, Listenpunkt- und Satzgrenzen, jeder Chunk bekommt seine Überschriften-Kette vorangestellt, und die Manifest-Prüfung verlangt, dass die Stücke ohne Lücke und ohne Überlappung aufeinander folgen (`Gap or overlap in source coverage`). Ein Chunk behält also seinen Kontext, ohne Text seines Nachbarn zu wiederholen.
- **Token-Limit:** Das E5-Modell liest höchstens 512 Tokens pro Eingabe (ein Token ist ein Wortstück); Teil 0 prüft jeden Chunk samt Präfix `passage: ` gegen dieses Limit.

## Aufgaben

Die Aufgaben stehen auch am Anfang jeder Datei; maßgeblich sind die Dateiköpfe.

### Teil 0 – `00-prepare-chunks.ts`

1. Prüfe die erzeugten Chunks mit `npm run l04:0 -- --verify`. Das Programm vergleicht Quelle, Prüfsummen und Token-Zahlen und gibt `minimum_tokens` und `maximum_tokens` aus (kleinste und größte Token-Zahl).
2. Setze oben `TOKEN_LIMIT_OVERRIDE` auf 256, lösche `content/owasp-genai-top-10/chunks/` und starte neu: Es entstehen deutlich mehr Chunks. Danach setze `TOKEN_LIMIT_OVERRIDE` zurück auf `undefined`, lösche `chunks/` und starte `npm run l04:0` erneut. Sonst passen Teil 1 bis 5 nicht zu den Chunks.
3. Öffne `content/owasp-genai-top-10/chunks/manifest.json` und lies `format_version` (3), `counting_method` und `counting`: Wie hat dein Server gezählt, und was heißt das für die Verlässlichkeit der Zahlen?

### Teil 1 – `01-prepared-chunks.ts`

1. Ändere `DEMO_QUESTION` in chunking.ts (z. B. "Was ist ein Jailbreak?"). Stehen die Treffer noch im richtigen Dokument?
2. Ändere `EXAMPLE_DOCUMENT` in chunking.ts auf ein anderes Dokument aus dem Manifest. Wie viele Chunks hat es, und wie viele Zeichen je Token? Mit `ALL_DOCUMENTS = true` zeigen Teil 1 bis 3 die Chunk-Tabellen aller Dokumente (nur die Ausgabe, der Index bleibt gleich). Setze beide Werte danach zurück (`'01-llm01-prompt-injection.md'` und `false`): Teil 2 und 3 zeigen ihre Beispielausgabe mit ihnen, und Teil 4 nutzt `EXAMPLE_DOCUMENT` bei `FULL_CORPUS = false`.
3. Schau dir die Spalte "characters per token" an: Welche Chunks liegen deutlich unter 4? Was steht in ihnen (Tipp: Linklisten)? (Nur aussagekräftig, wenn `counting_method` im Manifest nicht `character-estimate` ist – dann liegt jeder Wert bei etwa 1.)

### Teil 2 – `02-heading-chunking.ts`

1. Ändere die Überschriftentiefe: Setze in `splitByHeadings` (chunking.ts) beide Vorkommen von `#{1,3}` auf `#{1,2}`. Wie ändert sich die Zahl der Chunks, und was passiert mit den Treffern?
2. Trage in `SUBSET` einen Dokumentnamen ein (z. B. den von EXAMPLE_DOCUMENT), dann läuft das Einbetten schneller. Setze `SUBSET` danach wieder auf `[]` und starte `npm run l04:2` neu, sonst kennen Lektion 05 bis 08 nur dieses Dokument.
3. Ändere `DEMO_QUESTION` in chunking.ts und vergleiche die besten drei Treffer (`DEFAULT_TOP_K`) mit Teil 1.

### Teil 3 – `03-semantic-chunking.ts`

1. Ändere `DISTANCE_PERCENTILE` von 95 auf 80. Wie viele semantische Schnitte und Chunks zeigt die Ausgabe jetzt? (Bei einem kurzen Dokument ändert sich evtl. nichts: siehe oben.)
2. Setze den Wert auf 100. Wie viele semantische Schnitte bleiben, und warum? (Tipp: Geschnitten wird nur bei Abstand > Schwelle.)
3. Vergleiche die Zahl der Embedding-Aufrufe mit Teil 2 und die Chunk-Anfänge in der Tabelle.

### Teil 4 – `04-question-generation-chunking.ts`

1. Ändere `QUESTIONS_PER_CHUNK` von 3 auf 5, lösche die Indexdatei `indexes/questions__*.json` und starte neu. Werden die Treffer besser, und wie viel länger dauert der Lauf?
2. Lies die ausgegebenen Fragen: Welche sind gut, welche zu allgemein? Passe den Prompt an, lösche den Index und vergleiche.
3. Ändere `DEMO_QUESTION` in chunking.ts auf eine Frage, die ein Chunk beantwortet, ohne ihre Wörter zu benutzen. Findet die Suche nach Fragen ihn besser als die Suche nach Chunk-Text (Teil 2)?

### Teil 5 – `05-parent-document.ts`

1. Vergleiche die beiden Tabellen: Wie viele der besten Kinder gehören zum selben Parent, und wie viel länger ist der gelieferte Kontext als die Kinder allein?
2. Setze `CHILD_SIZE` auf 150 und danach auf 600. Wie ändern sich die Zahl der Kinder, die Ähnlichkeiten und die gelieferten Parents?
3. Vergleiche die gelieferten Parents mit den Treffern aus Teil 2 (`npm run l04:2`). Findet die Suche über Kinder andere Abschnitte für `DEMO_QUESTION`?

Zurück zur [Übersicht](../../README.de.md).
