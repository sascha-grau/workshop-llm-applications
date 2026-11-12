// Suche über Qdrant für Teil 8 bis 10 von Lektion 07: Hybrid-Suche (BM25 + Vektor, RRF), Reranking
// und Multi-Query aus Lektion 06. Die Funktionen sind `Retrieve`-Fabriken wie in `retrieval.ts`; der
// Index-Parameter bleibt ungenutzt (leer), denn die Chunks liegen in der Collection aus Lektion 06,
// Teil 1. Aufgaben, die sonst `loadRagIndex` erledigt (nur öffentliche Chunks), übernimmt hier
// `PUBLIC_FILTER`.
//
// Logging-Regel (siehe shared/logging.ts): Fragen, Antworten und Chunk-Texte kommen nie ins Log.
// Die Aufrufe unten protokollieren nur Zahlen (Anzahl und Länge der Fassungen, Länge der Frage,
// Punkt-IDs), keine Texte.
import { modelText, stripJsonFence } from '../shared/text.ts';
import { z } from 'zod';
import { getQdrantClient, requireCollection, getCollectionName } from '../06-hybrid-rerank/hybrid.ts';
import { abortable } from '../shared/abort.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { INTERNAL_DOCUMENTS, indexEntrySchema } from '../shared/index.ts';
import { isAbortError, log, logInvocation } from '../shared/logging.ts';
import { remoteModel } from '../shared/config.ts';
import { embedRagQuestions, type RagSource, type RetrievalContext, type Retrieve } from './rag.ts';

export { requireCollection, getCollectionName };

// Der Pre-Filter für Qdrant: nur Zugriffsgruppe `public`, und nie ein Dokument aus
// `INTERNAL_DOCUMENTS`. Er muss an jede Teilsuche (`prefetch`) und an die fusionierte Anfrage:
// Ein Filter an der äußeren Anfrage allein käme zu spät, denn die Kandidatenlisten würden
// ungefiltert gebildet, und die Fusion könnte interne Chunks enthalten oder die Listen mit Treffern
// füllen, die danach wegfallen. So wirkt der Filter vor der Suche, wie in Lektion 05, Teil 3.
export const PUBLIC_FILTER = {
  must: [{ key: 'accessGroup', match: { value: 'public' } }],
  must_not: INTERNAL_DOCUMENTS.map((source) => ({ key: 'source', match: { value: source } })),
};

// Prüft die Payload eines Qdrant-Punkts: Chunk-Text plus Metadaten (wie im Index aus Lektion 04).
const payloadSchema = z.object({ text: indexEntrySchema.shape.text, ...indexEntrySchema.shape.metadata.shape });
type Hit = { id: string | number; score: number; payload?: unknown };

// Wandelt einen Qdrant-Treffer in eine Quelle für den Kontext um (Text und Metadaten); die Payload
// wird dabei geprüft, ein beschädigter Punkt wirft einen Fehler.
export function sourceFromHit(hit: Hit): RagSource {
  const { text, ...metadata } = payloadSchema.parse(hit.payload);
  return { text, metadata };
}

// Eine Hybrid-Anfrage an Qdrant: `prefetch` holt zwei Kandidatenlisten (BM25 über das Textfeld mit
// dem Fragetext, Vektorsuche mit `queryVector`), je `candidatesPerList`; Qdrant fusioniert sie mit
// RRF und gibt `limit` Treffer zurück. `abortable` bricht das Warten ab, wenn Open WebUI die
// Anfrage abbricht (der Qdrant-Client kennt kein Signal).
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

// Hybrid-Suche als Trefferauswahl (Lektion 06, Teil 4).
export const hybridRetrieval = (candidatesPerList: number, rrfK: number): Retrieve =>
  async (_index, queryVector, topK, context) =>
    (await hybridSearch(queryVector, context, topK, candidatesPerList, rrfK)).map(sourceFromHit);

// Antwortformat der Bewertung: eine ganze Zahl von 0 bis 10.
const ratingSchema = z.object({ score: z.number().int().min(0).max(10) });
// Liest JSON aus einer Modellantwort. Kleine Modelle verpacken es oft in einen ```json-Block;
// den entfernt die Funktion vorher.
const jsonFromAnswer = (answer: string) =>
  JSON.parse(stripJsonFence(answer));

// Reranking (Lektion 06, Teil 5): holt `candidates` Treffer per Hybrid-Suche, lässt das Chat-Modell
// jeden einzeln bewerten (pointwise, parallel, nur die ersten `textLimit` Zeichen) und behält die
// besten `topK`. Eine fehlgeschlagene Bewertung (kein gültiges JSON) zählt als -1: Der Chunk
// fällt ans Ende, die Antwort bricht nicht ab. Ein Abbruch durch Open WebUI dagegen wird weitergereicht.
export const rerankRetrieval = (candidates: number, textLimit: number, candidatesPerList: number, rrfK: number): Retrieve =>
  async (_index, queryVector, topK, context) => {
    const { question, chatModel, signal } = context;
    const hybrid = await hybridSearch(queryVector, context, candidates, candidatesPerList, rrfK);
    const rated = await Promise.all(hybrid.map(async (hit) => {
      const source = sourceFromHit(hit);
      const rating = await logInvocation('LLM reranking', { model: remoteModel.name, point: hit.id }, async () => {
        signal.throwIfAborted();
        const response = await chatModel.invoke(
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

// Multi-Query (Lektion 06, Teil 6): Das Chat-Modell formuliert die Frage `variantCount`-mal um, die
// Originalfrage und jede Fassung werden mit je einer Vektorsuche gesucht, Qdrant fusioniert alle
// Listen mit RRF. Anders als bei der Hybrid-Suche läuft hier kein BM25. Ein Fehler beim
// Umformulieren (z. B. falsche Zahl von Fassungen) bricht die Frage ab.
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
