// Lektion 04 – Chunking, Teil 1: Index aus vorbereiteten Chunks
//
// Lernziel: Aus fertigen Chunks einen Index bauen und ihn mit einer Frage durchsuchen.
// Braucht:  Chunks aus `npm run l04:0`, LM Studio mit E5.
// Schreibt: Index `prepared` (indexes/prepared__<Modell>.json) – gelesen von L06, Teil 1 und L08, Teil 5.
// Start:    npm run l04:1   (oder F5)
// Erklärt:  lessons/04-chunking/GUIDE.de.md → „Teil 1“
//
// Aufgabe:
//   1. `DEMO_QUESTION` (chunking.ts) auf 'Was ist ein Jailbreak?': Stehen die Treffer im passenden Dokument?
//      ↺ Danach zurück auf 'Wie begrenze ich Prompt Injection?' (alle Teile stellen dieselbe Frage).
//   2. `EXAMPLE_DOCUMENT` (chunking.ts) auf ein anderes Dokument: Wie viele Chunks, wie viele Zeichen je
//      Token? Alle auf einmal: `ALL_DOCUMENTS = true` (oder `ALL_DOCUMENTS=true` in `.env`).
//      ↺ Danach '01-llm01-prompt-injection.md', `false` und den `.env`-Eintrag leeren (Teil 4 nutzt EXAMPLE_DOCUMENT).
//   3. Spalte „characters per token“: Welche Chunks liegen deutlich unter 4? Was steht in ihnen?
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Ausgabe.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { e5Model } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { writeIndex, readIndex, DEFAULT_TOP_K, type IndexEntry, type ChunkMetadata } from '../shared/index.ts';
import { requirePreparedChunks, embedTexts, exampleDocuments, previewText, metadataFor, printStats, searchTop, DEMO_QUESTION, printHits, readManifest, readChunk } from './chunking.ts';
import { COUNTING_METHOD } from './formats.ts';
import { runMain } from '../shared/startup.ts';

async function main() {
  requirePreparedChunks();
  useBurpIfConfigured();

  const manifest = readManifest();
  const chunks = manifest.sources.flatMap(({ file: source, chunks: chunkFiles }) =>
    chunkFiles.map(({ file: chunkFile, token_count: tokens }, position) => ({
      source, position, chunkFile, tokens, text: readChunk(chunkFile),
    })));

  // Hat Teil 0 nur geschätzt (`counting_method`), sind die Token-Zahlen unten Schätzwerte, und
  // „characters per token“ liegt dann überall bei etwa 1.
  if (manifest.counting_method === COUNTING_METHOD.estimate) {
    console.log('Token counts in the manifest are conservative character estimates, not guaranteed token counts.');
  }
  for (const document of exampleDocuments(manifest)) {
    console.log(`Chunks from ${document} (limit: ${manifest.limit} tokens):`);
    console.table(chunks.filter(({ source }) => source === document).map(({ chunkFile, tokens, text }) => ({
      file: chunkFile,
      characters: text.length,
      tokens: tokens,
      'characters per token': (text.length / tokens).toFixed(1),
      preview: previewText(text),
    })));
  }

  // Wer Tokens aus Zeichen schätzt (wie Teil 4 für seine Kostenzeile), muss mit dem kleinsten
  // Verhältnis im Korpus rechnen: Das ist der ungünstigste Fall.
  const lowestRatio = Math.min(...chunks.map(({ text, tokens }) => text.length / tokens));
  console.log(
    `Full corpus: ${chunks.length} chunks, at most ${Math.max(...chunks.map(({ tokens }) => tokens))} tokens,` +
    ` at least ${lowestRatio.toFixed(2)} characters per token`,
  );

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Embedding', { model: remoteEmbeddingModel.name, chunkCount: chunks.length }, async () => {
      // KERN 1: Ein Vektor je Chunk, alle in einer Anfrage. Das Präfix "passage: " gehört zum Modell
      // (Lektion 03, Teil 3), nicht zum Text: Der Index speichert den reinen Chunk-Text.
      const vectors = await embedTexts(chunks.map(({ text }) => `${e5Model.passagePrefix}${text}`));
      const entries: IndexEntry<ChunkMetadata>[] = chunks.map(({ source, position, chunkFile, text }, index) => ({
        text,
        metadata: metadataFor(source, position, { chunkFile }),
        vector: vectors[index],
      }));

      // KERN 2: Index schreiben: je Chunk Text, Metadaten (Dokument, Position, …) und Vektor.
      const indexFile = writeIndex('prepared', entries);
      printStats(indexFile, entries);
    });

    // KERN 3: Suche: Frage einbetten, mit allen Chunk-Vektoren vergleichen, die besten drei zeigen.
    await logInvocation('Search', { model: remoteEmbeddingModel.name }, async () => {
      const hits = await searchTop(readIndex('prepared'), DEFAULT_TOP_K);
      console.log(`Top ${DEFAULT_TOP_K} for “${DEMO_QUESTION}”:`);
      printHits(hits);
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

await runMain(main);
