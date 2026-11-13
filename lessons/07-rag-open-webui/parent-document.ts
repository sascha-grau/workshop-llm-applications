// Parent-Document-Retrieval für Teil 4 (Lektion 04, Teil 5): klein suchen, groß liefern. Die Parents
// sind die Abschnitte des Überschriften-Index, die Kinder kleine Stücke daraus.
// Erklärt: lessons/07-rag-open-webui/GUIDE.de.md
import { embedTexts, splitIntoChildren, type Child } from '../04-chunking/chunking.ts';
import { e5Model } from '../shared/embeddings.ts';
import { rankEntries, uniqueChunks, type IndexEntry } from '../shared/index.ts';
import { log } from '../shared/logging.ts';
import type { Retrieve } from './rag.ts';

// VEREINFACHT: Kinder nur im Speicher, bei jedem Start neu eingebettet (eine Anfrage je Dokument).
// Siehe docs/production.de.md#workshop-vereinfachung--in-produktion
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

// Jeden Parent nur einmal, die ersten `topK` verschiedenen. `index` bleibt ungenutzt: Die Kinder
// tragen ihre Parents schon bei sich.
export const parentRetrieval = (children: Child[], childCandidates: number): Retrieve =>
  (_index, queryVector, topK) => uniqueChunks(rankEntries(children, queryVector, childCandidates), topK)
    .map(({ parent }) => parent);
