# Lektion 03 – Embeddings

[English](README.md) · Erklärungen, erwartete Ausgabe und Stolperfallen: [GUIDE.de.md](GUIDE.de.md)

**Lernziel:** Du verstehst, was ein Embedding ist, vergleichst Texte mit der Kosinus-Ähnlichkeit und siehst, wozu die Präfixe `query: ` und `passage: ` dienen. Das ist die Grundlage der Suche in Lektion 04 bis 08.

## Teile

| Teil | Datei | Start | Zeigt | Braucht |
|---|---|---|---|---|
| 1 | [`01-hello-embeddings.ts`](01-hello-embeddings.ts) | `npm run l03:1` | Zwei Sätze einbetten und ihre Ähnlichkeit messen | LM Studio mit E5; Burp optional |
| 2 | [`02-comparisons.ts`](02-comparisons.ts) | `npm run l03:2` | Passagen nach Bedeutung sortieren, E5 mit EmbeddingGemma vergleichen | wie Teil 1, dazu EmbeddingGemma |
| 3 | [`03-prefixes.ts`](03-prefixes.ts) | `npm run l03:3` | Messen, wie viel die Rollen-Präfixe ausmachen | wie Teil 2 |

Die Aufgaben stehen im Kopf jeder Datei. [`embeddings.ts`](embeddings.ts) ist ein Hilfsmodul (die beiden Modelle mit ihren Präfixen), kein eigener Teil; E5 und die Kosinus-Ähnlichkeit liegen in [`../shared/embeddings.ts`](../shared/embeddings.ts).

## Reihenfolge und Abhängigkeiten

- **Teil 1 → 3** der Reihe nach. Jeder Teil läuft einmal durch und endet.
- **Kein Chat-Modell, kein Open WebUI:** Diese Lektion braucht nur die Embedding-Modelle in LM Studio. Ihre Identifier stehen in `.env` (`REMOTE_EMBEDDING_MODEL_NAME`, `REMOTE_EMBEDDING_GEMMA_MODEL_NAME`).
- **Burp** ist optional; ist `BURP_PROXY_URL` gesetzt, zeigt die HTTP-History die Texte und die rohen Vektoren.
- **Danach:** Lektion 04 bettet mit E5 die OWASP-Dokumente ein; EmbeddingGemma brauchst du dort nicht mehr.

## Weiterlesen

- [GUIDE.de.md](GUIDE.de.md): Begriffe, Ablauf je Teil, echte Ausgabe, Stolperfallen
- [docs/architecture.de.md](../../docs/architecture.de.md): Datenfluss über alle Lektionen
- [docs/production.de.md](../../docs/production.de.md): Vereinfachungen und Literatur (E5)
- [docs/trainer.de.md](../../docs/trainer.de.md) (für Trainer, enthält Lösungen): Vorbereitung, Zeiten
- Fehlermeldungen: [Wenn etwas nicht klappt](../../README.de.md#wenn-etwas-nicht-klappt) in der Wurzel-README

Zurück zur [Übersicht](../../README.de.md).
