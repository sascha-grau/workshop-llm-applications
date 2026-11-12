// Trefferauswahl im Speicher (ohne Qdrant) für Teil 5 bis 7 von Lektion 07: MMR, Metadaten-Filter
// und Schwellenwert aus Lektion 05. Jede Fabrik liefert eine `Retrieve`-Funktion (Typ in `rag.ts`),
// die man `createRagAnswer` als dritten Parameter übergibt. Sie arbeiten auf dem Index, den
// `loadRagIndex` schon auf öffentliche Chunks gefiltert hat.
import { selectByMmr } from '../05-retrieval-strategies/retrieval.ts';
import { rankEntries, type ChunkMetadata } from '../shared/index.ts';
import type { Retrieve } from './rag.ts';

// Holt die besten `fetchK` Chunks und wählt daraus mit MMR `topK`. Mehr Kandidaten geben MMR mehr
// Auswahl; bei `fetchK` = `topK` ändert sich nichts.
export const mmrRetrieval = (fetchK: number, lambda: number): Retrieve =>
  (index, queryVector, topK) => selectByMmr(rankEntries(index, queryVector, fetchK), topK, lambda);

// Pre-Filter (Lektion 05, Teil 3): erst nach Metadaten filtern, dann Top-k über den Rest. Was der
// Filter ausschließt, kann nie im Prompt landen.
export const metadataRetrieval = (filter: (metadata: ChunkMetadata) => boolean): Retrieve =>
  (index, queryVector, topK) => rankEntries(index.filter(({ metadata }) => filter(metadata)), queryVector, topK);

// Top-k mit Untergrenze (Lektion 05, Teil 4): Die Zahl der Treffer ist offen und kann 0 sein.
// `topK` bleibt als Obergrenze.
export const thresholdRetrieval = (threshold: number): Retrieve =>
  (index, queryVector, topK) => rankEntries(index, queryVector, topK).filter(({ similarity }) => similarity >= threshold);

// Feste Antwort, wenn der Schwellenwert alle Treffer verwirft. Sie wird ohne Sprachmodell
// gesendet (siehe `noSourcesAnswer` in `createRagAnswer`), das Modell kann also nicht raten.
export const NO_SOURCES_ANSWER = 'Ich habe in den bereitgestellten Dokumenten keine ausreichend passenden Quellen gefunden. ' +
  'Daher kann ich die Frage anhand dieser Dokumente nicht beantworten.';
