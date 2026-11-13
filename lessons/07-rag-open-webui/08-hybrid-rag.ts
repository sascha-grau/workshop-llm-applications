// Lektion 07 – RAG, Teil 8: RAG mit Hybrid-Suche (BM25 + Vektor, RRF)
//
// Lernziel: Die Hybrid-Suche aus Lektion 06 findet Fachbegriffe und Namen, bei denen die Vektorsuche danebenliegt.
// Braucht:  Qdrant mit der Collection aus `npm run l06:1`, LM Studio mit Chat- und E5-Modell, Open WebUI.
//           Nur ein Teil von Lektion 07 zur Zeit (gleicher FACADE_PORT): den laufenden mit Strg+C beenden.
// Start:    npm run l07:8   (oder F5), Modell `lesson-07-hybrid`
// Erklärt:  lessons/07-rag-open-webui/GUIDE.de.md → „Teil 8“
//
// Aufgabe:
//   1. Frage "Was ist PoisonGPT?" hier und in Teil 1: Welche Quellenliste trifft den Begriff?
//   2. Frage "Wie plaudert ein Modell geheime Anweisungen aus?": Hilft BM25 bei Alltagssprache?
//   3. `CANDIDATES_PER_LIST` und `TOP_K` auf 3, neu starten, Frage 1: Fehlen jetzt Quellen?
//      ↺ Danach `CANDIDATES_PER_LIST` auf 20, `TOP_K` auf 5 und neu starten.
//
// Lesen: die Zeile `// KERN 1`. Einbetten, Kontext, Prompt und Streamen sind wie in Teil 1.
import { createRagAnswer, startRag } from './rag.ts';
import { getCollectionName, hybridRetrieval, requireCollection } from './qdrant-retrieval.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-07-hybrid';
// Standard: 5. So viele Chunks kommen nach der Fusion in den Prompt.
const TOP_K = 5;
// Standard: 20. Kandidaten je Liste (BM25 und Vektor) vor der Fusion; was in keiner steht, fehlt.
const CANDIDATES_PER_LIST = 20;
// Standard: 60. Beitrag eines Platzes ist 1 / (RRF_K + Rang); größer = flacher.
const RRF_K = 60;

async function main() {
  // Ohne die Collection aus Lektion 06, Teil 1 gibt es nichts zu durchsuchen: Abbruch mit klarer Meldung.
  await requireCollection(getCollectionName());
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    // KERN 1: Leerer Index (`[]`): Die Suche läuft in Qdrant, eine Anfrage für BM25, Vektor und Fusion.
    answer: createRagAnswer([], TOP_K, hybridRetrieval(CANDIDATES_PER_LIST, RRF_K)),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
