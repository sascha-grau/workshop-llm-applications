// Die zwei Embedding-Modelle von Lektion 03 mit ihren Rollen-Präfixen. E5 steht in shared/embeddings.ts, weil
// spätere Lektionen es auch nutzen. EmbeddingGemma (REMOTE_EMBEDDING_GEMMA_MODEL_NAME) muss auf demselben Server
// laufen (gleiche Basis-URL, gleicher API-Key), nur unter anderem Namen.
// Erklärt: lessons/03-embeddings/GUIDE.de.md → „Teil 2“

import { e5Model } from '../shared/embeddings.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';

// Die Präfixe von EmbeddingGemma stammen aus seiner Modellbeschreibung: eines für Suchanfragen, eines für Dokumente.
export const models = [
  e5Model,
  {
    shortName: 'Gemma',
    get name() { return remoteEmbeddingModel.gemmaName; },
    queryPrefix: 'task: search result | query: ',
    passagePrefix: 'title: none | text: ',
  },
];
