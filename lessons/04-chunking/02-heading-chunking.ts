// Lektion 04 – Chunking, Teil 2: An der Dokumentstruktur schneiden
//
// Lernziel: An Überschriften schneiden und sehen, warum kleine, thematisch reine Chunks besser treffen.
// Braucht:  Chunks aus `npm run l04:0`, LM Studio mit E5.
// Schreibt: Index `headings` – Grundlage von Teil 5 und Lektion 05 bis 08.
// Start:    npm run l04:2   (oder F5)
// Erklärt:  lessons/04-chunking/GUIDE.de.md → „Teil 2“
//
// Aufgabe:
//   1. Vergleiche die Top 3 mit Teil 1: Welcher Abschnitt steht jetzt vorn, und warum?
//   2. In `splitByHeadings` (chunking.ts) beide `#{1,3}` auf `#{1,2}`: Wie ändern sich Chunks und Treffer?
//      ↺ Danach zurück auf `#{1,3}` und `npm run l04:2` (sonst lesen L05–L08 den groben Index).
//   3. `SUBSET` auf ['01-llm01-prompt-injection.md']: Wie viel schneller ist das Einbetten?
//      ↺ Danach `SUBSET` auf [] und `npm run l04:2` (sonst kennen L05–L08 nur dieses Dokument).
//
// Lesen: die Zeilen `// KERN 1–2`. Der Rest ist wie in Teil 1.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { e5Model } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { writeIndex, readIndex, DEFAULT_TOP_K, sectionPath, type IndexEntry, type ChunkMetadata } from '../shared/index.ts';
import { requirePreparedChunks, embedTexts, exampleDocuments, previewChunk, metadataFor, printStats, searchTop, DEMO_QUESTION, printHits, readManifest, readChunks, sourcesFor } from './chunking.ts';
import { runMain } from '../shared/startup.ts';

// Standard: [] = der ganze Korpus. Eine Liste von Dokumentnamen indexiert nur diese (schneller).
const SUBSET: string[] = [];

async function main() {
  requirePreparedChunks();
  useBurpIfConfigured();

  const manifest = readManifest();
  const sources = sourcesFor(SUBSET, manifest);

  for (const document of exampleDocuments(manifest, sources)) {
    console.log(`Chunks from ${document}:`);
    console.table(readChunks(document, manifest).map((chunk) => ({
      characters: chunk.text.length,
      section: sectionPath(chunk.headingPath),
      preview: previewChunk(chunk),
    })));
  }

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Embedding', { model: remoteEmbeddingModel.name, documentCount: sources.length }, async () => {
      const entries: IndexEntry<ChunkMetadata>[] = [];
      let embeddingCalls = 0;

      for (const source of sources) {
        // KERN 1: readChunks schneidet die vorbereiteten Chunks an den Überschriften (`splitByHeadings`);
        // jeder Chunk beginnt mit seinem Überschriftenpfad.
        const chunks = readChunks(source, manifest);
        if (chunks.length === 0) continue;
        // Eine Anfrage je Dokument. Das Präfix ist nur Eingabe, der Index speichert den Text mit Pfad.
        const vectors = await embedTexts(chunks.map(({ text }) => `${e5Model.passagePrefix}${text}`));
        embeddingCalls += 1;
        // KERN 2: Metadaten mit Überschriftenpfad (als Liste) und Zugriffsgruppe ("public"/"internal").
        // Die Zugriffsgruppe schützt hier noch nichts; gefiltert wird erst ab Lektion 05, Teil 3.
        chunks.forEach(({ headingPath, text }, position) => entries.push({
          text,
          metadata: metadataFor(source, position, { headingPath }),
          vector: vectors[position],
        }));
        console.log(`${source}: ${chunks.length} chunks`);
      }

      const indexFile = writeIndex('headings', entries);
      printStats(indexFile, entries);
      // Kein Sprachmodell beteiligt: Schneiden an Überschriften kostet nur die Embeddings.
      console.log(`Embedding calls: ${embeddingCalls}, LLM calls: 0`);
    });

    await logInvocation('Search', { model: remoteEmbeddingModel.name }, async () => {
      const hits = await searchTop(readIndex('headings'), DEFAULT_TOP_K);
      console.log(`Top ${DEFAULT_TOP_K} for “${DEMO_QUESTION}”:`);
      printHits(hits);
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

await runMain(main);
