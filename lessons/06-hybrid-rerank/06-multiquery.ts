// Lektion 06 – Hybrid-Suche und Reranking, Teil 6: Multi-Query
//
// Lernziel: Du lässt das Sprachmodell eine Frage mehrfach umformulieren, suchst mit jeder Fassung und
// führst die Listen mit RRF zusammen. Du siehst, wie das einer umgangssprachlichen Frage hilft.
//
// Teil 2 bis 5 haben gezeigt: Eine umgangssprachliche Frage ("ausplaudern") trifft andere Wörter als
// das Dokument ("Offenlegung"), und auch ihr Vektor liegt nicht nah an den passenden Chunks.
// Reranking (Teil 5) kann nur umsortieren, was die Suche schon gefunden hat. Multi-Query setzt
// früher an: Das Sprachmodell schreibt die Frage in der Sprache des Korpus neu, und die Suche läuft
// mit jeder Fassung. Schritte:
//   1. Umformulieren: ein Aufruf des Chat-Modells, der `VARIANT_COUNT` sachliche Fassungen der Frage
//      mit Fachbegriffen der IT-Sicherheit liefert.
//   2. Einbetten und suchen: Originalfrage und jede Fassung werden eingebettet (E5-Präfix "query: ")
//      und je für sich gesucht, mit je `CANDIDATES_PER_LIST` Kandidaten.
//   3. Fusionieren: Qdrant führt alle Listen in einer Anfrage mit RRF zusammen (wie in Teil 4, nur mit
//      mehr als zwei Listen).
//   4. Vergleichen: Die Tabelle zeigt die Suche mit der Originalfrage neben Multi-Query und, wie viele
//      Listen jeden Multi-Query-Treffer gefunden haben.
//
// Merke: Die Originalfrage bleibt eine der Listen. So können Fassungen, die vom Thema abdriften, sie
// nicht ganz verdrängen. Ein Chunk, den mehrere Fassungen finden, steigt nach oben. Multi-Query kostet
// einen Modellaufruf und mehrere Embeddings je Frage, und es hängt am Modell: Eine schlechte
// Umformulierung führt die Suche in die falsche Richtung. Lies die Fassungen daher immer mit.
//
// Voraussetzungen: Qdrant läuft (`QDRANT_URL` in .env), und Teil 1 hat die Collections geladen
// (`npm run l06:1`); LM Studio läuft mit gestartetem Server, geladenem E5-Modell und geladenem
// Chat-Modell (`REMOTE_MODEL_NAME`). Open WebUI braucht dieser Teil nicht. Burp ist optional und zeigt
// den Aufruf zum Umformulieren.
// Start: npm run l06:6   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Lies die Fassungen: Welche Fachbegriffe hat das Modell eingesetzt, die in der Originalfrage
//      fehlen? Findest du sie in den Überschriften der Treffer wieder?
//   2. Vergleiche die Spalten: Wie viele Treffer stammen in jeder Spalte aus
//      `02-llm02-offenlegung-sensibler-informationen.md`, und welche Treffer finden alle Listen?
//   3. Setze `VARIANT_COUNT` auf 1 und danach auf 5. Lohnen sich mehr Fassungen, gemessen an der Zeit?
import { modelText, stripJsonFence } from '../shared/text.ts';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel, remoteModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { assertVectorCount, embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, type ChunkMetadata } from '../shared/index.ts';
import { getQdrantClient, requireCollection, getCollectionName } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Die umgangssprachliche Frage aus Teil 2 bis 5.
const QUESTION = 'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?';
// NEU: Wie viele Fassungen das Sprachmodell schreibt. Mit der Originalfrage ergibt das
// `VARIANT_COUNT + 1` Suchen.
const VARIANT_COUNT = 3;
// Wie viele Chunks die Multi-Query-Suche liefert.
const TOP_K = 5;
// Wie viele Kandidaten jede Liste in die Fusion gibt, und die Konstante k von RRF (wie in Teil 4).
const CANDIDATES_PER_LIST = 20;
const RRF_K = 60;

// Die erwartete Antwort: genau `VARIANT_COUNT` Fassungen, keine leer. Wie in Lektion 04, Teil 4 und
// Teil 5 bittet das Programm den Server nicht um strukturierte Ausgabe (kein `withStructuredOutput`):
// Reasoning-Modelle legen das JSON dann teils ins Feld `reasoning` und lassen die Antwort leer.
// Deshalb verlangt der Prompt nur JSON, und dieses Schema prüft, was zurückkommt.
const variantSchema = z.object({ variants: z.array(z.string().trim().min(1)).length(VARIANT_COUNT) });

