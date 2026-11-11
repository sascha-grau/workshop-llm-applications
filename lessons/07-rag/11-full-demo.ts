// Lektion 07 – RAG, Teil 11: Alle RAG-Pipelines in einer Fassade
//
// Lernziel: Du vergleichst die RAG-Pipelines aus Teil 1 bis 10 in Open WebUI, ohne zwischen den
// Teilen neu zu starten: Dieselbe Frage, nur das Modell im Dropdown wechselt.
//
// Diese Datei startet eine einzige Fassade, die alle zehn Pipelines als eigene Modelle anbietet
// (`lesson-07-headings` bis `lesson-07-multiquery`, Namen siehe README). `startRag` bekommt dafür
// statt eines Modells eine Liste (`{ models }`); bei jeder Chat-Frage wählt die Fassade anhand
// des gewählten Modellnamens die passende Pipeline (Details in `rag.ts`). Die Modelle baut
// `loadDemoModels` in `demo.ts`.
//
// Fehlende Voraussetzungen blockieren die Demo nicht: Ein Modell, dessen Index oder Qdrant-
// Collection fehlt, wird übersprungen. Das Terminal zeigt dazu eine Zeile `WARN Skipping
// unavailable RAG model` mit dem Grund und dem npm-Skript, das ihn behebt (Feld `fix`). Läuft
// kein einziges Modell, bricht der Start mit einer Fehlermeldung ab. Nach dem Beheben starte die
// Demo neu und lade die Modellliste in Open WebUI neu.
//
// Wichtig: `demo.ts` setzt die Werte der Pipelines selbst (TOP_K, `CHILD_SIZE`, `LAMBDA`,
// Schwellenwert usw.) und liest nicht die Konstanten aus den Teilen 1 bis 10. Sie entsprechen den
// Standardwerten dort, aber eine Änderung in einem Teil wirkt in der Demo nicht. Willst du in der
// Demo experimentieren, ändere `demo.ts`.
//
// Voraussetzungen: LM Studio läuft mit Chat- und E5-Modell, Open WebUI zeigt auf die Fassade.
// Je Modell, das du nutzen willst: Index aus Lektion 04 (`npm run l04:0`, dann `l04:2`, `l04:3`
// oder `l04:4`; Parent-Document, MMR, Metadaten-Filter und Schwellenwert nutzen `l04:2`) und für
// Hybrid, Rerank und Multi-Query Qdrant mit der Collection aus `npm run l06:1`. Burp ist optional.
// Es läuft immer nur eine Fassade auf dem Port (FACADE_PORT): Beende vorher jeden anderen Teil
// von Lektion 07 mit Strg+C.
// Start: npm run l07:11
//
// Aufgabe:
//   1. Stelle dieselbe Frage nacheinander an alle Modelle im Dropdown und vergleiche Quellen
//      (Zeile `RAG sources`, das Feld `strategy` der Logzeile `RAG` zeigt das Modell), Länge und
//      Dauer. Welche Pipeline liefert für die Frage die beste Antwort, und was kostet sie?
//   2. Stoppe Qdrant, starte die Demo neu und lies die `WARN`-Zeilen. Welche Modelle fehlen im
//      Dropdown, und welches Skript würde sie zurückbringen?
//   3. Ändere in `demo.ts` die `TOP_K` einer Pipeline und starte neu. Wirkt die Änderung, anders
//      als in den Einzelteilen, ohne dass du eine Teil-Datei anfasst?
import { loadDemoModels } from './demo.ts';
import { startRag } from './rag.ts';
import { runMain } from '../shared/startup.ts';

async function main() {
  // Die Funktion bekommt von `startRag` eine gemeinsame Serverprüfung (`checkServer`), die nur einmal läuft.
  await startRag(async (checkServer) => {
    // Baut alle Pipelines; Modelle mit fehlenden Voraussetzungen werden dabei übersprungen (WARN).
    const models = await loadDemoModels(checkServer);
    // Eine Fassade für alle Modelle: Open WebUI wählt per Modellname die Pipeline.
    return { models };
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
