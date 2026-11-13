// Lektion 04 – Chunking, Teil 3: Schneiden, wo das Thema wechselt
//
// Lernziel: Das Embedding-Modell findet Themensprünge; ein Perzentil steuert, wie viele davon
//           zu Schnitten werden.
// Braucht:  Chunks aus `npm run l04:0`, LM Studio mit E5.
// Schreibt: Index `semantic` – gelesen von L06, Teil 1, L07, Teil 2 und L08, Teil 5.
// Start:    npm run l04:3   (oder F5)
// Erklärt:  lessons/04-chunking/GUIDE.de.md → „Teil 3“
//
// Aufgabe:
//   1. `DISTANCE_PERCENTILE` auf 80: Wie viele semantische Schnitte und Chunks zeigt die Ausgabe?
//   2. `DISTANCE_PERCENTILE` auf 100: Sage vorher, wie viele semantische Schnitte bleiben, dann prüfe es.
//      ↺ Nach 1 und 2: zurück auf 95, `npm run l04:3` neu starten (sonst rechnen L07/L08 mit deinem Index).
//   3. Vergleiche „Embedding calls“ mit Teil 2. Woher kommt der Unterschied?
//
// Lesen: die Zeilen `// KERN 1–4`. Der Rest ist Handwerk (Sätze, Überschriften, Index).
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { cosineSimilarity, e5Model } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { writeIndex, readIndex, DEFAULT_TOP_K, type IndexEntry, type ChunkMetadata } from '../shared/index.ts';
import { requirePreparedChunks, embedTexts, exampleDocuments, previewText, metadataFor, printStats, searchTop, DEMO_QUESTION, printHits, readManifest, prepareSemanticChunk, type HeadingSection, type PreparedChunk, percentile } from './chunking.ts';
import type { Manifest } from './formats.ts';
import { runMain } from '../shared/startup.ts';

// Standard: 95. Kleiner = mehr Schnitte. Die Schwelle ist relativ zum Dokument, weil kein fester
// Abstand „neues Thema“ bedeutet.
const DISTANCE_PERCENTILE = 95;

