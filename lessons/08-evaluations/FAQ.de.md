# FAQ: Wann besteht ein promptfoo-Test, wann nicht?

*English version: [FAQ.md](FAQ.md)*

Dieses FAQ erklärt die Ergebnisse von Teil 5 (`npm run l08:5`) und Teil 6 (`npm run l08:6`). Es beantwortet vor allem eine Frage: **Warum ist eine Zelle rot, obwohl die Antwort die richtigen Stellen zu enthalten scheint?**

## Die Kurzfassung

- **Eine Zelle ist ein Paar aus Frage und Strategie.** In Teil 5 gibt es 11 Fragen × 4 Strategien = 44 Zellen.
- **Eine Zelle besteht nur, wenn _alle_ ihre Prüfungen bestehen.** Teil 5 hat vier Prüfungen je Zelle. Scheitert eine davon, ist die ganze Zelle `FAIL`, auch wenn die anderen drei perfekt sind.
- **Zwei der vier Prüfungen sind sehr streng:** `faithful` verlangt, dass _jede_ Aussage der Antwort im Kontext steht. `correct` verlangt, dass die Antwort die _ganze_ erwartete Kernaussage enthält, nicht nur einen Teil davon.
- **"Die richtigen Stellen stehen drin" reicht deshalb nicht.** Eine Antwort, die 2 von 7 erwarteten Maßnahmen nennt, ist für `correct` unvollständig. Eine Antwort mit 18 belegten und einer zu frei formulierten Aussage ist für `faithful` nicht ganz quellentreu.
- **Lies deshalb die Mittelwerte, nicht die Zahl der grünen Zellen.** Ein `faithful` von 0,95 heißt "fast jede Aussage belegt", auch wenn die Zelle rot ist.

## Die vier Prüfungen in Teil 5

| Prüfung | Was sie prüft | Besteht, wenn … | Prüft _nicht_ … |
|---|---|---|---|
| `source-hit` | Hat die Suche ein erwartetes **Dokument** unter den Treffern? | mindestens eine Datei aus `expectedSources` unter den Treffern ist | ob die richtige **Stelle** im Dokument gefunden wurde |
| `mrr` | Auf welchem **Rang** steht das erste erwartete Dokument? | der Wert größer als 0 ist (Rang 1 → 1,0; Rang 2 → 0,5; Rang 3 → 0,33 …) | ob der Rang gut ist; auch Rang 5 besteht |
| `faithful` | Steht jede **Aussage der Antwort** im gefundenen Kontext? | **alle** Aussagen gedeckt sind (Schwelle 1) | ob die Antwort vollständig oder richtig ist |
| `correct` | Enthält die Antwort die **erwartete Kernaussage** (`keyPoint`)? | der Judge die Kernaussage als vollständig und ohne Widerspruch enthalten bewertet | ob die Antwort bei den Quellen bleibt |

`source-hit` und `mrr` rechnet der Code ohne Sprachmodell. `faithful` und `correct` bewertet ein Sprachmodell als Judge.

Teil 6 hat nur zwei Prüfungen, `source-hit` (in der Quellenliste unter der Antwort) und `correct`. Die Regeln dafür sind dieselben.

## Woran scheitern die Zellen wirklich?

