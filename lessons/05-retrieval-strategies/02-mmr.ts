// Lektion 05 – Retrieval-Strategien, Teil 2: MMR (Maximal Marginal Relevance)
//
// Lernziel: MMR wählt Treffer nacheinander und bestraft Chunks, die schon Gewähltem ähneln.
// Braucht:  wie Teil 1 (Index `headings`, LM Studio mit E5).
// Start:    npm run l05:2   (oder F5)
// Erklärt:  lessons/05-retrieval-strategies/GUIDE.de.md → „Teil 2“
//
// Aufgabe:
//   1. Ab welchem Wert in `LAMBDA_VALUES` ändert sich die Auswahl, nicht nur die Reihenfolge?
//      Passen die neuen Chunks besser oder schlechter zur Frage?
//   2. Setze `FETCH_K` erst auf den Wert von `TOP_K`, dann auf 50: Was bewirkt `LAMBDA` jeweils noch?
//      ↺ Danach zurücksetzen: `FETCH_K` auf 20.
//   3. Setze `QUESTION` auf 'Welche Risiken entstehen durch zu viele Berechtigungen?': Bei welchem
//      `LAMBDA` deckt die Auswahl mehr Dokumente ab als Top-k?
//      ↺ Danach zurücksetzen: `QUESTION` auf 'Wie verhindere ich Prompt Injection?'.
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Ausgabe.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { cosineSimilarity, embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, rankEntries, sectionPath } from '../shared/index.ts';
import { loadPublicIndex, INDEX_STRATEGY } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Standard: 'Wie verhindere ich Prompt Injection?'. "verhindere" statt "begrenze" wie in Teil 1:
// Dazu passen auch Abschnitte anderer Dokumente, sodass MMR etwas zur Auswahl hat.
const QUESTION = 'Wie verhindere ich Prompt Injection?';
// Standard: 3 Chunks, die am Ende in den Prompt kämen.
const TOP_K = 3;
// Standard: 20. MMR wählt nur aus diesen Kandidaten. Größer = mehr Vielfalt möglich, aber auch mehr
// schwache Treffer zur Wahl.
const FETCH_K = 20;
// Standard: [1, 0.6, 0.5]. 1 = reines Top-k, kleiner = mehr Vielfalt. Die Werte sind für E5 und
// diesen Index gewählt (eng beieinander liegende Ähnlichkeiten), kein allgemeiner Richtwert.
const LAMBDA_VALUES = [1, 0.6, 0.5];

async function main() {
  useBurpIfConfigured();

  const index = loadPublicIndex();
  console.log(`Index: ${index.length} public chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Search', { model: remoteEmbeddingModel.name, question: QUESTION }, async () => {
      // Der einzige Modellaufruf. MMR rechnet danach nur mit Vektoren, die schon im Index stehen.
      const queryVector = await embeddings.embedQuery(embeddingQuery(QUESTION));
      // KERN 1: Kandidaten holen: Top-k aus Teil 1, aber mit `FETCH_K`. Was hier fehlt, findet MMR nie.
      const candidates = rankEntries(index, queryVector, FETCH_K)
        .map((candidate, position) => ({ ...candidate, topKRank: position + 1 }));

      for (const lambda of LAMBDA_VALUES) {
        // KERN 2: Auswählen. Dieselben Kandidaten, je `lambda` eine andere Auswahl.
        const hits = selectByMmr(candidates, TOP_K, lambda);
        const documentCount = new Set(hits.map(({ metadata }) => metadata.source)).size;
        console.log(
          `MMR with lambda ${lambda} for “${QUESTION}”: ${hits.length} of ${candidates.length} candidates` +
          ` from ${documentCount} document(s)`,
        );
        console.table(hits.map(({ metadata, similarity, redundancy, topKRank }, position) => ({
          rank: position + 1,
          // Der Platz bei reinem Top-k. Lücken zeigen übersprungene Chunks.
          'top-k rank': topKRank,
          similarity: similarity.toFixed(3),
          // Der erste Chunk hat noch keinen Vorgänger, also keine Redundanz.
          redundancy: position === 0 ? '–' : redundancy.toFixed(3),
          file: metadata.source,
          // Der Überschriftenpfad ohne Dokumenttitel; "–" steht für Text direkt unter dem Titel.
          section: sectionPath(metadata.headingPath),
        })));
      }
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

// LEHRKOPIE (→ retrieval.ts#selectByMmr): hier zum Lesen, Teil 5 nutzt das Original. Ändere beide.
// Jede Runde nimmt den Kandidaten mit dem höchsten MMR-Wert; ab dann zählt er als "schon gesagt".
function selectByMmr<T extends { vector: number[]; similarity: number }>(candidates: T[], topK: number, lambda: number) {
  const remaining = [...candidates];
  const selected: (T & { redundancy: number })[] = [];

  while (selected.length < topK && remaining.length) {
    let best = { position: 0, score: -Infinity, redundancy: 0 };
    remaining.forEach((candidate, position) => {
      // Redundanz = Ähnlichkeit zum ähnlichsten schon gewählten Chunk. In Runde 1 ist sie 0, also
      // gewinnt der beste Top-k-Treffer.
      const redundancy = Math.max(0, ...selected.map(({ vector }) => cosineSimilarity(candidate.vector, vector)));
      // KERN 3: Relevanz belohnen, Redundanz bestrafen, gewichtet mit `lambda`. Negative Werte sind
      // normal; es zählt nur, welcher Kandidat vorn liegt.
      const score = lambda * candidate.similarity - (1 - lambda) * redundancy;
      if (score > best.score) best = { position, score, redundancy };
    });
    const [winner] = remaining.splice(best.position, 1);
    selected.push({ ...winner, redundancy: best.redundancy });
  }
  return selected;
}

await runMain(main);
