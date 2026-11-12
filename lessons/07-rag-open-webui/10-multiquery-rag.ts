// Lektion 07 – RAG, Teil 10: RAG mit Multi-Query
//
// Lernziel: Du siehst, wie Multi-Query (Lektion 06, Teil 6) eine umgangssprachliche Frage im RAG-
// Ablauf auffangbar macht, indem das Sprachmodell sie zuerst in der Sprache des Korpus umformuliert.
//
// Gegenüber Teil 8 (`08-hybrid-rag.ts`) ändert sich die Frage, mit der gesucht wird:
// `multiqueryRetrieval` (aus `qdrant-retrieval.ts`) lässt das Chat-Modell `VARIANT_COUNT` sachliche
// Fassungen der Frage schreiben, bettet die Originalfrage und jede Fassung ein, sucht mit jedem
// Vektor je `CANDIDATES_PER_LIST` Kandidaten und führt alle Listen in einer Qdrant-Anfrage mit RRF
// (`RRF_K`) zu den besten `TOP_K` zusammen. Die Originalfrage bleibt eine der Listen, damit
// abdriftende Fassungen sie nicht verdrängen. Gesucht wird nur mit Vektoren; die Fassungen
// kosten einen Modellaufruf und mehrere Embeddings je Frage. Die Fassungen erscheinen im Terminal in
// der Zeile `Multi-query variants`: Lies sie mit.
//
// Es kann immer nur ein Teil von Lektion 07 laufen (gleicher Port, FACADE_PORT): Beende vorher
// den anderen mit Strg+C. In Open WebUI erscheint dieser Teil als Modell `lesson-07-multiquery`;
// lade bei Bedarf die Modellliste neu.
//
// Voraussetzungen: wie Teil 8: Qdrant läuft, die Collection ist geladen (`npm run l06:1`, braucht
// `npm run l04:2`), LM Studio läuft mit Chat- und E5-Modell, Open WebUI zeigt auf die Fassade. Burp
// ist optional und zeigt den Umformulierungsaufruf und die Embedding-Anfrage.
// Start: npm run l07:10
//
// Aufgabe:
//   1. Stelle eine umgangssprachliche Frage ("Wie plaudert ein Modell geheime Anweisungen aus?") in
//      Teil 1 und Teil 10. Lies die Fassungen in `Multi-query variants` und vergleiche `RAG
//      sources`: Findet Teil 10 Quellen, die Teil 1 verfehlt?
//   2. Setze `VARIANT_COUNT` auf 1 und auf 5. Wie ändern sich Quellen und Wartezeit? Antwortet das
//      Modell immer im verlangten JSON-Format?
//   3. Stelle eine Frage aus nur einem Wort ("PoisonGPT"). Helfen die Fassungen hier, oder
//      driften sie vom Begriff ab?
import { createRagAnswer, startRag } from './rag.ts';
import { getCollectionName, multiqueryRetrieval, requireCollection } from './qdrant-retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Name, unter dem die Fassade das Modell in Open WebUI anbietet.
const ADVERTISED_MODEL = 'lesson-07-multiquery';
// So viele Chunks kommen als Kontext in den Prompt.
const TOP_K = 5;
// Wie viele Umformulierungen das Chat-Modell zusätzlich zur Originalfrage schreibt.
const VARIANT_COUNT = 3;
// Kandidaten je Liste (Originalfrage und jede Fassung) vor der Fusion mit RRF.
const CANDIDATES_PER_LIST = 20;
// Dämpfung der Reciprocal Rank Fusion, wie in Teil 8.
const RRF_K = 60;

async function main() {
  // Ohne die Collection aus Lektion 06, Teil 1 gibt es nichts zu durchsuchen: Abbruch mit klarer Meldung.
  await requireCollection(getCollectionName());
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    // Der Index ist leer (`[]`): Die Suche läuft in Qdrant, nicht im Speicher.
    answer: createRagAnswer([], TOP_K, multiqueryRetrieval(VARIANT_COUNT, CANDIDATES_PER_LIST, RRF_K)),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
