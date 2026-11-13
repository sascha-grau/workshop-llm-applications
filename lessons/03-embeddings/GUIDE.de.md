# Lektion 03 – Embeddings: Guide

*English version: [GUIDE.md](GUIDE.md)* · Überblick und Start: [README.de.md](README.de.md)

## Worum geht's?

Ein Embedding-Modell macht aus einem Text eine lange Liste von Zahlen, die seine Bedeutung beschreibt. Texte mit ähnlicher Bedeutung bekommen ähnliche Zahlenlisten, auch wenn sie kaum ein Wort teilen. Damit findest du zu einer Frage die passenden Texte, ohne dass die Stichwörter stimmen müssen.

Vergleich: eine Landkarte der Bedeutungen. Jeder Satz bekommt einen Ort; „Kamillentee nach Feierabend“ liegt nah bei „heißes Getränk zum Entspannen“ und weit weg vom Bahnfahrplan.

## Wo stehen wir?

```text
L02 Tool-Calls ──► [ L03 Embeddings ] ──► L04 Chunking ──► L05 Retrieval ──► … ──► L07 RAG
                          ▲ du bist hier

Text ──► Embedding-Modell (E5) ──► Vektor [0.03, -0.01, …]   (768 Zahlen bei E5)

Frage ──── "query: …"   ──► Vektor ──┐
Passage ── "passage: …" ──► Vektor ──┴──► Kosinus-Ähnlichkeit ──► Rangfolge
```

Ab Lektion 04 bettest du so die Abschnitte der OWASP-Dokumente ein; Lektion 05 bis 08 suchen darin.

## Neue Begriffe

| Begriff | In einem Satz | Beispiel |
|---|---|---|
| Embedding, Vektor | Ein Embedding-Modell macht aus einem Text einen Vektor: eine Liste von Zahlen, die seine Bedeutung beschreibt. | E5 liefert 768 Zahlen je Text. |
| Kosinus-Ähnlichkeit | Misst, wie ähnlich die Richtung zweier Vektoren ist, als Zahl zwischen -1 und 1. | 1 = gleiche Richtung |
| Präfix (Rolle) | Ein Vorsatz vor dem Text, der dem Modell sagt, ob es eine Suchanfrage oder ein gespeichertes Dokument ist. | E5: `query: ` und `passage: ` |
| Semantische Suche | Texte nach Bedeutung statt nach Stichwörtern finden. | „heißes Getränk“ findet „Kamillentee“ |
| RAG | Retrieval-Augmented Generation: passende Textstücke suchen und dem Sprachmodell als Kontext mitgeben. | Lektion 07 |

## Vorher prüfen

- [ ] LM Studio läuft, das E5-Modell (`REMOTE_EMBEDDING_MODEL_NAME`) ist geladen.
- [ ] Für Teil 2 und 3: Auch EmbeddingGemma ist geladen, sein Identifier steht in `REMOTE_EMBEDDING_GEMMA_MODEL_NAME`. Beide Modelle laufen auf demselben Server wie das Chat-Modell.
- [ ] Burp ist optional. Ist `BURP_PROXY_URL` gesetzt, muss Burp laufen (Intercept aus).

