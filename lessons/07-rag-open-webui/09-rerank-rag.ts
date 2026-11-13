// Lektion 07 – RAG, Teil 9: RAG mit Reranking
//
// Lernziel: Das Chat-Modell bewertet die Hybrid-Treffer neu (Lektion 06, Teil 5), bevor es antwortet.
// Braucht:  Qdrant mit der Collection aus `npm run l06:1`, LM Studio mit Chat- und E5-Modell, Open WebUI.
//           Nur ein Teil von Lektion 07 zur Zeit (gleicher FACADE_PORT): den laufenden mit Strg+C beenden.
//           `SHOW_THINKING` leer oder false, sonst scheitert jede Bewertung (JSON): Hybrid-Reihenfolge.
// Start:    npm run l07:9   (oder F5), Modell `lesson-07-rerank`
// Erklärt:  lessons/07-rag-open-webui/GUIDE.de.md → „Teil 9“
//
// Aufgabe:
//   1. Frage "Was ist PoisonGPT?" hier und in Teil 8: Welche Quellen steigen auf, welche fallen weg?
//      Mit Burp: Ist die Bewertung (`{"score": …}`) eines weggefallenen Chunks nachvollziehbar?
//   2. `RERANK_THINKING` in `qdrant-retrieval.ts` auf `false`, neu starten, dieselbe Frage: Wie schnell
//      kommt die Antwort, welche Bewertungen zeigt Burp, bleiben die Quellen?
//      ↺ Danach `RERANK_THINKING` auf `true` und neu starten.
//   3. `CANDIDATES` auf 5 (= `TOP_K`), neu starten: Warum ändert sich nur noch die Reihenfolge?
//      ↺ Danach `CANDIDATES` auf 8 und neu starten.
//
// Lesen: die Zeile `// KERN 1`. Der Rest ist wie in Teil 8.
import { createRagAnswer, startRag } from './rag.ts';
import { getCollectionName, rerankRetrieval, requireCollection } from './qdrant-retrieval.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-07-rerank';
// Standard: 5. So viele Chunks kommen nach dem Reranking in den Prompt.
const TOP_K = 5;
// Standard: 8. Ein Modellaufruf je Kandidat und Frage; was hier fehlt, kann nicht aufsteigen.
const CANDIDATES = 8;
// Standard: 400. So viele Zeichen eines Chunks sieht das Modell bei der Bewertung.
const TEXT_LIMIT = 400;
// Wie in Teil 8: Kandidaten je Liste und RRF-Dämpfung der Hybrid-Suche davor.
const CANDIDATES_PER_LIST = 20;
const RRF_K = 60;

async function main() {
  // Ohne die Collection aus Lektion 06, Teil 1 gibt es nichts zu durchsuchen: Abbruch mit klarer Meldung.
  await requireCollection(getCollectionName());
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    // KERN 1: Hybrid-Suche wie in Teil 8, dann bewertet das Chat-Modell jeden Kandidaten mit 0 bis 10.
    answer: createRagAnswer([], TOP_K, rerankRetrieval(CANDIDATES, TEXT_LIMIT, CANDIDATES_PER_LIST, RRF_K)),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
