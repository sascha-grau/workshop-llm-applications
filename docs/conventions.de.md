# Konventionen für Code-Kommentare und Dokumentation

*English version: [conventions.md](conventions.md)*

Diese Regeln gelten für alle Lektionen. Sie sollen verhindern, dass dieselbe Information an mehreren Stellen steht und auseinanderläuft. Pilot sind Lektion 04 und 08; die übrigen Lektionen folgen.

## Wo welche Information steht

Jede Information hat genau einen Ort. Andere Stellen verlinken dorthin.

| Information | Ort |
|---|---|
| Was die Datei tut, Start, Aufgaben samt Zurücksetzen | Dateikopf der Lektionsdatei |
| Warum eine Codezeile so aussieht (nur wenn es nicht offensichtlich ist) | Kommentar an der Zeile |
| Idee, Ablauf, erwartete Ausgabe, Stolperfallen, Begriffe | `lessons/NN/GUIDE.de.md` und `GUIDE.md` |
| Überblick über die Teile, Reihenfolge, Abhängigkeiten | `lessons/NN/README.de.md` und `README.md` |
| Datenfluss zwischen den Lektionen, Artefakte, Verträge | [`docs/architecture.de.md`](architecture.de.md) |
| Begründete Entscheidungen | [`docs/decisions.de.md`](decisions.de.md) |
| Vereinfachungen im Workshop gegenüber Produktion, Literatur | [`docs/production.de.md`](production.de.md) |
| Ablauf, Zeiten, Vorbereitung, Lösungen und erwartete Ergebnisse der Aufgaben, Gesprächspunkte | [`docs/trainer.de.md`](trainer.de.md) |
| Standardwerte der Schalter (Tabelle zum Zurücksetzen) | Code (`// Standard:`) und Rücksetz-Tabelle in [`docs/trainer.de.md`](trainer.de.md) |
| Wer welchen Index liest | [`docs/architecture.de.md`](architecture.de.md); Dateiköpfe nur kurz unter "Schreibt:" |
| Ein Messlauf (Zahlen, Dauer) | Genau eine Stelle, mit Modell und Datum; alle anderen verlinken dorthin |
| Fehlermeldungen und ihre Lösung | Abschnitt "Wenn etwas nicht klappt" in der Wurzel-README |

## Sprache

- Code-Kommentare: Deutsch. Fehlermeldungen und Konsolenausgabe: Englisch.
- Guides und Dokumente unter `docs/`: Deutsch (`*.de.md`) und Englisch (`*.md`), inhaltlich gleich.

## Dateikopf einer Lektionsdatei

Höchstens 20 Zeilen, Ziel etwa 15. Vorlage:

```ts
// Lektion NN – Thema, Teil N: Titel
//
// Lernziel: ein Satz.
// Braucht:  was vorher laufen muss (z. B. `npm run l04:0`, LM Studio mit E5; `SHOW_THINKING` leer, wenn der Teil JSON liest).
// Schreibt: was entsteht und wer es liest (nur wenn etwas entsteht).
// Start:    npm run lNN:N   (oder F5)
// Erklärt:  lessons/NN-…/GUIDE.de.md → „Teil N“
//
// Aufgabe:
//   1. …
//   2. …
//   ↺ Danach zurücksetzen: `KONSTANTE` auf `Wert` (sonst …).
//
// Lesen: die Zeilen `// KERN 1–n`. Der Rest ist Handwerk.
```

- Höchstens drei Aufgaben. Jede Aufgabe, die etwas ändert, endet mit einer ↺-Zeile zum Zurücksetzen.
- Eine Aufgabe dauert auf Referenz-Hardware höchstens etwa fünf Minuten. Sonst heißt sie "(Demo)" und die Trainer-Notizen sagen, wie sie vorgeführt wird.
- Aufgaben zerstören nichts, was sich nur langsam wiederherstellen lässt: umbenennen statt löschen.
- Aufgaben stehen nur hier. README und Guide verlinken darauf und wiederholen sie nicht.
- Kein Wiederholen von Einrichtung (Burp, `.env`, Docker): Das steht in der Wurzel-README.

## Kommentare im Code

| Regel | Inhalt |
|---|---|
| Inhalt | Nur, was der Code nicht selbst sagt: warum, Invariante, Sicherheitsgrund, Umgehung samt Auslöser. Kein Nacherzählen des Aufrufs. |
| Länge | Höchstens drei Zeilen je Block. Längeres wird ein Abschnitt im Guide mit Link. |
| Keine Listen von Nutzern | Nicht "genutzt von Lektion 05, 07, 08". Das findet die Suche im Editor. |
| Keine Messwerte | Keine gemessenen Zahlen (Dauer, Treffer, Tokens). Jeder Messlauf steht an genau einer Stelle (Guide oder Trainer-Notizen), mit Modell und Datum. |
| Werte in Texten | Texte nennen Einstellungen beim Namen (`timeout` im Judge-Block, `MAX_ADDED_SUBSECTIONS`), nicht ihren Wert. Wo eine Zahl nötig ist, prüft `docs:check` sie gegen den Code. |
| Konstanten | Einstellbare Konstante mit Standardwert und Richtung: `// Standard: 95. Kleiner = mehr Schnitte.` |
| Links | Repo-relativ und mit Abschnitt: `// Siehe docs/decisions.de.md#judge-huelle`. |

