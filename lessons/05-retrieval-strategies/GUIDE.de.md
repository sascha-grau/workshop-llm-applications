# Lektion 05 – Retrieval-Strategien: Guide

*English version: [GUIDE.md](GUIDE.md)* · Überblick und Start: [README.de.md](README.de.md)

## Worum geht's?

**Retrieval** heißt: zu einer Frage die passenden Chunks aus dem Index holen. Lektion 04 hat dafür immer die besten drei genommen. Hier lernst du die Regeln kennen, nach denen eine Suche auswählt, was später im Prompt landet: nach Rang, nach Vielfalt, nach Metadaten und nach Mindest-Ähnlichkeit.

Vergleich: eine Bibliothekarin, die dir Bücher zu deiner Frage bringt. Sie kann dir die fünf passendsten bringen (Top-k), fünf möglichst verschiedene (MMR), nur solche aus der Abteilung, die du betreten darfst (Filter), oder nur die, die wirklich passen, notfalls keins (Schwellenwert).

Diese Lektion braucht kein Sprachmodell. Jede Tabelle zeigt, was in den Prompt käme. Was die Suche nicht liefert, kann das Modell in Lektion 07 nicht wissen; was sie zu viel liefert, lenkt es ab.

## Wo stehen wir?

```text
L03 Embeddings ──► L04 Chunking ──► [ L05 Retrieval ] ──► L06 Qdrant/Hybrid ──► L07 RAG ──► L08 Evaluierung
                                          ▲ du bist hier

indexes/headings__<Modell>.json  (aus npm run l04:2)
        │  Frage einbetten ("query: "), mit jedem Chunk vergleichen
        ▼
Rangliste aller Chunks
        ├─ Teil 1: die ersten k behalten ─────────────────────────► Top-k
        ├─ Teil 2: nacheinander wählen, Ähnliches bestrafen ───────► MMR
        ├─ Teil 3: vorher nach Metadaten filtern ──────────────────► Filter (Zugriffsrechte)
        ├─ Teil 4: nur über einer Mindest-Ähnlichkeit ─────────────► Schwellenwert
        └─ Teil 5: alles nebeneinander + Schwelle kalibrieren ─────► question-set.json
```

## Neue Begriffe

| Begriff | In einem Satz | Beispiel |
|---|---|---|
| Retrieval-Strategie | Die Regel, welche Chunks aus der Rangliste in den Prompt kommen. | Top-k, MMR, Filter, Schwellenwert |
| Rauschen | Chunks im Prompt, die nichts zur Antwort beitragen; sie verlängern den Prompt und lenken ab. | Ein Abschnitt über Lieferketten bei einer Frage zu Prompt Injection |
| Redundanz | Die höchste Ähnlichkeit eines Kandidaten zu einem schon gewählten Chunk; hoch heißt "das wurde schon gesagt". | Spalte `redundancy` in Teil 2 |
| Pre-Filter / Post-Filter | Vor der Suche filtern (Top-k sucht nur im erlaubten Rest) oder danach (Treffer werden gestrichen, nichts rückt nach). | Spalten `(pre-filter)` und `(post-filter)` in Teil 3 |
| Zugriffsgruppe | `public` oder `internal`, in den Metadaten jedes Chunks seit Lektion 04. Der Anhang gilt als intern. | `accessGroup: 'internal'` |
| Schwellenwert, Kalibrierung | Mindest-Ähnlichkeit für einen Treffer; ausgemessen an Fragen mit und ohne Antwort im Korpus. | `THRESHOLD` und `question-set.json` in Teil 5 |

## Vorher prüfen

- [ ] LM Studio läuft, das E5-Modell (`REMOTE_EMBEDDING_MODEL_NAME`) ist geladen. Ein Chat-Modell braucht diese Lektion nicht.
- [ ] Der Index `headings` existiert: einmal `npm run l04:0`, dann `npm run l04:2`.
- [ ] Die Konstanten stehen auf ihrem Standard (`git diff lessons/05-retrieval-strategies` ist leer).

