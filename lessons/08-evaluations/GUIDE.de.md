# Lektion 08 – Evaluierung: Guide

*English version: [GUIDE.md](GUIDE.md)* · Überblick und Start: [README.de.md](README.de.md)

## Worum geht's?

Bis Lektion 07 hast du Suche und Antworten nach Augenmaß eingestellt: eine Frage, eine Tabelle, ein Eindruck. Jetzt misst du. Die Suche misst du mit zwei Zahlen und ohne Sprachmodell. Die Antworten prüft ein Sprachmodell als Judge (Prüfer). Das ist wie beim Kochen: Erst wenn du abwiegst, merkst du, ob die neue Zutat das Gericht besser macht oder nur anders.

## Wo stehen wir?

```
Lektion 04      Lektion 05       Lektion 06/07                 Lektion 08
Chunks/Index ─► Suche (Top-k) ─► Antwort (RAG, Fassade) ─────► ► MESSEN ◄
                  ▲                 ▲                ▲
                  Teil 1, 4         Teil 2, 3        Teil 6 (über die API)
                  └──── Teil 5: alle Chunking-Strategien auf einmal ────┘
```

## Neue Begriffe

| Begriff | In einem Satz | Beispiel |
|---|---|---|
| Trefferquote (Hit Ratio) | Anteil der Fragen, bei denen ein erwartetes Dokument unter den Top-k steht. | 11 von 12 Fragen → 0,92 |
| MRR (Mean Reciprocal Rank) | Mittelwert von 1 / Rang des ersten Treffers; ein Fehltreffer zählt 0. | Ränge 1, 2, 0 → (1 + 0,5 + 0) / 3 = 0,50 |
| Quellentreue (Faithfulness) | Jede Aussage der Antwort ist durch den gelieferten Kontext gedeckt. | "Firewall vor dem Modell" steht nicht im Kontext → nicht treu |
| Korrektheit (Correctness) | Die Antwort enthält die erwartete Kernaussage (`keyPoint`), sinngemäß und ohne Widerspruch. | F-01 erwartet sieben Maßnahmen |
| LLM-as-a-Judge | Ein Sprachmodell bewertet die Ausgabe eines Sprachmodells, erst Begründung, dann Urteil. | `{"reasoning": "…", "verdict": "no"}` |
| Gegenprobe | Eine absichtlich falsche Antwort, die der Judge ablehnen muss. | `INVENTED_ANSWER`, `HONEST_NO` |
| Regression | Eine Änderung, die einen Messwert verschlechtert; sichtbar nur im Vergleich mit dem Vorlauf. | `TOP_K` 5 → 3 senkt die Trefferquote |

## Vorher prüfen

- [ ] LM Studio läuft mit gestartetem Server und geladenem E5-Modell.
- [ ] Für Teil 2, 3, 5 und 6: Das Chat-Modell (`REMOTE_MODEL_NAME`) ist geladen.
- [ ] Chunks und Überschriften-Index existieren: `npm run l04:0`, dann `npm run l04:2`.
- [ ] Für Teil 5 zusätzlich `npm run l04:1`, `npm run l04:3` und `npm run l04:4`.
- [ ] Für Teil 6: Qdrant läuft, die Collection ist geladen (`npm run l06:1`), und die Fassade läuft in einem zweiten Terminal (`npm run l07:11`).
- [ ] Für Teil 5 und 6: Das Chat-Modell ist in LM Studio mit Parallel 1 geladen (im Developer-Tab in den Einstellungen des Modells, oder `lms load qwen3.5-4b --parallel 1`). Mit dem Standard von LM Studio (Parallel 4) scheitern Aufrufe mit `Context size has been exceeded`.
- [ ] `SHOW_THINKING` in `.env` ist leer oder `false`. Ein Reasoning-Modell schreibt vor der Antwort Denkschritte; mit `true` stehen sie vor jedem JSON des Judge, und es gibt kein Urteil.

Alle Ausgaben in diesem Guide: gemessen am 2026-11-13 mit LM Studio, `qwen3.5-4b` (Chat-Modell und Judge) und `text-embedding-multilingual-e5-base` (Workshop-Standard). Mit einem anderen Modell weichen die Zahlen ab; Antworten und Urteile schwanken auch zwischen zwei Läufen.

Alle Prompts sind deutsch. Für englische Antworten ändere in `ANSWER_SYSTEM_PROMPT` (in `evaluation.ts`) "auf Deutsch" in "in English"; `QUESTION` und `INVENTED_ANSWER` in Teil 2 darfst du durch englischen Text ersetzen. Der Judge antwortet in jedem Fall mit `yes` oder `no`. Seine Begründung ist in Teil 2 und 3 meist deutsch, bei `correct` in Teil 5 meist englisch (promptfoo stellt die Rubrik in einen englischen Prompt). E5 ist mehrsprachig, eine englische Frage sollte also deutsche Abschnitte finden (nicht gemessen).

## Teil 1 – Trefferquote und MRR

**In einem Satz:** Du misst die Suche an zwölf Fragen mit bekannten Quelldokumenten, ohne ein einziges Chat-Modell.

**Ablauf** (`// KERN 1–4` in `01-hitratio-mrr.ts`)

