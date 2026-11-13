// Lektion 04 – Chunking, Teil 4: Suche mit generierten Fragen
//
// Lernziel: Ein Multi-Vektor-Index: Mehrere generierte Fragen zeigen auf denselben Chunk, die Suche
//           vergleicht Frage mit Frage.
// Braucht:  Chunks aus `npm run l04:0`, LM Studio mit Chat-Modell und E5, `SHOW_THINKING` leer/false.
// Schreibt: Index `questions` (fortsetzbar) – gelesen von L06, Teil 1, L07, Teil 3 und L08, Teil 5.
// Start:    npm run l04:4   (oder F5; der erste Lauf über den ganzen Korpus dauert viele Minuten)
// Erklärt:  lessons/04-chunking/GUIDE.de.md → „Teil 4“
//
// Aufgabe:
//   1. Hänge an `indexes/questions__*.json` die Endung `.bak` an (VS Code: Explorer, F2).
//      `QUESTIONS_PER_CHUNK` auf 5, `FULL_CORPUS` auf false, neu starten: Werden die Treffer besser?
//      ↺ Danach 3 und true, die neue Datei löschen, `.bak` wieder entfernen (sonst fehlen L07/L08 Dokumente).
//   2. Lies die Fragen aus Aufgabe 1: Welche sind zu allgemein? Was würdest du im Prompt (KERN 1) ändern?
//   3. `DEMO_QUESTION` (chunking.ts) auf eine Frage ohne die Wörter des Chunks: Trifft Teil 4 besser als Teil 2?
//      ↺ Danach zurück auf 'Wie begrenze ich Prompt Injection?'.
//
// Lesen: die Zeilen `// KERN 1–4`. Der Rest ist Fortsetzen, Prüfen und Zählen.
import { modelText, stripJsonFence } from '../shared/text.ts';
import { ChatOpenAI } from '@langchain/openai';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { z } from 'zod';
import { remoteModel, remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { CHARACTERS_PER_TOKEN, e5Model } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { indexFileFor, DEFAULT_TOP_K, chunkKey, uniqueChunks, sectionPath, type QuestionEntry } from '../shared/index.ts';
import { requirePreparedChunks, embedTexts, DEMO_QUESTION, EXAMPLE_DOCUMENT, readChunks, sourcesFor, previewChunk, metadataFor, printStats, searchTop, readQuestionIndex, hasChunk, appendQuestionChunk } from './chunking.ts';
import { runMain } from '../shared/startup.ts';

// Standard: true = der ganze Korpus (ein Modellaufruf je Chunk, viele Minuten). false = nur
// `EXAMPLE_DOCUMENT` (schnell). Was schon im Index steht, bleibt und wird durchsucht.
const FULL_CORPUS = true;
// Standard: 3 Fragen (= Vektoren) je Chunk. Mehr = mehr Treffer-Chancen, längerer Lauf.
// Ein Index mit anderer Zahl wird abgelehnt: erst löschen, dann neu starten.
const QUESTIONS_PER_CHUNK = 3;
// Das Formatbeispiel im Prompt hat genau so viele Einträge wie `QUESTIONS_PER_CHUNK`, denn kleine
// Modelle übernehmen die Länge des Beispiels.
const QUESTION_FORMAT_EXAMPLE = JSON.stringify({
  questions: Array.from({ length: QUESTIONS_PER_CHUNK }, (_, index) => `Frage ${index + 1}?`),
});

async function main() {
  requirePreparedChunks();
  useBurpIfConfigured();

  const indexFile = indexFileFor('questions');

  let llmCalls = 0;
  let llmTokens = 0;
  let llmTokenReports = 0;
  const model = new ChatOpenAI({
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    maxRetries: 0,
    disableStreaming: true,
    temperature: 0,
    // Rohantwort behalten: Sie enthält die Denkschritte (siehe shared/text.ts).
    __includeRawResponse: true,
    configuration: { baseURL: remoteModel.baseURL },
    callbacks: [{
      handleLLMEnd: (output) => {
        const reportedTokens = output.llmOutput?.tokenUsage?.totalTokens;
        if (typeof reportedTokens === 'number') {
          llmTokens += reportedTokens;
          llmTokenReports += 1;
        }
      },
    }],
  });
  // Bewusst kein `withStructuredOutput`/`response_format`: Reasoning-Modelle legten das JSON dann in
  // `reasoning` und ließen `content` leer. Der Prompt verlangt JSON, dieses Schema prüft es.
  // Siehe docs/decisions.de.md#kein-structured-output.
  const questionSchema = z.object({ questions: z.array(z.string().trim().min(1)).length(QUESTIONS_PER_CHUNK) });

  const sources = FULL_CORPUS ? sourcesFor() : sourcesFor([EXAMPLE_DOCUMENT]);

  // Fortsetzen vergleicht nur Dokument und Position, nie den Text: Geänderte Einstellungen oder
  // Dokumente bemerkt niemand. Nur Löschen ergibt einen frischen Index.
  console.log(
    'Existing chunks are kept and searched, including those outside the selection. ' +
    `If settings or content change, delete ${indexFile} to rebuild the index.`,
  );

  // Keine Prüfung gegen das Token-Limit: Schneiden wie in Teil 2 macht die Chunks aus Teil 0 nur kleiner.
  console.log('Chunks per document:');
  console.table(sources.map((source) => ({ document: source, chunks: readChunks(source).length })));

  // Chat- und Embedding-Modell laufen auf demselben Server, deshalb genügt eine Prüfung.
  await checkModelServer({ viaBurp: true });

  // Laufzeit, Aufrufe und Tokens beschreiben nur diesen Lauf; Anzahlen und Längen danach den gespeicherten Index.
  const started = performance.now();
  let entries: QuestionEntry[] = [];
  let embeddingCalls = 0;
  // Der Embedding-Server meldet keine Tokens; sie werden aus den Zeichen geschätzt.
  let embeddingCharacters = 0;
  let failedChunks = 0;

  try {
    // Ausgangspunkt ist, was ein früherer Lauf gespeichert hat (keine Datei = leerer Index).
    entries = await logInvocation('Index', { file: indexFile }, async () => readQuestionIndex(QUESTIONS_PER_CHUNK));
    for (const source of sources) {
      const chunks = readChunks(source);
      await logInvocation('Indexing', { source }, async () => {
        let newChunks = 0;
        let skipped = 0;
        try {
          // Ein Chunk, der schon im Index steht, ist erledigt und kostet keinen Aufruf mehr.
          for (const [position, { headingPath, text }] of chunks.entries()) {
            const inIndex = hasChunk(entries, source, position);
            if (inIndex) {
              skipped += 1;
              continue;
            }
            let questions: string[];
            try {
              ({ questions } = await logInvocation('LLM', { model: remoteModel.name, source, position }, async () => {
                // KERN 1: Der Prompt verlangt genau QUESTIONS_PER_CHUNK kurze Fragen in Nutzerworten, auf
                // Deutsch wie die Suchfrage, und nur JSON. Die Antwort wird geparst und mit dem Schema geprüft.
                llmCalls += 1;
                const response = await model.invoke(
                  `Schreibe genau ${QUESTIONS_PER_CHUNK} kurze Fragen auf Deutsch, wie sie ein Nutzer in eigenen Worten stellen würde und die dieser Abschnitt beantwortet. ` +
                  `Bei einer Linkliste frage nach ihren Themen oder Quellen. Antworte ausschließlich mit einem JSON-Objekt im Format ` +
                  `${QUESTION_FORMAT_EXAMPLE}. Alle Fragen müssen auf Deutsch sein.\n\n${text}`,
                );
                const answer = modelText(response).trim();
                const json = stripJsonFence(answer);
                return questionSchema.parse(JSON.parse(json));
              }));
            } catch (error) {
              // Unbrauchbares JSON stoppt den Lauf nicht: Der Chunk bleibt draußen und wird beim nächsten
              // Lauf erneut versucht. Jeder andere Fehler (Server aus, Timeout) beendet den Lauf.
              if (!(error instanceof SyntaxError || error instanceof z.ZodError)) throw error;
              failedChunks += 1;
              console.log(`${source}, chunk ${position + 1}: Model response could not be used; skipped.`);
              continue;
            }
            // Nur neue Chunks zeigen ihre Fragen; ein schon indizierter Chunk erzeugt keine.
            console.log(`${source}, chunk ${position + 1}: ${questions.join(' | ')}`);
            const metadata = metadataFor(source, position, { headingPath });
            // KERN 2: Multi-Vektor-Einträge. Ein Eintrag je Frage, alle mit demselben Chunk-Text und
            // denselben Metadaten. Gesucht wird über die Frage, in den Prompt kommt später der Text.
            const newEntries = questions.map((generatedQuestion) => ({ generatedQuestion, text, metadata }));

            // KERN 3: Die Fragen werden eingebettet, mit "query: ", denn sie sind Anfragen. Der Chunk-Text
            // selbst wird in diesem Teil nie eingebettet.
            const inputs = newEntries.map(({ generatedQuestion }) => `${e5Model.queryPrefix}${generatedQuestion}`);
            embeddingCalls += 1;
            embeddingCharacters += inputs.reduce((sum, text) => sum + text.length, 0);
            const vectors = await logInvocation('Embedding', { model: remoteEmbeddingModel.name, source, position }, () => embedTexts(inputs));
            const chunkEntries = newEntries.map((entry, index) => ({ ...entry, vector: vectors[index] }));
            // Nach jedem Chunk speichern (atomar, siehe chunking.ts): Ein Abbruch kostet höchstens diesen Chunk.
            entries = appendQuestionChunk(entries, chunkEntries, QUESTIONS_PER_CHUNK);
            newChunks += 1;
          }
        } finally {
          // Auch nach einem Fehler: zeigt, wie weit dieses Dokument kam.
          console.log(`${source}: ${newChunks} new chunks, ${skipped} chunks already indexed and skipped.`);
        }
      });
    }
  } catch {
    process.exitCode = 1;
  }
  // Übersprungene Chunks fehlen im Index: Exit-Code 1, obwohl der Lauf durchlief.
  if (failedChunks > 0) {
    console.log(`Chunks with unusable model responses in this run: ${failedChunks}`);
    process.exitCode = 1;
  }

  console.log(`Indexing in this run: ${((performance.now() - started) / 1000).toFixed(1)} s`);
  console.log(
    `Calls in this run: Embedding ${embeddingCalls}, LLM ${llmCalls}` +
    ` · LLM tokens: ${llmTokens} (reported for ${llmTokenReports}/${llmCalls} calls)` +
    ` · Embedding tokens (estimated): ${Math.ceil(embeddingCharacters / CHARACTERS_PER_TOKEN)}`,
  );

  try {
    await logInvocation('Search', { model: remoteEmbeddingModel.name }, async () => {
      // Gesucht wird in der gespeicherten Datei, nicht im Speicher: So siehst du, womit L07 und L08 arbeiten.
      const index = readQuestionIndex(QUESTIONS_PER_CHUNK);
      const savedSources = new Set(index.map(({ metadata }) => metadata.source));
      const savedChunks = new Map(index.map(({ metadata, text }) => [chunkKey(metadata.source, metadata.position), text]));
      // Was je Dokument noch fehlt; ein neuer Start macht mit genau diesen Chunks weiter.
      const missingSources = sources.map((source) => ({
        source,
        count: readChunks(source).filter((_chunk, position) => !savedChunks.has(chunkKey(source, position))).length,
      })).filter(({ count }) => count > 0);
      const missingCount = missingSources.reduce((sum, { count }) => sum + count, 0);
      console.log(
        `Chunks not yet indexed: ${missingCount}` +
        (missingCount ? ` (${missingSources.map(({ source, count }) => `${source}: ${count}`).join(', ')})` : ''),
      );
      console.log(`Saved index: ${savedSources.size} documents, ${index.length} vectors`);
      printStats(indexFile, [...savedChunks.values()].map((text) => ({ text })));
      if (index.length === 0) {
        console.log('No saved entries; search skipped.');
        return;
      }
      const ranked = await searchTop(index, index.length);
      // KERN 4: Mehrere Fragen eines Chunks können oben landen. Jeder Chunk zählt nur einmal, mit
      // seiner am besten passenden Frage.
      const hits = uniqueChunks(ranked, DEFAULT_TOP_K);

      console.log(`Top ${DEFAULT_TOP_K} for “${DEMO_QUESTION}”:`);
      console.table(hits.map(({ text, metadata, generatedQuestion, similarity }) => ({
        file: metadata.source,
        similarity: similarity.toFixed(3),
        accessGroup: metadata.accessGroup,
        section: sectionPath(metadata.headingPath),
        question: generatedQuestion,
        preview: previewChunk({ headingPath: metadata.headingPath, text }),
      })));
      // Ein RAG-Prompt bekäme den Text von Platz 1, nicht die Frage, die ihn gefunden hat.
      if (hits[0]) console.log(`Original chunk for rank 1:\n${hits[0].text}`);
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

await runMain(main);
