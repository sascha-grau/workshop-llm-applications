// Lektion 04 – Chunking, Teil 4: Suche mit generierten Fragen
//
// Lernziel: Du verstehst einen Multi-Vektor-Index: Mehrere Vektoren (hier generierte Fragen)
// zeigen auf denselben Chunk, und die Suche vergleicht Frage mit Frage.
//
// Ein Nutzer stellt eine Frage, ein Chunk nennt Fakten, und beide sind anders formuliert. Deshalb
// liegt der Vektor einer Frage nicht immer am nächsten beim Vektor des Chunks, der sie
// beantwortet. Hier schreibt das Chat-Modell zu jedem Chunk genau `QUESTIONS_PER_CHUNK` Fragen (3), die der Chunk
// beantwortet. Jede Frage wird ein eigener Suchvektor und zeigt auf den Original-Chunk-Text. Der
// Index ist ein Multi-Vektor-Index: `QUESTIONS_PER_CHUNK` Einträge pro Chunk mit gleichem Text und gleichen Metadaten,
// aber verschiedener `generatedQuestion` und verschiedenem Vektor. Die Suche vergleicht dann
// Frage mit Frage. Die Fragen werden mit dem E5-Präfix für Anfragen eingebettet, weil sie
// Anfragen sind; der Chunk-Text selbst wird in diesem Teil nicht eingebettet.
//
// Die Chunks werden wie in Teil 2 (`02-heading-chunking.ts`) geschnitten: die vorbereiteten
// Chunks aus Teil 0, weiter an den Markdown-Überschriften geteilt.
//
// Das Indizieren ist fortsetzbar, Chunk für Chunk: Ein Chunk ist durch Dokument und Position
// bestimmt, nach jedem neuen Chunk wird der Index gespeichert (die Logik dazu steht in
// `chunking.ts`), und der nächste Lauf überspringt jeden Chunk, der schon im Index steht. Eine
// Modellantwort, die nicht das erwartete JSON ist, stoppt den Lauf nicht: Dieser Chunk bleibt
// draußen, wird am Ende gemeldet und beim nächsten Lauf erneut versucht. Das Programm fügt nur
// Einträge hinzu und vergleicht den gespeicherten Text nie mit dem aktuellen: Nach geänderten
// Einstellungen (Fragen pro Chunk, Prompt) oder Dokumenten musst du die Indexdatei löschen.
//
// Zum Verstehen reichen die KERN-Zeilen (markiert mit `// KERN:`): der Prompt für die Fragen, das
// Erzeugen der Fragen und die Multi-Vektor-Einträge. Der Rest ist Fortsetzen, Prüfen und Zählen.
//
// Kosten: ein Modellaufruf und eine Embedding-Anfrage (`QUESTIONS_PER_CHUNK` Fragen) pro neuem Chunk. Mit
// FULL_CORPUS = true sind das bei einem ersten Lauf für den ganzen Korpus Hunderte Aufrufe und
// viele Minuten (Beispiellauf: 199 Chunks, 597 Vektoren, etwa 20 bis 25 Minuten auf dem
// Workshop-Server). Standardmäßig läuft nur das Beispieldokument. Ein vollständig indizierter
// Korpus kostet keinen Aufruf.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server, geladenem Chat- und E5-Modell
// (REMOTE_MODEL_*, REMOTE_EMBEDDING_MODEL_NAME); die vorbereiteten Chunks existieren
// (`npm run l04:0`). Burp ist optional. Der Index `headings` aus Teil 2 wird hier nicht gebraucht.
// Start: npm run l04:4   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Ändere `QUESTIONS_PER_CHUNK` von 3 auf 5, lösche die Indexdatei `indexes/questions__*.json`
//      und starte neu. Werden die Treffer besser, und wie viel länger dauert der Lauf?
//   2. Lies die ausgegebenen Fragen: Welche sind gut, welche zu allgemein? Passe den Prompt an,
//      lösche den Index und vergleiche.
//   3. Ändere `DEMO_QUESTION` in chunking.ts auf eine Frage, die ein Chunk beantwortet, ohne ihre Wörter
//      zu benutzen. Findet die Suche nach Fragen ihn besser als die Suche nach Chunk-Text (Teil 2)?
import { ChatOpenAI } from '@langchain/openai';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { z } from 'zod';
import { remoteModel, remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { CHARACTERS_PER_TOKEN, e5Model } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { indexFileFor, DEFAULT_TOP_K, chunkKey, uniqueChunks, type QuestionEntry } from '../shared/index.ts';
import { requirePreparedChunks, embedTexts, DEMO_QUESTION, EXAMPLE_DOCUMENT, readChunks, sourcesFor, sectionPath, previewChunk, metadataFor, printStats, searchTop, readQuestionIndex, hasChunk, appendQuestionChunk } from './chunking.ts';
import { runMain } from '../shared/startup.ts';

// false: nur das Beispieldokument (schnell). true: der ganze Korpus (Hunderte Modellaufrufe, viele
// Minuten). Dokumente früherer Läufe bleiben im Index und werden durchsucht.
const FULL_CORPUS = false;
const SUBSET: string[] = FULL_CORPUS ? [] : [EXAMPLE_DOCUMENT];
// NEU: So viele Fragen je Chunk (ein Vektor pro Frage). Das Schema unten prüft genau diese Zahl,
// und der Prompt verlangt sie.
const QUESTIONS_PER_CHUNK = 3;
// Das Formatbeispiel im Prompt hat genau so viele Einträge wie `QUESTIONS_PER_CHUNK`, denn kleine
// Modelle übernehmen die Länge des Beispiels.
const QUESTION_FORMAT_EXAMPLE = JSON.stringify({
  questions: Array.from({ length: QUESTIONS_PER_CHUNK }, (_, index) => `Frage ${index + 1}?`),
});

async function main() {
  requirePreparedChunks();
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Jeder Modellaufruf (Chunk-Text hinaus, Fragen
  // zurück) und jede Embedding-Anfrage erscheint in der HTTP-History.
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
  // Die erwartete Antwort des Modells: genau `QUESTIONS_PER_CHUNK` Fragen, keine leer. Das Programm bittet den Server
  // nicht um strukturierte Ausgabe (kein `withStructuredOutput`, kein `response_format`): Mit einem
  // JSON-Schema in der Anfrage lieferte der frühere Workshop-Server mit einem Reasoning-Modell das
  // JSON im Feld `reasoning` und ließ `content` leer, sodass LangChain mit "Unexpected end of JSON
  // input" scheiterte (mit LM Studio nicht erneut geprüft). Reasoning-Modelle (siehe
  // REMOTE_MODEL_NAME in .env.example) sind dafür anfällig. Deshalb verlangt der Prompt nur JSON,
  // und dieses Schema prüft, was zurückkommt.
  const questionSchema = z.object({ questions: z.array(z.string().trim().min(1)).length(QUESTIONS_PER_CHUNK) });

  const sources = sourcesFor(SUBSET);

  // Niemand bemerkt geänderte Einstellungen oder Dokumente; nur das Löschen der Datei ergibt einen
  // frischen Index.
  console.log(
    'Existing chunks are kept and searched, including those outside the selection. ' +
    `If settings or content change, delete ${indexFile} to rebuild the index.`,
  );

  // Eine Zeile pro Dokument dieses Laufs. Keine Prüfung gegen das Token-Limit: Teil 1 hat gezeigt,
  // dass jeder vorbereitete Chunk passt, und Schneiden an Überschriften macht Chunks nur kleiner.
  console.log('Chunks per document:');
  console.table(sources.map((source) => ({ document: source, chunks: readChunks(source).length })));

  // Dieser Teil braucht beide Modelle: Das Chat-Modell schreibt die Fragen, das Embedding-Modell
  // bettet sie ein. Beide laufen auf demselben Server, deshalb genügt eine Prüfung.
  await checkModelServer({ viaBurp: true });

  // Laufzeit, Aufrufe und Tokens unten beschreiben nur diesen Lauf; ein Lauf, der alles im Index
  // findet, macht 0 LLM-Aufrufe. Anzahlen und Längen weiter unten beschreiben den gespeicherten Index.
  const started = performance.now();
  let entries: QuestionEntry[] = [];
  let embeddingCalls = 0;
  // Der Embedding-Server meldet keine Tokens, deshalb werden sie aus den gesendeten Zeichen geschätzt.
  let embeddingCharacters = 0;
  // Chunks, deren Modellantwort nicht das erwartete JSON war. Sie bleiben draußen, der Lauf geht weiter.
  let failedChunks = 0;

  try {
    // Ausgangspunkt ist, was ein früherer Lauf gespeichert hat, falls es eine Datei gibt.
    entries = await logInvocation('Index', { file: indexFile }, async () => readQuestionIndex(QUESTIONS_PER_CHUNK));
    for (const source of sources) {
      const chunks = readChunks(source);
      // Ein protokollierter Schritt pro Dokument; Modellaufruf und Embedding-Anfrage jedes Chunks
      // darin werden einzeln protokolliert.
      await logInvocation('Indexing', { source }, async () => {
        // Zähler dieses Dokuments für die Zusammenfassung am Ende. (Die Zugriffsgruppe wird wie in
        // Teil 2 aus dem Dokumentnamen abgeleitet: nicht als intern geführt = "public", sonst "internal".)
        let newChunks = 0;
        let skipped = 0;
        try {
          // Ein Modellaufruf pro neuem Chunk, einer nach dem anderen. Jeder Chunk wird zuerst im Index
          // nachgeschlagen: Ein Chunk mit Einträgen dort ist erledigt und kostet in diesem und jedem
          // späteren Lauf keinen Aufruf.
          for (const [position, { headingPath, text }] of chunks.entries()) {
            const inIndex = hasChunk(entries, source, position);
            if (inIndex) {
              skipped += 1;
              continue;
            }
            let questions: string[];
            try {
              ({ questions } = await logInvocation('LLM', { model: remoteModel.name, source, position }, async () => {
                // KERN: Der Prompt (auf Deutsch, wie die Frage) verlangt genau QUESTIONS_PER_CHUNK kurze
                // Fragen in den eigenen Worten eines Nutzers und nur JSON, weil man den Server nicht
                // um strukturierte Ausgabe bitten kann (siehe questionSchema). Danach wird die Antwort
                // geparst und mit dem Schema geprüft.
                llmCalls += 1;
                const response = await model.invoke(
                  `Schreibe genau ${QUESTIONS_PER_CHUNK} kurze Fragen auf Deutsch, wie sie ein Nutzer in eigenen Worten stellen würde und die dieser Abschnitt beantwortet. ` +
                  `Bei einer Linkliste frage nach ihren Themen oder Quellen. Antworte ausschließlich mit einem JSON-Objekt im Format ` +
                  `${QUESTION_FORMAT_EXAMPLE}. Alle Fragen müssen auf Deutsch sein.\n\n${text}`,
                );
                const answer = response.text.trim();
                const json = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(answer)?.[1] ?? answer;
                return questionSchema.parse(JSON.parse(json));
              }));
            } catch (error) {
              // Eine Antwort, die nicht das erwartete JSON ist (gar kein JSON oder nicht genau `QUESTIONS_PER_CHUNK`
              // Fragen), darf den Lauf nicht stoppen: Dieser Chunk bleibt aus dem Index, der nächste
              // folgt. Ein späterer Lauf versucht ihn erneut. Jeder andere Fehler (Server aus,
              // Timeout) beendet den Lauf weiterhin.
              if (!(error instanceof SyntaxError || error instanceof z.ZodError)) throw error;
              failedChunks += 1;
              console.log(`${source}, chunk ${position + 1}: Model response could not be used; skipped.`);
              continue;
            }
            // Zeigt die generierten Fragen, damit du ihre Qualität mit bloßem Auge beurteilen kannst.
            // Nur für Chunks dieses Laufs: Ein Chunk, der schon im Index steht, erzeugt nichts.
            console.log(`${source}, chunk ${position + 1}: ${questions.join(' | ')}`);
            const metadata = metadataFor(source, position, { headingPath });
            // KERN: Multi-Vektor-Einträge. Ein Eintrag pro Frage: gleicher Text und gleiche Metadaten, nur die Frage (und später
            // der Vektor) unterscheidet sich. Der Index speichert den Chunk-Text, weil ihn ein
            // RAG-Prompt braucht (Lektion 05).
            const newEntries = questions.map((generatedQuestion) => ({ generatedQuestion, text, metadata }));

            // Die Fragen sind Anfragen, also bekommen sie das Anfrage-Präfix, nicht das Passage-Präfix.
            // Das Präfix ist nur Teil der Eingabe; der Index speichert die reine Frage. Eine
            // Embedding-Anfrage trägt die `QUESTIONS_PER_CHUNK` Fragen dieses Chunks.
            // KERN: Die Fragen werden eingebettet; ihre Vektoren zeigen später auf den Chunk-Text.
            const inputs = newEntries.map(({ generatedQuestion }) => `${e5Model.queryPrefix}${generatedQuestion}`);
            embeddingCalls += 1;
            embeddingCharacters += inputs.reduce((sum, text) => sum + text.length, 0);
            const vectors = await logInvocation('Embedding', { model: remoteEmbeddingModel.name, source, position }, () => embedTexts(inputs));
            const chunkEntries = newEntries.map((entry, index) => ({ ...entry, vector: vectors[index] }));
            // Speichern: hängt die neuen Einträge an, prüft den ganzen Index und schreibt die Datei
            // atomar (Logik in chunking.ts). `entries` ändert sich erst nach dem Speichern.
            entries = appendQuestionChunk(entries, chunkEntries, QUESTIONS_PER_CHUNK);
            newChunks += 1;
          }
        } finally {
          // Auch nach einem fehlgeschlagenen Chunk: zeigt, wie weit dieses Dokument vor dem Abbruch kam.
          console.log(`${source}: ${newChunks} new chunks, ${skipped} chunks already indexed and skipped.`);
        }
      });
    }
  } catch {
    process.exitCode = 1;
  }
  // Übersprungene Chunks fehlen im Index, der Lauf war also nicht vollständig erfolgreich.
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
      // Suchen heißt: Datei lesen, Frage einbetten, mit dem Vektor jeder generierten Frage
      // vergleichen, sortieren. Frage trifft Frage, beide mit dem Anfrage-Präfix. Die Suche nutzt
      // immer die gespeicherte Datei, nicht, was dieser Lauf im Speicher hielt; sie zeigt also, womit
      // ein späterer Lauf startet.
      const index = readQuestionIndex(QUESTIONS_PER_CHUNK);
      const savedSources = new Set(index.map(({ metadata }) => metadata.source));
      // Jeder Chunk einmal, egal wie viele Fragen er hat; der Schlüssel ist Dokument plus Position.
      const savedChunks = new Map(index.map(({ metadata, text }) => [chunkKey(metadata.source, metadata.position), text]));
      // Nach einem fehlgeschlagenen Lauf funktioniert die Suche mit dem Gespeicherten weiter. Das
      // hier sagt, was pro Dokument noch fehlt; ein neuer Start macht mit genau diesen Chunks weiter.
      const missingSources = sources.map((source) => ({
        source,
        count: readChunks(source).filter((_chunk, position) => !savedChunks.has(chunkKey(source, position))).length,
      })).filter(({ count }) => count > 0);
      const missingCount = missingSources.reduce((sum, { count }) => sum + count, 0);
      console.log(
        `Chunks not yet indexed: ${missingCount}` +
        (missingCount ? ` (${missingSources.map(({ source, count }) => `${source}: ${count}`).join(', ')})` : ''),
      );
      // Eine Länge pro Chunk (nicht pro Frage), für die Statistik darunter.
      console.log(`Saved index: ${savedSources.size} documents, ${index.length} vectors`);
      printStats(indexFile, [...savedChunks.values()].map((text) => ({ text })));
      if (index.length === 0) {
        console.log('No saved entries; search skipped.');
        return;
      }
      const ranked = await searchTop(index, index.length);
      // NEU: Mehrere Fragen eines Chunks können weit oben landen. Jeder Chunk soll nur einmal erscheinen;
      // deshalb bleibt nur sein erster Eintrag im Ranking, die am besten passende Frage.
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
      // Der Text von Platz 1 ist das, was ein RAG-Prompt bekäme, nicht die Frage, die ihn gefunden hat.
      if (hits[0]) console.log(`Original chunk for rank 1:\n${hits[0].text}`);
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
