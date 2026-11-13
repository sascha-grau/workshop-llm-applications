// Lektion 06 – Hybrid-Suche und Reranking, Teil 7: Alle Verfahren im Vergleich
//
// Lernziel: Alle Verfahren der Lektion auf denselben zwei Fragen vergleichen, samt ihren Kosten.
// Braucht:  Collections aus `npm run l06:1`, LM Studio mit E5 und Chat-Modell; `SHOW_THINKING` leer.
// Start:    npm run l06:7   (oder F5; Datei 99, aber Teil 7)
// Erklärt:  lessons/06-hybrid-rerank/GUIDE.de.md → „Teil 7“
//
// Aufgabe:
//   1. Bei welcher Frage hilft die Hybrid-Suche gegenüber der besseren der beiden Einzelsuchen?
//   2. Welches Verfahren bringt mehr Treffer aus `02-llm02-offenlegung-sensibler-informationen.md`
//      nach vorn, Reranking oder Multi-Query, und was kostet es?
//   3. Setze `COLLOQUIAL_QUESTION` auf eine Frage aus `question-set.json` (Lektion 05): Welche
//      Kombination würdest du für sie einsetzen?  ↺ Danach `COLLOQUIAL_QUESTION` zurücksetzen.
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Ausgabe und Kostenzählung.
import { modelText, stripJsonFence } from '../shared/text.ts';
import { ChatOpenAI } from '@langchain/openai';
import { createJsonChatModel } from '../shared/chat-model.ts';
import { z } from 'zod';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel, remoteModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { assertVectorCount, embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, type ChunkMetadata } from '../shared/index.ts';
import { getQdrantClient, requireCollection, getCollectionName } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Standard: die beiden Fragen aus Teil 3 bis 6, ein Fachbegriff und eine umgangssprachliche Frage.
const TECHNICAL_TERM = 'PoisonGPT';
const COLLOQUIAL_QUESTION = 'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?';
// Standard: 5 Treffer je Suche.
const TOP_K = 5;
// Standard für alle übrigen Werte: dieselben wie in Teil 4 bis 6.
const CANDIDATES_PER_LIST = 20;
const RRF_K = 60;
const RERANK_CANDIDATES = 8;
const TEXT_LIMIT = 400;
const VARIANT_COUNT = 3;
// Standard: true. Das Modell denkt vor jeder Bewertung: sinnvolle Noten, aber langsam.
// false = `reasoning_effort: none`: schnell, doch der kleine Judge bewertet fast alles mit 0.
// Gedacht zum Umschalten und Vergleichen (docs/decisions.de.md#rerank-denken).
const RERANK_THINKING = true;

// Kein `withStructuredOutput`, wie in Teil 5 und 6 (docs/decisions.de.md#kein-structured-output).
const ratingSchema = z.object({ score: z.number().int().min(0).max(10) });
const variantSchema = z.object({ variants: z.array(z.string().trim().min(1)).length(VARIANT_COUNT) });

/** Ein Treffer aus Qdrant, so weit dieses Programm ihn braucht. */
type Hit = { id: string | number; score: number; payload?: unknown };

