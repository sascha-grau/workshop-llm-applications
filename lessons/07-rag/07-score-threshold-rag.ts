// Lektion 07 – RAG, Teil 7: RAG mit Schwellenwert
//
// Lernziel: Du siehst, wie ein Schwellenwert (Lektion 05, Teil 4) Fragen erkennbar macht, auf die
// die Dokumente keine Antwort haben, und wie die Anwendung dann ehrlich "nichts gefunden" sagt.
//
// Gegenüber Teil 1 (`01-heading-rag.ts`, die Referenz mit dem vollständigen Ablauf) ändern sich
// Trefferauswahl und Ablauf bei leerer Trefferliste. `thresholdRetrieval` (aus `retrieval.ts`) holt
// die besten `MAX_K` Chunks und behält nur die mit Ähnlichkeit von mindestens `SCORE_THRESHOLD`;
// die Zahl der Treffer ist also offen. Bleibt keiner übrig, ruft `createRagAnswer` das Sprachmodell
// gar nicht erst auf, sondern schickt die feste deutsche Antwort `NO_SOURCES_ANSWER`. Das Modell
// kann so nicht aus unpassendem Kontext raten. Beachte: Die Zeile `RAG sources` ist dann leer, und
// im System-Prompt steht bei Treffern "[1] bis [N]" mit N = Zahl der Treffer, nicht `MAX_K`.
// Der Wert 0,83 passt zum E5-Modell und zu diesem Korpus (siehe Lektion 05, Teil 4 und 5).
//
// Es kann immer nur ein Teil von Lektion 07 laufen (gleicher Port, FACADE_PORT): Beende vorher
// den anderen mit Strg+C. In Open WebUI erscheint dieser Teil als Modell
// `lesson-07-score-threshold`; lade bei Bedarf die Modellliste neu.
//
// Voraussetzungen: wie Teil 1, mit dem Index aus Lektion 04, Teil 2 (erst `npm run l04:0`, dann
// `npm run l04:2`). Burp ist optional.
// Start: npm run l07:7
//
// Aufgabe:
//   1. Stelle die Frage aus Teil 1, Aufgabe 1 ("Wie wird das Wetter morgen?"). Was antwortet jetzt
//      die Anwendung, und was zeigt `RAG sources`? Vergleiche mit Teil 1: Dort kommen
//      trotzdem Quellen, hier ruft die Anwendung das Modell für die Antwort nicht auf.
//   2. Stelle eine Frage, deren Antwort in den Dokumenten steht, aber in anderen Worten
//      ("Wie plaudert ein Modell geheime Anweisungen aus?"). Wie viele Quellen kommen, und wird
//      sie vom Schwellenwert fälschlich abgewiesen?
//   3. Setze `SCORE_THRESHOLD` auf 0,7 und auf 0,9. Wie verhalten sich Frage 1 und Frage 2 jeweils?
//      Warum trennt kein Wert beide Gruppen sauber (siehe Lektion 05, Teil 5)?
import { createRagAnswer, loadRagIndex, startRag } from './rag.ts';
import { NO_SOURCES_ANSWER, thresholdRetrieval } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Name, unter dem die Fassade das Modell in Open WebUI anbietet.
const ADVERTISED_MODEL = 'lesson-07-score-threshold';
// Obergrenze: höchstens so viele Chunks kommen in den Prompt, auch wenn mehr den Schwellenwert erreichen.
const MAX_K = 5;
// Mindest-Ähnlichkeit (Kosinus) eines Chunks zur Frage. Gilt nur für das E5-Modell und diesen Korpus,
// siehe Lektion 05, Teil 4 und 5. Erreicht kein Chunk sie, antwortet die Anwendung mit `NO_SOURCES_ANSWER`.
const SCORE_THRESHOLD = 0.83;

async function main() {
  const index = loadRagIndex('headings');
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    answer: createRagAnswer(index, MAX_K, thresholdRetrieval(SCORE_THRESHOLD), { noSourcesAnswer: NO_SOURCES_ANSWER }),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
