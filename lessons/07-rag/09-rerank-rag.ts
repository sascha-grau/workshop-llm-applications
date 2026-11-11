// Lektion 07 – RAG, Teil 9: RAG mit Reranking
//
// Lernziel: Du siehst, wie das Reranking mit dem Sprachmodell (Lektion 06, Teil 5) die Quellen im
// RAG-Ablauf verbessert und was es pro Frage kostet.
//
// Gegenüber Teil 8 (`08-hybrid-rag.ts`) kommt ein Schritt dazu: `rerankRetrieval` (aus
// `qdrant-retrieval.ts`) holt per Hybrid-Suche die besten `CANDIDATES` Chunks, lässt das Chat-Modell
// jeden einzeln mit einer Zahl von 0 bis 10 bewerten (pointwise, nur die ersten `TEXT_LIMIT`
// Zeichen des Chunks) und liefert die besten `TOP_K` nach dieser Zahl. Schlägt eine Bewertung fehl
// (z. B. kein gültiges JSON), zählt der Chunk als -1 und rutscht ans Ende, statt die Antwort
// abzubrechen. Das Reranking sortiert nur um: Was nicht unter den `CANDIDATES` steht, kommt nicht
// in den Prompt. Es kostet pro Frage `CANDIDATES` zusätzliche Modellaufrufe, bevor die Antwort
// beginnt; in Open WebUI wartest du spürbar länger auf das erste Wort.
//
// Es kann immer nur ein Teil von Lektion 07 laufen (gleicher Port, FACADE_PORT): Beende vorher
// den anderen mit Strg+C. In Open WebUI erscheint dieser Teil als Modell `lesson-07-rerank`; lade
// bei Bedarf die Modellliste neu.
//
// Voraussetzungen: wie Teil 8: Qdrant läuft, die Collection ist geladen (`npm run l06:1`, braucht
// `npm run l04:2`), LM Studio läuft mit Chat- und E5-Modell, Open WebUI zeigt auf die Fassade. Burp
// ist optional und zeigt jeden Bewertungsaufruf an das Chat-Modell.
// Start: npm run l07:9
//
// Aufgabe:
//   1. Stelle dieselbe Frage in Teil 8 und Teil 9. Vergleiche `RAG sources`: Welche Chunks steigen
//      auf, welche fallen ab? Wie viel länger dauert es bis zum ersten Wort?
//   2. Lies in Burp (oder in den Logzeilen `LLM reranking`) die Bewertung eines Chunks, der stark
//      gefallen ist. Ist die Zahl nachvollziehbar?
//   3. Setze `CANDIDATES` auf `TOP_K` (5). Warum ändert das Reranking dann nur noch die
//      Reihenfolge der Quellen, nicht mehr ihre Auswahl?
import { createRagAnswer, startRag } from './rag.ts';
import { getCollectionName, rerankRetrieval, requireCollection } from './qdrant-retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Name, unter dem die Fassade das Modell in Open WebUI anbietet.
const ADVERTISED_MODEL = 'lesson-07-rerank';
// So viele Chunks kommen nach dem Reranking als Kontext in den Prompt.
const TOP_K = 5;
// So viele Kandidaten der Hybrid-Suche bewertet das Chat-Modell: ein Modellaufruf je Kandidat und Frage.
const CANDIDATES = 8;
// Nur die ersten so vielen Zeichen eines Chunks sieht das Modell bei der Bewertung.
const TEXT_LIMIT = 400;
// Wie in Teil 8: Kandidaten je Liste und RRF-Dämpfung der Hybrid-Suche davor.
const CANDIDATES_PER_LIST = 20;
const RRF_K = 60;

async function main() {
  // Ohne die Collection aus Lektion 06, Teil 1 gibt es nichts zu durchsuchen: Abbruch mit klarer Meldung.
  await requireCollection(getCollectionName());
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    // Der Index ist leer (`[]`): Die Suche läuft in Qdrant, nicht im Speicher.
    answer: createRagAnswer([], TOP_K, rerankRetrieval(CANDIDATES, TEXT_LIMIT, CANDIDATES_PER_LIST, RRF_K)),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
