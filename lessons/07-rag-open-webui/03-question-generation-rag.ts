// Lektion 07 – RAG, Teil 3: RAG mit generierten Fragen
//
// Lernziel: Suchen über generierte Fragen, antworten mit dem Original-Chunk (Multi-Vektor-Index).
// Braucht:  Index aus `npm run l04:0` und `npm run l04:4` (`FULL_CORPUS` dort auf true), sonst wie Teil 1.
//           Nur ein Teil von Lektion 07 zur Zeit (gleicher FACADE_PORT): den laufenden mit Strg+C beenden.
// Start:    npm run l07:3   (oder F5), Modell `lesson-07-questions`
// Erklärt:  lessons/07-rag-open-webui/GUIDE.de.md → „Teil 3“
//
// Aufgabe:
//   1. Frage "Wie plaudert ein Modell geheime Anweisungen aus?" hier und in Teil 1:
//      Welcher Index findet Abschnitte, die besser zur Frage passen?
//   2. `TOP_K` auf 1, neu starten, "Wie begrenze ich Prompt Injection?": Reicht der eine Chunk für die Antwort?
//      ↺ Danach `TOP_K` auf 3 und neu starten.
//
// Lesen: die Zeilen `// KERN 1–2`. Der Rest des Ablaufs ist wie in Teil 1.
import { createRagAnswer, loadRagIndex, startRag, retrieveQuestionChunks } from './rag.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-07-questions';
// Standard: 3. Zählt verschiedene Chunks, nicht Fragen.
const TOP_K = 3;

async function main() {
  // KERN 1: der Fragen-Index aus Lektion 04, Teil 4: mehrere Einträge (Fragen) je Chunk.
  const index = loadRagIndex('questions');
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    // KERN 2: Einfaches Top-k könnte alle Plätze mit Fragen eines Chunks füllen; die Auswahl
    // nimmt jeden Chunk nur einmal (Dedupe) und liefert seinen Original-Text.
    answer: createRagAnswer(index, TOP_K, retrieveQuestionChunks),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
