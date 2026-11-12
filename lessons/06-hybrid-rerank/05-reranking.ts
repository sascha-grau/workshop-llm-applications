// Lektion 06 – Hybrid-Suche und Reranking, Teil 5: Reranking mit dem Sprachmodell
//
// Lernziel: Du sortierst die Treffer der Hybrid-Suche mit einem Sprachmodell neu und siehst, was das
// genauer macht und was es kostet.
//
// Teil 4 liefert die Hybrid-Liste: Sie ist nach Rängen fusioniert, aber niemand hat geprüft, ob ein
// Chunk die Frage beantwortet. Die Vektorsuche bettet Frage und Chunk getrennt ein und vergleicht nur
// die Vektoren. Beim Reranking liest das Sprachmodell Frage und Chunk zusammen und vergibt einen
// Wert. Schritte:
//   1. Kandidaten holen: die Hybrid-Suche aus Teil 4 (RRF), die besten `CANDIDATES` Chunks.
//   2. Bewerten (pointwise): Für jeden Kandidaten ein Aufruf des Chat-Modells mit Frage und den
//      ersten `TEXT_LIMIT` Zeichen des Chunks. Das Modell antwortet mit einer Zahl von 0 bis 10.
//   3. Neu sortieren: absteigend nach dieser Zahl. Bei gleicher Zahl bleibt die Reihenfolge von RRF.
//   4. Vergleichen: Die Tabelle zeigt die Liste vor und nach dem Reranking, dazu die Kosten
//      (Aufrufe, Tokens, Zeit).
//
// Pointwise: Jeder Kandidat wird für sich bewertet, ohne die anderen zu sehen. Das ist einfach und
// lässt sich parallel ausführen; dafür sind die Zahlen verschiedener Aufrufe nicht genau aufeinander
// abgestimmt.
//
// Merke: Reranking sortiert nur um, es findet nichts Neues: Was nicht unter den `CANDIDATES` steht,
// kommt auch danach nicht in den Prompt. Es kostet einen Modellaufruf je Kandidat, bei jeder Frage;
// deshalb rerankt man wenige Kandidaten, nicht den ganzen Index. In der Praxis übernimmt das oft ein
// kleines, eigens dafür trainiertes Modell (Cross-Encoder: ein Modell, das Frage und Chunk zusammen
// liest und direkt einen Relevanzwert ausgibt), das schneller ist als ein Chat-Modell.
// Kosten: Das Reranking macht `CANDIDATES` Chat-Aufrufe parallel je Frage. Lokal ist das nur Zeit,
// bei einer bezahlten API kostet jeder Aufruf Geld.
//
// Hinweis: Es gibt leichtgewichtige Reranking-Modelle, z. B. Qwen3-Reranker-0.6B mit nur 0,6
// Milliarden Parametern. Ein solches Modell liest Frage und Chunk zusammen und gibt direkt einen
// Relevanzwert zurück, ohne Prompt und ohne JSON, das geprüft werden muss.
//
// Voraussetzungen: Qdrant läuft (`QDRANT_URL` in .env), und Teil 1 hat die Collections geladen
// (`npm run l06:1`); LM Studio läuft mit gestartetem Server, geladenem E5-Modell und geladenem
// Chat-Modell (`REMOTE_MODEL_NAME`). Open WebUI braucht dieser Teil nicht. Burp ist optional und zeigt
// jeden Bewertungsaufruf.
// Start: npm run l06:5   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Vergleiche die beiden Spalten: Welche Chunks steigen auf, welche fallen ab? Lies in Burp die
//      Antwort des Modells zu einem Chunk, der stark gefallen ist.
//   2. Setze `TEXT_LIMIT` auf 150 und danach auf 1500. Wie ändern sich die Zahlen, die Tokens und die
//      Zeit?
//   3. Ändere `QUESTION` in "PoisonGPT". Hilft das Reranking bei einer Frage aus nur einem Wort?
import { modelText, stripJsonFence } from '../shared/text.ts';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel, remoteModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, type ChunkMetadata } from '../shared/index.ts';
import { getQdrantClient, requireCollection, getCollectionName } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Die umgangssprachliche Frage aus Teil 2 bis 4.
const QUESTION = 'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?';
// Wie viele Hybrid-Treffer das Sprachmodell bewertet. Jeder Kandidat ist ein Modellaufruf, und alle
// laufen parallel: Wenige Kandidaten halten die Wartezeit auf einem Laptop erträglich. Auf einer
// bezahlten API kostet jede Frage so 8 Aufrufe; lokal in LM Studio kostet es nur Zeit.
const CANDIDATES = 8;
// Wie viele Zeichen eines Chunks das Modell liest. Mehr Text heißt mehr Tokens und mehr Zeit; 400
// Zeichen genügen meist, um zu erkennen, worum es im Abschnitt geht, und halten den Prompt klein.
const TEXT_LIMIT = 400;
// Die Hybrid-Suche aus Teil 4: so viele Kandidaten je Liste, Konstante k von RRF.
const CANDIDATES_PER_LIST = 20;
const RRF_K = 60;

