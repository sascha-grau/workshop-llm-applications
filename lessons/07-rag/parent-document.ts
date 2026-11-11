// Parent-Document-Retrieval (Lektion 04, Teil 5) für Teil 4 von Lektion 07: klein suchen, groß
// liefern. Die Parents sind die Abschnitte des Überschriften-Index, die Kinder kleine Stücke daraus,
// die allein eingebettet und durchsucht werden.
import { embedTexts, splitIntoChildren, type Child } from '../04-chunking/chunking.ts';
import { e5Model } from '../shared/embeddings.ts';
import { rankEntries, uniqueChunks, type IndexEntry } from '../shared/index.ts';
import { log } from '../shared/logging.ts';
import type { Retrieve } from './rag.ts';

// Teilt alle Parents und bettet die Kinder ein, eine Anfrage je Quelldokument (Lektion 04, Teil 5).
// Das Ergebnis lebt nur im Speicher und wird bei jedem Start neu berechnet.
export async function buildChildren(parents: IndexEntry[], childSize: number): Promise<Child[]> {
  const children: Child[] = [];
  for (const source of new Set(parents.map(({ metadata }) => metadata.source))) {
    const pieces = parents.filter(({ metadata }) => metadata.source === source)
      .flatMap((parent) => splitIntoChildren(parent, childSize));
    const vectors = await embedTexts(pieces.map(({ text }) => `${e5Model.passagePrefix}${text}`));
    pieces.forEach((piece, position) => children.push({ ...piece, vector: vectors[position] }));
  }
  log('INFO', 'Parent-document index ready', { parents: parents.length, children: children.length, childSize });
  return children;
}

// Sucht über die Kinder (`childCandidates` Treffer) und liefert deren Parents: jeden einmal, die
// ersten `topK` verschiedenen. Der Parameter `index` (die Parents) wird nicht gebraucht, die
// Kinder tragen ihre Parents schon bei sich.
export const parentRetrieval = (children: Child[], childCandidates: number): Retrieve =>
  (_index, queryVector, topK) => uniqueChunks(rankEntries(children, queryVector, childCandidates), topK)
    .map(({ parent }) => parent);
