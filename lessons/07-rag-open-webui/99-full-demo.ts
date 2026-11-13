// Lektion 07 – RAG, Teil 11: Alle RAG-Pipelines in einer Fassade (Voll-Demo, `npm run l07:11`)
//
// Lernziel: Teil 1 bis 10 in Open WebUI vergleichen, ohne neu zu starten: nur das Modell im Dropdown wechselt.
// Braucht:  je Modell die Voraussetzungen seines Teils; fehlt etwas, wird nur dieses Modell übersprungen (WARN).
//           `SHOW_THINKING` leer oder false, sonst sortiert `lesson-07-rerank` nicht und `-multiquery` bricht ab.
//           Nur ein Teil von Lektion 07 zur Zeit (gleicher FACADE_PORT): den laufenden mit Strg+C beenden.
// Start:    npm run l07:11   (oder F5)
// Erklärt:  lessons/07-rag-open-webui/GUIDE.de.md → „Teil 11“
//
// Aufgabe:
//   1. Dieselbe Frage an drei Modelle im Dropdown: Welche Quellenliste passt am besten, wie lange dauert es?
//   2. `docker stop qdrant`, Demo neu starten: Welche Modelle fehlen, welches Skript nennt die WARN-Zeile?
//      ↺ Danach `docker start qdrant` und die Demo neu starten.
//   3. In `demo.ts` bei `lesson-07-headings` die 3 durch 1 ersetzen, neu starten: Ändert sich die Quellenliste?
//      ↺ Danach in `demo.ts` wieder 3 und neu starten.
//
// Lesen: die Zeilen `// KERN 1–2` und `loadDemoModels` in demo.ts.
import { loadDemoModels } from './demo.ts';
import { startRag } from './rag.ts';
import { runMain } from '../shared/startup.ts';

async function main() {
  await startRag(async (checkServer) => {
    // KERN 1: Alle zehn Pipelines bauen; fehlt eine Voraussetzung, fällt nur dieses Modell weg (WARN).
    const models = await loadDemoModels(checkServer);
    // KERN 2: Eine Fassade, viele Modelle: Der Modellname in jeder Chat-Anfrage wählt die Pipeline.
    return { models };
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
