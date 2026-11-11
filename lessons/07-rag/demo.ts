// Baut die Modelle für Teil 11 (`11-full-demo.ts`): alle zehn Pipelines aus Teil 1 bis 10 in einer
// Fassade. Die Werte (TOP_K, `CHILD_SIZE`, `LAMBDA`, Schwellenwert usw.) stehen hier noch einmal
// als nackte Zahlen; sie sind eine Kopie der Konstanten aus den Teilen und folgen deren
// Änderungen nicht. Ändert sich ein Wert in einem Teil, muss er hier nachgezogen werden, und
// umgekehrt. Woher welcher Wert stammt, steht im Kommentar an der jeweiligen Zeile in `loadDemoModels`.
import { createRagAnswer, loadRagIndex, retrieveQuestionChunks, NO_RAG_MODELS_MESSAGE, type RagEntry, type RagModel } from './rag.ts';
import { buildChildren, parentRetrieval } from './parent-document.ts';
import { metadataRetrieval, mmrRetrieval, NO_SOURCES_ANSWER, thresholdRetrieval } from './retrieval.ts';
import { getCollectionName, hybridRetrieval, multiqueryRetrieval, rerankRetrieval, requireCollection } from './qdrant-retrieval.ts';
import type { Strategy } from '../shared/index.ts';
import { log } from '../shared/logging.ts';

// Wie `ALLOWED_SOURCES` in Teil 6: Dokumente, die der Metadaten-Filter durchlässt.
const ALLOWED_SOURCES = ['01-llm01-prompt-injection.md'];

// Liefert die Modelle, deren Voraussetzungen erfüllt sind. Für die anderen schreibt `add` eine
// WARN-Zeile mit dem Grund und dem Skript, das ihn behebt (`fix`), und überspringt sie: So läuft
// die Demo auch mit nur einem Teil der Indizes, etwa ohne Qdrant. Ein Index wird nur einmal
// geladen (`index`), die Qdrant-Prüfung nur einmal (`collection`), auch wenn mehrere Modelle sie
// brauchen. Fehlt jedes Modell, bricht der Start ab.
// `checkServer` kommt von `startRag` (gemeinsame, einmalige Erreichbarkeitsprüfung); nur das Modell
// für Teil 4 ruft sie schon hier auf, weil es beim Aufbau Kinder einbettet.
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

  await add('lesson-07-headings', 'npm run l04:0, then npm run l04:2', () => createRagAnswer(index('headings'), 3)); // TOP_K aus 01-heading-rag.ts
  await add('lesson-07-semantic', 'npm run l04:0, then npm run l04:3', () => createRagAnswer(index('semantic'), 3)); // TOP_K aus 02-semantic-rag.ts
  await add('lesson-07-questions', 'npm run l04:0, then npm run l04:4', () => createRagAnswer(index('questions'), 3, retrieveQuestionChunks)); // TOP_K aus 03-question-generation-rag.ts
  await add('lesson-07-parent-document', 'Start LM Studio; npm run l04:0, then npm run l04:2', async () => {
    const parents = index('headings');
    await checkServer();
    // CHILD_SIZE (300), TOP_K (5) und CHILD_CANDIDATES (4 * TOP_K) aus 04-parent-document-rag.ts.
    const children = await buildChildren(parents, 300);
    return createRagAnswer(parents, 5, parentRetrieval(children, 4 * 5));
  });
  await add('lesson-07-mmr', 'npm run l04:0, then npm run l04:2', () => createRagAnswer(index('headings'), 3, mmrRetrieval(20, 0.5))); // TOP_K, FETCH_K und LAMBDA aus 05-mmr-rag.ts
  // TOP_K aus 06-metadata-filter-rag.ts; ALLOWED_SOURCES steht oben in dieser Datei.
  await add('lesson-07-metadata-filter', 'npm run l04:0, then npm run l04:2', () => createRagAnswer(index('headings'), 3,
    metadataRetrieval((metadata) => ALLOWED_SOURCES.includes(metadata.source)), { noSourcesAnswer: NO_SOURCES_ANSWER }));
  // MAX_K (5) und SCORE_THRESHOLD aus 07-score-threshold-rag.ts.
  await add('lesson-07-score-threshold', 'npm run l04:0, then npm run l04:2', () => createRagAnswer(index('headings'), 5,
    thresholdRetrieval(0.83), { noSourcesAnswer: NO_SOURCES_ANSWER }));
  await add('lesson-07-hybrid', 'Start Qdrant; npm run l06:1', async () => {
    await collection();
    // TOP_K, CANDIDATES_PER_LIST und RRF_K aus 08-hybrid-rag.ts.
    return createRagAnswer([], 5, hybridRetrieval(20, 60));
  });
  await add('lesson-07-rerank', 'Start Qdrant; npm run l06:1', async () => {
    await collection();
    // TOP_K, CANDIDATES, TEXT_LIMIT, CANDIDATES_PER_LIST und RRF_K aus 09-rerank-rag.ts.
    return createRagAnswer([], 5, rerankRetrieval(8, 400, 20, 60));
  });
  await add('lesson-07-multiquery', 'Start Qdrant; npm run l06:1', async () => {
    await collection();
    // TOP_K, VARIANT_COUNT, CANDIDATES_PER_LIST und RRF_K aus 10-multiquery-rag.ts.
    return createRagAnswer([], 5, multiqueryRetrieval(3, 20, 60));
  });
  if (!models.length) throw new Error(NO_RAG_MODELS_MESSAGE);
  return models;
}
