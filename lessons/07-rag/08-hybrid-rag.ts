// Lektion 07 – RAG, Teil 8: RAG mit Hybrid-Suche (BM25 + Vektor, RRF)
//
// Lernziel: Du siehst, wie die Hybrid-Suche aus Lektion 06 (Teil 2 bis 4) Fragen beantwortet, bei
// denen die reine Vektorsuche aus Teil 1 danebenliegt.
//
// Gegenüber Teil 1 (`01-heading-rag.ts`, die Referenz mit dem vollständigen Ablauf) ändert sich die
// Suche grundlegend: Es gibt keinen Index im Speicher (daher der leere Index `[]`), sondern die
// Qdrant-Collection aus Lektion 06, Teil 1. `hybridRetrieval` (aus `qdrant-retrieval.ts`) schickt
// eine Anfrage an Qdrant: Qdrant sucht mit BM25 (Stichwörter) und mit dem Frage-Vektor, je
// `CANDIDATES_PER_LIST` Kandidaten, und führt beide Listen mit Reciprocal Rank Fusion (RRF) zu den
// besten `TOP_K` zusammen. `RRF_K` dämpft den Vorsprung der ersten Plätze. Einbetten, Kontext, Prompt
// und Streamen sind wie in Teil 1. Den Pre-Filter auf öffentliche Chunks übernimmt hier Qdrant
// (`PUBLIC_FILTER`), nicht `loadRagIndex`.
//
// Es kann immer nur ein Teil von Lektion 07 laufen (gleicher Port, FACADE_PORT): Beende vorher
// den anderen mit Strg+C. In Open WebUI erscheint dieser Teil als Modell `lesson-07-hybrid`; lade
// bei Bedarf die Modellliste neu.
//
// Voraussetzungen: Qdrant läuft (`QDRANT_URL` in .env), und die Collection ist geladen (`npm run
// l06:1`, das wiederum den Index aus `npm run l04:2` braucht); LM Studio läuft mit Chat- und
// E5-Modell, Open WebUI zeigt auf die Fassade. Burp ist optional und sieht die Anfragen an Qdrant
// nicht (eigener Verbindungspool, siehe Lektion 06, Teil 1).
// Start: npm run l07:8
//
// Aufgabe:
//   1. Stelle eine Frage mit einem genauen Fachbegriff oder Namen (z. B. "Was ist PoisonGPT?") in
//      Teil 1 und Teil 8. Vergleiche `RAG sources` und Antwort: Findet die Hybrid-Suche den Chunk
//      sicherer als die reine Vektorsuche?
//   2. Stelle eine umgangssprachliche Frage ohne Fachwörter ("Wie plaudert ein Modell geheime
//      Anweisungen aus?"). Hilft BM25 hier, oder liefert die Hybrid-Suche vor allem, was auch die
//      Vektorsuche gefunden hätte?
//   3. Setze `CANDIDATES_PER_LIST` auf 3 und `TOP_K` auf 3. Fehlen jetzt Chunks, die mit 20
//      Kandidaten noch dabei waren (siehe Lektion 06, Teil 4: RRF findet nichts, was in keiner
//      Liste weit genug vorn steht)?
import { createRagAnswer, startRag } from './rag.ts';
import { getCollectionName, hybridRetrieval, requireCollection } from './qdrant-retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Name, unter dem die Fassade das Modell in Open WebUI anbietet.
const ADVERTISED_MODEL = 'lesson-07-hybrid';
// So viele Chunks kommen als Kontext in den Prompt.
const TOP_K = 5;
// Kandidaten je Liste (BM25 und Vektor), die Qdrant vor der Fusion holt (Lektion 06, Teil 4).
const CANDIDATES_PER_LIST = 20;
// Dämpfung der Reciprocal Rank Fusion: Beitrag eines Platzes ist 1 / (RRF_K + Rang).
const RRF_K = 60;

async function main() {
  // Ohne die Collection aus Lektion 06, Teil 1 gibt es nichts zu durchsuchen: Abbruch mit klarer Meldung.
  await requireCollection(getCollectionName());
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    // Der Index ist leer (`[]`): Die Suche läuft in Qdrant, nicht im Speicher.
    answer: createRagAnswer([], TOP_K, hybridRetrieval(CANDIDATES_PER_LIST, RRF_K)),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
