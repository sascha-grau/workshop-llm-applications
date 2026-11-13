// Lektion 06 – Hybrid-Suche und Reranking, Teil 3: Vektorsuche in Qdrant, neben BM25
//
// Lernziel: Vektorsuche und BM25 versagen bei verschiedenen Fragen und ergänzen sich deshalb.
// Braucht:  Collections aus `npm run l06:1`, LM Studio mit E5.
// Start:    npm run l06:3   (oder F5)
// Erklärt:  lessons/06-hybrid-rerank/GUIDE.de.md → „Teil 3“
//
// Aufgabe:
//   1. Vom Text zum Vektor: Wie viele Zahlen hat der Fragevektor? Steht ein Wort der Frage in der
//      Anfrage an Qdrant?
//   2. Welche Suche findet bei "PoisonGPT" das passende Szenario, welche bei der umgangssprachlichen
//      Frage mehr Treffer aus `02-llm02-offenlegung-sensibler-informationen.md`?
//   3. `VERSION_QUESTIONS`: Was liefert der Filter auf 2024, was der auf 2025, und wie unterscheidet
//      sich 2025 von der Suche ohne Filter?
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Ausgabe.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, type ChunkMetadata } from '../shared/index.ts';
import type { Schemas } from '@qdrant/js-client-rest';
import { getQdrantClient, requireCollection, getCollectionName } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Standard: die ersten beiden Fragen aus Teil 2, ein Fachbegriff und eine umgangssprachliche Frage.
const QUESTIONS = [
  'PoisonGPT',
  'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?',
];
// Standard: 5. Die Vektorsuche liefert immer so viele, BM25 nur bei passenden Wörtern.
const TOP_K = 5;
const VECTOR_EXAMPLE_QUESTION = 'Wie verhindere ich, dass mein Chatbot vertrauliche Daten verrät?';
const VECTOR_PREVIEW_LENGTH = 6;
// Standard: dieselbe Frage für zwei Ausgaben der OWASP-Liste; der Korpus enthält nur eine davon.
const VERSION_QUESTIONS = [
  'Welche Risiken nennt OWASP 2024 für die Lieferkette?',
  'Welche Risiken nennt OWASP 2025 für die Lieferkette?',
];
const VERSION_PATTERN = /\b(20\d{2})\b/;

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Die Suche sieht auch den internen Anhang.
// Lektion 07 ergänzt `PUBLIC_FILTER`; siehe docs/decisions.de.md#pre-filter.
async function main() {
  // Burp sieht nur das Embedding-Modell; der Qdrant-Client umgeht ihn (`getQdrantClient` in hybrid.ts).
  useBurpIfConfigured();

  await requireCollection(getCollectionName());
  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Vector example', { model: remoteEmbeddingModel.name, collection: getCollectionName(), question: VECTOR_EXAMPLE_QUESTION }, async () => {
      const input = embeddingQuery(VECTOR_EXAMPLE_QUESTION);
      const queryVector = await embeddings.embedQuery(input);
      console.log(`1. To the embedding model ${remoteEmbeddingModel.name}: “${input}”`);
      console.log(`   Back: a vector with ${queryVector.length} numbers: ${previewVector(queryVector)}`);

      // KERN 1: An Qdrant geht nur der Vektor, kein Text; Qdrant kennt kein Embedding-Modell. Die
      // Ausgabe zeigt den Rumpf von POST /collections/<Name>/points/query mit abgekürztem Vektor.
      const request = { query: queryVector, limit: TOP_K, with_payload: true };
      console.log(`2. To Qdrant, collection ${getCollectionName()}:`);
      console.log(`   ${JSON.stringify({ ...request, query: previewVector(queryVector) })}`);
      const { points } = await getQdrantClient().query(getCollectionName(), request);
      console.table(points.map((hit, position) => ({ rank: position + 1, hit: describeHit(hit) })));
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }

  for (const question of QUESTIONS) {
    try {
      await logInvocation('Search', { model: remoteEmbeddingModel.name, collection: getCollectionName(), question }, async () => {
        const keyword = await getQdrantClient().query(getCollectionName(), { query: { text: question }, using: 'text', limit: TOP_K, with_payload: true });

        // KERN 2: Statt `{ text }` bekommt `query` den Fragevektor; ohne `using` sucht Qdrant auf den
        // Vektoren der Collection, mit Kosinus wie in Lektion 05.
        const queryVector = await embeddings.embedQuery(embeddingQuery(question));
        const vector = await getQdrantClient().query(getCollectionName(), { query: queryVector, limit: TOP_K, with_payload: true });

        // Eine leere Zelle heißt: Diese Suche hat weniger Treffer.
        console.log(`Top ${TOP_K} for “${question}” (#point document score):`);
        console.table(Array.from({ length: TOP_K }, (_unused, position) => ({
          rank: position + 1,
          'keyword (BM25)': describeHit(keyword.points[position]),
          vector: describeHit(vector.points[position]),
        })));
      });
    } catch {
      // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
      process.exitCode = 1;
    }
  }

  // KERN 3: Die Jahreszahl wird zur harten Regel auf `version` und aus dem eingebetteten Text
  // genommen; im Vektor würde sie die Suche nur ein wenig verschieben.
  for (const question of VERSION_QUESTIONS) {
    const version = VERSION_PATTERN.exec(question)?.[1];
    const searchText = question.replace(VERSION_PATTERN, '').replace(/\s+/g, ' ').trim();
    const filter: Schemas['Filter'] | undefined = version ? { must: [{ key: 'version', match: { value: version } }] } : undefined;
    try {
      await logInvocation('Search', { model: remoteEmbeddingModel.name, collection: getCollectionName(), question, version }, async () => {
        const queryVector = await embeddings.embedQuery(embeddingQuery(searchText));
        const unfiltered = await getQdrantClient().query(getCollectionName(), { query: queryVector, limit: TOP_K, with_payload: true });
        // Pre-Filter wie in Lektion 05, Teil 3: erst die Metadaten, dann nur die übrigen Punkte.
        const filtered = filter
          ? await getQdrantClient().query(getCollectionName(), { query: queryVector, filter, limit: TOP_K, with_payload: true })
          : undefined;

        console.log(`Vector search for “${question}”: version ${version ?? '(none)'}, embedded text “${searchText}”`);
        if (filter) console.log(`Filter: ${JSON.stringify(filter)} → ${filtered!.points.length} of at most ${TOP_K} hits`);
        console.table(Array.from({ length: TOP_K }, (_unused, position) => ({
          rank: position + 1,
          'no filter': describeHit(unfiltered.points[position]),
          ...(filtered ? { [`version ${version}`]: describeHit(filtered.points[position]) } : {}),
        })));
      });
    } catch {
      // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
      process.exitCode = 1;
    }
  }
}

function previewVector(vector: number[]): string {
  const shown = vector.slice(0, VECTOR_PREVIEW_LENGTH).map((value) => value.toFixed(4)).join(', ');
  return `[${shown}, … ${vector.length - VECTOR_PREVIEW_LENGTH} more]`;
}

// Eine Zelle: Punkt-ID, Anfang des Dateinamens (z. B. "03-llm03") und Wert.
function describeHit(hit?: { id: string | number; score: number; payload?: unknown }): string {
  if (!hit) return '';
  const { source } = hit.payload as ChunkMetadata;
  return `#${hit.id} ${source.split('-').slice(0, 2).join('-')} ${hit.score.toFixed(3)}`;
}

await runMain(main);
