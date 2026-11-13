// Lektion 07 – RAG, Teil 2: RAG mit semantischen Chunks
//
// Lernziel: Gleicher Ablauf wie Teil 1, anderer Index: Wie verändert das Chunking die Antwort?
// Braucht:  Index aus `npm run l04:0` und `npm run l04:3`, sonst wie Teil 1.
//           Nur ein Teil von Lektion 07 zur Zeit (gleicher FACADE_PORT): den laufenden mit Strg+C beenden.
// Start:    npm run l07:2   (oder F5), Modell `lesson-07-semantic`
// Erklärt:  lessons/07-rag-open-webui/GUIDE.de.md → „Teil 2“
//
// Aufgabe:
//   1. Frage "Wie begrenze ich Prompt Injection?": Ist die Antwort vollständiger oder knapper als in Teil 1?
//   2. `TOP_K` auf 1, neu starten, dieselbe Frage: Reicht ein semantischer Chunk für eine gute Antwort?
//      ↺ Danach `TOP_K` auf 3 und neu starten.
//
// Lesen: die Zeile `// KERN 1`. Der Ablauf ist `createRagAnswer` in rag.ts (Teil 1 schreibt ihn aus).
import { createRagAnswer, loadRagIndex, startRag } from './rag.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-07-semantic';
// Standard: 3. Mehr = mehr Kontext, längerer Prompt.
const TOP_K = 3;

async function main() {
  // KERN 1: Der einzige Unterschied zu Teil 1: der semantische Index aus Lektion 04, Teil 3.
  const index = loadRagIndex('semantic');
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    answer: createRagAnswer(index, TOP_K),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