/** Ein Treffer aus Qdrant, so weit dieses Programm ihn braucht. */
type Hit = { id: string | number; score: number; payload?: unknown };

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Auch der interne Anhang kann hier im Prompt des Chat-Modells landen. Lektion 07 ergänzt `PUBLIC_FILTER` (OWASP LLM02/LLM08).
async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Er sieht den Aufruf zum Umformulieren und
  // die Anfragen an das Embedding-Modell, aber nicht die an Qdrant (siehe hybrid.ts).
  useBurpIfConfigured();

  const model = new ChatOpenAI({
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    maxRetries: 0,
    disableStreaming: true,
    temperature: 0,
    // Rohantwort behalten: Sie enthält die Denkschritte (siehe shared/text.ts).
    __includeRawResponse: true,
    configuration: { baseURL: remoteModel.baseURL },
  });

  await requireCollection(getCollectionName());
  // Chat- und Embedding-Modell laufen auf demselben Server, deshalb genügt eine Prüfung.
  await checkModelServer({ viaBurp: true });

  try {
    // NEU: Schritt 1: Umformulieren, ein Modellaufruf für alle Fassungen.
    const started = performance.now();
    const variants = await logInvocation('LLM', { model: remoteModel.name, question: QUESTION }, async () => {
      const response = await model.invoke(
        `Formuliere diese Frage auf ${VARIANT_COUNT} verschiedene Arten neu, sachlich und mit Fachbegriffen der IT-Sicherheit. ` +
        `Antworte ausschließlich mit einem JSON-Objekt im Format {"variants": ["…", "…"]} mit genau ${VARIANT_COUNT} Einträgen. ` +
        `Frage: ${QUESTION}`,
      );
      const answer = modelText(response).trim();
      const json = stripJsonFence(answer);
      return variantSchema.parse(JSON.parse(json)).variants;
    });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`Multi-query for “${QUESTION}” (rewriting: 1 LLM call, ${seconds} s):`);
    variants.forEach((variant, position) => console.log(`Variant ${position + 1}: ${variant}`));

    await logInvocation('Multi-query search', { model: remoteEmbeddingModel.name, collection: getCollectionName(), listCount: variants.length + 1 }, async () => {
      // Schritt 2: Originalfrage und Fassungen einbetten, in einer Anfrage, und je für sich suchen.
      // `embedDocuments` mit dem Präfix "query: " bettet sie als Fragen ein (siehe Lektion 03, Teil 3).
      const texts = [QUESTION, ...variants];
      const vectors = await embeddings.embedDocuments(texts.map(embeddingQuery));
      assertVectorCount(vectors, texts.length);
      const lists = await Promise.all(vectors.map((vector) =>
        getQdrantClient().query(getCollectionName(), { query: vector, limit: CANDIDATES_PER_LIST, with_payload: true })));

      // NEU: Schritt 3: Fusionieren. Ein `prefetch` je Vektor, RRF über alle Listen.
      const multiQuery = await getQdrantClient().query(getCollectionName(), {
        prefetch: vectors.map((vector) => ({ query: vector, limit: CANDIDATES_PER_LIST })),
        query: { rrf: { k: RRF_K } },
        limit: TOP_K,
        with_payload: true,
      });

      // Schritt 4: Vergleichen, Rang für Rang.
      console.log(`Original question against multi-query (${vectors.length} vectors, RRF k = ${RRF_K}) (#point document score):`);
      console.table(multiQuery.points.map((hit, position) => ({
        rank: position + 1,
        'original question (vector)': describeHit(lists[0].points[position]),
        [`multi-query (${vectors.length} vectors, RRF)`]: describeHit(hit),
        // In wie vielen der einzelnen Listen der Multi-Query-Treffer steht.
        'found by': `${lists.filter(({ points }) => points.some(({ id }) => id === hit.id)).length} of ${lists.length} lists`,
      })));
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

// Ein Treffer als kurze Zelle: Punkt-ID, Dokument (Anfang des Dateinamens) und Wert, wie in Teil 3
// bis 5. Ohne Treffer bleibt die Zelle leer.
function describeHit(hit?: Hit): string {
  if (!hit) return '';
  const { source } = hit.payload as ChunkMetadata;
  return `#${hit.id} ${source.split('-').slice(0, 2).join('-')} ${hit.score.toFixed(3)}`;
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