async function main() {
  requirePreparedChunks();
  useBurpIfConfigured();

  type SemanticChunk = { chunkFile: string; text: string };
  const manifest = readManifest();

  // Schneidet ein Dokument an Überschriften und Themensprüngen. Keine Größenprüfung nötig: Jedes Stück
  // stammt aus einem vorbereiteten Chunk unter dem Token-Limit, Schnitte machen es nur kleiner.
  async function splitSemantically(document: Manifest['sources'][number]) {
    // Sätze und Überschriften trennt `prepareSemanticChunk` in chunking.ts.
    const preparedChunks = document.chunks.map(({ file }) => prepareSemanticChunk(file));

    const measuredPreparedChunks: PreparedChunk[] = [];
    let embeddingCalls = 0;
    for (const preparedChunk of preparedChunks) {
      // KERN 1: Ein Fenster ist ein Satz mit Vorgänger und Nachfolger, damit ein kurzer Satz nicht
      // allein entscheidet. Fenster reichen nie über eine Überschrift hinweg.
      const windows = preparedChunk.sections.flatMap(({ sentences }) => sentences.map((_sentence, index) =>
        sentences.slice(Math.max(0, index - 1), index + 2).join('')));
      // "query: " statt "passage: ": Fenster mit Fenstern zu vergleichen ist eine symmetrische Aufgabe,
      // für die E5 das Anfrage-Präfix vorsieht. Eine Anfrage je vorbereitetem Chunk mit Sätzen.
      let vectors: number[][] = [];
      if (windows.length > 0) {
        vectors = await embedTexts(windows.map((text) => `${e5Model.queryPrefix}${text}`));
        embeddingCalls += 1;
      }
      // distances[n] gehört zur Lücke zwischen Satz n und n + 1: ein Abstand weniger als Sätze.
      let vectorOffset = 0;
      const sections = preparedChunk.sections.map(({ heading, sentences }): HeadingSection => {
        const sectionVectors = vectors.slice(vectorOffset, vectorOffset + sentences.length);
        vectorOffset += sentences.length;
        // KERN 2: Abstand zweier Nachbarfenster = 1 minus Kosinus-Ähnlichkeit.
        const distances = sectionVectors.slice(1).map((vector, index) => 1 - cosineSimilarity(sectionVectors[index], vector));
        return { heading, sentences, distances };
      });
      measuredPreparedChunks.push({ ...preparedChunk, sections });
    }

    // Eine Schwelle für das ganze Dokument: Ein Abschnitt ohne Themensprung bekommt keinen Schnitt.
    const distances = measuredPreparedChunks.flatMap(({ sections }) => sections.flatMap(({ distances }) => distances));
    // KERN 3: Schwelle = Perzentil der Abstände. Bei weniger als 4 Abständen ist sie unendlich: kein
    // semantischer Schnitt.
    const threshold = distances.length < 4 ? Infinity : percentile(distances, DISTANCE_PERCENTILE);
    const chunks: SemanticChunk[] = measuredPreparedChunks.flatMap(({ chunkFile, leadingHeadingBlock, sections }) =>
      sections.flatMap(({ heading, sentences, distances }) => {
        // Jeder Abschnitt beginnt ein neues Stück (Schnitt aus der Struktur).
        const pieces = [heading];
        sentences.forEach((sentence, index) => {
          // KERN 4: Schnitt aus dem Thema, wo der Abstand zum vorigen Satz größer als die Schwelle ist.
          if (index > 0 && distances[index - 1] > threshold) pieces.push('');
          pieces[pieces.length - 1] += sentence;
        });
        // Die führenden Überschriften des vorbereiteten Chunks stehen vor jedem Stück, damit es allein
        // verständlich bleibt.
        return pieces.map((piece) => ({ chunkFile, text: `${leadingHeadingBlock}${piece}`.trim() }));
      }));

    return { chunks, distances, threshold, embeddingCalls };
  }

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Embedding', { model: remoteEmbeddingModel.name, documentCount: manifest.sources.length }, async () => {
      const examples = new Set(exampleDocuments(manifest));
      const entries: IndexEntry<ChunkMetadata>[] = [];
      let embeddingCalls = 0;
      for (const document of manifest.sources) {
        const result = await splitSemantically(document);
        const { chunks } = result;
        embeddingCalls += result.embeddingCalls;
        if (examples.has(document.file)) {
          const formattedPercentile = (percent: number) => percentile(result.distances, percent).toFixed(3);
          console.log(
            `Distances in ${document.file}: ${result.distances.length} · min ${formattedPercentile(0)}` +
            ` · median ${formattedPercentile(50)} · percentile 90 ${formattedPercentile(90)}` +
            ` · percentile ${DISTANCE_PERCENTILE} ${formattedPercentile(DISTANCE_PERCENTILE)} · max ${formattedPercentile(100)}`,
          );
          // „Cuts“ zählt nur Themensprünge; die Zahl der Chunks enthält auch die Schnitte an Überschriften.
          console.log(
            `Cuts: ${result.distances.filter((distance) => distance > result.threshold).length}` +
            (result.distances.length < 4
              ? ' semantic (too few sentences for a semantic cut)'
              : ` semantic (distance > ${result.threshold.toFixed(3)})`) +
            ` · ${chunks.length} chunks`,
          );
          console.log(`Chunks from ${document.file}:`);
          console.table(chunks.map(({ chunkFile, text }, position) => ({
            number: position + 1,
            file: chunkFile,
            characters: text.length,
            preview: previewText(text),
          })));
        }
        if (chunks.length === 0) continue;
        // Zweite Runde Embeddings: die fertigen Chunks, jetzt mit "passage: " wie in Teil 1 und 2.
        const vectors = await embedTexts(chunks.map(({ text }) => `${e5Model.passagePrefix}${text}`));
        embeddingCalls += 1;
        chunks.forEach(({ chunkFile, text }, position) => entries.push({
          text,
          metadata: metadataFor(document.file, position, { chunkFile }),
          vector: vectors[position],
        }));
        console.log(`${document.file}: ${chunks.length} chunks`);
      }

      const indexFile = writeIndex('semantic', entries);
      printStats(indexFile, entries);
      // Zwei Runden Embeddings (Fenster, dann Chunks), deshalb mehr Aufrufe als Teil 2, aber kein Sprachmodell.
      console.log(`Embedding calls: ${embeddingCalls}, LLM calls: 0`);
    });

    await logInvocation('Search', { model: remoteEmbeddingModel.name }, async () => {
      const hits = await searchTop(readIndex('semantic'), DEFAULT_TOP_K);
      console.log(`Top ${DEFAULT_TOP_K} for “${DEMO_QUESTION}”:`);
      printHits(hits);
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

await runMain(main);
