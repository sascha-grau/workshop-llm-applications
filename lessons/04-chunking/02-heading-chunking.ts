// Lektion 04 – Chunking, Teil 2: An der Dokumentstruktur schneiden
//
// Lernziel: Du schneidest Dokumente an ihren Überschriften und siehst, warum kleinere, thematisch
// reine Chunks besser gefunden werden.
//
// Teil 1 (`01-prepared-chunks.ts`) liest vorbereitete Chunks und bettet sie unverändert ein. Hier
// schneidet das Programm diese Chunks weiter, an den Markdown-Überschriften: Jeder Abschnitt wird
// ein Chunk. Jeder Chunk beginnt mit seinem Überschriftenpfad (Dokumenttitel › Abschnitt ›
// Unterabschnitt), damit er auch allein verständlich ist. Dieser Pfad wird später in Lektion 07
// (RAG) als Quellenangabe angezeigt.
//
// Das Programm braucht kein eigenes Token-Limit: Teil 0 hat jeden vorbereiteten Chunk gegen das
// Limit des Embedding-Modells geprüft, und Schneiden an Überschriften macht Chunks nur kleiner. Der
// Preis: Ein Abschnitt, den Teil 0 auf zwei vorbereitete Chunks verteilen musste, bleibt auch
// hier zwei Chunks.
//
// Das Programm zeigt die Chunks der Beispieldokumente (`ALL_DOCUMENTS`), bettet den Korpus ein,
// schreibt Text, Metadaten und Vektor in die Indexdatei und durchsucht sie mit der Frage aus Teil 1.
//
// Vergleiche die drei Treffer mit denen aus Teil 1: Ein vorbereiteter Chunk füllt das Token-Limit
// und mischt mehrere Abschnitte, sein Vektor ist ein Mittelwert aus allen. Ein Chunk mit genau
// einem Abschnitt hat einen Vektor für genau dieses Thema, und eine Frage dazu findet ihn direkt.
//
// Dieser Index (`headings`) ist die Grundlage von Lektion 05 bis 08: Die Retrieval-Strategien, Hybrid-Suche und Reranking (Qdrant), RAG (Teil 1) und die Evaluierung laden genau diese Datei.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und geladenem E5-Modell; die
// vorbereiteten Chunks existieren (`npm run l04:0`). Burp ist optional.
// Start: npm run l04:2   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Ändere die Überschriftentiefe: Setze in `splitByHeadings` (chunking.ts) beide Vorkommen von
//      `#{1,3}` auf `#{1,2}`. Wie ändert sich die Zahl der Chunks, und was passiert mit den Treffern?
//   2. Trage in `SUBSET` einen Dokumentnamen ein (z. B. den von EXAMPLE_DOCUMENT), dann läuft das
//      Einbetten schneller.
//      Setze `SUBSET` danach wieder auf `[]` und starte `npm run l04:2` neu, sonst kennen Lektion 05 bis 08 nur dieses Dokument.
//   3. Ändere `DEMO_QUESTION` in chunking.ts und vergleiche die besten drei Treffer (`DEFAULT_TOP_K`) mit Teil 1.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { e5Model } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { writeIndex, readIndex, DEFAULT_TOP_K, sectionPath, type IndexEntry, type ChunkMetadata } from '../shared/index.ts';
import { requirePreparedChunks, embedTexts, exampleDocuments, previewChunk, metadataFor, printStats, searchTop, DEMO_QUESTION, printHits, readChunks, sourcesFor } from './chunking.ts';
import { runMain } from '../shared/startup.ts';

// Leer heißt: der ganze Korpus. Eine Liste von Dokumentnamen indexiert nur diese Dokumente
// (im Workshop schneller).
const SUBSET: string[] = [];

async function main() {
  requirePreparedChunks();
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Jedes Dokument ist eine Anfrage, mit den Chunk-Texten hinaus
  // und den rohen Vektoren zurück.
  useBurpIfConfigured();

  const sources = sourcesFor(SUBSET);

  for (const document of exampleDocuments()) {
    console.log(`Chunks from ${document}:`);
    console.table(readChunks(document).map((chunk) => ({
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
        // NEU: readChunks schneidet die vorbereiteten Chunks an den Überschriften.
        const chunks = readChunks(source);
        if (chunks.length === 0) continue;
        // Das Präfix sagt dem Modell, welche Rolle ein Text spielt (siehe Lektion 03, Teil 3). Es gehört
        // zum Modell, nicht zum Dokument und ist nur Teil der Eingabe; der Index speichert den
        // Chunk-Text mit seinem Überschriftenpfad.
        const vectors = await embedTexts(chunks.map(({ text }) => `${e5Model.passagePrefix}${text}`));
        embeddingCalls += 1;
        // NEU: Die Metadaten enthalten den Überschriftenpfad (als Liste) und die Zugriffsgruppe. Die Zugriffsgruppe wird
        // hier nur gespeichert und schützt noch nichts; gefiltert wird erst ab Lektion 05 (Teil 3). Ein Dokument,
        // das nicht als intern geführt ist, bekommt "public", intern ist "internal".
        chunks.forEach(({ headingPath, text }, position) => entries.push({
          text,
          metadata: metadataFor(source, position, { headingPath }),
          vector: vectors[position],
        }));
        console.log(`${source}: ${chunks.length} chunks`);
      }

      const indexFile = writeIndex('headings', entries);
      printStats(indexFile, entries);
      // Eine Anfrage pro Dokument und kein Sprachmodell beteiligt: Das Schneiden an Überschriften
      // kostet nur die Embeddings.
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

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
