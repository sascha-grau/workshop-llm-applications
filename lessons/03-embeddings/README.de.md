# Lektion 03 – Embeddings

[English](README.md)

**Lernziel:** Du verstehst, was ein Embedding ist, vergleichst Texte mit der Kosinus-Ähnlichkeit und siehst, wozu die Präfixe `query: ` und `passage: ` dienen. Das ist die Grundlage der Suche in Lektion 04 bis 07.

| Teil | Datei | npm-Skript | Lernziel | Braucht |
| --- | --- | --- | --- | --- |
| 1 | `01-hello-embeddings.ts` | `npm run l03:1` | Zwei Sätze einbetten und ihre Ähnlichkeit messen | LM Studio (E5), Burp optional |
| 2 | `02-comparisons.ts` | `npm run l03:2` | Passagen nach Bedeutung sortieren, E5 mit EmbeddingGemma vergleichen | LM Studio (E5 und EmbeddingGemma), Burp optional |
| 3 | `03-prefixes.ts` | `npm run l03:3` | Messen, wie viel die Rollen-Präfixe ausmachen | LM Studio (E5 und EmbeddingGemma), Burp optional |

`embeddings.ts` ist ein Hilfsmodul (die beiden Modelle mit ihren Präfixen), kein eigener Teil.

**Reihenfolge:** Arbeite die Teile 1 bis 3 nacheinander durch. Bei E5 liegen auch unverwandte Texte oft bei 0,7 bis 0,8; entscheidend ist die Reihenfolge, nicht der Absolutwert. Der Name des Gemma-Modells steht in `.env` bei `REMOTE_EMBEDDING_GEMMA_MODEL_NAME`.

## Grundbegriffe

- **Embedding:** Ein Embedding-Modell macht aus einem Text einen Vektor, der seine Bedeutung beschreibt.
- **Vektor:** eine lange Liste von Zahlen; zwei Sätze mit ähnlicher Bedeutung bekommen Vektoren, die in eine ähnliche Richtung zeigen, auch wenn sie fast keine Wörter teilen.
- **Kosinus-Ähnlichkeit:** misst diese Richtung als Zahl zwischen -1 und 1.
- **Präfixe für Anfrage und Passage:** E5 und EmbeddingGemma wurden mit Präfixen trainiert, die die Rolle eines Textes markieren. E5 nutzt `query: ` für Suchanfragen und `passage: ` für gespeicherte Dokumente; EmbeddingGemma hat eigene (`task: search result | query: ` und `title: none | text: `, siehe `embeddings.ts`).
- **Rangfolge statt Absolutwerte:** Bei E5 liegen auch unverwandte Texte oft bei 0,7 bis 0,8; vergleiche also die Reihenfolge, nicht die Absolutwerte, und vergleiche keine Werte zwischen Modellen.

## Aufgaben

Die Aufgaben stehen auch am Anfang jeder Datei; maßgeblich sind die Dateiköpfe.

### Teil 1 – `01-hello-embeddings.ts`

1. Ersetze textB durch einen Satz zu einem ganz anderen Thema (z. B. Fahrplan der Bahn). Wie stark sinkt der Wert, und liegt er trotzdem noch über 0,5?
2. Setze textB gleich textA. Welchen Wert erwartest du, bevor du startest?
3. Öffne in Burp die Antwort und suche die Zahlenliste eines Vektors (nur mit Burp).

### Teil 2 – `02-comparisons.ts`

1. Füge der Liste passages eine eigene Passage hinzu und sage vorher voraus, auf welchem Platz sie landet. Stimmt es?
2. Ändere die Suchanfrage in eine Frage zum Bahnfahrplan. Welche Passage steht jetzt oben?
3. Vergleiche den Abstand zwischen Platz 3 (letzte passende Passage) und Platz 4 (erster Ablenker) bei E5 und bei Gemma. Welches Modell trennt Passendes und Unpassendes deutlicher?

### Teil 3 – `03-prefixes.ts`

1. Lies die erste Tabelle: Bei welchem Modell und in welchem Index bringen die Präfixe am meisten Treffer auf Platz 1?
2. Füge einen eigenen Fall mit Anfrage, ähnlicher Frage und Antwort zu `cases` hinzu. Verdrängt deine ähnliche Frage die Antwort?
3. Vertausche in der Variante withPrefix Anfrage- und Passage-Präfix. Wird es schlechter als ganz ohne Präfix?

Zurück zur [Übersicht](../../README.de.md).
