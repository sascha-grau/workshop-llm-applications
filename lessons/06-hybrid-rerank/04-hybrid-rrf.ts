// Lektion 06 – Hybrid-Suche und Reranking, Teil 4: Hybrid-Suche mit Reciprocal Rank Fusion (RRF)
//
// Lernziel: RRF verbindet BM25- und Vektorliste über die Ränge, nicht über die Werte.
// Braucht:  Collections aus `npm run l06:1`, LM Studio mit E5.
// Start:    npm run l06:4   (oder F5)
// Erklärt:  lessons/06-hybrid-rerank/GUIDE.de.md → „Teil 4“
//
// Aufgabe:
//   1. Stimmen "RRF by hand" und "RRF Qdrant" überein? Rechne einen Wert mit 1 / (`RRF_K` + Rang) nach.
//   2. Lies die Zeilen "Rank 0 …": Welcher Spitzenplatz einer Liste fehlt in den Hybrid-Top-k, und warum?
//   3. Setze `RRF_K` auf 1, danach auf 1000: Welche Liste setzt sich bei kleinem `RRF_K` durch?
//      ↺ Danach zurücksetzen: `RRF_K` auf 60.
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Ausgabe.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, type ChunkMetadata } from '../shared/index.ts';
import { getQdrantClient, requireCollection, getCollectionName } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Standard: dieselben Fragen wie in Teil 3.
const QUESTIONS = [
  'PoisonGPT',
  'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?',
];
// Standard: 5 Treffer der Hybrid-Suche.
const TOP_K = 5;
// Standard: 20 Kandidaten je Liste. Was in keiner Liste so weit vorn steht, kann RRF nicht finden.
const CANDIDATES_PER_LIST = 20;
// Standard: 60, der Wert aus dem Originalartikel (docs/production.de.md#weiterlesen). Größer = die
// ersten Plätze haben weniger Vorsprung.
const RRF_K = 60;

/** Ein Treffer aus Qdrant, so weit dieses Programm ihn braucht. */
type Hit = { id: string | number; score: number; payload?: unknown };

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Die Suche sieht auch den internen Anhang.
// Lektion 07 ergänzt `PUBLIC_FILTER`; siehe docs/decisions.de.md#pre-filter.
async function main() {
  // Burp sieht nur das Embedding-Modell; der Qdrant-Client umgeht ihn (`getQdrantClient` in hybrid.ts).
  useBurpIfConfigured();

  await requireCollection(getCollectionName());
  await checkModelServer({ viaBurp: true });

  for (const question of QUESTIONS) {
    try {
      await logInvocation('Hybrid search', { model: remoteEmbeddingModel.name, collection: getCollectionName(), question }, async () => {
        const queryVector = await embeddings.embedQuery(embeddingQuery(question));

        // Beide Listen einzeln, nur zum Nachrechnen.
        const keyword = await getQdrantClient().query(getCollectionName(), { query: { text: question }, using: 'text', limit: CANDIDATES_PER_LIST, with_payload: true });
        const vector = await getQdrantClient().query(getCollectionName(), { query: queryVector, limit: CANDIDATES_PER_LIST, with_payload: true });

        // KERN 1: Hybrid in einer Anfrage. `prefetch` holt beide Listen, `query: { rrf }` fusioniert
        // sie auf dem Server.
        const hybrid = await getQdrantClient().query(getCollectionName(), {
          prefetch: [
            { query: { text: question }, using: 'text', limit: CANDIDATES_PER_LIST },
            { query: queryVector, limit: CANDIDATES_PER_LIST },
          ],
          query: { rrf: { k: RRF_K } },
          limit: TOP_K,
          with_payload: true,
        });

        // KERN 2: Jede Liste gibt 1 / (`RRF_K` + Rang), Rang ab 0 wie in Qdrant; fehlt der Chunk in
        // einer Liste (-1), gibt sie nichts.
        console.log(`Hybrid search (RRF, k = ${RRF_K}) for “${question}” – rank from 0 in both lists, RRF by hand next to Qdrant’s score:`);
        console.table(hybrid.points.map((hit, position) => {
          const ranks = [keyword.points, vector.points].map((list) => list.findIndex(({ id }) => id === hit.id));
          const byHand = ranks.filter((rank) => rank >= 0).reduce((sum, rank) => sum + 1 / (RRF_K + rank), 0);
          return {
            rank: position + 1,
            hit: `#${hit.id} ${shortSource(hit)}`,
            'keyword rank': ranks[0] >= 0 ? ranks[0] : '–',
            'vector rank': ranks[1] >= 0 ? ranks[1] : '–',
            'RRF by hand': byHand.toFixed(4),
            'RRF Qdrant': hit.score.toFixed(4),
          };
        }));

        // KERN 3: RRF belohnt Einigkeit, nicht Spitzenplätze. Eine leere Liste (BM25 ohne passendes
        // Wort) hat keinen Spitzenplatz.
        for (const [name, top] of [['keyword', keyword.points[0]], ['vector', vector.points[0]]] as const) {
          if (!top) {
            console.log(`Rank 0 ${name}: no hits`);
            continue;
          }
          const inHybrid = hybrid.points.some(({ id }) => id === top.id);
          console.log(`Rank 0 ${name}: #${top.id} ${shortSource(top)}, in the hybrid top ${TOP_K}: ${inHybrid ? 'yes' : 'no'}`);
        }
      });
    } catch {
      // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
      process.exitCode = 1;
    }
  }
}

function shortSource(hit: Hit): string {
  return (hit.payload as ChunkMetadata).source.split('-').slice(0, 2).join('-');
}

await runMain(main);
