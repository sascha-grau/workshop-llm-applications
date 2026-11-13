# Lektion 08 – Evaluierung

[English](README.md)

**Lernziel:** Du misst eine RAG-Anwendung, statt sie nach Augenmaß zu beurteilen. Die Suche misst du mit Trefferquote und MRR, ohne Sprachmodell. Die Antworten prüft ein Sprachmodell als Judge auf Quellentreue und Korrektheit, und eine Gegenprobe prüft den Judge. Du speicherst jede Messung, erkennst Verschlechterungen (Regression) und machst dieselben Messungen mit promptfoo: über alle Chunking-Strategien und gegen die laufende Fassade aus Lektion 07.

## Teile

| Teil | Datei | Start | Zeigt | Braucht |
|---|---|---|---|---|
| 1 | [`01-hitratio-mrr.ts`](01-hitratio-mrr.ts) | `npm run l08:1` | Trefferquote und MRR der Suche, ohne Sprachmodell | LM Studio (E5), Index aus `l04:2` |
| 2 | [`02-faithfulness.ts`](02-faithfulness.ts) | `npm run l08:2` | Quellentreue: Ist die Antwort durch ihren Kontext gedeckt? | wie Teil 1, dazu das Chat-Modell |
| 3 | [`03-correctness.ts`](03-correctness.ts) | `npm run l08:3` | Korrektheit: Enthält die Antwort die erwartete Kernaussage? | wie Teil 2 |
| 4 | [`04-regression.ts`](04-regression.ts) | `npm run l08:4` | Regression: wie Teil 1 messen, speichern, mit dem Vorlauf vergleichen | wie Teil 1 |
| 5 | [`05-promptfoo-strategies.yaml`](05-promptfoo-strategies.yaml) | `npm run l08:5` | promptfoo: alle vier Chunking-Strategien, alle vier Kennzahlen, eine Tabelle | wie Teil 2, dazu die Indizes aus `l04:1` bis `l04:4` |
| 6 | [`06-promptfoo-black-box.yaml`](06-promptfoo-black-box.yaml) | `npm run l08:6` | promptfoo: die laufende Fassade als Black Box, über die API von Open WebUI | wie Teil 2, dazu Qdrant (`l06:1`) und die Fassade (`l07:11`) |

Die Aufgaben stehen im Kopf jeder Datei. Ablauf, erwartete Ausgabe und Stolperfallen je Teil erklärt der [Guide](GUIDE.de.md). Warum promptfoo-Zellen rot sind, erklärt das [FAQ](FAQ.de.md).

## Reihenfolge und Abhängigkeiten

- **Vorher:** Chunks und Überschriften-Index aus Lektion 04 (`npm run l04:0`, dann `npm run l04:2`). Teil 1 bis 4 lesen diesen einen Index.
- **Teil 1 → 4:** der Reihe nach. Teil 3 baut auf Teil 2 auf, Teil 4 auf Teil 1. Jeder Teil läuft einmal durch und endet; es gibt keinen Chat und kein Open WebUI.
- **Teil 4** schreibt jeden Lauf nach `results/lesson-08-regression/` (steht in `.gitignore`).
- **Teil 5 und 6** sind promptfoo-Konfigurationen, keine Programme. Im Workshop startest du sie mit der ersten Frage (`npm run l08:5 -- --filter-first-n 1`). Der volle Lauf von Teil 5 dauert mehrere Minuten: Mit eigener GPU startest du ihn selbst, sonst zeigt der Trainer den Bericht eines vorab gestarteten Laufs. Dauer und Mittelwerte des Messlaufs stehen im [Guide](GUIDE.de.md#messlauf-2026-11-13).
- **Hilfsmodule, kein eigener Teil:** [`evaluation.ts`](evaluation.ts) (Teil 2 bis 5) und `promptfoo-*.ts` (Teil 5 und 6). Fragen-Set und Index-Laden kommen aus Lektion 05 ([`question-set.json`](../05-retrieval-strategies/question-set.json), [`retrieval.ts`](../05-retrieval-strategies/retrieval.ts)).
- **Burp** ist optional; in Teil 2 und 3 zeigt er die Prompts von Antwort und Judge.

## Vor Teil 5 und 6

1. LM Studio mit E5- und Chat-Modell starten, das Chat-Modell mit Parallel 1 geladen ([warum](GUIDE.de.md#vorher-prüfen)). `SHOW_THINKING` in `.env` leer lassen oder auf `false` setzen.
2. Teil 5: alle vier Indizes erzeugen (`npm run l04:0`, dann `npm run l04:1` bis `npm run l04:4`). Fehlt einer, zeigt nur seine Spalte `[ERROR] Cannot load index …`.
3. Teil 6: Qdrant starten und die Collection laden (`npm run l06:1`). Die Fassade in einem zweiten Terminal starten: `npm run l07:11` (oder `npm run l07:8`, nur `lesson-07-hybrid`).
4. promptfoo nur über `npm run l08:5` / `npm run l08:6` oder die VS-Code-Konfiguration "promptfoo: current config" starten. Nur so werden `.env` und [`promptfoo.env`](promptfoo.env) geladen.
5. Ergebnis: Tabelle im Terminal und HTML-Bericht in `results/lesson-08-promptfoo/`. Scheitert ein Test, endet npm mit Exit-Code 100; das ist normal.

## Datenschutz

- promptfoo speichert jeden Lauf (Fragen, Antworten, Begründungen des Judge, Konfiguration) unter `~/.promptfoo/`, außerhalb des Repos, dazu Debug-Logs unter `~/.promptfoo/logs/`. Alles löschen: `npx promptfoo delete eval all`.
- Die Konfiguration nennt nur den Namen der Variablen mit dem API-Schlüssel (`apiKeyEnvar`), nie den Schlüssel selbst.
- `promptfoo.env` schaltet Nutzungsstatistik, Versionsprüfung, Teilen in der Cloud und Testerzeugung auf promptfoos Servern ab. Die Adresse des Judge fällt auf LM Studio zurück, nie auf OpenAI.
- `npx promptfoo view` lauscht auf allen Netzwerkschnittstellen. Im geteilten WLAN können andere deine Ergebnisse lesen. Beende den Viewer gleich nach dem Ansehen mit Strg+C und lies alles außer den Spalten-Mittelwerten im HTML-Bericht.

## Weiterlesen

- [Guide](GUIDE.de.md): je Teil Ablauf, echte Ausgabe, Stolperfallen und Fehlermeldungen
- [FAQ](FAQ.de.md): wann ein promptfoo-Test besteht und wie du eine rote Zelle liest
- [docs/architecture.de.md](../../docs/architecture.de.md): Datenfluss und Artefakte zwischen den Lektionen
- [docs/decisions.de.md](../../docs/decisions.de.md): begründete Entscheidungen, z. B. die Judge-Hülle für promptfoo
- [docs/production.de.md](../../docs/production.de.md): was im Workshop vereinfacht ist
- [docs/trainer.de.md](../../docs/trainer.de.md): für Trainer, enthält Lösungen
- Allgemeine Fehlermeldungen: "Wenn etwas nicht klappt" in der [Wurzel-README](../../README.de.md)

Zurück zur [Übersicht](../../README.de.md).
