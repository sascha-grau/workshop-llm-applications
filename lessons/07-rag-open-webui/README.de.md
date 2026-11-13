# Lektion 07 – RAG mit Open WebUI

[English](README.md) · Erklärungen, echte Ausgabe und Stolperfallen: [GUIDE.de.md](GUIDE.de.md)

**Lernziel:** Du beantwortest Fragen zu den OWASP-Dokumenten mit Quellenangaben: passende Chunks suchen, als Kontext in den Prompt legen und das Sprachmodell daraus antworten lassen (Retrieval-Augmented Generation, RAG). Jeder Teil tauscht ein Stück der Suche aus, und du vergleichst die Antworten in Open WebUI.

> **Nur ein Teil zur Zeit.** Alle Teile starten die Fassade auf demselben Port (`FACADE_PORT`). Beende den laufenden Teil mit Strg+C, bevor du einen anderen startest, und lade danach in Open WebUI die Modellliste neu.

## Teile

| Teil | Datei | Start | Zeigt | Braucht |
|---|---|---|---|---|
| 1 | [`01-heading-rag.ts`](01-heading-rag.ts) | `npm run l07:1` | Der ganze RAG-Ablauf, ausgeschrieben (`lesson-07-headings`) | Index aus `l04:2` |
| 2 | [`02-semantic-rag.ts`](02-semantic-rag.ts) | `npm run l07:2` | Dasselbe mit semantischen Chunks (`lesson-07-semantic`) | Index aus `l04:3` |
| 3 | [`03-question-generation-rag.ts`](03-question-generation-rag.ts) | `npm run l07:3` | Suche über generierte Fragen, Antwort mit dem Original-Chunk (`lesson-07-questions`) | Index aus `l04:4` |
| 4 | [`04-parent-document-rag.ts`](04-parent-document-rag.ts) | `npm run l07:4` | Klein suchen, ganzen Abschnitt liefern (`lesson-07-parent-document`) | Index aus `l04:2`, E5 schon beim Start |
| 5 | [`05-mmr-rag.ts`](05-mmr-rag.ts) | `npm run l07:5` | MMR: Quellen, die sich unterscheiden (`lesson-07-mmr`) | Index aus `l04:2` |
| 6 | [`06-metadata-filter-rag.ts`](06-metadata-filter-rag.ts) | `npm run l07:6` | Filter nach Dokument vor der Suche (`lesson-07-metadata-filter`) | Index aus `l04:2` |
| 7 | [`07-score-threshold-rag.ts`](07-score-threshold-rag.ts) | `npm run l07:7` | Schwellenwert, feste Antwort ohne passende Quelle (`lesson-07-score-threshold`) | Index aus `l04:2` |
| 8 | [`08-hybrid-rag.ts`](08-hybrid-rag.ts) | `npm run l07:8` | Hybrid-Suche (BM25 + Vektor, RRF) in Qdrant (`lesson-07-hybrid`) | Qdrant, Collection aus `l06:1` |
| 9 | [`09-rerank-rag.ts`](09-rerank-rag.ts) | `npm run l07:9` | Reranking der Hybrid-Treffer durch das Chat-Modell (`lesson-07-rerank`) | wie Teil 8 |
| 10 | [`10-multiquery-rag.ts`](10-multiquery-rag.ts) | `npm run l07:10` | Multi-Query: Fassungen der Frage, fusioniert mit RRF (`lesson-07-multiquery`) | wie Teil 8 |
| **11** | [`99-full-demo.ts`](99-full-demo.ts) (Datei 99 = Teil 11) | `npm run l07:11` | Voll-Demo: alle Pipelines in einer Fassade, Wechsel im Dropdown (alle zehn Modelle oben) | je Modell wie sein Teil |

Alle Teile brauchen LM Studio mit Chat- und E5-Modell und Open WebUI, verbunden mit der Fassade (Einrichtung in der [Wurzel-README](../../README.de.md)). In Klammern steht der Modellname in Open WebUI. Die Aufgaben stehen im Kopf jeder Datei.

**Hilfsmodule, kein eigener Teil:** `rag.ts` (gemeinsamer Ablauf und Fassade), `retrieval.ts` (MMR, Filter, Schwellenwert im Speicher), `parent-document.ts` (Kinder und Parents), `qdrant-retrieval.ts` (Hybrid, Reranking, Multi-Query in Qdrant), `demo.ts` (die Modelle für Teil 11).

## Reihenfolge und Abhängigkeiten

- **Vorher:** Chunks und Index aus Lektion 04 (`npm run l04:0`, dann `npm run l04:2`; für Teil 2 `npm run l04:3`, für Teil 3 `npm run l04:4`). Lektion 07 liest nur die fertigen Indizes.
- **Teil 1 zuerst.** Er schreibt den Ablauf aus; Teil 2 bis 10 zeigen nur, was anders ist. Danach in beliebiger Reihenfolge.
- **Teil 3** braucht den Fragen-Index über den ganzen Korpus (`FULL_CORPUS` in `lessons/04-chunking/04-question-generation-chunking.ts`). Mit nur einem Dokument findet er zu anderen Themen nichts.
- **Teil 8 bis 11** brauchen Qdrant mit der Collection aus Lektion 06, Teil 1 (`npm run l06:1`, liest den Index aus `l04:2`). Startbefehl in der [README von Lektion 06](../06-hybrid-rerank/README.de.md).
- **Teil 9, 10 und 11** lesen JSON vom Chat-Modell: `SHOW_THINKING` in `.env` leer lassen oder auf `false` setzen.
- **Teil 11** überspringt Modelle, deren Voraussetzungen fehlen, mit einer `WARN`-Zeile. `demo.ts` hat eigene Kopien der Werte; Änderungen in Teil 1 bis 10 wirken dort nicht.
- **Lektion 08, Teil 6** testet diese Fassade (`npm run l07:11` oder `npm run l07:8`) in einem zweiten Terminal.

## Sicherheit

- **Zugriffsgruppen:** Chunks aus internen Dokumenten (hier der Anhang `11-appendix-…`) werden vor jeder Suche entfernt, in Teil 1 bis 7 beim Laden des Index, in Teil 8 bis 11 durch einen Filter an jeder Qdrant-Suche. Sie können nie im Kontext landen.
- **Indirekte Prompt Injection:** Chunks sind fremde Daten. Der Block `<retrieved_context>` und die Leitplanke im System-Prompt mindern das Risiko, schützen aber nicht vollständig. Der Zugriffsschutz steckt im Code, nicht im Prompt.

## Weiterlesen

- [GUIDE.de.md](GUIDE.de.md): Ablauf je Teil, echte Ausgabe, Stolperfallen, Fehlermeldungen.
- [docs/architecture.de.md](../../docs/architecture.de.md): Datenfluss über alle Lektionen.
- [docs/decisions.de.md](../../docs/decisions.de.md) und [docs/production.de.md](../../docs/production.de.md): Begründungen und Vereinfachungen.
- [docs/trainer.de.md](../../docs/trainer.de.md): für Trainer, enthält Lösungen.

Zurück zur [Übersicht](../../README.de.md).