Alle Ausgaben unten: gemessen am 2026-11-13 mit LM Studio und `text-embedding-multilingual-e5-base` (Workshop-Standard). Log-Zeilen, Tabellenrahmen und lange Pfade sind gekürzt (`…`). Mit einem anderen Server, Embedding-Modell oder anderen Chunks weichen die Zahlen ab; die Muster bleiben.

## Teil 1 – Top-k

**In einem Satz:** Top-k sortiert alle Chunks nach Ähnlichkeit zur Frage und behält die besten k, egal wie gut sie passen.

**Ablauf**

1. **Nur öffentliche Chunks** (KERN 1). `loadPublicIndex` wirft die internen Chunks des Anhangs vor der Suche raus. Warum vorher, zeigt Teil 3.
2. **Einmal ranken** (KERN 2). Die Frage wird mit `query: ` eingebettet und mit jedem Chunk verglichen, für das größte k in `TOP_K_VALUES`.
3. **Abschneiden** (KERN 3). Für jedes k bleibt der Anfang dieser Liste. Die Tabelle zeigt Ähnlichkeit, Abstand zum Platz davor und die geschätzte Länge des Kontexts.

**Das siehst du**

```text
Index: 194 public chunks from …/indexes/headings__text-embedding-multilingual-e5-base.json
Top 1 for “Wie begrenze ich Prompt Injection?”: 1 chunks, 443 characters (about 178 tokens of context)
…
Top 8 for “Wie begrenze ich Prompt Injection?”: 8 chunks, 5066 characters (about 2027 tokens of context)
│ rank │ similarity │ gap to previous │ file                           │ section                                                              │
│ 1    │ '0.885'    │ '–'             │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien › 1. Begrenzen Sie das Mod…' │
│ 2    │ '0.881'    │ '0.004'         │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien › 5. Fordern Sie manuelle …' │
│ 3    │ '0.879'    │ '0.002'         │ '01-llm01-prompt-injection.md' │ 'Arten von Prompt Injection-Schwachstellen › Direkte Prompt Injec…'  │
│ 4    │ '0.870'    │ '0.009'         │ '01-llm01-prompt-injection.md' │ 'Beschreibung'                                                       │
│ …                                                                                                                                              │
│ 6    │ '0.866'    │ '0.000'         │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien › 6. Trennen und kennzeic…'  │
│ 7    │ '0.866'    │ '0.000'         │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien'                             │
│ 8    │ '0.863'    │ '0.003'         │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien › 3. Implementieren Sie Fi…' │
```

**Was bedeutet das?**

- 194 statt 199 Chunks: Die fünf Chunks des internen Anhangs sind vor der Suche herausgefiltert.
- Die Tabelle für k = 3 ist genau der Anfang der Tabelle für k = 8. Gerankt wird nur einmal.
- Bei E5 liegen auch unpassende Treffer oft bei 0,7 bis 0,8 (Lektion 03). Lies Reihenfolge und Abstände, nicht die absoluten Werte.
- Die Token-Zahl ist eine Schätzung aus der Zeichenzahl (`CHARACTERS_PER_TOKEN`). Sie zeigt, wie schnell der Prompt mit k wächst.

**Probier aus:** die Aufgaben im Kopf von `01-top-k.ts`. Achte auf die Spalte `gap to previous` und darauf, wie viele Treffer Top-k bei einer Frage liefert, die der Korpus nicht beantwortet.

**Stolperfallen**

