# Lektion 03 – Embeddings

**Lernziel:** Du verstehst, was ein Embedding ist, vergleichst Texte mit der Kosinus-Ähnlichkeit und siehst, wozu die Präfixe `query: ` und `passage: ` dienen. Das ist die Grundlage der Suche in Lektion 04 und 05.

| Teil | Datei | npm-Skript | Lernziel | Braucht |
|---|---|---|---|---|
| 1 | `01-hello-embeddings.ts` | `npm run l03:1` | Zwei Sätze einbetten und ihre Ähnlichkeit messen | LM Studio (E5), Burp optional |
| 2 | `02-comparisons.ts` | `npm run l03:2` | Passagen nach Bedeutung sortieren, E5 mit EmbeddingGemma vergleichen | LM Studio (E5 und EmbeddingGemma), Burp optional |
| 3 | `03-prefixes.ts` | `npm run l03:3` | Messen, wie viel die Rollen-Präfixe ausmachen | LM Studio (E5 und EmbeddingGemma), Burp optional |

`embeddings.ts` ist ein Hilfsmodul (die beiden Modelle mit ihren Präfixen), kein eigener Teil.

**Reihenfolge:** Arbeite die Teile 1 bis 3 nacheinander durch. Bei E5 liegen auch unverwandte Texte oft bei 0,7 bis 0,8; entscheidend ist die Reihenfolge, nicht der Absolutwert. Der Name des Gemma-Modells steht in `.env` bei `REMOTE_EMBEDDING_GEMMA_MODEL_NAME`.

Zurück zur [Übersicht](../../README.md).
