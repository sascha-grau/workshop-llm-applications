/**
 * Grundlagen für Embeddings, die alle Lektionen ab 03 gemeinsam nutzen.
 */
import { OpenAIEmbeddings } from '@langchain/openai';
import { remoteEmbeddingModel } from './config.ts';

/**
 * Das E5-Modell aus REMOTE_EMBEDDING_MODEL_NAME mit seinen Präfixen. E5 wurde so trainiert, dass vor
 * Fragen "query: " und vor den zu findenden Texten "passage: " steht. `tokenLimit` ist die
 * Textlänge, die E5 pro Eingabe höchstens lesen kann (512 Tokens).
 */
export const e5Model = {
  shortName: 'E5',
  tokenLimit: 512,
  get name() { return remoteEmbeddingModel.name; },
  queryPrefix: 'query: ',
  passagePrefix: 'passage: ',
};

/**
 * Kosinus-Ähnlichkeit: das Winkelmaß zwischen zwei Vektoren, unabhängig von ihrer Länge. Sie liegt
 * zwischen -1 und 1, und 1 bedeutet gleiche Richtung. Achtung: E5 liefert auch für unverwandte
 * Texte oft hohe Werte (z. B. 0,7 bis 0,8). Der absolute Wert sagt wenig, entscheidend ist die
 * Reihenfolge beim Vergleich mehrerer Texte.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Vector dimensions differ: ${a.length} and ${b.length}.`);
  if (a.length === 0 || !a.every(Number.isFinite) || !b.every(Number.isFinite)) {
    throw new Error('Cosine similarity requires nonempty vectors of finite numbers.');
  }
  // Länge eines Vektors: Wurzel aus der Summe seiner Quadrate (`Math.hypot`).
  const normA = Math.hypot(...a);
  const normB = Math.hypot(...b);
  if (normA === 0 || normB === 0) throw new Error('Cosine similarity is undefined for a vector of length zero.');
  // Skalarprodukt: jede Zahl von a mit der Zahl an derselben Stelle von b malnehmen und alles addieren (`reduce`).
  // Skalarprodukt geteilt durch beide Längen ergibt den Kosinus des Winkels.
  const dotProduct = a.reduce((sum, value, index) => sum + value * b[index], 0);
  return dotProduct / (normA * normB);
}

/** Bricht ab, wenn der Server nicht genau einen Vektor pro Text geliefert hat. */
export function assertVectorCount(vectors: number[][], expected: number): void {
  if (vectors.length !== expected) {
    throw new Error(`The embedding server returned ${vectors.length} vectors for ${expected} texts.`);
  }
}

// Zeichen je Token für eine grobe Schätzung: für die Kostenzeile der Programme und für die
// Ersatz-Schätzung in Lektion 04, Teil 0, wenn der Server keine verlässliche Token-Zahl liefert. Eine
// garantierte Token-Obergrenze ist das nicht. Hier gibt es keinen Tokenizer. Fließtext liegt bei
// etwa 4 Zeichen je Token, Linklisten unter 3 (siehe Lektion 04, Teil 1). Mit 2,5 liegt die Schätzung
// deshalb eher zu hoch als zu niedrig, für eine Kostenschätzung die sichere Seite.
export const CHARACTERS_PER_TOKEN = 2.5;
// Start- und End-Token, die E5 (Tokenizer XLM-R) um jeden Text setzt. Sie zählen zum 512-Token-Limit
// und werden bei Schätzungen vorab abgezogen.
export const SPECIAL_TOKEN_RESERVE = 2;
// So viele Zeichen einer Frage passen (geschätzt) in die 512 Tokens von E5, nach Abzug der zwei
// Spezialtokens und des Präfixes `query: `. Längere Fragen werden in `embeddingQuery` abgeschnitten.
export const QUERY_CHARACTER_LIMIT = Math.floor((e5Model.tokenLimit - SPECIAL_TOKEN_RESERVE) * CHARACTERS_PER_TOKEN) - e5Model.queryPrefix.length;
// Die Frage so, wie E5 sie erwartet: Präfix `query: ` davor, auf `QUERY_CHARACTER_LIMIT` gekürzt.
export const embeddingQuery = (question: string) => `${e5Model.queryPrefix}${question.slice(0, QUERY_CHARACTER_LIMIT)}`;

/** Erzeugt einen Embedding-Client für `model` (Standard: das E5-Modell aus der `.env`). Er wird erst bei der ersten Anfrage gebaut. */
export function createEmbeddings(model?: string): Pick<OpenAIEmbeddings, 'embedQuery' | 'embedDocuments'> {
  let client: OpenAIEmbeddings | undefined;
  const getClient = () => client ??= new OpenAIEmbeddings({
    model: model ?? remoteEmbeddingModel.name,
    apiKey: remoteEmbeddingModel.apiKey,
    // Gewöhnliche Fließkommazahlen statt des base64-Standards: in Burp lesbar und von jedem
    // OpenAI-kompatiblen Server unterstützt.
    encodingFormat: 'float',
    // LangChain ersetzt vor dem Senden standardmäßig jeden Zeilenumbruch durch ein Leerzeichen.
    // Hier abgeschaltet, damit Burp genau den Text zeigt, den der Index speichert, mit den
    // Überschriften in eigenen Zeilen.
    stripNewLines: false,
    // Wiederholungen würden in Burp als verwirrende doppelte Anfragen auftauchen; lieber sofort scheitern.
    maxRetries: 0,
    configuration: { baseURL: remoteEmbeddingModel.baseURL },
  });
  return {
    embedQuery: (text) => getClient().embedQuery(text),
    embedDocuments: (texts) => getClient().embedDocuments(texts),
  };
}
