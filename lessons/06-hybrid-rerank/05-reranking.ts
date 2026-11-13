// Lektion 06 – Hybrid-Suche und Reranking, Teil 5: Reranking mit dem Sprachmodell
//
// Lernziel: Ein Sprachmodell bewertet die Hybrid-Treffer neu; das sortiert um und kostet je Kandidat.
// Braucht:  Collections aus `npm run l06:1`, LM Studio mit E5 und Chat-Modell; `SHOW_THINKING` leer.
// Start:    npm run l06:5   (oder F5)
// Erklärt:  lessons/06-hybrid-rerank/GUIDE.de.md → „Teil 5“
//
// Aufgabe:
//   1. Welche Chunks steigen auf, welche fallen ab? Mit Burp: Lies die Antwort zu einem, der fällt.
//   2. Setze `TEXT_LIMIT` auf 150, danach auf 1500: Wie ändern sich Bewertungen und Tokens?
//      ↺ Danach zurücksetzen: `TEXT_LIMIT` auf 400.
//   3. Setze `RERANK_THINKING` auf false: Wie ändern sich Dauer, Tokens und Bewertungen?
//      ↺ Danach zurücksetzen: `RERANK_THINKING` auf true.
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Ausgabe und Kostenzählung.
import { modelText, stripJsonFence } from '../shared/text.ts';
import { createJsonChatModel } from '../shared/chat-model.ts';
import { z } from 'zod';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel, remoteModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, type ChunkMetadata } from '../shared/index.ts';
import { getQdrantClient, requireCollection, getCollectionName } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Standard: die umgangssprachliche Frage aus Teil 2 bis 4.
const QUESTION = 'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?';
// Standard: 8. Jeder Kandidat ist ein Chat-Aufruf je Frage, alle parallel. Mehr = längere Wartezeit;
// bei einer bezahlten API kostet jeder Aufruf Geld.
const CANDIDATES = 8;
// Standard: 400 Zeichen je Chunk. Mehr = mehr Tokens je Bewertung; der Anfang zeigt meist schon,
// worum es im Abschnitt geht.
const TEXT_LIMIT = 400;
// Standard: wie in Teil 4.
const CANDIDATES_PER_LIST = 20;
const RRF_K = 60;
// Standard: true. Das Modell denkt vor jeder Bewertung: sinnvolle Noten, aber langsam.
// false = `reasoning_effort: none`: schnell, doch der kleine Judge bewertet fast alles mit 0.
// Gedacht zum Umschalten und Vergleichen (docs/decisions.de.md#rerank-denken).
const RERANK_THINKING = true;

// Kein `withStructuredOutput`: Reasoning-Modelle legen das JSON dann teils ins Feld `reasoning`. Der
// Prompt verlangt JSON, dieses Schema prüft es (docs/decisions.de.md#kein-structured-output).
const ratingSchema = z.object({ score: z.number().int().min(0).max(10) });

/** Ein Treffer aus Qdrant, so weit dieses Programm ihn braucht. */
type Hit = { id: string | number; score: number; payload?: unknown };

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Auch der interne Anhang kann hier im Prompt des
// Chat-Modells landen. Lektion 07 ergänzt `PUBLIC_FILTER`; siehe docs/decisions.de.md#pre-filter.
async function main() {
  // Burp sieht Embedding und jeden Bewertungsaufruf, nie Qdrant (`getQdrantClient` in hybrid.ts).
  useBurpIfConfigured();

  let llmCalls = 0;
  let llmTokens = 0;
  const model = createJsonChatModel({
    thinking: RERANK_THINKING,
    // Großzügiges Zeitlimit: LM Studio arbeitet parallele Anfragen nacheinander ab, denkende Bewertungen warten lange.
    timeout: 600_000,
    callbacks: [{ handleLLMEnd: (output) => { llmTokens += output.llmOutput?.tokenUsage?.totalTokens ?? 0; } }],
  });

  await requireCollection(getCollectionName());
  // Chat- und Embedding-Modell laufen auf demselben Server, deshalb genügt eine Prüfung.
  await checkModelServer({ viaBurp: true });

  try {
    // KERN 1: Kandidaten aus der Hybrid-Suche (Teil 4). Was hier fehlt, findet Reranking nie.
    const hybrid = await logInvocation('Hybrid search', { model: remoteEmbeddingModel.name, collection: getCollectionName(), question: QUESTION }, async () => {
      const queryVector = await embeddings.embedQuery(embeddingQuery(QUESTION));
      const { points } = await getQdrantClient().query(getCollectionName(), {
        prefetch: [
          { query: { text: QUESTION }, using: 'text', limit: CANDIDATES_PER_LIST },
          { query: queryVector, limit: CANDIDATES_PER_LIST },
        ],
        query: { rrf: { k: RRF_K } },
        limit: CANDIDATES,
        with_payload: true,
      });
      return points;
    });

    // KERN 2: Pointwise bewerten: Jeder Aufruf sieht nur die Frage und einen Chunk, alle parallel.
    // Chunk-Text ist fremder Text im Prompt und hier ungerahmt; Lektion 07 setzt ihn in Tags.
    const started = performance.now();
    const rated = await Promise.all(hybrid.map(async (hit) => {
      const rating = await logInvocation('LLM', { model: remoteModel.name, point: hit.id }, async () => {
        llmCalls += 1;
        const response = await model.invoke(
          'Wie gut beantwortet der Abschnitt die Frage? Vergib eine ganze Zahl von 0 (gar nicht) bis 10 (vollständig). ' +
          'Antworte ausschließlich mit einem JSON-Objekt im Format {"score": 7}.\n\n' +
          `Frage: ${QUESTION}\n\nAbschnitt:\n${(hit.payload as { text: string }).text.slice(0, TEXT_LIMIT)}`,
        );
        const answer = modelText(response).trim();
        const json = stripJsonFence(answer);
        return ratingSchema.parse(JSON.parse(json)).score;
      }).catch(() => undefined);
      // Eine unbrauchbare Antwort ist schon protokolliert; der Kandidat bleibt hinter den bewerteten.
      return { ...hit, score: rating ?? -1, rated: rating !== undefined };
    }));
    // KERN 3: Neu sortieren. `toSorted` ist stabil: Bei gleicher Zahl bleibt die RRF-Reihenfolge.
    const reranked = rated.toSorted((a, b) => b.score - a.score);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);

    const failed = rated.filter(({ rated: ok }) => !ok).length;
    console.log(`Reranking the hybrid top ${CANDIDATES} for “${QUESTION}” (#point document score):`);
    console.log(
      `Cost: ${llmCalls} LLM calls, ${llmTokens} tokens, ${seconds} s` +
      (failed ? ` – ${failed} answer(s) unusable, kept behind the rated ones` : ''),
    );
    console.table(hybrid.map((hit, position) => ({
      rank: position + 1,
      'before (RRF)': describeHit(hit),
      'after (LLM 0–10)': reranked[position].rated ? describeHit(reranked[position]) : `#${reranked[position].id} ${shortSource(reranked[position])} –`,
    })));
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

// Vor dem Reranking ist der Wert der RRF-Wert, danach die Zahl des Modells.
function describeHit(hit: Hit): string {
  return `#${hit.id} ${shortSource(hit)} ${Number.isInteger(hit.score) ? hit.score : hit.score.toFixed(4)}`;
}

function shortSource(hit: Hit): string {
  return (hit.payload as ChunkMetadata).source.split('-').slice(0, 2).join('-');
}

await runMain(main);