1. **Suchen:** Jede Frage wird eingebettet (mit E5-Präfix `query: `) und gegen den Index gerankt. Ein Embedding je Frage, kein Chat-Aufruf. Das ist billig, wiederholbar und in einer Sekunde fertig.
2. **Rang:** Gezählt wird der Platz des ersten Chunks aus einem erwarteten Dokument (`expectedSources`), ab 1. Rang 0 heißt: keiner der Top-k stammt daher.
3. **Kennzahlen:** Trefferquote = Fragen mit Rang > 0 / alle Fragen. MRR = Mittelwert von 1 / Rang. Rang 1 zählt 1, Rang 2 zählt 0,5, Rang 5 zählt 0,2.
4. **Frage ohne Quelle:** `withoutSource` hat kein erwartetes Dokument und damit keinen Rang. Sie zählt in keiner Zahl mit.

**Das siehst du** (gekürzt; Überschriften-Index, `TOP_K` 5)

```
Index: 199 chunks from …/indexes/headings__text-embedding-multilingual-e5-base.json
Retrieval over 12 questions, top-5:
│ 'F-00' │ 1 │ '00-vorwort-der-projektleiter, 00-vorwort-der-projektleiter, …'
│ 'F-05' │ 0 │ '09-llm09-fehlinformationen, 10-llm10-unbegrenzter-verbrauch, …'
│ 'F-09' │ 3 │ '06-llm06-uebermaessige-handlungsfreiheit, 05-llm05-…, 09-llm09-fehlinformationen, …'
│ … (alle übrigen Fragen: Rang 1)
Hit ratio: 0.92 · MRR: 0.86
Without source (no-source): best similarity 0.825; excluded from hit ratio and MRR.
```

**Was bedeutet das?**

- 11 von 12 Fragen haben einen Treffer. Nur F-05 findet ihr Dokument nicht unter den Top 5.
- Der MRR (0,86) liegt unter der Trefferquote (0,92), weil F-09 auf Rang 3 steht. Sind beide Zahlen gleich, steht jeder Treffer auf Platz 1.
- Zwölf Fragen sind eine kleine Stichprobe. Eine einzige Frage verschiebt die Trefferquote um 1/12 ≈ 0,08.
- Gemessen wird das Dokument, nicht der Abschnitt. Ein Treffer im richtigen Dokument kann trotzdem der falsche Chunk sein.
- Die Frage ohne Quelle erreicht eine Ähnlichkeit von 0,825. Echte Treffer liegen kaum höher (Spalte `similarity` in Teil 2). Solche Fragen fängt nur der Schwellenwert ab (Lektion 05, Teil 4), nicht die Rangfolge.

**Probier aus:** die Aufgaben im Dateikopf von `01-hitratio-mrr.ts`. Achte bei Aufgabe 2 auf den Abstand zwischen den beiden Zahlen.

**Stolperfallen**

- F-11 erwartet den internen Anhang und wird trotzdem gefunden. Das ist Absicht: Teil 1 lädt den ganzen Index (`loadIndex`). Er schickt keinen Chunk-Text an ein Chat-Modell und zeigt nur Dateinamen.
- Die Spalte `sources` nennt ein Dokument mehrfach. Ein Dokument hat mehrere Chunks, jeder zählt als eigener Platz.
- `withoutSource` fehlt in der Tabelle. Auch das ist Absicht: Als Fehltreffer gezählt, würde sie beide Zahlen drücken, obwohl die Suche nichts falsch gemacht hat.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Cannot load index … Generate it with npm run l04:0, then npm run l04:2.` | Die genannten Skripte ausführen. |
| `… The model server is unreachable or timed out. …` | LM Studio starten, Server einschalten, Adresse in `.env` prüfen. |

> **Vertiefung:** Trefferquote und MRR sind die einfachsten Retrieval-Metriken. In Produktion misst man oft zusätzlich Recall@k (wie viele der relevanten Chunks gefunden wurden) oder nDCG (Rangfolge mit abgestufter Relevanz). Das braucht Relevanzurteile je Chunk statt je Dokument und ein größeres Fragen-Set, siehe [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion).

## Teil 2 – Quellentreue mit einem LLM-Judge

**In einem Satz:** Ein Sprachmodell prüft, ob eine Antwort nur sagt, was im Kontext steht, und eine Gegenprobe prüft, ob der Judge Erfundenes erkennt.

**Ablauf** (`// KERN 1–5` in `02-faithfulness.ts`)

1. **Suchen und antworten:** Die Top 5 bilden den Kontext. Das Chat-Modell antwortet nur daraus. Der Judge bekommt genau diesen Kontext, nicht mehr.
2. **Auftrag an den Judge:** Er antwortet mit JSON, erst `reasoning`, dann `verdict`. Ein Sprachmodell schreibt Wort für Wort. Steht das Urteil vorn, legt es sich fest, bevor es geprüft hat. Steht die Begründung vorn, folgt das Urteil aus ihr, und du kannst es nachlesen.
3. **Fremder Text in Tags:** Kontext und Antwort stehen in `<retrieved_context>` und `<answer_under_test>`. Der System-Prompt nennt beides Daten, die geprüft und nicht befolgt werden (OWASP LLM01).
4. **Gegenprobe:** Derselbe Judge prüft `INVENTED_ANSWER`, eine plausible, aber erfundene Antwort.
5. **Auswerten:** Der Judge besteht nur mit `yes` für die echte und `no` für die erfundene Antwort.