// Kosten je Schritt; `resetCost` setzt sie vor jedem Schritt zurück.
const cost = { llmCalls: 0, llmTokens: 0, started: 0 };
const resetCost = () => Object.assign(cost, { llmCalls: 0, llmTokens: 0, started: performance.now() });
const describeCost = () =>
  `${cost.llmCalls} LLM calls, ${cost.llmTokens} tokens, ${((performance.now() - cost.started) / 1000).toFixed(1)} s`;

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Auch der interne Anhang kann hier im Prompt des
// Chat-Modells landen. Lektion 07 ergänzt `PUBLIC_FILTER`; siehe docs/decisions.de.md#pre-filter.
async function main() {
  // Burp sieht Embedding- und Chat-Aufrufe, nie Qdrant (`getQdrantClient` in hybrid.ts).
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
    callbacks: [{ handleLLMEnd: (output) => { cost.llmTokens += output.llmOutput?.tokenUsage?.totalTokens ?? 0; } }],
  });
  const ratingModel = createJsonChatModel({
    thinking: RERANK_THINKING,
    // Großzügiges Zeitlimit: LM Studio arbeitet parallele Anfragen nacheinander ab, denkende Bewertungen warten lange.
    timeout: 600_000,
    callbacks: [{ handleLLMEnd: (output) => { cost.llmTokens += output.llmOutput?.tokenUsage?.totalTokens ?? 0; } }],
  });
  const askForJson = async <T>(prompt: string, schema: z.ZodType<T>, chatModel = model): Promise<T> => {
    cost.llmCalls += 1;
    const answer = modelText(await chatModel.invoke(prompt)).trim();
    const json = stripJsonFence(answer);
    return schema.parse(JSON.parse(json));
  };

  await requireCollection(getCollectionName());
  // Chat- und Embedding-Modell laufen auf demselben Server, deshalb genügt eine Prüfung.
  await checkModelServer({ viaBurp: true });

  try {
    // KERN 1: BM25, Vektor und Hybrid für beide Fragen. Reranking und Multi-Query bauen auf den
    // Ergebnissen der umgangssprachlichen Frage auf.
    await compareSearches(TECHNICAL_TERM);
    const { queryVector, vector, hybrid } = await compareSearches(COLLOQUIAL_QUESTION);

    // KERN 2: Reranking (Teil 5), ein Aufruf je Kandidat. Eine unbrauchbare Antwort ist protokolliert;
    // der Kandidat bekommt -1 und bleibt hinter den bewerteten.
    resetCost();
    const rated = await Promise.all(hybrid.map(async (hit) => {
      const rating = await logInvocation('LLM', { model: remoteModel.name, point: hit.id }, async () => askForJson(
        'Wie gut beantwortet der Abschnitt die Frage? Vergib eine ganze Zahl von 0 (gar nicht) bis 10 (vollständig). ' +
        'Antworte ausschließlich mit einem JSON-Objekt im Format {"score": 7}.\n\n' +
        `Frage: ${COLLOQUIAL_QUESTION}\n\nAbschnitt:\n${(hit.payload as { text: string }).text.slice(0, TEXT_LIMIT)}`,
        ratingSchema,
        ratingModel,
      )).catch(() => undefined);
      return { ...hit, score: rating?.score ?? -1 };
    }));
    // `toSorted` ist stabil: Bei gleicher Zahl bleibt die RRF-Reihenfolge.
    const reranked = rated.toSorted((a, b) => b.score - a.score);
    console.log(`Reranking the hybrid top ${RERANK_CANDIDATES} for “${COLLOQUIAL_QUESTION}” (LLM, pointwise 0–10) – cost: ${describeCost()}`);
    printColumns({ 'before (RRF)': hybrid, 'after (LLM 0–10)': reranked }, RERANK_CANDIDATES);

    // KERN 3: Multi-Query (Teil 6), ein Aufruf je Frage. Der Vektor der Originalfrage bleibt eine der Listen.
    resetCost();
    const { variants } = await logInvocation('LLM', { model: remoteModel.name, question: COLLOQUIAL_QUESTION }, async () => askForJson(
      `Formuliere diese Frage auf ${VARIANT_COUNT} verschiedene Arten neu, sachlich und mit Fachbegriffen der IT-Sicherheit. ` +
      `Antworte ausschließlich mit einem JSON-Objekt im Format {"variants": ["…", "…"]} mit genau ${VARIANT_COUNT} Einträgen. ` +
      `Frage: ${COLLOQUIAL_QUESTION}`,
      variantSchema,
    ));
    console.log(`Multi-query for “${COLLOQUIAL_QUESTION}”:`);
    variants.forEach((variant, position) => console.log(`Variant ${position + 1}: ${variant}`));
    const variantVectors = await embeddings.embedDocuments(variants.map(embeddingQuery));
    assertVectorCount(variantVectors, variants.length);
    const vectors = [queryVector, ...variantVectors];
    const { points: multiQuery } = await getQdrantClient().query(getCollectionName(), {
      prefetch: vectors.map((query) => ({ query, limit: CANDIDATES_PER_LIST })),
      query: { rrf: { k: RRF_K } },
      limit: TOP_K,
      with_payload: true,
    });
    console.log(`Multi-query cost: ${describeCost()} – ${vectors.length} vectors, fusion: RRF in Qdrant (k = ${RRF_K})`);
    printColumns({ 'original question (vector)': vector, [`multi-query (${vectors.length} vectors, RRF)`]: multiQuery });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

// Die Hybrid-Suche holt `RERANK_CANDIDATES` Treffer für das Reranking; die Tabelle zeigt nur `TOP_K`.
async function compareSearches(question: string) {
  return logInvocation('Search', { model: remoteEmbeddingModel.name, collection: getCollectionName(), question }, async () => {
    const queryVector = await embeddings.embedQuery(embeddingQuery(question));
    const { points: keyword } = await getQdrantClient().query(getCollectionName(), { query: { text: question }, using: 'text', limit: TOP_K, with_payload: true });
    const { points: vector } = await getQdrantClient().query(getCollectionName(), { query: queryVector, limit: TOP_K, with_payload: true });
    const { points: hybrid } = await getQdrantClient().query(getCollectionName(), {
      prefetch: [
        { query: { text: question }, using: 'text', limit: CANDIDATES_PER_LIST },
        { query: queryVector, limit: CANDIDATES_PER_LIST },
      ],
      query: { rrf: { k: RRF_K } },
      limit: RERANK_CANDIDATES,
      with_payload: true,
    });
    console.log(`Top ${TOP_K} for “${question}” (#point document score) – fusion: RRF in Qdrant (k = ${RRF_K})`);
    printColumns({ 'keyword (BM25)': keyword, vector, 'hybrid (RRF)': hybrid });
    return { queryVector, vector, hybrid };
  });
}

function printColumns(columns: Record<string, Hit[]>, rows = TOP_K): void {
  console.table(Array.from({ length: rows }, (_unused, position) => ({
    rank: position + 1,
    ...Object.fromEntries(Object.entries(columns).map(([name, hits]) => [name, describeHit(hits[position])])),
  })));
}

// Ganze Zahlen sind Bewertungen des Modells; -1 (unbrauchbare Antwort) erscheint als "–".
function describeHit(hit?: Hit): string {
  if (!hit) return '';
  const { source } = hit.payload as ChunkMetadata;
  const score = hit.score === -1 ? '–' : Number.isInteger(hit.score) ? String(hit.score) : hit.score.toFixed(3);
  return `#${hit.id} ${source.split('-').slice(0, 2).join('-')} ${score}`;
}

await runMain(main);
