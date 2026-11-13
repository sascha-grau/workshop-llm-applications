// Lektion 07 – RAG, Teil 10: RAG mit Multi-Query
//
// Lernziel: Das Chat-Modell formuliert die Frage in Fachsprache um (Lektion 06, Teil 6); alle suchen mit.
// Braucht:  Qdrant mit der Collection aus `npm run l06:1`, LM Studio mit Chat- und E5-Modell, Open WebUI.
//           Nur ein Teil von Lektion 07 zur Zeit (gleicher FACADE_PORT): den laufenden mit Strg+C beenden.
//           `SHOW_THINKING` leer oder false, sonst scheitert das Umformulieren (JSON) und die Frage bricht ab.
// Start:    npm run l07:10   (oder F5), Modell `lesson-07-multiquery`
// Erklärt:  lessons/07-rag-open-webui/GUIDE.de.md → „Teil 10“
//
// Aufgabe:
//   1. Frage "Wie plaudert ein Modell geheime Anweisungen aus?" hier und in Teil 1: Findet Teil 10 andere Quellen?
//   2. `VARIANT_COUNT` auf 1, dann auf 5, je neu starten, dieselbe Frage: Wie ändern sich Quellen und Wartezeit?
//      ↺ Danach `VARIANT_COUNT` auf 3 und neu starten.
//   3. Mit Burp: Frage nur "PoisonGPT". Bleiben die Fassungen beim Begriff, oder driften sie ab?
//
// Lesen: die Zeile `// KERN 1`. Der Rest des Ablaufs ist wie in Teil 1.
import { createRagAnswer, startRag } from './rag.ts';
import { getCollectionName, multiqueryRetrieval, requireCollection } from './qdrant-retrieval.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-07-multiquery';
// Standard: 5. So viele Chunks kommen nach der Fusion in den Prompt.
const TOP_K = 5;
// Standard: 3. Umformulierungen zusätzlich zur Originalfrage; mehr = mehr Embeddings und Wartezeit.
const VARIANT_COUNT = 3;
// Standard: 20. Kandidaten je Liste (Originalfrage und jede Fassung) vor der Fusion.
const CANDIDATES_PER_LIST = 20;
// Standard: 60. Dämpfung der Reciprocal Rank Fusion, wie in Teil 8.
const RRF_K = 60;

async function main() {
  // Ohne die Collection aus Lektion 06, Teil 1 gibt es nichts zu durchsuchen: Abbruch mit klarer Meldung.
  await requireCollection(getCollectionName());
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    // KERN 1: Fassungen schreiben lassen, jede einzeln per Vektor suchen, alle Listen mit RRF fusionieren.
    answer: createRagAnswer([], TOP_K, multiqueryRetrieval(VARIANT_COUNT, CANDIDATES_PER_LIST, RRF_K)),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
