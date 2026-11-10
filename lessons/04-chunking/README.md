# Lektion 04 – Chunking

**Lernziel:** Du verstehst, warum man Dokumente in Chunks teilt, baust daraus Indizes und siehst, wie die Art des Schneidens die Suche verändert.

| Teil | Datei | npm-Skript | Lernziel | Braucht |
|---|---|---|---|---|
| 0 | `00-prepare-chunks.ts` | `npm run l04:0` | Die OWASP-Dokumente einmalig in Chunks unter 512 Tokens schneiden | LM Studio (E5), Burp wird nicht genutzt |
| 1 | `01-prepared-chunks.ts` | `npm run l04:1` | Index aus den vorbereiteten Chunks bauen und durchsuchen | Teil 0, LM Studio (E5) |
| 2 | `02-heading-chunking.ts` | `npm run l04:2` | An Überschriften schneiden | Teil 0, LM Studio (E5) |
| 3 | `03-semantic-chunking.ts` | `npm run l04:3` | Schneiden, wo das Thema wechselt (Perzentil) | Teil 0, LM Studio (E5) |
| 4 | `04-question-generation-chunking.ts` | `npm run l04:4` | Suche mit generierten Fragen (Multi-Vektor-Index) | Teil 0, LM Studio (Chat und E5) |

`chunking.ts` und `formats.ts` sind Hilfsmodule (gemeinsame Funktionen, Dateiformate: Manifest-Version und Manifest-Schema), keine eigenen Teile. Index lesen, schreiben und Ranking liegen in [`shared/index.ts`](../shared/index.ts), weil auch Lektion 05 sie nutzt; die Teile importieren sie von dort direkt.

**Reihenfolge:** Starte zuerst Teil 0, er erzeugt die Chunk-Dateien (sie liegen nicht im Repository). Danach kannst du Teil 1 bis 4 in beliebiger Reihenfolge laufen lassen; jeder schreibt einen eigenen Index nach `indexes/`. Lektion 05 liest diese Indizes: `l04:2` für Teil 1, `l04:3` für Teil 2, `l04:4` für Teil 3. Alte Chunks oder Indizes werden mit einer Meldung abgelehnt; erzeuge sie dann neu.

**Teil 0 prüfen und Hilfe:** `npm run l04:0 -- --verify` prüft die vorhandenen Chunks gegen die Quelldokumente und das Token-Limit, ohne neue zu erzeugen (je nach Zählmethode kostet das noch einmal Anfragen an den Embedding-Endpunkt). `npm run l04:0 -- --help` zeigt eine Kurzhilfe. Das `--` trennt die npm-Optionen von denen des Programms. Existiert `chunks/` schon, bricht ein normaler Lauf ab, statt etwas zu überschreiben: Nutze `--verify` oder verschiebe den Ordner.

**Teil 4 und der Korpus:** Standardmäßig (`FULL_CORPUS = false` in `04-question-generation-chunking.ts`) indiziert Teil 4 nur `01-llm01-prompt-injection.md`. Für den ganzen Korpus setze `FULL_CORPUS = true` und starte neu; das dauert bei einem ersten Lauf viele Minuten, weil das Chat-Modell für jeden Chunk Fragen schreibt. Fertige Chunks bleiben im Index, ein Abbruch kostet höchstens den Chunk in Arbeit. Lektion 05, Teil 3 findet dann auch Fragen zu den anderen Dokumenten.

Zurück zur [Übersicht](../../README.md).