// Die erwartete Antwort: eine ganze Zahl von 0 bis 10. Wie in Lektion 04, Teil 4 bittet das Programm
// den Server nicht um strukturierte Ausgabe (kein `withStructuredOutput`): Reasoning-Modelle (Modelle,
// die vor der Antwort erst "nachdenken" und diesen Gedankengang in ein eigenes Feld schreiben) legen
// das JSON dann teils ins Feld `reasoning` und lassen die Antwort leer. Deshalb verlangt der Prompt
// nur JSON, und dieses Schema prüft, was zurückkommt.
const ratingSchema = z.object({ score: z.number().int().min(0).max(10) });

/** Ein Treffer aus Qdrant, so weit dieses Programm ihn braucht. */
type Hit = { id: string | number; score: number; payload?: unknown };

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Auch der interne Anhang kann hier im Prompt des Chat-Modells landen. Lektion 07 ergänzt `PUBLIC_FILTER` (OWASP LLM02/LLM08).
async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Er sieht die Anfragen an das
  // Embedding-Modell und jeden Bewertungsaufruf, aber nicht die an Qdrant (siehe hybrid.ts).
  useBurpIfConfigured();

  let llmCalls = 0;
  let llmTokens = 0;
  const model = new ChatOpenAI({
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    maxRetries: 0,
    disableStreaming: true,
    // 0: dieselbe Frage und derselbe Chunk sollen möglichst dieselbe Zahl ergeben.
    temperature: 0,
    // Rohantwort behalten: enthält die Denkschritte (siehe shared/text.ts)
    __includeRawResponse: true,
    configuration: { baseURL: remoteModel.baseURL },
    callbacks: [{ handleLLMEnd: (output) => { llmTokens += output.llmOutput?.tokenUsage?.totalTokens ?? 0; } }],
  });

  await requireCollection(getCollectionName());
  // Chat- und Embedding-Modell laufen auf demselben Server, deshalb genügt eine Prüfung.
  await checkModelServer({ viaBurp: true });

  try {
    // Schritt 1: Kandidaten holen, wie in Teil 4.
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

    // NEU: Schritt 2: Bewerten. Alle Kandidaten parallel; jeder Aufruf sieht nur Frage und einen Chunk.
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
      // Eine unbrauchbare Antwort (kein JSON, Zahl außerhalb 0–10) ist schon protokolliert; der
      // Kandidat bekommt keine Zahl und bleibt hinter den bewerteten.
      return { ...hit, score: rating ?? -1, rated: rating !== undefined };
    }));
    // NEU: Schritt 3: Neu sortieren. `toSorted` ist stabil: Bei gleicher Zahl bleibt die RRF-Reihenfolge.
    const reranked = rated.toSorted((a, b) => b.score - a.score);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);

    // Schritt 4: Vergleichen.
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

// Ein Treffer als kurze Zelle: Punkt-ID, Dokument und Wert, wie in Teil 3 und 4. Vor dem Reranking ist
// der Wert der RRF-Wert, danach die Zahl des Modells.
function describeHit(hit: Hit): string {
  return `#${hit.id} ${shortSource(hit)} ${Number.isInteger(hit.score) ? hit.score : hit.score.toFixed(4)}`;
}

// Das Dokument eines Treffers, nur der Anfang des Dateinamens (z. B. "02-llm02").
function shortSource(hit: Hit): string {
  return (hit.payload as ChunkMetadata).source.split('-').slice(0, 2).join('-');
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