Markierungen, höchstens eine je Block:

| Markierung | Bedeutung |
|---|---|
| `KERN n:` | Die Zeilen, die das Lernziel tragen, nummeriert. Der Guide erklärt dieselben Nummern. |
| `NEU:` | Erstes Auftreten gegenüber dem vorigen Teil. |
| `VEREINFACHT:` | Abkürzung für den Workshop; Details in `docs/production.de.md`. |
| `LEHRKOPIE (→ Datei#Symbol):` | Bewusste Kopie zum Lesen; das Original steht dort. |
| `SYNC (→ Datei#Schlüssel):` | Kopie, die gleich bleiben muss (z. B. Judge-Block in Teil 5 und 6); `docs:check` vergleicht beide. |
| `UMGEHUNG (Paket Version):` | Umgehung eines Verhaltens einer Bibliothek; entfällt, wenn sich das Paket ändert. |

## Guide einer Lektion (`GUIDE.de.md`)

```markdown
# Lektion NN – Titel: Guide
## Worum geht's?            (drei Sätze, ein Vergleich aus dem Alltag)
## Wo stehen wir?           (Pipeline als Textbild, aktueller Schritt markiert)
## Neue Begriffe            (Tabelle: Begriff | in einem Satz | Beispiel; höchstens etwa fünf)
## Vorher prüfen            (Checkliste)
## Teil N – Titel
**In einem Satz:** …
**Ablauf** (dieselben Nummern wie `KERN 1–n` im Code)
**Das siehst du** (gekürzte echte Ausgabe; Modell und Datum der Messung)
**Was bedeutet das?** (drei bis fünf Punkte zur Ausgabe; keine Lösungen der Aufgaben)
**Stolperfallen** (was richtig ist, obwohl es falsch aussieht)
**Wenn es hakt** (Meldung → Lösung)
> **Vertiefung:** … (für Fortgeschrittene, mit Link auf decisions/production)
## Das nimmst du mit         (drei Merksätze)
## Weiter geht's             (wer nutzt das Ergebnis?)
```

- Ton: "du", ein Gedanke pro Satz.
- Die Aufgaben stehen nicht im Guide. "Probier aus" verweist auf den Dateikopf und sagt nur, worauf man achten soll.
- Erwartete Ergebnisse der Aufgaben stehen nur in den Trainer-Notizen.
- Ein neuer Begriff wird erklärt, bevor er benutzt wird (Tabelle "Neue Begriffe" oder ein Halbsatz im Text).

## README einer Lektion

Höchstens etwa 60 Zeilen: Lernziel, Tabelle der Teile (Datei, Start, was sie zeigt), Reihenfolge und Abhängigkeiten, Links auf Guide und weitere Dokumente. Keine Aufgaben, keine langen Erklärungen, keine Standardwerte, keine Links auf Lösungen (Trainer-Notizen nur als "für Trainer" gekennzeichnet).

## Prüfung

`npm run check` führt Typprüfung, `npm run docs:check` und die Tests der Lehrkopien aus (sie vergleichen jede `LEHRKOPIE` mit ihrem Original). `docs:check` prüft Skripte, Dateien, Links und Anker (auch aus Code-Kommentaren), Namen von Konstanten und Funktionen, Zahlen neben Konstanten (Beispiele mit "(Beispiel)" oder `<!-- docs:check-ignore -->` kennzeichnen), festgelegte Versionen gegen `package.json`, `SYNC`-Kopien und die Gleichheit der deutschen und englischen Fassung. Läuft es nicht durch, ist eine Stelle veraltet. Es gibt keinen Git-Hook: Führe `npm run check` selbst vor jedem Commit aus.
