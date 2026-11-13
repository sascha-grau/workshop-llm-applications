# Lektion 04 – Chunking

[English](README.md) · Erklärungen, erwartete Ausgabe und Stolperfallen: [GUIDE.de.md](GUIDE.de.md)

**Lernziel:** Du verstehst, warum man Dokumente in Chunks teilt, baust daraus Indizes und siehst, wie die Art des Schneidens die Suche verändert.

## Teile

| Teil | Datei | Start | Zeigt | Braucht | Schreibt |
|---|---|---|---|---|---|
| 0 | [`00-prepare-chunks.ts`](00-prepare-chunks.ts) | `npm run l04:0` | Dokumente in Chunks unter 512 Tokens schneiden und das Limit prüfen | E5-Tokenizer (`npm run tokenizer:fetch`, einmalig), sonst LM Studio mit E5 | `content/owasp-genai-top-10/chunks/` mit `manifest.json` |
| 1 | [`01-prepared-chunks.ts`](01-prepared-chunks.ts) | `npm run l04:1` | Index aus fertigen Chunks bauen und durchsuchen | wie Teil 0, dazu die Chunks aus Teil 0 | Index `prepared` |
| 2 | [`02-heading-chunking.ts`](02-heading-chunking.ts) | `npm run l04:2` | An Überschriften schneiden | wie Teil 1 | Index `headings` |
| 3 | [`03-semantic-chunking.ts`](03-semantic-chunking.ts) | `npm run l04:3` | Schneiden, wo das Thema wechselt (Perzentil) | wie Teil 1 | Index `semantic` |
| 4 | [`04-question-generation-chunking.ts`](04-question-generation-chunking.ts) | `npm run l04:4` | Suche mit generierten Fragen (Multi-Vektor-Index) | wie Teil 1, dazu Chat-Modell | Index `questions` |
| 5 | [`05-parent-document.ts`](05-parent-document.ts) | `npm run l04:5` | Klein suchen, groß liefern (Parent-Document) | LM Studio mit E5, Index aus Teil 2 | nichts |

Ein Index ist die Datei `indexes/<Index>__<REMOTE_EMBEDDING_MODEL_NAME>.json`. Die Aufgaben stehen im Kopf jeder Datei. `chunking.ts` (gemeinsame Funktionen) und `formats.ts` (Format des Manifests) sind Hilfsmodule; Index lesen und schreiben liegt in [`../shared/index.ts`](../shared/index.ts).

## Reihenfolge und Abhängigkeiten

- **Teil 0 zuerst, einmal.** Die Chunks liegen nicht im Repository. Ein zweiter Lauf bricht ab, statt zu überschreiben; prüfen kannst du mit `npm run l04:0 -- --verify`.
- **Teil 1 bis 4** danach in beliebiger Reihenfolge. Alle brauchen LM Studio mit E5, Teil 4 zusätzlich das Chat-Modell.
- **Teil 4** schreibt Fragen für den ganzen Korpus und dauert beim ersten Lauf lange. Er ist fortsetzbar: Ein neuer Start ergänzt nur fehlende Chunks.
- **Teil 5** braucht den Index aus Teil 2.
- Alte Chunks oder Indizes werden mit einer Meldung abgelehnt; erzeuge sie dann neu.

Welche Lektion welchen Index liest, steht in [docs/architecture.de.md](../../docs/architecture.de.md#datenfluss).

## Schalter

| Schalter | Ort | Wirkt auf |
|---|---|---|
| `DEMO_QUESTION` | `chunking.ts` | Suchfrage aller Teile (nur Ausgabe) |
| `EXAMPLE_DOCUMENT` | `chunking.ts` | Tabellen in Teil 1 bis 3; Teil 4, wenn `FULL_CORPUS` aus ist |
| `ALL_DOCUMENTS` | `chunking.ts` oder `.env` | nur die Tabellen in Teil 1 bis 3 |
| `TOKEN_LIMIT_OVERRIDE` | `00-prepare-chunks.ts` | Chunks und damit alle Indizes |
| `SUBSET` | `02-heading-chunking.ts` | Index `headings` |
| `DISTANCE_PERCENTILE` | `03-semantic-chunking.ts` | Index `semantic` |
| `FULL_CORPUS`, `QUESTIONS_PER_CHUNK` | `04-question-generation-chunking.ts` | Index `questions` |
| `CHILD_SIZE` | `05-parent-document.ts` | nur die Ausgabe von Teil 5 |
| `SHOW_THINKING` | `.env` | muss für Teil 4 leer oder `false` sein |

Die Standardwerte stehen im Code (`// Standard:`). Zurücksetzen: [docs/trainer.de.md](../../docs/trainer.de.md), Abschnitt „Schalter: Standard und Zurücksetzen“ (für Trainer, enthält Lösungen).

## Weiterlesen

- [GUIDE.de.md](GUIDE.de.md): Ablauf je Teil, echte Ausgabe, Stolperfallen, Fehlermeldungen.
- [docs/architecture.de.md](../../docs/architecture.de.md): Datenfluss über alle Lektionen.
- [docs/trainer.de.md](../../docs/trainer.de.md) (für Trainer, enthält Lösungen): Vorbereitung, Zeiten.
- [docs/decisions.de.md](../../docs/decisions.de.md) und [docs/production.de.md](../../docs/production.de.md): Begründungen und Vereinfachungen.

Zurück zur [Übersicht](../../README.de.md).