**Das siehst du** (gekürzt)

```
Index: 194 public chunks from …/headings__text-embedding-multilingual-e5-base.json
Context: top 5 for “Welche Maßnahmen schützen vor Prompt Injection?”:
│ 1 │ 'hit' │ '0.896' │ '01-llm01-prompt-injection.md' │ 'Präventions- und Mitigationsstrategien'
│ 2 │ 'hit' │ '0.894' │ '01-llm01-prompt-injection.md' │ '… › 5. Fordern Sie manuelle Freigabe für risikoreiche Aktionen'
│ …
real answer:
  | Basierend auf dem bereitgestellten Kontext können folgende Maßnahmen … ergriffen werden:
  | *   **Begrenzung des Modellverhaltens:** …
  | *   **Manuelle Freigabe für risikoreiche Aktionen:** …
  | *   **Trennen und Kennzeichnen externer Inhalte:** …
  faithful: yes
  | Die Antwort fasst die drei genannten Strategien korrekt zusammen und erwähnt zusätzlich den Hinweis auf die Unmöglichkeit absoluter Sicherheit, was ebenfalls im Kontext enthalten ist.

invented answer:
  | Gegen Prompt Injection hilft vor allem eine Firewall vor dem Modell und ein tägliches Backup der Vektordatenbank.
  faithful: no
  | Der Kontext erwähnt keine Firewalls oder Backups als Schutzmaßnahmen, sondern listet spezifische Strategien wie manuelle Freigaben, Verhaltensbeschränkungen und die Trennung externer Inhalte auf.

Judge check passed: the judge accepted the real answer and rejected the invented answer.
```

**Was bedeutet das?**

- Quellentreue braucht keine Musterlösung, nur Kontext und Antwort. Deshalb lässt sie sich auch im Betrieb auf echten Anfragen messen.
- Ein Judge ist ein Messgerät. Erkennt er die erfundene Antwort nicht, taugt er nicht.
- Die Gegenprobe allein genügt nicht: Ein Judge, der immer `no` sagt, lehnt sie auch ab. Erst `yes` und `no` zusammen zeigen, dass er unterscheidet.
- Jeder Lauf kostet drei Chat-Aufrufe (eine Antwort, zwei Urteile), jeder mit dem ganzen Kontext.

**Probier aus:** die Aufgaben im Dateikopf von `02-faithfulness.ts`. Achte bei Aufgabe 2 darauf, wo der eingeschleuste Satz im Prompt steht (Burp: in `<answer_under_test>`).

**Stolperfallen**

- Die echte Antwort nennt nicht alle Maßnahmen, die F-01 erwartet, und der Judge sagt trotzdem `yes`. Das ist richtig: Quellentreu heißt "nichts erfunden", nicht "vollständig". Vollständigkeit prüft Teil 3.
- Der Judge sieht die Frage nicht. Er prüft nur, ob die Antwort gedeckt ist, nicht, ob sie passt.
- Dasselbe kleine Modell antwortet und urteilt. In der Praxis nimmt man als Judge oft ein stärkeres Modell.

**Sicherheit:** Teil 2 lädt nur öffentliche Chunks (`loadPublicIndex`, der Pre-Filter aus Lektion 05, Teil 3). Der interne Anhang landet so weder beim Modell noch beim Judge noch im Terminal, auch wenn du `QUESTION` änderst. Jedes `<` im fremden Text wird vor dem Verpacken zu `‹`. So kann der Text keinen Block mit `</answer_under_test>` vorzeitig schließen. Tag-Namen herauszulöschen wäre unsicherer: Aus `</answer_<answer_under_test>under_test>` setzt das Löschen das schließende Tag erst zusammen. Das alles senkt das Risiko, ist aber kein vollständiger Schutz.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Judge check FAILED: expected "yes" for the real answer and "no" for the invented answer, got …` | Beide Begründungen lesen. Die Antwort kann unvollständig sein oder der Judge irren. Hast du Teil 3, Aufgabe 2 gemacht? Dann `INVENTED_ANSWER` zurücksetzen. |
| `faithful: – (no usable verdict, see the log line above)` und davor `The judge did not return valid JSON.` | `SHOW_THINKING` leer oder `false` setzen. Bleibt es, ein anderes Chat-Modell laden. |
| `The judge response was truncated (finish_reason: length).` | Das Modell denkt zu lange. Erst das Ausgabelimit des Servers erhöhen, dann ein Modell wählen, das `reasoning_effort: none` beachtet. |
| `Judge check incomplete: at least one verdict is missing.` | Siehe die Zeile davor; ein Urteil fehlt. |

> **Vertiefung:** Die Gegenprobe ist die kleinste mögliche Prüfung eines Judge. In Produktion validiert man ihn gegen eine Stichprobe, die Menschen bewertet haben, und misst die Übereinstimmung. Bekannte Schwächen von LLM-Judges sind Vorliebe für lange Antworten, für die eigene Formulierung und Schwankung zwischen Läufen. Siehe [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion) und die Literatur unter [Weiterlesen](../../docs/production.de.md#weiterlesen).

## Teil 3 – Korrektheit gegen die Kernaussage

**In einem Satz:** Ein Judge prüft, ob die Antwort die erwartete Kernaussage enthält, und ein ehrliches "Ich finde nichts" muss er ablehnen.

**Ablauf** (`// KERN 1–5` in `03-correctness.ts`)

