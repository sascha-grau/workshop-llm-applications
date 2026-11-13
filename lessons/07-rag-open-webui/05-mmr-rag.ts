// Lektion 07 – RAG, Teil 5: RAG mit MMR
//
// Lernziel: MMR (Lektion 05, Teil 2) wählt Quellen, die zur Frage passen und sich wenig ähneln.
// Braucht:  Index aus `npm run l04:0` und `npm run l04:2`, sonst wie Teil 1.
//           Nur ein Teil von Lektion 07 zur Zeit (gleicher FACADE_PORT): den laufenden mit Strg+C beenden.
// Start:    npm run l07:5   (oder F5), Modell `lesson-07-mmr`
// Erklärt:  lessons/07-rag-open-webui/GUIDE.de.md → „Teil 5“
//
// Aufgabe:
//   1. Frage "Wie begrenze ich Prompt Injection?": Welche Quellen sind anders als in Teil 1?
//   2. `LAMBDA` auf 1, neu starten, dieselbe Frage; dann 0.1: Passen noch alle Quellen zur Frage?
//      ↺ Danach `LAMBDA` auf 0.5 und neu starten.
//   3. `FETCH_K` auf 3 (= `TOP_K`): Warum ändert MMR dann nichts mehr an der Auswahl?
//      ↺ Danach `FETCH_K` auf 20 und neu starten.
//
// Lesen: die Zeile `// KERN 1`. Der Rest des Ablaufs ist wie in Teil 1.
import { createRagAnswer, loadRagIndex, startRag } from './rag.ts';
import { mmrRetrieval } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-07-mmr';
// Standard: 3. So viele Chunks kommen in den Prompt.
const TOP_K = 3;
// Standard: 20. Nur aus diesen ähnlichsten Kandidaten wählt MMR.
const FETCH_K = 20;
// Standard: 0.5. 1 = reines Top-k, kleiner = mehr Vielfalt.
const LAMBDA = 0.5;

async function main() {
  const index = loadRagIndex('headings');
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    // KERN 1: Nur die Trefferauswahl (`KERN 3` in Teil 1) ist anders.
    answer: createRagAnswer(index, TOP_K, mmrRetrieval(FETCH_K, LAMBDA)),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
