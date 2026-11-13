# Lektion 06 – Hybrid-Suche und Reranking

[English](README.md) · Erklärungen, erwartete Ausgabe und Stolperfallen: [GUIDE.de.md](GUIDE.de.md)

**Lernziel:** Du lädst die Indizes aus Lektion 04 in eine Vektordatenbank (Qdrant) und suchst auf drei Arten: nach Stichwörtern (BM25), nach Bedeutung (Vektoren) und nach beidem zusammen (Hybrid-Suche mit RRF). Du siehst, was ein Sprachmodell beiträgt, wenn es die Treffer neu sortiert (Reranking) oder die Frage umformuliert (Multi-Query), und was das kostet.

## Teile

| Teil | Datei | Start | Zeigt | Braucht |
|---|---|---|---|---|
| 1 | [`01-collection-load.ts`](01-collection-load.ts) | `npm run l06:1` | Alle vier Indizes in Qdrant laden, mit BM25-Volltextindex | Qdrant, Index `headings` (übrige optional) |
| 2 | [`02-keywords-search.ts`](02-keywords-search.ts) | `npm run l06:2` | Keyword-Suche mit BM25 | Qdrant mit Collections aus Teil 1 |
| 3 | [`03-vector-search.ts`](03-vector-search.ts) | `npm run l06:3` | Vektorsuche neben BM25; Jahreszahl in der Frage als Filter | wie Teil 2, dazu LM Studio mit E5 |
| 4 | [`04-hybrid-rrf.ts`](04-hybrid-rrf.ts) | `npm run l06:4` | Hybrid-Suche: beide Listen mit RRF verbinden | wie Teil 3 |
| 5 | [`05-reranking.ts`](05-reranking.ts) | `npm run l06:5` | Reranking mit dem Sprachmodell, samt Kosten | wie Teil 3, dazu Chat-Modell |
| 6 | [`06-multiquery.ts`](06-multiquery.ts) | `npm run l06:6` | Multi-Query: Frage umformulieren, Listen mit RRF vereinen | wie Teil 5 |
| **7** | [`99-full-demo.ts`](99-full-demo.ts) (Datei 99 = Teil 7) | `npm run l06:7` | Alle Verfahren nebeneinander, samt Kosten | wie Teil 5 |

Die Aufgaben stehen im Kopf jeder Datei. [`hybrid.ts`](hybrid.ts) ist ein Hilfsmodul, kein eigener Teil: Collection-Namen, Qdrant-Client und die Prüfung, ob Qdrant und die Collection da sind.

## Reihenfolge und Abhängigkeiten

- **Qdrant zuerst:** Lektion 06 braucht ein laufendes Qdrant in Docker. Einrichtung und Sicherheitshinweis (nur an `127.0.0.1` binden) stehen in der Wurzel-README unter [Qdrant einrichten](../../README.de.md#qdrant-einrichten).
- **Vorher:** Chunks und Überschriften-Index aus Lektion 04 (`npm run l04:0`, dann `npm run l04:2`). Die übrigen Indizes (`l04:1`, `l04:3`, `l04:4`) sind optional; Teil 1 überspringt fehlende mit einem Hinweis.
- **Teil 1 einmal:** Er lädt alle vorhandenen Indizes als Collections. Teil 2 bis 7 suchen aber nur in `headings__…`, gesteuert über `INDEX_STRATEGY` in `hybrid.ts`. Nach einem neuen Index in Lektion 04 Teil 1 erneut starten.
- **Teil 2 → 7** der Reihe nach: Jeder baut auf dem vorigen auf. Jeder Teil läuft einmal durch und endet; es gibt keinen Chat und kein Open WebUI.
- **Teil 5 bis 7** lesen JSON aus dem Chat-Modell: `SHOW_THINKING` in `.env` leer lassen oder auf `false` setzen.
- **Lektion 07 ab Teil 8** und Lektion 08, Teil 6 suchen in denselben Collections.

## Hinweise

- **Kein Zugriffsfilter:** Teil 2 bis 7 suchen bewusst ungefiltert, der Übersicht halber, und sehen auch den internen Anhang. Teil 5 und 7 schicken Chunk-Text beim Reranking an das Chat-Modell. Lektion 07 ergänzt den Filter ([warum vorher](../../docs/decisions.de.md#pre-filter)).
- **Burp sieht Qdrant nicht:** Der Qdrant-Client nutzt einen eigenen Verbindungspool, den die Proxy-Einstellung nicht erreicht. Burp zeigt nur die Aufrufe an Embedding- und Chat-Modell. Qdrant beobachtest du im Dashboard unter `<QDRANT_URL>/dashboard`.
- **Kosten:** Reranking macht je Frage einen Chat-Aufruf je Kandidat. Lokal ist das Wartezeit, bei einer bezahlten API Geld.

## Weiterlesen

- [GUIDE.de.md](GUIDE.de.md): Begriffe, Ablauf je Teil, echte Ausgabe, Stolperfallen, Fehlermeldungen.
- [docs/architecture.de.md](../../docs/architecture.de.md): Datenfluss, bekannte Grenzen und Namensfallen (zwei `INDEX_STRATEGY`, Dateinummer ≠ Teilnummer).
- [docs/decisions.de.md](../../docs/decisions.de.md#json-index-und-qdrant) und [docs/production.de.md](../../docs/production.de.md): Begründungen, Vereinfachungen, Literatur zu BM25 und RRF.
- [docs/trainer.de.md](../../docs/trainer.de.md): für Trainer, enthält Lösungen.
- Allgemeine Fehlermeldungen: "Wenn etwas nicht klappt" in der [Wurzel-README](../../README.de.md#wenn-etwas-nicht-klappt).

Zurück zur [Übersicht](../../README.de.md).