1. **Suchen mit Unterabschnitten:** Zu den Top 5 kommen ihre Unterabschnitte aus demselben Dokument (`EXPAND_SECTIONS`, begrenzt). Aufzählungen stehen oft dort. Das ähnelt dem Parent-Document-Retriever (Lektion 04, Teil 5), nur in die andere Richtung.
2. **Auftrag an den Judge:** "sinngemäß", weil die Kernaussage eine Stichpunktliste ist. "ohne Widerspruch" fängt Antworten, die die Punkte nennen und Falsches dazusagen. "Ich finde nichts" ist nicht korrekt, außer bei F-10 ("OWASP nennt keine Zahlen").
3. **Referenz und fremder Text:** Frage und Kernaussage kommen aus `question-set.json` und stehen als Referenz in `<question>` und `<expected_key_point>`. Nur die Antwort ist fremder Text. Der Judge sieht keinen Kontext.
4. **Gegenprobe:** `HONEST_NO` ("Ich finde dazu nichts im Korpus.") ist quellentreu, aber nicht korrekt.
5. **Auswerten:** wie in Teil 2.

**Das siehst du** (gekürzt)

```
F-01: Welche Maßnahmen schützen vor Prompt Injection?
Expected key point: Modellverhalten begrenzen, Ausgabeformate validieren, Ein-/Ausgabefilter, geringste Rechte, manuelle Freigabe, externe Inhalte kennzeichnen, adversarial Tests
Context: top 5 expanded to 9 chunks for “Welche Maßnahmen schützen vor Prompt Injection?”:
│ 1  │ 'hit'              │ '0.896' │ … │ 'Präventions- und Mitigationsstrategien'
│ …
│ 5  │ 'hit'              │ '0.879' │ … │ '… › 6. Trennen und kennzeichnen Sie externe Inhalte'
│ '' │ 'subsection of #1' │ '0.878' │ … │ '… › 2. Definieren und validieren Sie erwartete Ausgabeformate'
│ '' │ 'subsection of #1' │ '0.870' │ … │ '… › 3. Implementieren Sie Filter für Ein- und Ausgaben'
│ …
real answer:
  | 1.  **Begrenzen Sie das Modellverhalten:** … (sieben Punkte) …
  correct: yes
  | Die Antwort listet alle in den erwarteten Punkten genannten Maßnahmen auf und formuliert sie korrekt.
honest no:
  | Ich finde dazu nichts im Korpus.
  correct: no
Judge check passed: the judge accepted the real answer and rejected the honest no.
```

**Was bedeutet das?**

- Korrektheit braucht eine Referenz, Quellentreue nicht. Korrektheit misst du deshalb an einem Fragen-Set mit bekannten Antworten, vor dem Betrieb und nach jeder Änderung.
- Mit den Unterabschnitten stehen alle Punkte der Aufzählung im Kontext, und die Antwort nennt alle sieben Maßnahmen.
- Erst alle Messungen zusammen erklären einen Fehler: der Rang aus Teil 1, die Quellentreue aus Teil 2 und die Korrektheit hier.

**Probier aus:** die Aufgaben im Dateikopf von `03-correctness.ts`. Aufgabe 2 ändert eine **andere Datei** (`02-faithfulness.ts`); setz sie danach zurück, sonst meldet Teil 2 `Judge check FAILED`. Achte bei Aufgabe 3 auf die Spalte `via` und auf die Begründung des Judge.

**Stolperfallen**

