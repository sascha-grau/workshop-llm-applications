// E5-Modell mit Präfixen, Kosinus-Ähnlichkeit und Embedding-Client. Übersicht: lessons/shared/README.de.md
import { OpenAIEmbeddings } from '@langchain/openai';
import { remoteEmbeddingModel } from './config.ts';

/** E5 ist so trainiert: `query: ` vor Fragen, `passage: ` vor den zu findenden Texten. `tokenLimit`: mehr Tokens
 *  liest E5 je Eingabe nicht. */
export const e5Model = {
  shortName: 'E5',
  tokenLimit: 512,
  get name() { return remoteEmbeddingModel.name; },
  queryPrefix: 'query: ',
  passagePrefix: 'passage: ',
};

/** Kosinus des Winkels zwischen zwei Vektoren (-1 bis 1, 1 = gleiche Richtung), unabhängig von ihrer Länge. Bei E5
 *  sind auch unverwandte Texte hoch: Es zählt die Reihenfolge, nicht der Wert (lessons/03-embeddings/README.de.md). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Vector dimensions differ: ${a.length} and ${b.length}.`);
  if (a.length === 0 || !a.every(Number.isFinite) || !b.every(Number.isFinite)) {
    throw new Error('Cosine similarity requires nonempty vectors of finite numbers.');
  }
  // Kosinus = Skalarprodukt / (Länge a · Länge b); `Math.hypot` ist die Länge (Wurzel der Quadratsumme).
  const normA = Math.hypot(...a);
  const normB = Math.hypot(...b);
  if (normA === 0 || normB === 0) throw new Error('Cosine similarity is undefined for a vector of length zero.');
  const dotProduct = a.reduce((sum, value, index) => sum + value * b[index], 0);
  return dotProduct / (normA * normB);
}

/** Bricht ab, wenn der Server nicht genau einen Vektor pro Text geliefert hat. */
export function assertVectorCount(vectors: number[][], expected: number): void {
  if (vectors.length !== expected) {
    throw new Error(`The embedding server returned ${vectors.length} vectors for ${expected} texts.`);
  }
}

// VEREINFACHT: Kein Tokenizer, nur eine Schätzung (Kostenzeile; Ersatz, wenn der Server keine Token-Zahl liefert).
// Bewusst wenige Zeichen je Token, damit die Schätzung eher zu hoch liegt; eine Obergrenze ist sie nicht.
// Gemessene Werte: lessons/04-chunking/GUIDE.de.md
export const CHARACTERS_PER_TOKEN = 2.5;
// Start- und End-Token, die E5 (Tokenizer XLM-R) um jeden Text setzt; sie zählen zum `tokenLimit`.
export const SPECIAL_TOKEN_RESERVE = 2;
// Zeichen einer Frage, die nach Spezialtokens und Präfix geschätzt ins `tokenLimit` passen; `embeddingQuery` kürzt darauf.
export const QUERY_CHARACTER_LIMIT = Math.floor((e5Model.tokenLimit - SPECIAL_TOKEN_RESERVE) * CHARACTERS_PER_TOKEN) - e5Model.queryPrefix.length;
export const embeddingQuery = (question: string) => `${e5Model.queryPrefix}${question.slice(0, QUERY_CHARACTER_LIMIT)}`;

/** Embedding-Client für `model` (Standard: E5 aus `.env`). Erst die erste Anfrage baut ihn, damit ein Import
 *  ohne Embedding-Einstellungen nicht scheitert. */
export function createEmbeddings(model?: string): Pick<OpenAIEmbeddings, 'embedQuery' | 'embedDocuments'> {
  let client: OpenAIEmbeddings | undefined;
  const getClient = () => client ??= new OpenAIEmbeddings({
    model: model ?? remoteEmbeddingModel.name,
    apiKey: remoteEmbeddingModel.apiKey,
    // Gewöhnliche Fließkommazahlen statt des base64-Standards: in Burp lesbar und von jedem
    // OpenAI-kompatiblen Server unterstützt.
    encodingFormat: 'float',
    // LangChain ersetzt sonst Zeilenumbrüche durch Leerzeichen. Aus, damit Burp genau den Text des Index
    // zeigt, Überschriften in eigenen Zeilen.
    stripNewLines: false,
    // VEREINFACHT: Keine Wiederholungen, sonst zeigt Burp verwirrende Doppelanfragen (docs/production.de.md).
    maxRetries: 0,
    configuration: { baseURL: remoteEmbeddingModel.baseURL },
  });
  return {
    embedQuery: (text) => getClient().embedQuery(text),
    embedDocuments: (texts) => getClient().embedDocuments(texts),
  };
}
