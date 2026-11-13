// Trefferauswahl in Qdrant für Teil 8 bis 10: Hybrid-Suche, Reranking und Multi-Query aus Lektion 06.
// Der Index-Parameter von `Retrieve` bleibt leer; die Chunks liegen in der Collection aus `npm run l06:1`.
// Fragen, Antworten und Chunk-Texte kommen nie ins Log, nur Zahlen und Punkt-IDs (shared/logging.ts).
// Erklärt: lessons/07-rag-open-webui/GUIDE.de.md
import { modelText, stripJsonFence } from '../shared/text.ts';
import { z } from 'zod';
import { getQdrantClient, requireCollection, getCollectionName } from '../06-hybrid-rerank/hybrid.ts';
import { abortable } from '../shared/abort.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { INTERNAL_DOCUMENTS, indexEntrySchema } from '../shared/index.ts';
import { isAbortError, log, logInvocation } from '../shared/logging.ts';
import { remoteModel } from '../shared/config.ts';
import { createJsonChatModel } from '../shared/chat-model.ts';
import { embedRagQuestions, type RagSource, type RetrievalContext, type Retrieve } from './rag.ts';

export { requireCollection, getCollectionName };

// Sicherheit: Pre-Filter wie `loadRagIndex`, an jeder Teilsuche (`prefetch`) und an der Fusion. Nur
// außen wäre zu spät: Die Kandidatenlisten enthielten interne Chunks. Siehe docs/decisions.de.md#pre-filter
export const PUBLIC_FILTER = {
  must: [{ key: 'accessGroup', match: { value: 'public' } }],
  must_not: INTERNAL_DOCUMENTS.map((source) => ({ key: 'source', match: { value: source } })),
};

// Chunk-Text plus Metadaten, wie im Index aus Lektion 04.
const payloadSchema = z.object({ text: indexEntrySchema.shape.text, ...indexEntrySchema.shape.metadata.shape });
type Hit = { id: string | number; score: number; payload?: unknown };

// Ein beschädigter Punkt wirft einen Fehler, statt halbe Daten in den Prompt zu legen.
export function sourceFromHit(hit: Hit): RagSource {
  const { text, ...metadata } = payloadSchema.parse(hit.payload);
  return { text, metadata };
}

// Eine Anfrage: zwei Kandidatenlisten (BM25 über den Fragetext, Vektor), Fusion mit RRF in Qdrant.
// Der Qdrant-Client kennt kein Abbruch-Signal; `abortable` hört nur auf zu warten.
export async function hybridSearch(
  queryVector: number[], context: RetrievalContext, limit: number, candidatesPerList: number, rrfK: number,
): Promise<Hit[]> {
  const { question, signal } = context;
  signal.throwIfAborted();
  const result = await abortable(getQdrantClient().query(getCollectionName(), {
    prefetch: [
      { query: { text: question }, using: 'text', limit: candidatesPerList, filter: PUBLIC_FILTER },
      { query: queryVector, limit: candidatesPerList, filter: PUBLIC_FILTER },
    ],
    query: { rrf: { k: rrfK } }, filter: PUBLIC_FILTER, limit, with_payload: true,
  }), signal);
  signal.throwIfAborted();
  return result.points;
}

export const hybridRetrieval = (candidatesPerList: number, rrfK: number): Retrieve =>
  async (_index, queryVector, topK, context) =>
    (await hybridSearch(queryVector, context, topK, candidatesPerList, rrfK)).map(sourceFromHit);

const ratingSchema = z.object({ score: z.number().int().min(0).max(10) });
// Großzügiges Zeitlimit statt des kurzen Standards: LM Studio arbeitet die parallelen Bewertungen nacheinander
// ab, und denkende Aufrufe warten sonst in der Warteschlange ins Zeitlimit.
const RERANK_TIMEOUT_MS = 600_000;
// Standard: true. Das Modell denkt vor jeder Bewertung: sinnvolle Noten, aber langsam.
// false = `reasoning_effort: none`: schnell, doch der kleine Judge bewertet fast alles mit 0.
// Gedacht zum Umschalten und Vergleichen (docs/decisions.de.md#rerank-denken).
const RERANK_THINKING = true;
// Kleine Modelle verpacken JSON oft in einen ```json-Block.
const jsonFromAnswer = (answer: string) =>
  JSON.parse(stripJsonFence(answer));