- `gap to previous` zeigt `0.000`, obwohl zwei Chunks verschieden sind: Die Werte sind auf drei Stellen gerundet.
- `section` zeigt `–` für Text direkt unter dem Dokumenttitel. Der Überschriftenpfad steht ohne Titel da.
- Top-k liefert immer genau k Chunks, auch wenn keiner passt. Das ist kein Fehler, sondern die Regel.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Cannot load index …/headings__….json (headings). Generate it with npm run l04:0, then npm run l04:2.` | Erst `npm run l04:0`, dann `npm run l04:2`. |
| `The index … is invalid or outdated. …` | Der Index stammt aus einer älteren Version. `npm run l04:2` erneut starten. |
| `The index … contains no public chunks.` | Der Index enthält nur interne Chunks, meist nach einer Änderung an `SUBSET` in Lektion 04. `SUBSET` leeren, `npm run l04:2`. |
| `Model API directly: The model server is unreachable or timed out. …` | LM Studio starten, E5 laden, `REMOTE_MODEL_BASE_URL` in `.env` prüfen; mehr unter [Wenn etwas nicht klappt](../../README.de.md#wenn-etwas-nicht-klappt). |

> **Vertiefung:** Wie viel Kontext ein Modell wirklich nutzt, hängt auch davon ab, wo im Prompt die Information steht: Mitten in einem langen Kontext wird sie leichter übersehen. Ein großes k ist deshalb nicht automatisch besser. Literatur ("Lost in the Middle") unter [Weiterlesen](../../docs/production.de.md#weiterlesen).

## Teil 2 – MMR

**In einem Satz:** MMR (Maximal Marginal Relevance) wählt die Treffer einzeln nacheinander und zieht jedem Kandidaten Punkte ab, wenn er einem schon gewählten Chunk ähnelt.

**Ablauf**

1. **Kandidaten holen** (KERN 1). Top-k wie in Teil 1, aber mit `FETCH_K` statt `TOP_K`. Nur aus diesen Kandidaten wählt MMR.
2. **Auswählen** (KERN 2). `TOP_K` Runden, für jeden Wert in `LAMBDA_VALUES` mit denselben Kandidaten.
3. **Der MMR-Wert** (KERN 3). In jeder Runde gewinnt der Kandidat mit dem höchsten Wert `LAMBDA × Relevanz − (1 − LAMBDA) × Redundanz`. Relevanz ist die Ähnlichkeit zur Frage, Redundanz die höchste Ähnlichkeit zu einem schon gewählten Chunk.

Ein Rechenbeispiel mit `LAMBDA` = 0,5:

```text
Kandidat A: Relevanz 0,88, Redundanz 0,91  →  0,5 × 0,88 − 0,5 × 0,91 = −0,015
Kandidat B: Relevanz 0,85, Redundanz 0,87  →  0,5 × 0,85 − 0,5 × 0,87 = −0,010
```

B gewinnt, obwohl A besser zur Frage passt: A wiederholt zu viel von dem, was schon gewählt ist.

**Das siehst du**

```text
Index: 194 public chunks from …/indexes/headings__text-embedding-multilingual-e5-base.json
MMR with lambda 1 for “Wie verhindere ich Prompt Injection?”: 3 of 20 candidates from 1 document(s)
│ rank │ top-k rank │ similarity │ redundancy │ file                           │ section                                                    │
│ 1    │ 1          │ '0.886'    │ '–'        │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien'                   │
│ 2    │ 2          │ '0.879'    │ '0.901'    │ '01-llm01-prompt-injection.md' │ '… › 5. Fordern Sie manuelle Freigabe für risikoreiche …'  │
│ 3    │ 3          │ '0.879'    │ '0.914'    │ '01-llm01-prompt-injection.md' │ '… › 1. Begrenzen Sie das Modellverhalten'                 │
MMR with lambda 0.6 for “Wie verhindere ich Prompt Injection?”: 3 of 20 candidates from 1 document(s)
│ 1    │ 1          │ '0.886'    │ '–'        │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien'                   │
│ 2    │ 2          │ '0.879'    │ '0.901'    │ '01-llm01-prompt-injection.md' │ '… › 5. Fordern Sie manuelle Freigabe für risikoreiche …'  │
│ 3    │ 3          │ '0.879'    │ '0.914'    │ '01-llm01-prompt-injection.md' │ '… › 1. Begrenzen Sie das Modellverhalten'                 │
MMR with lambda 0.5 for “Wie verhindere ich Prompt Injection?”: 3 of 20 candidates from 2 document(s)
│ 1    │ 1          │ '0.886'    │ '–'        │ '01-llm01-prompt-injection.md'               │ 'Präventions- und Mitigationsstrategien'                       │
│ 2    │ 14         │ '0.853'    │ '0.865'    │ '07-llm07-offenlegung-des-system-prompts.md' │ '… › 1. Trennen Sie sensible Daten vom System Prompt'          │
│ 3    │ 12         │ '0.856'    │ '0.873'    │ '01-llm01-prompt-injection.md'               │ '… › 3. Implementieren Sie Filter für Ein- und Ausgaben'       │
```

**Was bedeutet das?**

- Die Tabelle `MMR with lambda 1` ist reines Top-k: Die Spalte `top-k rank` zählt 1, 2, 3.
- Die Spalte `top-k rank` zeigt, welchen Platz ein Chunk bei Top-k hätte. Lücken in dieser Spalte sind übersprungene Kandidaten.
- `redundancy` ist für den ersten Treffer immer `–`: In Runde 1 ist noch nichts gewählt, also gewinnt der beste Top-k-Treffer.
- Die Redundanz liegt hier über der Relevanz. Die Abschnitte eines Dokuments ähneln einander mehr als der Frage.
- MMR braucht keinen weiteren Modellaufruf. Die Vektoren der Kandidaten stehen schon im Index.

**Probier aus:** die Aufgaben im Kopf von `02-mmr.ts`. Achte auf die Spalte `top-k rank` und auf die Zahl der Dokumente in der Kopfzeile jeder Tabelle.

**Stolperfallen**

- Die Spalte `similarity` ist nicht absteigend sortiert. Das ist richtig: MMR sortiert nach dem MMR-Wert, nicht nach der Ähnlichkeit.
- Die Frage lautet "verhindere" statt "begrenze" wie in Teil 1. Dazu passen auch Abschnitte anderer Dokumente, sodass MMR überhaupt eine Wahl hat.
- MMR findet nichts, was nicht unter den `FETCH_K` Kandidaten ist. Und "anders als die bisherigen" heißt nicht "nützlich": MMR prüft nicht, ob ein Chunk die Frage beantwortet.
- `selectByMmr` steht zweimal im Code: zum Lesen in `02-mmr.ts` (Markierung `LEHRKOPIE`) und als Original in `retrieval.ts`, das Teil 5 nutzt. Änderst du die Rechnung, ändere beide.

**Wenn es hakt:** dieselben Meldungen wie in Teil 1.

> **Vertiefung:** MMR stammt aus der Suche nach Dokumenten für Zusammenfassungen (Carbonell und Goldstein, 1998; [Weiterlesen](../../docs/production.de.md#weiterlesen)). Übliche Werte für `LAMBDA` liegen um 0,5 bis 0,7. Weil E5-Ähnlichkeiten eng beieinander liegen, wirkt hier schon eine kleine Änderung stark; die Werte in `LAMBDA_VALUES` sind für diesen Index gewählt, kein allgemeiner Richtwert. Lektion 07, Teil 5 nutzt MMR für echte Antworten.

## Teil 3 – Metadaten-Filter

**In einem Satz:** Ein Filter auf die Metadaten entscheidet, welche Chunks überhaupt gefunden werden dürfen; die Ähnlichkeit entscheidet nur noch über die Reihenfolge.

**Ablauf**

1. **Der Zugriffsfilter** (KERN 1). `mayRead` sieht nur die Metadaten eines Chunks, nie Text oder Vektor, und sagt ja oder nein. Erlaubt ist, was in `ALLOWED_ACCESS_GROUPS` steht. Jeder weitere Filter baut auf `mayRead` auf.
2. **Pre-Filter** (KERN 2). Für jeden Eintrag in `FILTERS` bleiben erst die passenden Chunks übrig; danach läuft Top-k über diesen Rest.
3. **Post-Filter** (KERN 3). Zum Vergleich: Top-k über alle Chunks, dann die unpassenden Treffer streichen. Nichts rückt nach.

**Das siehst du**

```text
Index: 199 chunks from …/indexes/headings__text-embedding-multilingual-e5-base.json
Filter “no filter” for “Welche Unternehmen sind Sponsoren des Projekts?”: 199 of 199 chunks searchable, pre-filter returns 3 hits, post-filter would return 3
│ filter                   │ rank │ similarity │ access group │ file                                                              │ section                         │
│ 'no filter (pre-filter)' │ 1    │ '0.830'    │ 'internal'   │ '11-appendix-llm-application-architecture-and-threat-modeling.md' │ 'Projektsponsoren'              │
│ 'no filter (pre-filter)' │ 2    │ '0.807'    │ 'public'     │ '00-vorwort-der-projektleiter.md'                                 │ 'Das deutsche Übersetzungsteam' │
│ …
Filter “access groups public” for “…”: 194 of 199 chunks searchable, pre-filter returns 3 hits, post-filter would return 1
│ 'access groups public (pre-filter)'  │ 1    │ '0.807'    │ 'public'     │ '00-vorwort-der-projektleiter.md' │ 'Das deutsche Übersetzungsteam'      │
│ …
│ 'access groups public (post-filter)' │ 2    │ '0.807'    │ 'public'     │ '00-vorwort-der-projektleiter.md' │ 'Das deutsche Übersetzungsteam' │
Filter “mitigation sections” for “…”: 60 of 199 chunks searchable, pre-filter returns 3 hits, post-filter would return 0
│ 'mitigation sections (pre-filter)' │ 1    │ '0.775'    │ 'public'     │ '03-llm03-lieferkette.md' │ 'Präventions- und Mitigationsstrategien' │
│ …
```

**Was bedeutet das?**

- Die Zeile "x of y chunks searchable" zeigt, wie viel der Filter übrig lässt. Die Suche sieht nur diesen Rest.
- Der Post-Filter behält die Ränge der ungefilterten Suche. Eine Lücke heißt: Dort stand ein gestrichener Treffer.
- Der Pre-Filter liefert immer `TOP_K` Treffer, solange genug Chunks übrig sind. Der Post-Filter kann weniger liefern, auch keinen.
- Ein Filter prüft keine Relevanz. Bei `mitigation sections` kommen Abschnitte zu Lieferketten, weil zur Sponsorenfrage kein Gegenmaßnahmen-Abschnitt passt.

**Probier aus:** die Aufgaben im Kopf von `03-metadata-filter.ts`. Achte auf die Spalte `access group` und auf die Zahl hinter "post-filter would return".

**Stolperfallen**

- Die Tabelle `no filter` und die Zeile "x of y chunks searchable" zeigen absichtlich interne Dateinamen und Zahlen. Das sind Lehrausgaben für dich als Entwickler. Einem Nutzer dürftest du weder gesperrte Treffer noch die Zahl gesperrter Chunks zeigen: Schon das verrät, dass es zu der Frage interne Dokumente gibt.
- Im Zweifel draußen: Ein Chunk zählt nur als öffentlich, wenn er `public` trägt und nicht auf der Liste `INTERNAL_DOCUMENTS` steht. Ein Filter ist nur so gut wie die Metadaten.
- `ALLOWED_ACCESS_GROUPS` steht als Konstante im Code, weil es keine Anmeldung gibt. In einer echten Anwendung bestimmt der Server die Gruppen aus der Anmeldung, nie aus Anfrage, Chat-Text oder Modellantwort.

**Wenn es hakt:** dieselben Meldungen wie in Teil 1.

> **Vertiefung:** Warum Zugriffsrechte immer vor der Suche gefiltert werden und nie im System-Prompt stehen: [docs/decisions.de.md](../../docs/decisions.de.md#pre-filter). Ein Chunk, der nie im Prompt steht, kann auch nicht herausgelockt werden. Wie Rechte in Produktion in die Metadaten kommen: [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion).

## Teil 4 – Schwellenwert

**In einem Satz:** Ein Schwellenwert lässt nur Chunks mit einer Mindest-Ähnlichkeit durch; die Zahl der Treffer ist offen, auch null.

**Ablauf**

1. **Kandidaten** (KERN 1). Für jede Frage in `QUESTIONS` die besten `MAX_K` Chunks wie in Teil 1. `MAX_K` bleibt als Obergrenze, damit ein zu niedriger Wert den Prompt nicht sprengt.
2. **Die Regel** (KERN 2). Ein Chunk bleibt, wenn seine Ähnlichkeit mindestens so hoch ist wie der Schwellenwert. Je Wert in `THRESHOLDS` zeigt die Tabelle eine Spalte `keep` oder `–`.
3. **Leere Liste** (KERN 3). Bleibt nichts übrig, gibt es keinen Kontext. Die Anwendung sollte dann "steht nicht in den Dokumenten" antworten, statt aus unpassendem Kontext zu raten.

**Das siehst du**

```text
Candidates for “Wie begrenze ich Prompt Injection?”: top 5 by similarity
│ rank │ similarity │ ≥ 0.5  │ ≥ 0.82 │ ≥ 0.88 │ file                           │ section                                   │
│ 1    │ '0.885'    │ 'keep' │ 'keep' │ 'keep' │ '01-llm01-prompt-injection.md' │ '… › 1. Begrenzen Sie das Modellverhalten' │
│ 2    │ '0.881'    │ 'keep' │ 'keep' │ 'keep' │ '01-llm01-prompt-injection.md' │ '… › 5. Fordern Sie manuelle Freigabe …'   │
│ 3    │ '0.879'    │ 'keep' │ 'keep' │ '–'    │ '01-llm01-prompt-injection.md' │ '… › Direkte Prompt Injections'           │
│ …
Threshold 0.5: 5 of 5 candidates
Threshold 0.82: 5 of 5 candidates
Threshold 0.88: 2 of 5 candidates
Candidates for “Wie wird das Wetter morgen?”: top 5 by similarity
│ 1    │ '0.790'    │ 'keep' │ '–'    │ '–'    │ '00-vorwort-der-projektleiter.md' │ 'Das deutsche Übersetzungsteam' │
│ …
│ 5    │ '0.781'    │ 'keep' │ '–'    │ '–'    │ '02-llm02-offenlegung-sensibler-informationen.md' │ 'Referenzlinks' │
Threshold 0.5: 5 of 5 candidates
Threshold 0.82: 0 of 5 candidates – no context, the application should answer “not in the documents”
Threshold 0.88: 0 of 5 candidates – no context, the application should answer “not in the documents”
```

**Was bedeutet das?**

- Bei `≥ 0.88` fällt schon Rang 3 heraus, obwohl er nur 0,002 unter Rang 2 liegt und ebenso zum Thema passt. Ein zu hoher Wert verwirft gute Treffer.
- Die Wetterfrage bekommt mit Top-k fünf Treffer mit Ähnlichkeiten nahe 0,8. Ohne Schwellenwert kämen sie in den Prompt.
- Die Zeile "no context" ist das gewünschte Ergebnis: lieber keine Antwort als eine aus unpassendem Kontext.
- Ein Wert wie 0,5, der bei anderen Modellen sinnvoll sein kann, lässt bei E5 alles durch.

**Probier aus:** die Aufgaben im Kopf von `04-score-threshold.ts`. Achte auf den Abstand zwischen der schlechtesten `keep`-Zeile der ersten Frage und der besten Zeile der zweiten.

**Stolperfallen**

- Ein Schwellenwert gilt nur für ein Embedding-Modell und eine Art von Texten. Mit einem anderen Modell musst du neu messen.
- Liegen Fragen mit und ohne Antwort nah beieinander, trennt kein Wert sie sauber: Ein hoher Wert verwirft gute Treffer, ein niedriger lässt Rauschen durch. Dann braucht es eine zweite Prüfung, etwa ein Modell, das sagt, wenn der Kontext die Frage nicht beantwortet (Lektion 07).
- Ein Schwellenwert ist eine Qualitätsregel, kein Schutz. Er hält keine internen Chunks zurück (dafür ist Teil 3 da). Wer einen Text in den Index schmuggelt, kann ihn der erwarteten Frage sehr ähnlich machen.

**Wenn es hakt:** dieselben Meldungen wie in Teil 1.

> **Vertiefung:** In der Praxis kombiniert man Schwellenwert und Top-k: Top-k begrenzt die Länge, der Schwellenwert die Qualität. Wie man einen Wert je Modell und Textart kalibriert, steht in [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion). Teil 5 macht den ersten Schritt dazu.

## Teil 5 – Alle Strategien im Vergleich (`99-full-demo.ts`)

**In einem Satz:** Teil 5 wendet alle Strategien auf dieselbe Frage an und misst den Schwellenwert an einem Fragen-Set aus, statt ihn zu raten.

Die Datei heißt `99-full-demo.ts`, ist aber Teil 5 und startet mit `npm run l05:5`.

**Fragen-Set:** [`question-set.json`](question-set.json) enthält Fragen, die der Korpus beantwortet, je mit ihren erwarteten Dokumenten (`expectedSources`), und eine Frage ohne Antwort (`withoutSource`). Lektion 08 misst an derselben Datei.

**Ablauf**

1. **Top-k** (KERN 1), dazu die Spanne der Ähnlichkeiten.
2. **MMR** (KERN 2) über die besten `FETCH_K` Kandidaten.
3. **Metadaten-Filter** (KERN 3): Top-k nur über Chunks, deren Metadaten zu `FILTER` passen.
4. **Schwellenwert** (KERN 4): von den Top-k-Treffern nur die mit mindestens `THRESHOLD`.
5. **Parent-Document** (KERN 5) aus Lektion 04, Teil 5: in Kindern von etwa `CHILD_SIZE` Zeichen suchen, den ganzen Abschnitt liefern.
6. **Kalibrieren** (KERN 6): für jede Frage des Fragen-Sets die beste Ähnlichkeit in den erwarteten Dokumenten und in allen anderen, und ob der beste Treffer `THRESHOLD` erreicht.

**Das siehst du**

```text
Index: 199 chunks from …/indexes/headings__text-embedding-multilingual-e5-base.json
199 parents → 357 children of about 300 characters
1. Top 5 for “Welche Maßnahmen schützen vor Prompt Injection?”:
│ rank │ similarity │ access group │ file                           │ section                                      │ characters │
│ 1    │ '0.896'    │ 'public'     │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien'      │ 428        │
│ …
Similarity of the top 5: min 0.879 / average 0.886 / max 0.896
2. MMR with lambda 0.5 from the top 20:
│ …
│ 5    │ '0.861'    │ 'public'     │ '07-llm07-offenlegung-des-system-prompts.md' │ '… › 1. Trennen Sie sensible Daten vom System Prompt' │ 443 │
3. Filter {"accessGroup":"public","version":"2025"} (194 of 199 chunks), top 5:
│ …
4. Threshold 0.83: 5 of 5 hits remain
│ …
5. Parent-document: children searched, 5 parents delivered from the top 20 children
│ 1    │ '0.896'    │ 'public'     │ '01-llm01-prompt-injection.md' │ 'Beschreibung'                                │ 1843       │
│ …
Calibration with …/lessons/05-retrieval-strategies/question-set.json (best similarity per question):
│ id          │ best expected │ best elsewhere │ answers │ question                                                      │
│ 'F-00'      │ '0.911'       │ '0.870'        │ true    │ 'Was ist neu in den OWASP Top 10 für LLM-Anwendungen 2025?'  │
│ 'F-01'      │ '0.896'       │ '0.861'        │ true    │ 'Welche Maßnahmen schützen vor Prompt Injection?'            │
│ …
│ 'no-source' │ '–'           │ '0.825'        │ false   │ 'Wie richte ich eine Firewall unter Linux ein?'               │
```

**Was bedeutet das?**

- Alle Strategien nutzen denselben Fragevektor. Die Unterschiede in den fünf Tabellen kommen nur aus der Auswahl.
- Die Spalte `characters` zeigt, wie viel Text eine Strategie in den Prompt gäbe. Beim Parent-Document ist das der ganze Abschnitt, nicht das gefundene Kind.
- `best expected` ist die beste Ähnlichkeit in den Dokumenten, in denen die Antwort steht; `best elsewhere` die beste in allen anderen. Ist die zweite höher, liegt ein fremdes Dokument näher an der Frage.
- `answers` entscheidet der beste Treffer, egal aus welchem Dokument. Die Kalibrierung fragt nur, ob die Anwendung antworten würde, nicht, ob sie das richtige Dokument fände.
- Die Frage ohne Quelle hat keine erwarteten Dokumente, deshalb `–`. Der Standard von `THRESHOLD` liegt knapp über ihrem `best elsewhere`.

**Probier aus:** die Aufgaben im Kopf von `99-full-demo.ts`. Achte in der Kalibrierung auf Zeilen, in denen `best elsewhere` größer ist als `best expected`.

**Stolperfallen**

- Die Tabelle des Filters gleicht hier der von Top-k. Das ist richtig: Die besten fünf Chunks sind ohnehin öffentlich und aus der Ausgabe 2025. Der Filter wirkt erst, wenn ein gesperrter Chunk vorn stünde.
- Teil 5 lädt den ganzen Index, auch interne Chunks, damit der Filter etwas zu tun hat. Kein Chunk-Text geht an ein Sprachmodell; die Ausgabe ist eine Lehrausgabe.
- Die Fragen werden mit `embedDocuments` eingebettet, aber mit dem Präfix `query: `. Bei E5 entscheidet das Präfix, ob ein Text als Frage gilt, nicht die Methode.
- Liegt die Frage ohne Antwort nur knapp unter den anderen, ist die Schwelle eine Wette: Eine neue, etwas andere Frage kann auf der falschen Seite landen.
- `question-set.json` ist geteilt. Änderst du sie, ändern sich auch die Messungen in Lektion 08.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Cannot load the question set …/question-set.json. Check its JSON and fields.` | Die Datei ist kein gültiges JSON oder ein Feld fehlt. Die Ursache steht in der Zeile darunter (`cause`). Zurück zum Original: `git checkout -- lessons/05-retrieval-strategies/question-set.json`. |
| Meldungen zum Index | wie in Teil 1 |

