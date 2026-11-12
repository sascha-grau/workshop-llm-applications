// Lektion 06 – Hybrid-Suche und Reranking, Teil 7: Alle Verfahren im Vergleich
//
// Lernziel: Du siehst alle Verfahren dieser Lektion nebeneinander, mit denselben zwei Fragen auf
// derselben Collection, samt ihren Kosten an Modellaufrufen, Tokens und Zeit.
//
// Teil 2 bis 6 zeigen je ein Verfahren. Hier laufen sie hintereinander. Schritte:
//   1. Vergleichen, je Frage (`TECHNICAL_TERM`, `COLLOQUIAL_QUESTION`): Keyword-Suche (BM25,
//      Teil 2), Vektorsuche (Teil 3) und Hybrid-Suche mit RRF (Teil 4) in einer Tabelle.
//   2. Reranking (Teil 5): Das Sprachmodell bewertet die Hybrid-Treffer der umgangssprachlichen Frage
//      mit 0 bis 10 und sortiert sie neu.
//   3. Multi-Query (Teil 6): Das Sprachmodell formuliert die umgangssprachliche Frage um, Qdrant
//      fusioniert die Suchen aller Fassungen mit RRF.
//
// Merke: Jedes Verfahren löst ein anderes Problem und kostet anderes. BM25 findet genaue Begriffe,
// die Vektorsuche Bedeutung, RRF verbindet beide ohne Modellaufruf. Reranking und Multi-Query kosten
// Modellaufrufe: Reranking einen je Kandidat und kann nur umsortieren, Multi-Query einen je Frage und
// kann neue Treffer finden. Welche Kombination sich lohnt, entscheiden deine Fragen; prüfe sie wie
// hier an Beispielen, bevor du ein Verfahren einbaust.
//
// Voraussetzungen: Qdrant läuft (`QDRANT_URL` in .env), und Teil 1 hat die Collections geladen
// (`npm run l06:1`); LM Studio läuft mit gestartetem Server, geladenem E5-Modell und geladenem
// Chat-Modell (`REMOTE_MODEL_NAME`). Open WebUI braucht dieser Teil nicht. Burp ist optional und zeigt
// die Aufrufe an Embedding- und Chat-Modell; Qdrant beobachtest du im Dashboard (<QDRANT_URL>/dashboard).
// Start: npm run l06:7   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Vergleiche die drei Spalten in Schritt 1 für beide Fragen: Bei welcher Frage hilft die
//      Hybrid-Suche gegenüber der besseren der beiden Einzelsuchen?
//   2. Vergleiche die Kosten von Reranking und Multi-Query: Welches Verfahren verändert die Treffer
//      zur umgangssprachlichen Frage stärker, gemessen an den Treffern aus
//      `02-llm02-offenlegung-sensibler-informationen.md`?
//   3. Ersetze `COLLOQUIAL_QUESTION` durch eine eigene Frage aus dem Fragen-Set von Lektion 05
//      (`question-set.json`) und entscheide, welche Kombination du für sie einsetzen würdest.
import { stripJsonFence } from '../shared/text.ts';
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

// Die beiden Fragen aus Teil 2 bis 6: ein seltener Fachbegriff und eine umgangssprachliche Frage.
const TECHNICAL_TERM = 'PoisonGPT';
const COLLOQUIAL_QUESTION = 'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?';
// Wie viele Chunks jede Suche liefert.
const TOP_K = 5;
// Hybrid-Suche (Teil 4): so viele Kandidaten je Liste, Konstante k von RRF.
const CANDIDATES_PER_LIST = 20;
const RRF_K = 60;
// Reranking (Teil 5): so viele Hybrid-Treffer bewertet das Modell, je höchstens `TEXT_LIMIT` Zeichen.
const RERANK_CANDIDATES = 8;
const TEXT_LIMIT = 400;
// Multi-Query (Teil 6): so viele Fassungen schreibt das Modell.
const VARIANT_COUNT = 3;

// Die erwarteten Antworten des Modells. Wie in Teil 5 und 6 verlangt der Prompt nur JSON (kein
// `withStructuredOutput`, siehe Lektion 04, Teil 4), und diese Schemas prüfen, was zurückkommt.
const ratingSchema = z.object({ score: z.number().int().min(0).max(10) });
const variantSchema = z.object({ variants: z.array(z.string().trim().min(1)).length(VARIANT_COUNT) });

