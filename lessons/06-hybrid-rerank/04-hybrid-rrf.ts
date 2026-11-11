// Lektion 06 – Hybrid-Suche und Reranking, Teil 4: Hybrid-Suche mit Reciprocal Rank Fusion (RRF)
//
// Lernziel: Du kombinierst Keyword-Suche (Teil 2) und Vektorsuche (Teil 3) zu einer Hybrid-Suche und
// verstehst, wie RRF zwei Trefferlisten über ihre Ränge zusammenführt.
//
// Teil 3 hat gezeigt: BM25 und Vektorsuche versagen bei verschiedenen Fragen, und ihre Werte sind
// nicht vergleichbar (BM25 nach oben offen, Kosinus bei E5 meist 0,7 bis 0,9). RRF umgeht das: Es
// zählt nur, auf welchem Platz ein Chunk in jeder Liste steht. Qdrant erledigt die ganze Hybrid-Suche
// in einer Anfrage. Schritte, je Frage in `QUESTIONS`:
//   1. Frage einbetten, mit dem E5-Präfix "query: " (`embeddingQuery` setzt es davor).
//   2. Beide Listen einzeln holen, je `CANDIDATES_PER_LIST` Kandidaten: Keyword (BM25) und Vektor.
//      Sie dienen nur dem Vergleich in Schritt 4.
//   3. Hybrid-Suche: Qdrant holt dieselben beiden Listen selbst (`prefetch`) und fusioniert sie auf
//      dem Server mit RRF zu den besten `TOP_K`.
//   4. Nachrechnen: Für jeden Hybrid-Treffer zeigt die Tabelle seinen Rang in beiden Listen und den
//      RRF-Wert, von Hand gerechnet, neben dem Wert von Qdrant.
//
// RRF: Jede Liste gibt einem Chunk 1 / (RRF_K + Rang), mit Rang ab 0 wie in Qdrant; die Beiträge
// beider Listen werden addiert. Ein Chunk, der in einer Liste fehlt, bekommt von ihr nichts.
// `RRF_K` dämpft den Vorsprung der ersten Plätze: Bei 60 ist Platz 0 nur wenig mehr wert als Platz 5.
//
// Merke: RRF belohnt Einigkeit. Ein Chunk, der in beiden Listen weit vorn steht, schlägt den
// Spitzenplatz nur einer Liste; deshalb steht Platz 1 einer Liste nicht immer in den Hybrid-Top-k.
// RRF findet nichts, was in keiner Liste unter den ersten `CANDIDATES_PER_LIST` steht. Und RRF
// prüft nicht, ob ein Chunk die Frage beantwortet; das macht erst das Reranking im nächsten Teil.
//
// Voraussetzungen: Qdrant läuft (`QDRANT_URL` in .env), und Teil 1 hat die Collections geladen
// (`npm run l06:1`); LM Studio läuft mit gestartetem Server und geladenem E5-Modell. Ein Chat-Modell
// und Open WebUI braucht dieser Teil nicht. Burp ist optional.
// Start: npm run l06:4   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Vergleiche die Spalten "RRF by hand" und "RRF Qdrant": Stimmen sie überein? Rechne einen Wert
//      mit der Formel oben selbst nach.
//   2. Lies die Zeilen "Rank 0 …" unter jeder Tabelle: Welcher Spitzenplatz einer Liste fehlt in den
//      Hybrid-Top-k, und woran liegt es (Rang in der anderen Liste)?
//   3. Setze `RRF_K` auf 1 und danach auf 1000. Wie ändert sich die Reihenfolge, und welche Liste
//      setzt sich bei kleinem `RRF_K` durch?
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, type ChunkMetadata } from '../shared/index.ts';
import { getQdrantClient, requireCollection, getCollectionName } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Dieselben Fragen wie in Teil 2 und 3: ein seltener Fachbegriff und eine umgangssprachliche Frage.
const QUESTIONS = [
  'PoisonGPT',
  'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?',
];
// Wie viele Chunks die Hybrid-Suche liefert.
const TOP_K = 5;
// Wie viele Kandidaten jede Liste in die Fusion gibt. Was in keiner Liste so weit vorn steht, kann
// RRF nicht finden.
const CANDIDATES_PER_LIST = 20;
// NEU: Die Konstante k von RRF. Ein großer Wert glättet den Vorsprung der ersten Plätze; 60 ist der
// übliche Wert aus dem Originalartikel zu RRF.
const RRF_K = 60;

/** Ein Treffer aus Qdrant, so weit dieses Programm ihn braucht. */
type Hit = { id: string | number; score: number; payload?: unknown };

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Die Suche sieht alle Chunks, auch den internen Anhang. Lektion 07 ergänzt `PUBLIC_FILTER` (OWASP LLM02/LLM08).
async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Er sieht die Anfragen an das
  // Embedding-Modell, aber nicht die an Qdrant (siehe hybrid.ts).
  useBurpIfConfigured();

  await requireCollection(getCollectionName());
  await checkModelServer({ viaBurp: true });

  for (const question of QUESTIONS) {
    try {
      await logInvocation('Hybrid search', { model: remoteEmbeddingModel.name, collection: getCollectionName(), question }, async () => {
        // Schritt 1: Frage einbetten, wie in Teil 3.
        const queryVector = await embeddings.embedQuery(embeddingQuery(question));

        // Schritt 2: Beide Listen einzeln, nur zum Vergleich.
        const keyword = await getQdrantClient().query(getCollectionName(), { query: { text: question }, using: 'text', limit: CANDIDATES_PER_LIST, with_payload: true });
        const vector = await getQdrantClient().query(getCollectionName(), { query: queryVector, limit: CANDIDATES_PER_LIST, with_payload: true });

        // NEU: Schritt 3: Hybrid in einer Anfrage. `prefetch` holt beide Listen, `query: { rrf }`
        // fusioniert sie auf dem Server.
        const hybrid = await getQdrantClient().query(getCollectionName(), {
          prefetch: [
            { query: { text: question }, using: 'text', limit: CANDIDATES_PER_LIST },
            { query: queryVector, limit: CANDIDATES_PER_LIST },
          ],
          query: { rrf: { k: RRF_K } },
          limit: TOP_K,
          with_payload: true,
        });

        // NEU: Schritt 4: Nachrechnen. Rang ab 0; -1 heißt: Die Liste enthält den Chunk nicht.
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

        // RRF belohnt Einigkeit: Steht der Spitzenplatz jeder Liste auch in den Hybrid-Top-k? Eine
        // leere Liste (BM25 ohne passendes Wort) hat keinen Spitzenplatz.
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

// Das Dokument eines Treffers, nur der Anfang des Dateinamens (z. B. "03-llm03"), wie in Teil 3.
function shortSource(hit: Hit): string {
  return (hit.payload as ChunkMetadata).source.split('-').slice(0, 2).join('-');
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