> **Vertiefung:** Die Kalibrierung prüft nur, ob der beste Treffer die Schwelle erreicht. Ob das richtige Dokument unter den Top-k steht, misst [Lektion 08](../08-evaluations/GUIDE.de.md), Teil 1 am selben Fragen-Set (Trefferquote und MRR). Wie groß ein Fragen-Set in Produktion sein sollte: [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion).

## Das nimmst du mit

1. Top-k schneidet nach Rang, nicht nach Qualität. Es liefert immer k Chunks, auch wenn keiner passt.
2. Zugriffsrechte gehören in einen Filter vor der Suche, nicht in den Prompt und nicht hinter die Suche.
3. Einen Schwellenwert misst du an Fragen mit und ohne Antwort aus. Er gilt nur für ein Modell und einen Korpus.

## Weiter geht's

- [Lektion 06 – Hybrid-Suche und Reranking](../06-hybrid-rerank/README.de.md) lädt die Indizes in Qdrant und ergänzt die Vektorsuche um Stichwortsuche (BM25), Fusion und ein Sprachmodell, das Treffer bewertet.
- [Lektion 07](../07-rag-open-webui/README.de.md) gibt die gefundenen Chunks dem Sprachmodell als Kontext; Teil 5 bis 7 dort nutzen MMR, Filter und Schwellenwert aus dieser Lektion.
- [Lektion 08](../08-evaluations/README.de.md) misst die Suche am Fragen-Set aus Teil 5.
- Den Datenfluss über alle Lektionen beschreibt [docs/architecture.de.md](../../docs/architecture.de.md).