/** Ein Treffer aus Qdrant, so weit dieses Programm ihn braucht. */
type Hit = { id: string | number; score: number; payload?: unknown };

// Zähler für die Kosten eines Schritts; `resetCost` setzt sie vor jedem Schritt zurück.
const cost = { llmCalls: 0, llmTokens: 0, started: 0 };
const resetCost = () => Object.assign(cost, { llmCalls: 0, llmTokens: 0, started: performance.now() });
const describeCost = () =>
  `${cost.llmCalls} LLM calls, ${cost.llmTokens} tokens, ${((performance.now() - cost.started) / 1000).toFixed(1)} s`;

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Auch der interne Anhang kann hier im Prompt des Chat-Modells landen. Lektion 07 ergänzt `PUBLIC_FILTER` (OWASP LLM02/LLM08).
async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Er sieht die Aufrufe an Embedding- und
  // Chat-Modell, aber nicht die an Qdrant (siehe hybrid.ts).
  useBurpIfConfigured();

  const model = new ChatOpenAI({
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    maxRetries: 0,
    disableStreaming: true,
    temperature: 0,
    configuration: { baseURL: remoteModel.baseURL },
    callbacks: [{ handleLLMEnd: (output) => { cost.llmTokens += output.llmOutput?.tokenUsage?.totalTokens ?? 0; } }],
  });
  // Ein Modellaufruf mit JSON-Antwort: Codeblock entfernen, parsen, mit dem Schema prüfen.
  const askForJson = async <T>(prompt: string, schema: z.ZodType<T>): Promise<T> => {
    cost.llmCalls += 1;
    const answer = (await model.invoke(prompt)).text.trim();
    const json = stripJsonFence(answer);
    return schema.parse(JSON.parse(json));
  };

  await requireCollection(getCollectionName());
  // Chat- und Embedding-Modell laufen auf demselben Server, deshalb genügt eine Prüfung.
  await checkModelServer({ viaBurp: true });

  try {
    // Schritt 1: Vergleichen, für beide Fragen. Die Ergebnisse der umgangssprachlichen Frage brauchen
    // Schritt 2 und 3.
    await compareSearches(TECHNICAL_TERM);
    const { queryVector, vector, hybrid } = await compareSearches(COLLOQUIAL_QUESTION);

    // Schritt 2: Reranking (Teil 5). Jeder Kandidat ein Aufruf; eine unbrauchbare Antwort ist
    // protokolliert, der Kandidat bekommt -1 und bleibt hinter den bewerteten.
    resetCost();
    const rated = await Promise.all(hybrid.map(async (hit) => {
      const rating = await logInvocation('LLM', { model: remoteModel.name, point: hit.id }, async () => askForJson(
        'Wie gut beantwortet der Abschnitt die Frage? Vergib eine ganze Zahl von 0 (gar nicht) bis 10 (vollständig). ' +
        'Antworte ausschließlich mit einem JSON-Objekt im Format {"score": 7}.\n\n' +
        `Frage: ${COLLOQUIAL_QUESTION}\n\nAbschnitt:\n${(hit.payload as { text: string }).text.slice(0, TEXT_LIMIT)}`,
        ratingSchema,
      )).catch(() => undefined);
      return { ...hit, score: rating?.score ?? -1 };
    }));
    // `toSorted` ist stabil: Bei gleicher Zahl bleibt die RRF-Reihenfolge.
    const reranked = rated.toSorted((a, b) => b.score - a.score);
    console.log(`Reranking the hybrid top ${RERANK_CANDIDATES} for “${COLLOQUIAL_QUESTION}” (LLM, pointwise 0–10) – cost: ${describeCost()}`);
    printColumns({ 'before (RRF)': hybrid, 'after (LLM 0–10)': reranked }, RERANK_CANDIDATES);

    // Schritt 3: Multi-Query (Teil 6). Der Vektor der Originalfrage aus Schritt 1 bleibt eine der Listen.
    resetCost();
    const { variants } = await logInvocation('LLM', { model: remoteModel.name, question: COLLOQUIAL_QUESTION }, async () => askForJson(
      `Formuliere diese Frage auf ${VARIANT_COUNT} verschiedene Arten neu, sachlich und mit Fachbegriffen der IT-Sicherheit. ` +
      `Antworte ausschließlich mit einem JSON-Objekt im Format {"variants": ["…", "…"]} mit genau ${VARIANT_COUNT} Einträgen. ` +
      `Frage: ${COLLOQUIAL_QUESTION}`,
      variantSchema,
    ));
    console.log(`Multi-query for “${COLLOQUIAL_QUESTION}”:`);
    variants.forEach((variant, position) => console.log(`Variant ${position + 1}: ${variant}`));
    const variantVectors = await embeddings.embedDocuments(variants.map(embeddingQuery));
    assertVectorCount(variantVectors, variants.length);
    const vectors = [queryVector, ...variantVectors];
    const { points: multiQuery } = await getQdrantClient().query(getCollectionName(), {
      prefetch: vectors.map((query) => ({ query, limit: CANDIDATES_PER_LIST })),
      query: { rrf: { k: RRF_K } },
      limit: TOP_K,
      with_payload: true,
    });
    console.log(`Multi-query cost: ${describeCost()} – ${vectors.length} vectors, fusion: RRF in Qdrant (k = ${RRF_K})`);
    printColumns({ 'original question (vector)': vector, [`multi-query (${vectors.length} vectors, RRF)`]: multiQuery });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

// Schritt 1 für eine Frage: Keyword-Suche, Vektorsuche und Hybrid-Suche in einer Tabelle. Die
// Hybrid-Suche holt `RERANK_CANDIDATES` Treffer, damit Schritt 2 sie bewerten kann; die Tabelle
// zeigt die ersten `TOP_K`.
async function compareSearches(question: string) {
  return logInvocation('Search', { model: remoteEmbeddingModel.name, collection: getCollectionName(), question }, async () => {
    const queryVector = await embeddings.embedQuery(embeddingQuery(question));
    const { points: keyword } = await getQdrantClient().query(getCollectionName(), { query: { text: question }, using: 'text', limit: TOP_K, with_payload: true });
    const { points: vector } = await getQdrantClient().query(getCollectionName(), { query: queryVector, limit: TOP_K, with_payload: true });
    // Hybrid: Qdrant holt beide Listen (`prefetch`) und fusioniert sie selbst mit RRF.
    const { points: hybrid } = await getQdrantClient().query(getCollectionName(), {
      prefetch: [
        { query: { text: question }, using: 'text', limit: CANDIDATES_PER_LIST },
        { query: queryVector, limit: CANDIDATES_PER_LIST },
      ],
      query: { rrf: { k: RRF_K } },
      limit: RERANK_CANDIDATES,
      with_payload: true,
    });
    console.log(`Top ${TOP_K} for “${question}” (#point document score) – fusion: RRF in Qdrant (k = ${RRF_K})`);
    printColumns({ 'keyword (BM25)': keyword, vector, 'hybrid (RRF)': hybrid });
    return { queryVector, vector, hybrid };
  });
}

// Gibt mehrere Trefferlisten nebeneinander aus, eine Spalte je Liste, eine Zeile je Rang.
function printColumns(columns: Record<string, Hit[]>, rows = TOP_K): void {
  console.table(Array.from({ length: rows }, (_unused, position) => ({
    rank: position + 1,
    ...Object.fromEntries(Object.entries(columns).map(([name, hits]) => [name, describeHit(hits[position])])),
  })));
}

// Ein Treffer als kurze Zelle: Punkt-ID, Dokument (Anfang des Dateinamens) und Wert, wie in Teil 3
// bis 6. Ganze Zahlen (die Bewertung des Modells) ohne Nachkommastellen, -1 als "–" (unbrauchbare
// Antwort). Ohne Treffer bleibt die Zelle leer.
function describeHit(hit?: Hit): string {
  if (!hit) return '';
  const { source } = hit.payload as ChunkMetadata;
  const score = hit.score === -1 ? '–' : Number.isInteger(hit.score) ? String(hit.score) : hit.score.toFixed(3);
  return `#${hit.id} ${source.split('-').slice(0, 2).join('-')} ${score}`;
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
