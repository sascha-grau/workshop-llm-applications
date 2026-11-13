// Baut die zehn Modelle für Teil 11 (`99-full-demo.ts`). Die Werte sind Kopien der Konstanten aus
// Teil 1 bis 10 (`SYNC` je Zeile) und folgen deren Änderungen nicht.
// Erklärt: lessons/07-rag-open-webui/GUIDE.de.md → „Teil 11“
import { createRagAnswer, loadRagIndex, retrieveQuestionChunks, NO_RAG_MODELS_MESSAGE, type RagEntry, type RagModel } from './rag.ts';
import { buildChildren, parentRetrieval } from './parent-document.ts';
import { metadataRetrieval, mmrRetrieval, NO_SOURCES_ANSWER, thresholdRetrieval } from './retrieval.ts';
import { getCollectionName, hybridRetrieval, multiqueryRetrieval, rerankRetrieval, requireCollection } from './qdrant-retrieval.ts';
import type { Strategy } from '../shared/index.ts';
import { log } from '../shared/logging.ts';

// SYNC (→ 06-metadata-filter-rag.ts#ALLOWED_SOURCES)
const ALLOWED_SOURCES = ['01-llm01-prompt-injection.md'];

// Fehlt einem Modell eine Voraussetzung, schreibt `add` eine WARN-Zeile samt `fix` und überspringt nur
// dieses Modell: Die Demo läuft auch ohne Qdrant. Indizes und die Qdrant-Prüfung laufen je nur einmal.
export async function loadDemoModels(checkServer: () => Promise<void>): Promise<RagModel[]> {
  const models: RagModel[] = [];
  const indexes = new Map<Strategy, RagEntry[] | Error>();
  const index = (strategy: Strategy): RagEntry[] => {
    if (!indexes.has(strategy)) {
      try { indexes.set(strategy, loadRagIndex(strategy)); }
      catch (error) { indexes.set(strategy, error instanceof Error ? error : new Error(String(error))); }
    }
    const result = indexes.get(strategy)!;
    if (result instanceof Error) throw result;
    return result;
  };
  let collectionReady: Promise<void> | undefined;
  const collection = () => collectionReady ??= requireCollection(getCollectionName());
  const add = async (advertisedModel: string, fix: string, answer: () => RagModel['answer'] | Promise<RagModel['answer']>) => {
    try { models.push({ advertisedModel, answer: await answer() }); }
    catch (error) {
      log('WARN', 'Skipping unavailable RAG model', {
        advertisedModel, reason: error instanceof Error ? error.message : String(error), fix,
      });
    }
  };

  await add('lesson-07-headings', 'npm run l04:0, then npm run l04:2', () => createRagAnswer(index('headings'), 3)); // SYNC (→ 01-heading-rag.ts#TOP_K)
  await add('lesson-07-semantic', 'npm run l04:0, then npm run l04:3', () => createRagAnswer(index('semantic'), 3)); // SYNC (→ 02-semantic-rag.ts#TOP_K)
  await add('lesson-07-questions', 'npm run l04:0, then npm run l04:4', () => createRagAnswer(index('questions'), 3, retrieveQuestionChunks)); // SYNC (→ 03-question-generation-rag.ts#TOP_K)
  await add('lesson-07-parent-document', 'Start LM Studio; npm run l04:0, then npm run l04:2', async () => {
    const parents = index('headings');
    await checkServer();
    // SYNC (→ 04-parent-document-rag.ts#CHILD_SIZE): ebenso `TOP_K` und `CHILD_CANDIDATES`.
    const children = await buildChildren(parents, 300);
    return createRagAnswer(parents, 5, parentRetrieval(children, 4 * 5));
  });
  await add('lesson-07-mmr', 'npm run l04:0, then npm run l04:2', () => createRagAnswer(index('headings'), 3, mmrRetrieval(20, 0.5))); // SYNC (→ 05-mmr-rag.ts#LAMBDA): ebenso `TOP_K`, `FETCH_K`
  // SYNC (→ 06-metadata-filter-rag.ts#TOP_K)
  await add('lesson-07-metadata-filter', 'npm run l04:0, then npm run l04:2', () => createRagAnswer(index('headings'), 3,
    metadataRetrieval((metadata) => ALLOWED_SOURCES.includes(metadata.source)), { noSourcesAnswer: NO_SOURCES_ANSWER }));
  // SYNC (→ 07-score-threshold-rag.ts#SCORE_THRESHOLD): ebenso `MAX_K`.
  await add('lesson-07-score-threshold', 'npm run l04:0, then npm run l04:2', () => createRagAnswer(index('headings'), 5,
    thresholdRetrieval(0.83), { noSourcesAnswer: NO_SOURCES_ANSWER }));
  await add('lesson-07-hybrid', 'Start Qdrant; npm run l06:1', async () => {
    await collection();
    // SYNC (→ 08-hybrid-rag.ts#TOP_K): ebenso `CANDIDATES_PER_LIST`, `RRF_K`.
    return createRagAnswer([], 5, hybridRetrieval(20, 60));
  });
  await add('lesson-07-rerank', 'Start Qdrant; npm run l06:1', async () => {
    await collection();
    // SYNC (→ 09-rerank-rag.ts#CANDIDATES): ebenso `TOP_K`, `TEXT_LIMIT`, `CANDIDATES_PER_LIST`, `RRF_K`.
    return createRagAnswer([], 5, rerankRetrieval(8, 400, 20, 60));
  });
  await add('lesson-07-multiquery', 'Start Qdrant; npm run l06:1', async () => {
    await collection();
    // SYNC (→ 10-multiquery-rag.ts#VARIANT_COUNT): ebenso `TOP_K`, `CANDIDATES_PER_LIST`, `RRF_K`.
    return createRagAnswer([], 5, multiqueryRetrieval(3, 20, 60));
  });
  if (!models.length) throw new Error(NO_RAG_MODELS_MESSAGE);
  return models;
}