Ein Chat-Modell und Open WebUI brauchst du in dieser Lektion nicht. Alle Ausgaben unten: gemessen am 2026-11-13 mit LM Studio, `text-embedding-multilingual-e5-base` (E5) und `text-embedding-embeddinggemma-300m-qat` (EmbeddingGemma), dem Workshop-Standard ([Modelle](../../README.de.md#modelle) in der Wurzel-README). Mit einem anderen Server oder Modell, auch mit einer anderen Quantisierung (einer stärker oder schwächer komprimierten Fassung desselben Modells), weichen die Zahlen ab; die Reihenfolge bleibt meist gleich. Zeitstempel sind gekürzt (`…`).

## Teil 1 – Dein erstes Embedding

**In einem Satz:** Das Programm schickt zwei Sätze an E5 und gibt die Kosinus-Ähnlichkeit ihrer Vektoren aus: ein Aufruf, eine Zahl.

**Ablauf**

1. **Einbetten** (KERN 1). `embedDocuments` schickt beide Sätze in einer Anfrage und bekommt je Satz einen Vektor. Beide Sätze bekommen das Präfix `query: `: Hier werden zwei gleichberechtigte Sätze verglichen, keine Frage mit einem Dokument.
2. **Vergleichen** (KERN 2). `cosineSimilarity` berechnet, wie ähnlich die Richtung der beiden Vektoren ist.

Die beiden Sätze haben fast kein gemeinsames Wort: „Nach einem langen Arbeitstag freute sich Lisa auf eine Tasse heißen Kamillentee.“ und „Entspannung nach einem anstrengenden Tag mit einem warmen Getränk.“ Eine Stichwortsuche würde sie nicht verbinden.

**Das siehst du**

```text
$ npm run l03:1
… INFO Model API directly: reachable { status: 200 }
… INFO Embedding: Call started { model: 'text-embedding-multilingual-e5-base' }
Cosine similarity: 0.868
… INFO Embedding: Call completed { model: 'text-embedding-multilingual-e5-base', durationMs: … }
```

**Was bedeutet das?**

- 0,868 heißt: Die beiden Vektoren zeigen in eine sehr ähnliche Richtung. Das Modell erkennt, dass beide Sätze vom Entspannen mit einem warmen Getränk handeln.
- Allein sagt die Zahl wenig. Ob 0,868 viel ist, zeigt erst der Vergleich mit anderen Texten in Teil 2.
- Ein Embedding-Aufruf ist schnell und braucht kein Chat-Modell. Deshalb kann man damit tausende Texte vorab einbetten.

**Probier aus:** die Aufgaben im Kopf von `01-hello-embeddings.ts`. Überlege bei jeder Änderung vorher, welchen Wert du erwartest.

**Stolperfallen**

- In Burp sind die Vektoren lesbare Zahlenlisten, weil der Code `encodingFormat: 'float'` setzt. Ohne diese Einstellung verlangt der OpenAI-Client base64-kodierte Vektoren.
- Ohne Präfix werden die Ähnlichkeiten bei E5 schlechter. Wie viel das ausmacht, misst Teil 3.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Model API directly: The model server is unreachable or timed out. …` | LM-Studio-Server starten, `REMOTE_MODEL_BASE_URL` prüfen. |
| `404` oder `400` mit dem Modellnamen in der Ursache | `REMOTE_EMBEDDING_MODEL_NAME` passt nicht zum Identifier in LM Studio, oder E5 ist nicht geladen. |
| `The setting REMOTE_EMBEDDING_MODEL_NAME is missing from .env (template: .env.example).` | Eintrag aus `.env.example` übernehmen. |

> **Vertiefung:** Das Modell ist [multilingual-e5-base](https://huggingface.co/intfloat/multilingual-e5-base). Es ist mehrsprachig: Eine englische Frage findet auch deutsche Texte. Die Kosinus-Ähnlichkeit steht in [`shared/embeddings.ts`](../shared/embeddings.ts), weil spätere Lektionen sie ebenfalls nutzen. Literatur zu E5: [docs/production.de.md](../../docs/production.de.md#weiterlesen).

## Teil 2 – Passagen nach Bedeutung sortieren

**In einem Satz:** Eine Suchanfrage wird mit fünf gespeicherten Passagen verglichen, und die Passagen werden nach Ähnlichkeit sortiert, einmal mit E5 und einmal mit EmbeddingGemma.

**Ablauf**

1. **Einbetten mit Rollen** (KERN 1). Die Anfrage bekommt das Anfrage-Präfix des Modells (`embedQuery`), die Passagen das Passagen-Präfix (`embedDocuments`). Jedes Modell hat eigene Präfixe; beide stehen in `embeddings.ts`.
2. **Sortieren** (KERN 2). Für jede Passage die Kosinus-Ähnlichkeit zur Anfrage berechnen und absteigend sortieren.

Drei Passagen passen inhaltlich zur Anfrage (Kamillentee, Kakao, Kräutertee), teilen aber kaum Wörter mit ihr. Zwei sind Ablenker (Fahrplan, Tomaten).

**Das siehst du**

```text
Model: text-embedding-multilingual-e5-base
Query: Wie kann ich mich nach Feierabend bei einem heißen Getränk entspannen?
Passages ranked by cosine similarity:
1. 0.844 – Ein gemütlicher Abend mit Kräutertee und einem guten Buch sorgt für Erholung.
2. 0.826 – Eine Tasse warmer Kakao auf dem Sofa hilft Paul, die Anstrengungen des Tages zu vergessen.
3. 0.814 – Lisa genießt Kamillentee und lässt den stressigen Bürotag ruhig ausklingen.
4. 0.763 – Im Garten wachsen Tomaten besonders gut an sonnigen Standorten.
5. 0.727 – Der neue Fahrplan bietet zusätzliche Zugverbindungen zwischen Berlin und Hamburg.
…
Model: text-embedding-embeddinggemma-300m-qat
Query: Wie kann ich mich nach Feierabend bei einem heißen Getränk entspannen?
Passages ranked by cosine similarity:
1. 0.633 – Ein gemütlicher Abend mit Kräutertee und einem guten Buch sorgt für Erholung.
2. 0.561 – Eine Tasse warmer Kakao auf dem Sofa hilft Paul, die Anstrengungen des Tages zu vergessen.
3. 0.502 – Lisa genießt Kamillentee und lässt den stressigen Bürotag ruhig ausklingen.
4. 0.244 – Im Garten wachsen Tomaten besonders gut an sonnigen Standorten.
5. 0.187 – Der neue Fahrplan bietet zusätzliche Zugverbindungen zwischen Berlin und Hamburg.
```

**Was bedeutet das?**

- Beide Modelle setzen die drei passenden Passagen nach vorn und die Ablenker nach hinten. Das ist semantische Suche: gefunden nach Bedeutung, nicht nach gemeinsamen Wörtern.
- Bei E5 liegen auch die Ablenker hoch: Tomaten 0,763, Fahrplan 0,727. Ein E5-Wert um 0,75 heißt nicht „passt ein bisschen“. Wichtig ist die Reihenfolge, nicht der Wert.
- Die Werte von EmbeddingGemma liegen insgesamt viel niedriger. Jedes Modell hat seine eigene Skala; Werte zweier Modelle vergleichst du nicht miteinander.
- Genau dieses Muster nutzt die Suche ab Lektion 04: Frage einbetten, mit allen gespeicherten Vektoren vergleichen, die besten nehmen.

**Probier aus:** die Aufgaben im Kopf von `02-comparisons.ts`. Achte auf die Abstände zwischen benachbarten Plätzen, nicht nur auf die Reihenfolge.

**Stolperfallen**

- Fällt ein Modell aus, läuft das andere trotzdem; das Programm endet dann mit Exit-Code 1.
- Beide Modelle laufen auf demselben Server mit derselben Adresse und demselben API-Schlüssel, nur unter verschiedenen Namen.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `ERROR Embedding: Call failed – …` mit dem Gemma-Namen | EmbeddingGemma ist nicht geladen, oder `REMOTE_EMBEDDING_GEMMA_MODEL_NAME` passt nicht zum Identifier in LM Studio. |
| `The embedding server returned … vectors for … texts.` | Der Server hat nicht alle Texte eingebettet. LM Studio neu starten. |

> **Vertiefung:** [EmbeddingGemma](https://huggingface.co/google/embeddinggemma-300m) nutzt statt `query: ` und `passage: ` Aufgaben-Präfixe: `task: search result | query: ` für die Anfrage und `title: none | text: ` für Dokumente. Solche Präfixe stehen in der Modellbeschreibung; wer das Modell wechselt, muss sie mitwechseln.

## Teil 3 – Was die Präfixe bringen

**In einem Satz:** Dieselbe Suche läuft ohne und mit Präfixen, und das Programm zählt, wie oft die richtige Antwort auf Platz 1 landet.

**Ablauf**

1. **Fälle und Indizes** (KERN 1). Jeder der acht Fälle hat eine Anfrage, eine ähnliche Frage eines anderen Nutzers (Ablenker) und die richtige Antwort. Index A enthält nur die acht Antworten. Index B enthält zusätzlich die acht ähnlichen Fragen.
2. **Zwei Varianten** (KERN 2). Alle Einträge und Anfragen werden einmal ohne Präfix und einmal mit den Präfixen des Modells eingebettet.
3. **Platz zählen** (KERN 3). Für jede Anfrage: Auf welchem Platz steht die richtige Antwort in Index B? Für Index A überspringt das Programm die ähnlichen Fragen einfach.

Die ähnliche Frage sieht der Anfrage zum Verwechseln ähnlich, beantwortet sie aber nicht. Das ist ein typisches Problem, wenn FAQ-Einträge oder Chat-Verläufe im Index landen.

**Das siehst du**

```text
E5: For how many of the 8 queries is the correct answer ranked first?
│ (index)        │ Index A: answers only │ Index B: answers + similar questions │
│ without prefix │ 7                     │ 0                                    │
│ with prefix    │ 8                     │ 5                                    │
E5, Index B: rank and score of the correct answer, and score of the best similar question
│ (index)                                            │ without prefix                           │ with prefix                              │
│ Wie schütze ich mein LLM vor Prompt Injection?     │ 'Rank 2 | Answer 0.865 | Question 0.918' │ 'Rank 2 | Answer 0.868 | Question 0.881' │
│ Darf ein Passwort im System-Prompt stehen?         │ 'Rank 2 | Answer 0.892 | Question 0.936' │ 'Rank 1 | Answer 0.897 | Question 0.865' │
│ Wie verhindere ich, dass mein Agent zu viel darf?  │ 'Rank 4 | Answer 0.848 | Question 0.872' │ 'Rank 1 | Answer 0.848 | Question 0.839' │
│ …                                                                                                                                         │

Gemma: For how many of the 8 queries is the correct answer ranked first?
│ (index)        │ Index A: answers only │ Index B: answers + similar questions │
│ without prefix │ 7                     │ 1                                    │
│ with prefix    │ 8                     │ 4                                    │
Gemma, Index B: rank and score of the correct answer, and score of the best similar question
│ Was bedeutet Datenvergiftung?                      │ 'Rank 2 | Answer 0.717 | Question 0.922' │ 'Rank 2 | Answer 0.668 | Question 0.742' │
│ Warum halluziniert mein Modell?                    │ 'Rank 4 | Answer 0.528 | Question 0.580' │ 'Rank 1 | Answer 0.527 | Question 0.411' │
│ …                                                                                                                                         │
```

**Was bedeutet das?**

- Die erste Tabelle je Modell: Zeilen sind die Varianten, Spalten die Indizes, jede Zahl sagt, bei wie vielen der acht Anfragen die richtige Antwort auf Platz 1 steht.
- Die zweite Tabelle zeigt Index B im Detail. „Rank 2 | Answer 0.892 | Question 0.936“ heißt: Die richtige Antwort steht auf Platz 2 mit 0,892, und eine ähnliche Frage hat sie mit 0,936 überholt.
- Am Beispiel „Darf ein Passwort im System-Prompt stehen?“ bei E5: Mit Präfix bleibt der Wert der Antwort fast gleich (0,892 → 0,897), der der ähnlichen Frage sinkt (0,936 → 0,865). Das Präfix trennt Frage-zu-Frage von Frage-zu-Antwort.
- Ohne Präfix gleicht eine Frage einer Frage stärker als ihrer Antwort. Die Präfixe sagen dem Modell, dass hier eine Anfrage eine Antwort sucht.

**Probier aus:** die Aufgaben im Kopf von `03-prefixes.ts`. Lies beide Tabellen je Modell: erst die Zählung, dann die Zeilen, in denen sich der Platz ändert.

**Stolperfallen**

- Acht Fälle sind eine kleine Stichprobe. Ein einzelner Fall verschiebt die Zählung um eins von acht.
- Das Präfix gehört zur Eingabe ans Modell, nicht zum gespeicherten Text. Wer es ändert, muss jeden Eintrag neu einbetten; Vektoren mit und ohne Präfix passen nicht zusammen.
- Die Antworten der anderen Fälle zählen für eine Anfrage als falsche Antworten. Auch sie können vor der richtigen landen.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| Nur eine der beiden Tabellen erscheint, Exit-Code 1 | Ein Modell ist nicht geladen. Die Fehlerzeile darüber nennt den Modellnamen. |

> **Vertiefung:** E5 wurde mit genau diesen Präfixen trainiert: `query: ` für Anfragen und `passage: ` für Dokumente; für symmetrische Aufgaben (zwei gleichartige Texte vergleichen, wie in Teil 1) empfiehlt die Modellbeschreibung `query: ` für beide. Lektion 04 nutzt beides: `passage: ` für die Chunks, `query: ` für die Suchfrage und für den Vergleich benachbarter Sätze. Literatur: Wang et al. (2022), siehe [docs/production.de.md](../../docs/production.de.md#weiterlesen).

## Das nimmst du mit

1. Ein Embedding fasst die Bedeutung eines Texts in einen Vektor. Ähnliche Bedeutung heißt ähnliche Richtung, auch ohne gemeinsame Wörter.
2. Zählt die Reihenfolge, nicht der Wert: Jedes Modell hat seine eigene Skala, und bei E5 liegen auch unpassende Texte hoch.
3. Präfixe für Anfrage und Passage gehören zum Modell. Sie entscheiden mit, ob eine Antwort gefunden wird oder eine ähnliche Frage.

## Weiter geht's

[Lektion 04 – Chunking](../04-chunking/README.de.md) zerlegt die OWASP-Dokumente in Stücke, bettet jedes mit E5 und `passage: ` ein und legt alles in einem Index ab. Ab dort sucht jede Lektion mit `query: ` in diesem Index. Den Datenfluss beschreibt [docs/architecture.de.md](../../docs/architecture.de.md).
