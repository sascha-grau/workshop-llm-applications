// Lektion 07 – RAG, Teil 2: RAG mit semantischen Chunks
//
// Lernziel: Du siehst, wie die Art des Chunkings die Antworten eines RAG-Systems verändert, bei
// sonst identischem Ablauf.
//
// Gegenüber Teil 1 (`01-heading-rag.ts`, die Referenz mit dem vollständigen Ablauf) ändert sich
// nur der Index: Hier wird der semantische Index aus Lektion 04, Teil 3 geladen, dessen Chunks
// an Überschriften und an Themensprüngen geschnitten wurden. Die Datei übergibt `startRag` den
// Standardablauf aus `rag.ts` (`createRagAnswer`: einbetten, ranken, Kontext, Prompt, streamen),
// nur mit anderen Chunks. Beachte: Bei kurzen Dokumenten gibt es in
// Lektion 04, Teil 3 keine semantischen Schnitte (siehe dort); dann ähneln die Chunks denen aus
// Lektion 04, Teil 2.
//
// Es kann immer nur ein Teil von Lektion 07 laufen (gleicher Port, FACADE_PORT): Beende vorher
// den anderen mit Strg+C. In Open WebUI erscheint dieser Teil als Modell `lesson-07-semantic`;
// lade bei Bedarf die Modellliste neu.
//
// Voraussetzungen: wie Teil 1, aber mit dem Index aus Lektion 04, Teil 3 (erst `npm run l04:0`,
// dann `npm run l04:3`). Burp ist optional.
// Start: npm run l07:2
//
// Aufgabe:
//   1. Stelle dieselbe Frage (z. B. "Wie begrenze ich Prompt Injection?") in Teil 1 und Teil 2.
//      Welche Quellen werden zitiert, und unterscheiden sich die Antworten?
//      (Im Terminal zeigt die Zeile `RAG sources`, was [1] bis [N] sind.)
//   2. Frage nach etwas, das in zwei Abschnitten steht. Welcher Chunking-Index liefert die
//      passenderen Quellen?
//   3. Ändere `TOP_K` auf 1. Reicht der kleinere semantische Chunk allein für eine gute Antwort,
//      verglichen mit Teil 1? Stelle dieselbe Frage auch in Teil 3 und vergleiche alle drei
//      Antworten (nach jedem Neustart).
import { createRagAnswer, loadRagIndex, startRag } from './rag.ts';
import { runMain } from '../shared/startup.ts';

// Name, unter dem die Fassade das Modell in Open WebUI anbietet.
const ADVERTISED_MODEL = 'lesson-07-semantic';
// So viele Chunks kommen als Kontext in den Prompt (Top-k, Lektion 05, Teil 1).
const TOP_K = 3;

async function main() {
  // Der semantische Index aus Lektion 04, Teil 3.

  // Index beim Start laden; ein fehlender Index bricht den Start mit einer klaren Meldung ab.
  // `createRagAnswer` liefert den Standardablauf aus rag.ts, hier mit dem semantischen Index.
  const index = loadRagIndex('semantic');
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    answer: createRagAnswer(index, TOP_K),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
