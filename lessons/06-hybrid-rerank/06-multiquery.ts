// Lektion 06 – Hybrid-Suche und Reranking, Teil 6: Multi-Query
//
// Lernziel: Das Sprachmodell formuliert die Frage um; jede Fassung sucht, RRF führt die Listen zusammen.
// Braucht:  Collections aus `npm run l06:1`, LM Studio mit E5 und Chat-Modell; `SHOW_THINKING` leer.
// Start:    npm run l06:6   (oder F5)
// Erklärt:  lessons/06-hybrid-rerank/GUIDE.de.md → „Teil 6“
//
// Aufgabe:
//   1. Welche Fachbegriffe hat das Modell eingesetzt, die in der Originalfrage fehlen?
//   2. Wie viele Treffer stammen je Spalte aus `02-llm02-offenlegung-sensibler-informationen.md`?
//      Welche Treffer finden alle Listen ("found by")?
//   3. Setze `VARIANT_COUNT` auf 1, danach auf 5: Ändern mehr Fassungen die Treffer noch?
//      ↺ Danach zurücksetzen: `VARIANT_COUNT` auf 3.
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Ausgabe.
import { modelText, stripJsonFence } from '../shared/text.ts';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel, remoteModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { assertVectorCount, embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, type ChunkMetadata } from '../shared/index.ts';
import { getQdrantClient, requireCollection, getCollectionName } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Standard: die umgangssprachliche Frage aus Teil 2 bis 5.
const QUESTION = 'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?';
// Standard: 3 Fassungen; mit der Originalfrage `VARIANT_COUNT + 1` Suchen. Mehr = mehr Embeddings
// und eine längere Antwort des Modells.
const VARIANT_COUNT = 3;
// Standard: 5 Treffer nach der Fusion.
const TOP_K = 5;
// Standard: wie in Teil 4.
const CANDIDATES_PER_LIST = 20;
const RRF_K = 60;

// Genau `VARIANT_COUNT` Fassungen, keine leer. Kein `withStructuredOutput`, wie in Teil 5
// (docs/decisions.de.md#kein-structured-output).
const variantSchema = z.object({ variants: z.array(z.string().trim().min(1)).length(VARIANT_COUNT) });

/** Ein Treffer aus Qdrant, so weit dieses Programm ihn braucht. */
type Hit = { id: string | number; score: number; payload?: unknown };

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Die Suche sieht auch den internen Anhang.
// Lektion 07 ergänzt `PUBLIC_FILTER`; siehe docs/decisions.de.md#pre-filter.
async function main() {
  // Burp sieht Umformulieren und Embeddings, nie Qdrant (`getQdrantClient` in hybrid.ts).
  useBurpIfConfigured();

  const model = new ChatOpenAI({
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    maxRetries: 0,
    disableStreaming: true,
    temperature: 0,
    // Rohantwort behalten: Sie enthält die Denkschritte (siehe shared/text.ts).
    __includeRawResponse: true,
    configuration: { baseURL: remoteModel.baseURL },
  });

  await requireCollection(getCollectionName());
  // Chat- und Embedding-Modell laufen auf demselben Server, deshalb genügt eine Prüfung.
  await checkModelServer({ viaBurp: true });

  try {
    // KERN 1: Ein Modellaufruf für alle Fassungen, in der Fachsprache des Korpus.
    const started = performance.now();
    const variants = await logInvocation('LLM', { model: remoteModel.name, question: QUESTION }, async () => {
      const response = await model.invoke(
        `Formuliere diese Frage auf ${VARIANT_COUNT} verschiedene Arten neu, sachlich und mit Fachbegriffen der IT-Sicherheit. ` +
        `Antworte ausschließlich mit einem JSON-Objekt im Format {"variants": ["…", "…"]} mit genau ${VARIANT_COUNT} Einträgen. ` +
        `Frage: ${QUESTION}`,
      );
      const answer = modelText(response).trim();
      const json = stripJsonFence(answer);
      return variantSchema.parse(JSON.parse(json)).variants;
    });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`Multi-query for “${QUESTION}” (rewriting: 1 LLM call, ${seconds} s):`);
    variants.forEach((variant, position) => console.log(`Variant ${position + 1}: ${variant}`));

    await logInvocation('Multi-query search', { model: remoteEmbeddingModel.name, collection: getCollectionName(), listCount: variants.length + 1 }, async () => {
      // KERN 2: Die Originalfrage bleibt eine der Listen, damit abdriftende Fassungen sie nicht
      // verdrängen. `embedDocuments` mit "query: " bettet als Fragen ein: Das Präfix entscheidet.
      const texts = [QUESTION, ...variants];
      const vectors = await embeddings.embedDocuments(texts.map(embeddingQuery));
      assertVectorCount(vectors, texts.length);
      const lists = await Promise.all(vectors.map((vector) =>
        getQdrantClient().query(getCollectionName(), { query: vector, limit: CANDIDATES_PER_LIST, with_payload: true })));

      // KERN 3: Ein `prefetch` je Vektor, RRF über alle Listen (wie Teil 4, nur mit mehr als zwei).
      const multiQuery = await getQdrantClient().query(getCollectionName(), {
        prefetch: vectors.map((vector) => ({ query: vector, limit: CANDIDATES_PER_LIST })),
        query: { rrf: { k: RRF_K } },
        limit: TOP_K,
        with_payload: true,
      });

      console.log(`Original question against multi-query (${vectors.length} vectors, RRF k = ${RRF_K}) (#point document score):`);
      console.table(multiQuery.points.map((hit, position) => ({
        rank: position + 1,
        'original question (vector)': describeHit(lists[0].points[position]),
        [`multi-query (${vectors.length} vectors, RRF)`]: describeHit(hit),
        'found by': `${lists.filter(({ points }) => points.some(({ id }) => id === hit.id)).length} of ${lists.length} lists`,
      })));
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

function describeHit(hit?: Hit): string {
  if (!hit) return '';
  const { source } = hit.payload as ChunkMetadata;
  return `#${hit.id} ${source.split('-').slice(0, 2).join('-')} ${hit.score.toFixed(3)}`;
}

await runMain(main);