// Reranking (Lektion 06, Teil 5), pointwise und parallel. Eine ungültige Bewertung zählt als -1: Der
// Chunk fällt ans Ende, statt die Antwort abzubrechen. Das Log zeigt nur Punkt-IDs, die Zahl sieht Burp.
export const rerankRetrieval = (candidates: number, textLimit: number, candidatesPerList: number, rrfK: number): Retrieve =>
  async (_index, queryVector, topK, context) => {
    const { question, signal } = context;
    const hybrid = await hybridSearch(queryVector, context, candidates, candidatesPerList, rrfK);
    const ratingModel = createJsonChatModel({ thinking: RERANK_THINKING, timeout: RERANK_TIMEOUT_MS });
    const rated = await Promise.all(hybrid.map(async (hit) => {
      const source = sourceFromHit(hit);
      const rating = await logInvocation('LLM reranking', { model: remoteModel.name, point: hit.id }, async () => {
        signal.throwIfAborted();
        const response = await ratingModel.invoke(
          'Wie gut beantwortet der Abschnitt die Frage? Vergib eine ganze Zahl von 0 (gar nicht) bis 10 (vollständig). ' +
          'Antworte ausschließlich mit einem JSON-Objekt im Format {"score": 7}.\n\n' +
          `Frage: ${question}\n\nAbschnitt:\n${source.text.slice(0, textLimit)}`,
          { signal },
        );
        return ratingSchema.parse(jsonFromAnswer(modelText(response))).score;
      }).catch((error) => {
        if (isAbortError(error, signal)) throw error;
        return undefined;
      });
      return { source, score: rating ?? -1 };
    }));
    signal.throwIfAborted();
    return rated.toSorted((a, b) => b.score - a.score).slice(0, topK).map(({ source }) => source);
  };

// Multi-Query (Lektion 06, Teil 6): nur Vektorsuche, kein BM25. Die Originalfrage bleibt eine Liste,
// damit abdriftende Fassungen sie nicht verdrängen. Ungültiges JSON beim Umformulieren bricht die Frage ab.
export const multiqueryRetrieval = (variantCount: number, candidatesPerList: number, rrfK: number): Retrieve =>
  async (_index, queryVector, topK, { question, chatModel, signal }) => {
    const variantSchema = z.object({ variants: z.array(z.string().trim().min(1)).length(variantCount) });
    signal.throwIfAborted();
    const variants = await logInvocation('LLM query rewriting', { model: remoteModel.name, questionLength: question.length }, async () => {
      const response = await chatModel.invoke(
        `Formuliere diese Frage auf ${variantCount} verschiedene Arten neu, sachlich und mit Fachbegriffen der IT-Sicherheit. ` +
        `Antworte ausschließlich mit einem JSON-Objekt im Format {"variants": ["…", "…"]} mit genau ${variantCount} Einträgen. ` +
        `Frage: ${question}`,
        { signal },
      );
      return variantSchema.parse(jsonFromAnswer(modelText(response))).variants;
    });
    log('INFO', 'Multi-query variants', { count: variants.length, lengths: variants.map((variant) => variant.length) });
    const vectors = [queryVector, ...await embedRagQuestions(variants.map(embeddingQuery), signal)];
    signal.throwIfAborted();
    const result = await abortable(getQdrantClient().query(getCollectionName(), {
      prefetch: vectors.map((vector) => ({ query: vector, limit: candidatesPerList, filter: PUBLIC_FILTER })),
      query: { rrf: { k: rrfK } }, filter: PUBLIC_FILTER, limit: topK, with_payload: true,
    }), signal);
    signal.throwIfAborted();
    return result.points.map(sourceFromHit);
  };
