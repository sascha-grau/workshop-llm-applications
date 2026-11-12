// Lektion 07 – RAG, Teil 3: RAG mit generierten Fragen
//
// Lernziel: Du verstehst, wie RAG mit einem Multi-Vektor-Index arbeitet: Die Suche vergleicht die
// Frage mit generierten Fragen, geantwortet wird aber mit dem Original-Chunk-Text.
//
// Gegenüber Teil 1 (`01-heading-rag.ts`, die Referenz mit dem vollständigen Ablauf) ändern sich
// der Index und die Auswahl der Treffer. Geladen wird der Fragen-Index aus Lektion 04, Teil 4:
// Er hat mehrere Einträge (Fragen-Vektoren) pro Chunk. Deshalb reicht das einfache Top-k (Lektion
// 05, Teil 1) nicht, denn mehrere Fragen desselben Chunks könnten alle Plätze belegen.
// `createRagAnswer` bekommt darum `retrieveQuestionChunks` (aus `rag.ts`) als dritten Parameter:
// Die Funktion bewertet alle Fragen, nimmt jeden Chunk nur einmal (mit seiner besten Frage,
// Dedupe) und übergibt dessen Original-Text als Kontext, nicht die Frage. Das ist eine eigene
// Retrieval-Strategie mit demselben Ziel wie MMR (Lektion 05, Teil 2): keine Plätze für
// Wiederholungen. Dedupe streicht aber nur exakte Doppelte desselben Chunks, MMR auch ähnliche
// Chunks. Der Rest des Standardablaufs bleibt gleich.
//
// Es kann immer nur ein Teil von Lektion 07 laufen (gleicher Port, FACADE_PORT): Beende vorher
// den anderen mit Strg+C. In Open WebUI erscheint dieser Teil als Modell `lesson-07-questions`;
// lade bei Bedarf die Modellliste neu.
//
// Voraussetzungen: wie Teil 1, aber mit dem Index aus Lektion 04, Teil 4 (erst `npm run l04:0`,
// dann `npm run l04:4`). Dieser Index wird mit dem Chat-Modell erzeugt und ist standardmäßig nur
// für das Beispieldokument gefüllt (FULL_CORPUS in Lektion 04, Teil 4); Fragen zu anderen Dokumenten finden
// dann nichts. Burp ist optional.
// Start: npm run l07:3
//
// Aufgabe:
//   1. Stelle dieselbe Frage wie in Teil 1 und 2. Welche Quellen kommen, und wie wirkt sich der
//      kleinere Index (nur ein Dokument) aus? (Im Terminal zeigt die Zeile `RAG sources`, was [1] bis [N] sind.)
//   2. Formuliere eine Frage in ganz anderen Worten als der Chunk-Text. Findet Teil 3 den Chunk
//      besser als Teil 1?
//   3. Ändere `TOP_K` auf 1 und vergleiche die Antwort mit der von Teil 1 bei derselben Einstellung.
//      Teil 3 liefert höchstens TOP_K verschiedene Chunks, auch wenn mehrere Fragen eines Chunks
//      vorn liegen.
import { createRagAnswer, loadRagIndex, startRag, retrieveQuestionChunks } from './rag.ts';
import { runMain } from '../shared/startup.ts';

// Name, unter dem die Fassade das Modell in Open WebUI anbietet.
const ADVERTISED_MODEL = 'lesson-07-questions';
// So viele verschiedene Chunks kommen als Kontext in den Prompt (Top-k, Lektion 05, Teil 1).
const TOP_K = 3;

async function main() {
  // Der Fragen-Index aus Lektion 04, Teil 4.

  // Index beim Start laden; ein fehlender Index bricht den Start mit einer klaren Meldung ab.
  // Der dritte Parameter ersetzt das einfache Top-k durch die Auswahl mit Dedupe (siehe
  // retrieveQuestionChunks in rag.ts).
  const index = loadRagIndex('questions');
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    answer: createRagAnswer(index, TOP_K, retrieveQuestionChunks),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