Zahlen aus dem [Messlauf 2026-11-13](GUIDE.de.md#messlauf-2026-11-13) im Guide. In seinen 32 gescheiterten Zellen schlugen diese Prüfungen fehl (eine Zelle kann mehrere haben):

| Gescheiterte Prüfung | in so vielen Zellen | davon als **einzige** Ursache |
|---|---|---|
| `faithful` | 22 | 12 |
| `correct` | 20 | 10 |
| `source-hit` und `mrr` (immer zusammen) | 3 | 0 |

Daraus folgt:

1. **Die Hauptgründe sind `faithful` und `correct`**, nicht die Suche. Die richtigen Dokumente werden fast immer gefunden (Spalte `source-hit` im Messlauf).
2. **`source-hit` scheitert nur bei F-05**, in drei der vier Strategien. Dort fehlt das erwartete Dokument wirklich unter den Treffern.
3. **`faithful` scheitert mal knapp, mal deutlich.** Knapp: 13 von 14, 12 von 13, 11 von 12 Aussagen gedeckt. Deutlich vor allem, wenn die Antwort sagt, was die Quellen _nicht_ enthalten: Bei F-10 ("OWASP nennt keine Zahlen") scheiterte `faithful` in drei Strategien mit 1 von 2 oder 2 von 6, `correct` bestand dort überall.

## Warum `correct` scheitert, obwohl das Thema stimmt

Der Judge vergleicht die Antwort mit der erwarteten Kernaussage aus [`question-set.json`](../05-retrieval-strategies/question-set.json). Viele Kernaussagen sind **Listen**:

> F-01: "Modellverhalten begrenzen, Ausgabeformate validieren, Ein-/Ausgabefilter, geringste Rechte, manuelle Freigabe, externe Inhalte kennzeichnen, adversarial Tests"

Nennt die Antwort nur einen Teil, urteilt der Judge `nicht korrekt`. Echte Begründungen aus dem Lauf (der Judge schrieb sie englisch):

> "The output discusses limiting model behavior and validating output formats, which aligns with two of the expected core points in the rubric ('Modellverhalten begrenzen', 'Ausgabeformate validieren'). However, it fails to mention several other critical security measures listed in the rubric: input/output filters ('Ein-/Ausgabefilter'), least privilege principle ('geringste Rechte'), …"

Sinngemäß: Die Antwort nennt zwei der sieben Punkte; es fehlen Ein-/Ausgabefilter, geringste Rechte und weitere.

> "The output correctly mentions the expansion of 'Unbounded Consumption' and the new entry regarding 'Vector and Embedding Weaknesses'. However, it fails to mention the third required update: 'Excessive Autonomy' (Übermäßige Handlungsfreiheit)."

Sinngemäß: Zwei der drei Neuerungen stehen drin, die erweiterte "Übermäßige Handlungsfreiheit" fehlt.

Das hat meist eine von zwei Ursachen:

- **Der Kontext enthält nicht alle Punkte.** Die Suche liefert fünf Chunks. Steht die Liste über mehrere Abschnitte verteilt, landen nicht alle im Kontext. Teil 3 zeigt das an F-01: Erst mit den Unterabschnitten (`EXPAND_SECTIONS`) stehen alle sieben Maßnahmen im Kontext. Teil 5 erweitert nicht.
- **Das Modell fasst zusammen.** Selbst wenn alle Punkte im Kontext stehen, nennt ein kleines Modell oft nur die ersten drei oder vier.

**Merke:** "Das richtige Dokument wurde gefunden" (`source-hit`) heißt nicht "alle nötigen Abschnitte wurden gefunden". Und "der Abschnitt steht im Kontext" heißt nicht "die Antwort nennt ihn".

## Warum `faithful` scheitert, obwohl fast alles belegt ist

Der Judge zerlegt die Antwort in einzelne Aussagen und prüft jede gegen den Kontext. Die Schwelle ist 1: **Eine einzige ungedeckte Aussage lässt die Prüfung scheitern.** Typische ungedeckte Aussagen aus dem Lauf:

| Aussage der Antwort | Begründung des Judge |
|---|---|
| "In den Quellen wird oft zwischen Prompt-Injection und Jailbreaking synonym unterschieden." | Der Kontext sagt, beide Begriffe würden "oft synonym verwendet", nicht, dass zwischen ihnen "synonym unterschieden" wird. |
| "Als Präventionsstrategie wird der Zero-Trust-Ansatz empfohlen." | Zero Trust steht im Kontext nur bei LLM05 (das Modell wie einen anderen Nutzer behandeln), nicht als allgemeine Präventionsstrategie. |
| "Dies kann dazu führen, dass das System versehentlich schädlichen Code ausführt oder Daten verarbeitet." | Der Kontext nennt keine Szenarien, in denen schädlicher Code ausgeführt wird, nur Datenlecks. |

Das sind kleine Übertreibungen oder Ergänzungen aus dem Allgemeinwissen des Modells. Für einen Nutzer wirkt die Antwort richtig, aber sie behauptet etwas, das nicht in den Quellen steht. Genau das soll `faithful` finden.

Manchmal irrt auch der Judge und markiert eine belegte Aussage als ungedeckt. Im Messlauf traf das vor allem Sätze darüber, was die Quellen _nicht_ enthalten. Bei F-10 nannte der Judge "Die bereitgestellten Quellen enthalten keine spezifischen numerischen Grenzwerte …" ungedeckt und schrieb in derselben Begründung, der Kontext nenne tatsächlich keine Grenzwerte. Die Begründung steht in der Zelle; lies sie, bevor du der Antwort die Schuld gibst.

## FAIL, ERROR, PASS: was heißt was?

| Anzeige | Bedeutung | Was tun? |
|---|---|---|
| `[PASS]` | Alle Prüfungen der Zelle bestanden. | Nichts. |
| `[FAIL]` | Mindestens eine Prüfung ist gescheitert. Die Zelle zeigt die Begründung jeder Prüfung. | Prüfen, _welche_ Prüfung scheiterte (siehe unten). |
| `[ERROR]` mit `judge format error` | Der Judge hat auch nach mehreren Versuchen kein gültiges JSON geliefert. Das sagt nichts über die Antwort. | Einzelfälle hinnehmen (mit strukturierter Ausgabe selten); bei vielen ein stärkeres Modell als Judge nehmen. |
| `[ERROR]` mit `Context size has been exceeded` | LM Studio bedient mehrere Anfragen parallel, und der Kontext reicht nicht für jede. | Das Chat-Modell mit Parallel 1 laden ([Vorher prüfen](GUIDE.de.md#vorher-prüfen) im Guide). |
| `[ERROR]` mit `did not answer within … s` | Der eigene Zeitgeber lief ab: Der Server ist zu langsam oder staut Anfragen. | `timeout` im Judge-Block der YAML-Datei erhöhen; auf LM Studio das Modell mit Parallel 1 laden. |
| Viele `[ERROR]`-Zellen auf einmal, auch `Could not embed the question` | Der Server ist überlastet oder nicht erreichbar; das ist kein Fehler im Code. | Server prüfen, Lauf neu starten. |
| `[ERROR]` mit `Cannot load index` | Ein Index fehlt. | Die Indizes aus Lektion 04 erzeugen (`npm run l04:0` bis `l04:4`). |

Gibt es `[ERROR]`-Zellen, endet `npm run l08:5` mit Exit-Code 100 und zeigt einen Stacktrace je Fehler. Das ist kein Absturz; Ergebnisse und HTML-Bericht werden trotzdem geschrieben.

## So liest du eine rote Zelle

Öffne den HTML-Bericht (`results/lesson-08-promptfoo/05-promptfoo-strategies.html`). Jede Zelle listet die Begründung aller vier Prüfungen. Geh sie in dieser Reihenfolge durch:

1. **`source-hit` gescheitert?** Die Suche hat das Dokument nicht gefunden. Das ist ein Problem der **Suche** (Chunking, `topK`, Embedding). Alle anderen Prüfungen sind dann wenig aussagekräftig.
2. **`correct` gescheitert?** Lies, welche Punkte der Judge vermisst. Steht der fehlende Punkt im gefundenen Kontext? (Den Kontext zeigt der Viewer `npx promptfoo view` in den Details der Zelle, in den Metadaten unter `context`.) Wenn nein: Problem der **Suche** (der Abschnitt wurde nicht gefunden). Wenn ja: Problem der **Antwort** (das Modell hat ihn weggelassen).
3. **`faithful` gescheitert?** Lies die als `UNSUPPORTED` markierten Aussagen. Hat die Antwort etwas hinzugedichtet? Dann ist es ein Problem der **Antwort**. Steht die Aussage doch im Kontext? Dann hat der **Judge** sich geirrt.

## Häufige Fragen

**Warum ist die Zelle rot, obwohl `faithful` 0,95 zeigt?**
Weil die Schwelle 1 ist: 18 von 19 Aussagen reicht nicht. Das ist bewusst streng. Der Wert 0,95 sagt trotzdem viel: fast alles ist belegt.

**Warum besteht `mrr` mit 0,2?**
`mrr` hat keine Schwelle; jeder Wert über 0 besteht. 0,2 heißt: Das erste erwartete Dokument stand auf Rang 5. Für den Vergleich der Strategien zählt der Mittelwert, nicht bestanden oder nicht.

**Die Antwort klingt für mich richtig. Ist der Judge falsch?**
Manchmal. Ein kleines Modell als Judge urteilt nicht immer gleich. Meist aber hat der Judge einen Punkt gefunden: eine fehlende Maßnahme oder eine Aussage, die nicht in den Quellen steht. Lies seine Begründung in der Zelle.

**Warum steht die Antwort in der Zelle und trotzdem fehlt "der Text"?**
Die Zelle zeigt die Antwort des Assistenten. Ob die Antwort das Thema trifft, sieht man sofort. Ob sie _alle_ Punkte der Kernaussage nennt und _keine_ unbelegte Aussage enthält, sieht man erst in den Begründungen.

**Welche Zahl soll ich mir anschauen?**
Die Mittelwerte je Spalte: `source-hit` = Trefferquote, `mrr` = MRR, `faithful` = Anteil belegter Aussagen, `correct` = Anteil korrekter Antworten. `npx promptfoo view` zeigt sie im Spaltenkopf. Damit vergleichst du die Strategien; die Zahl der grünen Zellen ist dafür zu grob.

**Wie bekomme ich mehr grüne Zellen?**
Je nach Ursache:

- **Fehlende Abschnitte im Kontext:** `topK` unter `config` des Providers erhöhen (wie in Aufgabe 3 von Teil 5, nur nach oben) oder Unterabschnitte mitnehmen wie in Teil 3.
- **Modell lässt Punkte weg oder dichtet hinzu:** ein größeres Chat-Modell.
- **Judge urteilt unzuverlässig:** ein stärkeres Modell im Judge-Block der YAML-Datei.

Eine niedrigere Schwelle bei `faithful` macht die Zellen grüner, aber nicht die Antworten besser.

**Warum scheitert F-05 fast überall?**
Bei F-05 ("Warum ist es gefährlich, die Antwort des Modells ungeprüft an eine Shell weiterzureichen?") findet die Suche das erwartete Dokument `05-llm05-fehlerhafte-ausgabeverarbeitung.md` in drei der vier Strategien nicht unter den Treffern. Dort scheitern alle vier Prüfungen: Die Antwort sagt, die Quellen gäben keine direkte Antwort. Nur `corpus:questions` findet das Dokument (auf Rang 2), weil dort die vom Modell erzeugten Fragen zur Suchanfrage passen. Diese Zelle endete im Messlauf allerdings mit `ERROR` (`judge format error`).

**Teil 3 meldet `Judge check passed`, aber in Teil 5 scheitert dieselbe Frage. Wie das?**
Teil 3 nimmt die Unterabschnitte der Treffer mit in den Kontext (`EXPAND_SECTIONS = true`), Teil 5 nicht. Bei F-01 fehlen deshalb in der Spalte `corpus:headings` (derselbe Index wie Teil 3) Maßnahmen. Aufgabe 3 im Kopf von `03-correctness.ts` zeigt den Unterschied.
