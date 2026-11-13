// Lektion 07 – RAG, Teil 7: RAG mit Schwellenwert
//
// Lernziel: Ein Schwellenwert (Lektion 05, Teil 4) erkennt Fragen ohne passende Quelle und antwortet fest.
// Braucht:  Index aus `npm run l04:0` und `npm run l04:2`, sonst wie Teil 1.
//           Nur ein Teil von Lektion 07 zur Zeit (gleicher FACADE_PORT): den laufenden mit Strg+C beenden.
// Start:    npm run l07:7   (oder F5), Modell `lesson-07-score-threshold`
// Erklärt:  lessons/07-rag-open-webui/GUIDE.de.md → „Teil 7“
//
// Aufgabe:
//   1. Frage "Wie plaudert ein Modell geheime Anweisungen aus?": Kommt sie durch, mit wie vielen Quellen?
//   2. `SCORE_THRESHOLD` auf 0.7, dann auf 0.9, je neu starten, Frage 1 und "Wie wird das Wetter morgen?":
//      Trennt ein Wert beide Fragen sauber?
//      ↺ Danach `SCORE_THRESHOLD` auf 0.83 und neu starten.
//
// Lesen: die Zeilen `// KERN 1–2`. Der Rest des Ablaufs ist wie in Teil 1.
import { createRagAnswer, loadRagIndex, startRag } from './rag.ts';
import { NO_SOURCES_ANSWER, thresholdRetrieval } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-07-score-threshold';
// Standard: 5. Obergrenze, auch wenn mehr Chunks den Schwellenwert erreichen.
const MAX_K = 5;
// KERN 1: Nur Chunks ab dieser Kosinus-Ähnlichkeit zählen; die Zahl der Treffer ist offen, auch 0.
// Standard: 0.83. Höher = mehr Fragen ohne Quellen. Gilt nur für E5 und diesen Korpus (Lektion 05, Teil 4).
const SCORE_THRESHOLD = 0.83;

async function main() {
  const index = loadRagIndex('headings');
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    // KERN 2: Ohne Treffer kommt `NO_SOURCES_ANSWER` ohne Modellaufruf; das Modell kann nicht raten.
    answer: createRagAnswer(index, MAX_K, thresholdRetrieval(SCORE_THRESHOLD), { noSourcesAnswer: NO_SOURCES_ANSWER }),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