- Die Zeilen mit `subsection of #1` haben keinen Rang. Sie sind keine Treffer der Suche, sondern mitgeliefert.
- Teil 3 meldet `Judge check passed`, aber in Teil 5 scheitert F-01 bei `corpus:headings`. Teil 5 nimmt keine Unterabschnitte mit; siehe [FAQ](FAQ.de.md#häufige-fragen).

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Question F-xx is not in question-set.json. Use an id such as F-01.` | `QUESTION_ID` auf eine vorhandene ID setzen. |
| `Judge check FAILED: … got "no" and "no".` | Begründung lesen: Welche Punkte fehlen, und stehen sie im Kontext (Tabelle oben)? |

> **Vertiefung:** Ein Fragen-Set mit Kernaussagen heißt in der Praxis "Golden Set". Es wächst mit jedem Fehler aus dem Betrieb um eine Frage. Warum zwölf Fragen nur für den Workshop reichen, steht in [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion). Warum Teil 3 Unterabschnitte dazunimmt: [docs/decisions.de.md](../../docs/decisions.de.md#expand-sections).

## Teil 4 – Regression

**In einem Satz:** Jede Messung wird gespeichert, und der nächste Lauf zeigt die Differenz zum vorigen.

**Ablauf** (`// KERN 1–4` in `04-regression.ts`)

1. **Vorlauf laden:** die jüngste Datei in `results/lesson-08-regression/`, vor der Messung. Ist sie kaputt, bricht das Programm ab, bevor es Anfragen schickt.
2. **Messen und festhalten, womit:** dieselbe Rechnung wie Teil 1 (`measureRetrieval`). Jeder Lauf speichert Embedding-Modell, Index, `TOP_K` und Zahl der Fragen mit.
3. **Vergleichbarkeit prüfen:** Unterscheiden sich die Läufe in Embedding-Modell, Index oder Zahl der Fragen, warnt das Programm. Dann misst die Differenz mehrere Änderungen auf einmal.
4. **Regression melden:** Sinkt eine Kennzahl um mehr als `TOLERANCE`, meldet das Programm sie. Danach speichert es den Lauf.

Der erste gespeicherte Lauf ist die **Baseline** (Ausgangsmessung).

**Das siehst du**

Beim ersten Lauf gibt es keinen Vorlauf. Das Programm meldet `No previous run in …; this run becomes the baseline.`, nennt Trefferquote und MRR und speichert den Lauf. Ab dem zweiten Lauf vergleicht es. Hier ein Lauf, dessen Vorlauf noch mit einem anders geschnittenen Überschriften-Index gemessen wurde (gekürzt):

```
Previous run: …/results/lesson-08-regression/2026-11-13T04-24-52.430Z.json
│ 'top-k'     │ 5      │ 5      │ 'unchanged' │
│ 'questions' │ 12     │ 12     │ 'unchanged' │
│ 'hit ratio' │ '0.83' │ '0.92' │ '+0.08'     │
│ 'MRR'       │ '0.79' │ '0.86' │ '+0.07'     │
No regression: no measure dropped compared with the previous run.
Saved: …/results/lesson-08-regression/2026-11-13T09-13-12.344Z.json
```

**Was bedeutet das?**

- Beide Kennzahlen stiegen, weil sich die Chunks geändert hatten. Eine Steigerung ist keine Regression.
- Die Suche ist deterministisch. Ohne Änderung kommen dieselben Zahlen heraus, also kommt jede Differenz von einer Änderung.
- Eine einzelne Zahl sagt wenig. Ob 0,92 gut ist, zeigt erst der Vergleich.
- In einer Build-Pipeline (CI) würde eine Regression den Build scheitern lassen. Hier ist sie ein Messergebnis, und das Programm endet normal.

**Probier aus:** die Aufgaben im Dateikopf von `04-regression.ts`. Achte bei Aufgabe 2 auf die letzte Zeile (`Regression` oder `No regression`), bei Aufgabe 3 auf die Zeile über der Tabelle.

**Stolperfallen**

- Eine Änderung von `TOP_K` löst keine Warnung aus. Das ist Absicht: Genau das willst du vergleichen. Die Tabelle zeigt es trotzdem.
- Auch ein neu gebauter Index löst keine Warnung aus. Verglichen wird der Name der Strategie (`INDEX_STRATEGY`), nicht der Inhalt des Index. Hast du in Lektion 04 neu geschnitten, misst die Differenz die neuen Chunks, wie in der Ausgabe oben.
- `results/` steht in `.gitignore`. Die Läufe gehören zu deinem Rechner, wie die Indizes.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `Cannot read the previous run … Delete the file and run again.` | Genau diese eine Datei löschen, nicht den Ordner. |
| `The previous run … has an unexpected shape. Delete the file and run again.` | Ebenso; die Datei wurde von Hand geändert oder stammt aus einer alten Fassung. |

> **Vertiefung:** Mit zwölf Fragen ist eine Differenz von 0,08 eine einzige Frage. In Produktion vergleicht man deshalb größere Sets, wiederholt Messungen mit Sprachmodell mehrmals und legt Schwellen fest, ab denen ein Build scheitert. Siehe [docs/production.de.md](../../docs/production.de.md#workshop-vereinfachung--in-produktion).

## Teil 5 – Chunking-Strategien mit promptfoo

**In einem Satz:** promptfoo stellt jede Frage an jede Chunking-Strategie und zeigt Trefferquote, MRR, Quellentreue und Korrektheit in einer Tabelle.

[promptfoo](https://www.promptfoo.dev/) ist ein Testwerkzeug für LLM-Anwendungen. Es wird mit `npm ci` installiert. Teil 5 und 6 sind keine Programme, sondern Konfigurationen (YAML).

| Begriff (promptfoo) | In einem Satz |
|---|---|
| Testfall | Eine Frage mit erwarteten Dokumenten und Kernaussage ([`promptfoo-testcases.ts`](promptfoo-testcases.ts)). |
| Provider | Das geprüfte System, hier eine Chunking-Strategie. Nicht dasselbe wie ein API-Anbieter. |
| Assertion (Prüfung) | Eine Regel je Antwort. `javascript` rechnet fest, `llm-rubric` und `faithful` fragen einen Judge. |
| Rubrik | Die Anweisung an den Judge in `llm-rubric`. |
| Zelle | Ein Paar aus Frage und Provider: 11 Fragen × 4 Strategien = 44 Zellen. |

**Ablauf** (`# KERN 1–6` in `05-promptfoo-strategies.yaml`)

1. **Provider:** je Strategie einer. Alle nutzen denselben Assistenten ([`promptfoo-assistant.ts`](promptfoo-assistant.ts), die Pipeline aus Lektion 07). Nur der Index wechselt.
2. **Testfälle:** das Fragen-Set aus Lektion 05 ohne F-11. Deren Antwort steht nur im internen Anhang, den der Assistent nie durchsucht.
3. **Judge-Block:** das Chat-Modell aus `.env` über LM Studio, für `correct` und `faithful`.
4. **Suche ohne Sprachmodell:** `source-hit` (Mittelwert = Trefferquote) und `mrr` (Mittelwert = MRR), aus den Metadaten des Providers.
5. **Quellentreue:** `faithful` zerlegt die Antwort in Aussagen und prüft jede gegen den Kontext. Der Wert ist der Anteil der gedeckten Aussagen, die Schwelle 1.
6. **Korrektheit:** `correct` vergleicht die Antwort mit der Kernaussage, wie Teil 3.

**Das siehst du**

Der Probelauf (`npm run l08:5 -- --filter-first-n 1`) stellt nur die erste Frage an alle vier Provider. Das Terminal zeigt dann eine Zeile der Tabelle und darunter die Summe. Wie Tabelle und Summe beim vollen Lauf aussehen, zeigt der Messlauf unten. Ist ein Test gescheitert, endet npm mit Exit-Code 100 (normal, siehe Stolperfallen). Welche Prüfung in einer roten Zelle scheiterte, zeigt der HTML-Bericht.

### Messlauf 2026-11-13

Der volle Lauf `npm run l08:5` (44 Zellen; LM Studio auf einer RTX 3080 Ti, `qwen3.5-4b` als Chat-Modell und Judge, geladen mit Parallel 1 und Kontext 8192; `text-embedding-multilingual-e5-base`) dauerte 6 min 59 s, knapp 10 Sekunden je Zelle. Ergebnis: 10 Zellen bestanden, 29 scheiterten, 5 endeten mit `ERROR`. Mit eigener GPU startest du ihn selbst; sonst zeigt der Trainer den Bericht eines Laufs, den er vorab gestartet hat.

```
Running 44 test cases (up to 1 at a time)...
Assertion grading failed during eval
{
  "error": "Error: judge format error (statement extraction) after 2 attempts: The judge did not return valid JSON.\n    at askWithRetry (…)",
  …
}
…   (ein solcher Block je ERROR-Zelle)
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ query           │ keyPoint        │ expectedSources │ [corpus:prepar… │ [corpus:headin… │ [corpus:semant… │ [corpus:questi… │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ Was ist neu in  │ Unbegrenzter    │ 00-vorwort-der… │ [FAIL] Die      │ [PASS] Die      │ [FAIL] Die      │ [FAIL] Die      │
│ den OWASP Top   │ Verbrauch       │                 │ OWASP Top 10    │ OWASP Top 10    │ OWASP Top 10    │ OWASP Top 10    │
│ …               │ …               │                 │ …               │ …               │ …               │ …               │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┴─────────────────┘
✓ Eval complete (ID: eval-cOV-2026-11-13T09:23:01)
Results:
  ✓ 10 passed (22.73%)
  ✗ 29 failed (65.91%)
  ✗ 5 errors (11.36%)
Duration: 6m 59s (concurrency: 1)
Writing output to results/lesson-08-promptfoo/05-promptfoo-strategies.html
```

| Provider | Zellen bestanden | `source-hit` | `mrr` | `faithful` | `correct` | Fehler |
|---|---|---|---|---|---|---|
| `corpus:prepared` | 2/11 | 0,90 | 0,73 | 0,83 | 0,68 | 1 |
| `corpus:headings` | 3/11 | 0,91 | 0,85 | 0,83 | 0,69 | 0 |
| `corpus:semantic` | 3/11 | 0,90 | 0,83 | 0,85 | 0,55 | 1 |
| `corpus:questions` | 2/11 | 1,00 | 0,92 | 0,92 | 0,69 | 3 |

Die Mittelwerte stehen über die geprüften Zellen; eine Fehler-Zelle hat keine Prüfergebnisse. Bei `corpus:questions` fehlen so drei Fragen (F-05, F-07, F-08). Aus den Metadaten der Antworten über alle elf Fragen nachgerechnet, liegt sein MRR bei 0,89; die Trefferquote bleibt 1,00. Alle fünf Fehler waren `judge format error (statement extraction)` nach zwei Versuchen: Beim Zerlegen der Antwort in Aussagen lieferte der Judge zweimal kein gültiges JSON. Mit einem Judge aus der 4B-Klasse sind solche Einzelfälle zu erwarten. Welche Prüfungen in den roten Zellen scheiterten, schlüsselt das [FAQ](FAQ.de.md#woran-scheitern-die-zellen-wirklich) auf.

**Was bedeutet das?**

- Die meisten roten Zellen kommen von der strengen `faithful`-Schwelle 1 und von `correct` (die Antwort nennt nicht alle Punkte).
- Eine Zelle besteht nur, wenn **alle** vier Prüfungen bestehen. Lies deshalb die Mittelwerte der Metriken, nicht die Zahl der grünen Zellen.
- Warum eine Zelle rot ist und wie du sie liest, erklärt das [FAQ](FAQ.de.md) ausführlich.

**Probier aus:** die Aufgaben im Kopf von `05-promptfoo-strategies.yaml`. Aufgabe 1 und 2 brauchen den vollen Lauf: Die Mittelwerte stehen in der Tabelle des Messlaufs oben, die einzelnen Zellen im Bericht deines vollen Laufs oder dem des Trainers (`results/lesson-08-promptfoo/05-promptfoo-strategies.html`). Aufgabe 3 startet nur eine Zelle (`--filter-first-n 1 --filter-providers headings`).

**Ausgabe lesen:** Am Ende zeigt das Terminal eine Tabelle (Zeile je Frage, Spalte je Provider, Zelle `[PASS]`, `[FAIL]` oder `[ERROR]`). Den HTML-Bericht `results/lesson-08-promptfoo/05-promptfoo-strategies.html` öffnest du direkt im Browser; er zeigt je Zelle die Begründung jeder Prüfung ([`promptfoo-scores.ts`](promptfoo-scores.ts)). Die Mittelwerte je Spalte zeigt `npx promptfoo view` im Spaltenkopf; nach einem Probelauf mit einer Frage sagen sie wenig. Beende den Viewer danach mit Strg+C (siehe README, Datenschutz).

**Stolperfallen**

- `npm run l08:5` endet mit Exit-Code 100, sobald ein Test scheitert, und zeigt bei `ERROR`-Zellen `Assertion grading failed during eval` mit Stacktrace. Das ist kein Absturz; Ergebnisse und Bericht werden geschrieben.
- `mrr` mit 0 zählt als FAIL, jeder Wert über 0 als PASS. Maßgeblich ist der Mittelwert.
- Nach Strg+C erscheinen Zeilen wie `Assertion grading failed … Provider registry is shutting down`. Sie heißen nur: Diese Urteile wurden abgebrochen. `npm run l08:5 -- --resume` setzt fort.
- Hast du in Lektion 04 `FULL_CORPUS = false` gesetzt, kennt `corpus:questions` nur ein Dokument und schneidet bei den übrigen Fragen schlecht ab.
- Starte promptfoo immer über die npm-Skripte oder die VS-Code-Konfiguration "promptfoo: current config". Nur so werden `.env` und [`promptfoo.env`](promptfoo.env) geladen. "Run current file" (F5) klappt nur für `.ts`-Dateien.

**Wenn es hakt**

| Meldung in der Zelle oder im Terminal | Lösung |
|---|---|
| `[ERROR] Cannot load index … Generate it with npm run l04:0, then npm run l04:N.` | Den fehlenden Index erzeugen. Die anderen Spalten laufen weiter. |
| `[ERROR] … judge format error (…) after 2 attempts: …` | Der Judge hielt das JSON-Format zweimal nicht ein. Mit einem 4B-Judge wie `qwen3.5-4b` sind einige solche Zellen zu erwarten (siehe [Messlauf](#messlauf-2026-11-13)); hinnehmen. Bei vielen ein stärkeres Modell in den Judge-Block. |
| `[ERROR] … 400 "Engine protocol predict stream returned an error: … Context size has been exceeded. …"`, im Terminal nach `Assertion grading failed during eval` | Das Chat-Modell ist mit mehreren parallelen Anfragen geladen (Standard in LM Studio: Parallel 4); dann reicht der Kontext nicht für jede. Mit Parallel 1 neu laden (siehe [Vorher prüfen](#vorher-prüfen)) und den Lauf neu starten. |
| `[ERROR] The judge did not answer within … s (timeout in the judge block of the YAML).` | `timeout` im Judge-Block erhöhen. |
| `[FAIL] … Could not extract JSON from … response` (bei `correct`) | Das Urteil wurde abgeschnitten. Erst `max_tokens` im Judge-Block erhöhen, dann ein Modell nehmen, das weniger denkt. |
| `[ERROR] Request timed out.` (ohne "judge") | Nicht der Judge, sondern der Assistent: Seine Antwort dauerte länger als `MODEL_TIMEOUT_MS` in `evaluation.ts`. Das passiert, wenn der Server unter Last steht (andere Läufe, Modellwechsel in LM Studio). Erneut starten (`-- --resume`) oder `MODEL_TIMEOUT_MS` erhöhen. |
| npm meldet `exit code 100` | Normal, wenn Tests scheitern. |

> **Vertiefung: Warum gibt es `promptfoo-judge.ts`?** promptfoo setzt `{{ env.X }}` als Text ein, und sein OpenAI-Adapter hielte den Text `"false"` bei `showThinking` für wahr. Die Hülle setzt deshalb einen echten Boolean, bittet um `reasoning_effort: none` und begrenzt die Zeit je Urteil (`timeout`) nur für den Judge. Beide Judge-Prüfungen nutzen so denselben Block. Grundlage für `timeout` und `max_tokens`: Ein denkender Judge brauchte bis etwa 2200 Tokens je Urteil bei rund 8 Tokens pro Sekunde (gemessen am 2026-11-12 mit `qwen3.8-4b-q4`). Die Abwägung: [docs/decisions.de.md](../../docs/decisions.de.md#judge-huelle).

> **Vertiefung: `faithful` wie RAGAS.** [RAGAS](https://docs.ragas.io/) ist ein verbreitetes Framework zur Evaluierung von RAG. Seine Quellentreue zerlegt die Antwort in Aussagen und prüft jede gegen den Kontext. [`promptfoo-faithfulness.ts`](promptfoo-faithfulness.ts) macht das in zwei JSON-Schritten mit streng geprüftem Schema und einem zweiten Versuch bei Formatfehlern. Die eingebaute Prüfung `context-faithfulness` von promptfoo las Klartext-Urteile: Denkschritte gerieten in die Aussagenlisten, und Formatfehler zählten still als 0. Siehe [docs/decisions.de.md](../../docs/decisions.de.md#eigene-faithful-pruefung) und das RAGAS-Paper unter [Weiterlesen](../../docs/production.de.md#weiterlesen).

## Teil 6 – Die laufende Fassade als Black Box

**In einem Satz:** promptfoo testet die fertige Anwendung über dieselbe API, die Open WebUI benutzt, ohne in den Code zu schauen.

**Ablauf** (`# KERN 1–4` in `06-promptfoo-black-box.yaml`)

1. **Provider:** das Modell `lesson-07-hybrid` der Fassade (Hybrid-Suche in der Qdrant-Collection), über die Ollama-API. Adresse aus `FACADE_HOST` und `FACADE_PORT` in `.env`.
2. **Testfälle:** dieselben wie in Teil 5.
3. **Quellentreffer:** gesucht in der Quellenliste, die die Fassade an die Antwort hängt, nicht im Antworttext.
4. **Korrektheit:** dieselbe Rubrik wie in Teil 5.

**Das siehst du** (gekürzt; `npm run l08:6 -- --filter-first-n 1` mit der Fassade aus `npm run l07:8`)

```
Running 1 test cases (up to 1 at a time)...
│ query                        │ keyPoint                     │ expectedSources              │ [lesson-07-hybrid] {{query}} │
│ Was ist neu in den OWASP Top │ Unbegrenzter Verbrauch       │ 00-vorwort-der-projektleite… │ [PASS] Die OWASP Top 10 für  │
│ 10 für LLM-Anwendungen 2025? │ erweitert; …                 │                              │ LLM-Anwendungen 2025 wurde … │
Results:
  ✓ 1 passed (100%)
  0 failed (0%)
  0 errors (0%)
Duration: … (concurrency: 1)
Writing output to results/lesson-08-promptfoo/06-promptfoo-black-box.html
```

Im zweiten Terminal zeigt die Fassade dieselbe Anfrage von ihrer Seite: promptfoo fragt erst die Modellliste ab, dann kommt die Frage als Chat-Anfrage, und die Fassade nennt ihre Quellen.

```
INFO HTTP request started { requestId: 1, method: 'GET', path: '/api/tags' }
INFO HTTP request started { requestId: 2, method: 'POST', path: '/api/chat' }
INFO RAG: Call started { model: 'qwen3.5-4b', strategy: 'lesson-07-hybrid' }
INFO RAG sources {
  sources: [
    '[1] 00-vorwort-der-projektleiter.md · Vorwort der Projektleiter',
    '[2] 00-vorwort-der-projektleiter.md · Vorwort der Projektleiter › Die Zukunft',
    …
INFO HTTP request completed { requestId: 2, status: 200, durationMs: … }
```

**Was bedeutet das?**

- Ein Black-Box-Test sieht nur, was über die API zurückkommt: die Antwort samt angehängter Quellenliste.
- Dafür testet er genau das, was Nutzer bekommen, samt Fassade, Prompt und Hybrid-Suche.
- `corpus:headings` in Teil 5 und `lesson-07-hybrid` nutzen dieselben Chunks und fünf Treffer. Anders sind die Suche (hybrid statt nur Vektoren) und der Weg (über die Fassade).

**Probier aus:** die Aufgaben im Kopf von `06-promptfoo-black-box.yaml`. Achte bei Aufgabe 2 im Terminal der Fassade darauf, ob Quellen gefunden werden.

**Stolperfallen**

- Die Ergebnisse hängen vom Zustand der laufenden Anwendung ab: geladene Collection, Modell in LM Studio.
- `npm run l07:8` bietet nur `lesson-07-hybrid`. Für Aufgabe 2 brauchst du `npm run l07:11`.
- Steht in `.env` `FACADE_HOST=0.0.0.0` (Open WebUI in Docker), klappt das unter Linux und macOS. Unter Windows trage im Provider `127.0.0.1` ein.

**Wenn es hakt**

| Meldung | Lösung |
|---|---|
| `ECONNREFUSED` in jeder Zeile | Die Fassade läuft nicht. In einem zweiten Terminal `npm run l07:11` starten. |
| `[ERROR] The judge did not answer within … s` | wie in Teil 5. |

> **Vertiefung:** Black-Box-Tests laufen in Produktion oft als "Smoke Test" nach jedem Deployment, mit wenigen Fragen und festen Erwartungen. Siehe [docs/production.de.md](../../docs/production.de.md).

## Das nimmst du mit

- Miss die Suche ohne Sprachmodell (billig, wiederholbar) und die Antworten mit einem Judge, getrennt.
- Ein Judge ist ein Messgerät: Prüfe ihn mit einer Gegenprobe, bevor du ihm glaubst, und lies seine Begründung.
- Eine Zahl sagt erst im Vergleich etwas, und nur, wenn sich genau eine Sache geändert hat.

## Weiter geht's

Lektion 08 ist die letzte Lektion. Ihre Messungen fließen zurück: Mit Teil 4 und 5 prüfst du jede Änderung an Chunking (Lektion 04), Suche (Lektion 05 und 06) oder Prompt (Lektion 07). Was in Produktion anders ist, steht in [docs/production.de.md](../../docs/production.de.md). Zurück zur [Lektionsübersicht](README.de.md).
