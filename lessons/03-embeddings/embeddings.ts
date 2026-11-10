import { e5Model } from '../shared/embeddings.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';

// Gemeinsam für die Dateien von Lektion 03. E5 und die Kosinus-Ähnlichkeit stehen in
// shared/embeddings.ts, weil spätere Lektionen sie ebenfalls nutzen. Das zweite Modell wird aus
// REMOTE_EMBEDDING_GEMMA_MODEL_NAME gelesen: Es muss auf demselben Server laufen wie das erste
// (gleiche Basis-URL, gleicher API-Key), nur unter anderem Namen.

// Die zwei Embedding-Modelle mit ihren Rollen-Präfixen (siehe 02-comparisons.ts): E5 ist das Modell
// aus REMOTE_EMBEDDING_MODEL_NAME, EmbeddingGemma aus REMOTE_EMBEDDING_GEMMA_MODEL_NAME.
export const models = [
  e5Model,
  {
    shortName: 'Gemma',
    get name() { return remoteEmbeddingModel.gemmaName; },
    queryPrefix: 'task: search result | query: ',
    passagePrefix: 'title: none | text: ',
  },
];
