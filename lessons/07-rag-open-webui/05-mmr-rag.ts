// Lektion 07 – RAG, Teil 5: RAG mit MMR
//
// Lernziel: Du siehst, wie MMR (Lektion 05, Teil 2) die Antworten eines RAG-Systems verändert, wenn
// Top-k mehrmals fast denselben Inhalt liefert.
//
// Gegenüber Teil 1 (`01-heading-rag.ts`, die Referenz mit dem vollständigen Ablauf) ändert sich nur
// die Trefferauswahl, also genau Schritt 3 des Ablaufs: Statt der `TOP_K` ähnlichsten Chunks holt
// `mmrRetrieval` (aus `retrieval.ts`) die besten `FETCH_K` Kandidaten und wählt daraus `TOP_K`
// Chunks, die zur Frage passen und sich untereinander möglichst wenig ähneln. `LAMBDA` wägt
// Relevanz gegen Vielfalt ab: 1 ist reines Top-k, kleinere Werte bevorzugen Vielfalt. Index und
// Rest des Ablaufs bleiben wie in Teil 1 (Überschriften-Index aus Lektion 04, Teil 2).
//
// Es kann immer nur ein Teil von Lektion 07 laufen (gleicher Port, FACADE_PORT): Beende vorher
// den anderen mit Strg+C. In Open WebUI erscheint dieser Teil als Modell `lesson-07-mmr`; lade
// bei Bedarf die Modellliste neu.
//
// Voraussetzungen: wie Teil 1, mit dem Index aus Lektion 04, Teil 2 (erst `npm run l04:0`, dann
// `npm run l04:2`). Burp ist optional.
// Start: npm run l07:5
//
// Aufgabe:
//   1. Stelle in Teil 1 und Teil 5 dieselbe Frage, bei der Top-k mehrere ähnliche Chunks aus einem
//      Dokument liefert (siehe Lektion 05, Teil 2). Vergleiche die Zeilen `RAG sources`: Kommen
//      mit MMR Quellen aus mehr Dokumenten, und wird die Antwort dadurch vollständiger?
//   2. Setze `LAMBDA` auf 1 und dann auf 0,1 und starte jeweils neu. Bei 1 muss das Ergebnis dem
//      von Teil 1 entsprechen. Was passiert bei 0,1 mit der Antwort: Kommen auch Quellen hinein,
//      die kaum noch zur Frage passen?
//   3. Setze `FETCH_K` auf `TOP_K` (3). Warum ändert MMR dann nichts mehr an der Auswahl?
import { createRagAnswer, loadRagIndex, startRag } from './rag.ts';
import { mmrRetrieval } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Name, unter dem die Fassade das Modell in Open WebUI anbietet.
const ADVERTISED_MODEL = 'lesson-07-mmr';
// So viele Chunks kommen als Kontext in den Prompt.
const TOP_K = 3;
// So viele Kandidaten nach Ähnlichkeit holt die Suche; nur aus ihnen wählt MMR (Lektion 05, Teil 2).
const FETCH_K = 20;
// Gewicht von Relevanz gegen Vielfalt: 1 ist reines Top-k, kleiner heißt mehr Vielfalt.
const LAMBDA = 0.5;

async function main() {
  const index = loadRagIndex('headings');
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    answer: createRagAnswer(index, TOP_K, mmrRetrieval(FETCH_K, LAMBDA)),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
