// Trefferauswahl im Speicher für Teil 5 bis 7: MMR, Metadaten-Filter und Schwellenwert aus Lektion 05.
// Jede Fabrik liefert ein `Retrieve` für `createRagAnswer`; der Index ist schon auf öffentliche Chunks gefiltert.
// Erklärt: lessons/07-rag-open-webui/GUIDE.de.md
import { selectByMmr } from '../05-retrieval-strategies/retrieval.ts';
import { rankEntries, type ChunkMetadata } from '../shared/index.ts';
import type { Retrieve } from './rag.ts';

export const mmrRetrieval = (fetchK: number, lambda: number): Retrieve =>
  (index, queryVector, topK) => selectByMmr(rankEntries(index, queryVector, fetchK), topK, lambda);

// Erst filtern, dann ranken: Was der Filter ausschließt, kann nie im Prompt landen.
export const metadataRetrieval = (filter: (metadata: ChunkMetadata) => boolean): Retrieve =>
  (index, queryVector, topK) => rankEntries(index.filter(({ metadata }) => filter(metadata)), queryVector, topK);

// `topK` bleibt Obergrenze; die Zahl der Treffer kann 0 sein.
export const thresholdRetrieval = (threshold: number): Retrieve =>
  (index, queryVector, topK) => rankEntries(index, queryVector, topK).filter(({ similarity }) => similarity >= threshold);

// Feste Antwort ohne Modellaufruf, wenn Filter (Teil 6) oder Schwellenwert (Teil 7) nichts übrig lassen.
export const NO_SOURCES_ANSWER = 'Ich habe in den bereitgestellten Dokumenten keine ausreichend passenden Quellen gefunden. ' +
  'Daher kann ich die Frage anhand dieser Dokumente nicht beantworten.';
