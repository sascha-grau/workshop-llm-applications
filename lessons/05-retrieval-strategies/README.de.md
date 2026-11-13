# Lektion 05 – Retrieval-Strategien

[English](README.md) · Erklärungen, erwartete Ausgabe und Stolperfallen: [GUIDE.de.md](GUIDE.de.md)

**Lernziel:** Du verstehst, nach welchen Regeln eine Suche die Chunks auswählt, die später im Prompt landen: nach Rang (Top-k), nach Vielfalt (MMR), nach Metadaten (Filter) und nach Mindest-Ähnlichkeit (Schwellenwert). Du siehst, warum Zugriffsrechte vor der Suche gefiltert werden, und misst einen Schwellenwert an einem Fragen-Set aus, statt ihn zu raten.

## Teile

| Teil | Datei | Start | Zeigt | Braucht |
|---|---|---|---|---|
| 1 | [`01-top-k.ts`](01-top-k.ts) | `npm run l05:1` | Top-k: die besten k Chunks nach Ähnlichkeit | LM Studio mit E5, Index aus `l04:2` |
| 2 | [`02-mmr.ts`](02-mmr.ts) | `npm run l05:2` | MMR: Relevanz gegen Vielfalt abwägen | wie Teil 1 |
| 3 | [`03-metadata-filter.ts`](03-metadata-filter.ts) | `npm run l05:3` | Metadaten-Filter vor und nach der Suche, Zugriffsrechte | wie Teil 1 |
| 4 | [`04-score-threshold.ts`](04-score-threshold.ts) | `npm run l05:4` | Schwellenwert: nach Mindest-Ähnlichkeit abschneiden | wie Teil 1 |
| **5** | [`99-full-demo.ts`](99-full-demo.ts) (Datei 99 = Teil 5) | `npm run l05:5` | Alle Strategien nebeneinander und den Schwellenwert an [`question-set.json`](question-set.json) kalibrieren | wie Teil 1 |

Die Aufgaben stehen im Kopf jeder Datei. [`retrieval.ts`](retrieval.ts) ist ein Hilfsmodul, kein eigener Teil: Index und Fragen-Set laden und die MMR-Auswahl, die Teil 5 nutzt (Teil 2 hat eine Lehrkopie davon). Ranking und Indexdateien liegen in [`../shared/index.ts`](../shared/index.ts).

## Reihenfolge und Abhängigkeiten

- **Vorher:** Chunks und Überschriften-Index aus Lektion 04 (`npm run l04:0`, dann `npm run l04:2`). Alle fünf Teile durchsuchen diesen einen Index.
- **Teil 1 → 5** der Reihe nach: Teil 2 bis 5 setzen Top-k aus Teil 1 voraus.
- Jeder Teil läuft einmal durch, schreibt Tabellen ins Terminal und endet. Du brauchst nur LM Studio mit dem E5-Modell, kein Chat-Modell und kein Open WebUI.
- `question-set.json` lesen auch Lektion 08 (Trefferquote, MRR, Judge). Änderungen daran wirken dort mit.

## Sicherheit

- Der Zugriffsfilter in Teil 3 setzt Rechte im Code der Suche durch, vor der Suche, nicht im Prompt. Welche Gruppen ein Nutzer lesen darf, bestimmt in einer echten Anwendung der Server aus der Anmeldung, nie die Anfrage.
- Die Tabelle `no filter` und die Zeile "x of y chunks searchable" zeigen absichtlich interne Dateinamen und Zahlen. Das sind Lehrausgaben, die ein Nutzer nicht sehen dürfte.
- Schwellenwert und MMR sind Qualitätsregeln und schützen vor nichts.

## Weiterlesen

- [GUIDE.de.md](GUIDE.de.md): Begriffe, Ablauf je Teil, echte Ausgabe, Stolperfallen, Fehlermeldungen.
- [docs/architecture.de.md](../../docs/architecture.de.md): Datenfluss über alle Lektionen und Namensfallen (zwei `retrieval.ts`, zwei `INDEX_STRATEGY`).
- [docs/decisions.de.md](../../docs/decisions.de.md#pre-filter) und [docs/production.de.md](../../docs/production.de.md): Begründungen, Vereinfachungen, Literatur.
- [docs/trainer.de.md](../../docs/trainer.de.md): für Trainer, enthält Lösungen.
- Allgemeine Fehlermeldungen: "Wenn etwas nicht klappt" in der [Wurzel-README](../../README.de.md#wenn-etwas-nicht-klappt).

Zurück zur [Übersicht](../../README.de.md).
