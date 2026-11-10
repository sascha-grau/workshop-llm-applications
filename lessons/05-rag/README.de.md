# Lektion 05 – RAG

[English](README.md)

**Lernziel:** Du beantwortest Fragen zu den OWASP-Dokumenten mit Quellenangaben: passende Chunks suchen, als Kontext in den Prompt legen und das Sprachmodell damit antworten lassen (Retrieval-Augmented Generation).

| Teil | Datei | npm-Skript | Lernziel | Braucht |
|---|---|---|---|---|
| 1 | `01-heading-rag.ts` | `npm run l05:1` | Der RAG-Ablauf Schritt für Schritt, mit Überschriften-Chunks | LM Studio (Chat und E5), Open WebUI, Index aus `l04:2` |
| 2 | `02-semantic-rag.ts` | `npm run l05:2` | Dasselbe mit semantischen Chunks | wie Teil 1, Index aus `l04:3` |
| 3 | `03-question-generation-rag.ts` | `npm run l05:3` | Suche über generierte Fragen, Antwort mit dem Original-Chunk | wie Teil 1, Index aus `l04:4` |

`rag.ts` ist das gemeinsame Hilfsmodul aller drei Teile.

**Reihenfolge:** Erzeuge vorher die Chunks (`npm run l04:0`) und den passenden Index der Lektion 04; die Chunk-Dateien selbst braucht diese Lektion nicht, nur den fertigen Index. Teil 1 ist die Referenz, Teil 2 und 3 zeigen nur den Unterschied. Alle drei starten die Fassade auf demselben Port, es läuft immer nur einer (Strg+C vor dem Wechsel). In Open WebUI erscheinen sie als `lesson-05-headings`, `lesson-05-semantic` und `lesson-05-questions`. Stelle dieselbe Frage in allen drei Teilen und vergleiche die Antworten.

**Nur ein Dokument bei Teil 3:** Der Fragen-Index aus `l04:4` enthält standardmäßig nur `01-llm01-prompt-injection.md` (`FULL_CORPUS = false` in `lessons/04-chunking/04-question-generation-chunking.ts`). `l05:3` kann deshalb nur Fragen zu Prompt Injection beantworten. Für alle Dokumente setze dort `FULL_CORPUS = true`, starte `npm run l04:4` (dauert viele Minuten) und danach `l05:3` neu.

**Quellen im Terminal:** Das Programm schreibt pro Frage eine Zeile `RAG sources` ins Terminal. Sie zeigt, welche Datei und welcher Überschriftenpfad (in Teil 2 nur die Datei, weil semantische Chunks keinen Überschriftenpfad haben) hinter den Nummern [1] bis [N] stehen, die das Modell zitiert.

**Zugriffsgruppen:** Die Indexeinträge tragen eine Zugriffsgruppe (`public` oder `internal`). `rag.ts` lädt nur `public`-Einträge: Der Anhang (`11-appendix-…`) gilt als `internal` und steht stellvertretend für ein Dokument, das nicht jeder lesen darf. Er wird vor der Suche herausgefiltert, kann also nie im Kontext landen, auch wenn er inhaltlich passt. Frage nach dem Anhang (z. B. nach der Bedrohungsmodellierung), und der Anhang erscheint nie unter den Quellen.

**Sicherheitshinweis:** Die Trennmarken `<retrieved_context>` und die Leitplanke im System-Prompt verringern das Risiko von Prompt Injection, schützen aber nicht vollständig; System-Prompts vom Client (Open WebUI) sind nicht vertrauenswürdig, und der Zugriffsschutz (Filter für interne Dokumente) steckt im Code, nicht im Prompt.

**Hilfsanfragen von Open WebUI:** Open WebUI schickt neben deiner Frage Anfragen für Titel und Tags (sie beginnen mit `### Task:`). Diese überspringen Einbetten und Suche und gehen direkt an das Chat-Modell. Sie bekommen einen reduzierten System-Prompt (Leitplanke gegen Anweisungen im Material und Sprachregel, ohne die Regel "nur aus den Quellen", die das JSON für Titel und Tags brechen würde). Wer seine Frage mit `### Task:` beginnt, umgeht also nichts Wichtiges.

Zurück zur [Übersicht](../../README.de.md).
