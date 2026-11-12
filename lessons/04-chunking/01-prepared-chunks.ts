// Lektion 04 – Chunking, Teil 1: Index aus vorbereiteten Chunks
//
// Lernziel: Du baust einen Index aus vorbereiteten Chunks und durchsuchst ihn.
//
// Ein ganzes Dokument ist für ein Embedding zu lang und zu gemischt im Thema. Deshalb wird es in
// Chunks (Abschnitte) geteilt, und jeder Chunk bekommt einen eigenen Vektor. Ein Index ist die
// Datei, in der Chunk-Text, Metadaten und Vektor gespeichert sind (hier JSON unter `indexes/`).
// Das Zerteilen ist in diesem Teil schon erledigt: Teil 0 (`npm run l04:0`, Datei
// `00-prepare-chunks.ts`) hat die Dokumente der OWASP Top 10 für LLM-Anwendungen an Absätzen,
// Listenpunkten und Sätzen in Stücke unter 512 Tokens geschnitten; die Überschriften bleiben beim
// Text. Das Ergebnis liegt als eine Datei pro Chunk unter `content/owasp-genai-top-10/chunks/`.
// Diese Dateien liegen nicht im Repository; du erzeugst sie einmal selbst. Teil 1 liest nur, was
// Teil 0 erzeugt hat. Jede Datei wiederholt Dokumenttitel und Überschriften, damit der Chunk auch
// allein verständlich ist.
//
// Das Limit von 512 Tokens ist das, was E5 lesen kann. LM Studio bietet keinen Tokenizer-Endpunkt;
// deshalb zählt Teil 0 die Tokens über den Embedding-Endpunkt, und wo das nicht verlässlich geht,
// nimmt es eine bewusst vorsichtige Zeichenschätzung (`character-estimate`). Welche Methode gilt,
// steht als `counting_method` in `manifest.json`; dort steht je Chunk auch `token_count`.
//
// Das Programm listet die Chunks von `EXAMPLE_DOCUMENT` (mit `ALL_DOCUMENTS = true` in chunking.ts
// die aller Dokumente; nur die Ausgabe), bettet alle Chunks ein, schreibt Text, Metadaten und Vektor
// in die Indexdatei und durchsucht sie dann: Frage einbetten, mit jedem Chunk vergleichen, die besten
// drei (`DEFAULT_TOP_K`) anzeigen. Teil 2 schneidet selbst.
//
// Neu in dieser Datei sind die gemeinsamen Hilfsfunktionen aus `chunking.ts` (Einbetten, Suche,
// Ausgabe mit `printHits`, `DEMO_QUESTION`) und die Index-Funktionen aus `shared/index.ts` (Indexdatei
// schreiben/lesen, Ranking, `DEFAULT_TOP_K`). Teil 2 bis 4 nutzen sie wieder; so bleiben die Ergebnisse
// vergleichbar.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und geladenem E5-Modell; die
// vorbereiteten Chunks existieren (`npm run l04:0`, einmal ausführen). Burp ist optional.
// Start: npm run l04:1   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Ändere `DEMO_QUESTION` in chunking.ts (z. B. "Was ist ein Jailbreak?"). Stehen die Treffer
//      noch im richtigen Dokument?
//   2. Ändere `EXAMPLE_DOCUMENT` in chunking.ts auf ein anderes Dokument aus dem Manifest. Wie
//      viele Chunks hat es, und wie viele Zeichen je Token? Mit `ALL_DOCUMENTS = true` (oder
//      `ALL_DOCUMENTS=true` in `.env`) zeigen Teil 1 bis 3 die Chunk-Tabellen aller Dokumente (nur die
//      Ausgabe, der Index bleibt gleich). Setze beide Werte danach zurück (`'01-llm01-prompt-injection.md'`
//      und `false`, den Eintrag in `.env` leere oder entferne): Teil 2 und 3 zeigen ihre Beispielausgabe
//      mit ihnen, und Teil 4 nutzt `EXAMPLE_DOCUMENT` bei `FULL_CORPUS = false`.
//   3. Schau dir die Spalte "characters per token" an: Welche Chunks liegen deutlich unter 4? Was
//      steht in ihnen (Tipp: Linklisten)? (Nur aussagekräftig, wenn `counting_method` im Manifest
//      nicht `character-estimate` ist – dann liegt jeder Wert bei etwa 1.)
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
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Die Anfrage zeigt die gesendeten Chunk-Texte und die
  // rohen Vektoren der Antwort.
  useBurpIfConfigured();

  const manifest = readManifest();
  const chunks = manifest.sources.flatMap(({ file: source, chunks: chunkFiles }) =>
    chunkFiles.map(({ file: chunkFile, token_count: tokens }, position) => ({
      source, position, chunkFile, tokens, text: readChunk(chunkFile),
    })));

  // `counting_method` im Manifest sagt, wie Teil 0 die Tokens bestimmt hat: gezählt (über den
  // Embedding-Endpunkt) oder nur geschätzt. Im Schätzmodus sind die Zahlen unten Schätzwerte, und
  // "characters per token" ist dann kein gemessener Tokenizer-Wert, sondern folgt aus der Schätzung.
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

  // Hat man keinen Tokenizer zur Hand, muss man Tokens aus den Zeichen schätzen, wie Teil 4 es für
  // seine Kostenzeile tut. Das kleinste Verhältnis im ganzen Korpus ist der ungünstigste Fall, mit dem
  // eine solche Schätzung rechnen muss.
  const lowestRatio = Math.min(...chunks.map(({ text, tokens }) => text.length / tokens));
  console.log(
    `Full corpus: ${chunks.length} chunks, at most ${Math.max(...chunks.map(({ tokens }) => tokens))} tokens,` +
    ` at least ${lowestRatio.toFixed(2)} characters per token`,
  );

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Embedding', { model: remoteEmbeddingModel.name, chunkCount: chunks.length }, async () => {
      // Das Präfix sagt dem Modell, welche Rolle ein Text spielt (siehe Lektion 03, Teil 3). Es gehört
      // zum Modell, nicht zum Dokument, und ist deshalb nur Teil der Eingabe; der Index speichert den
      // reinen Chunk-Text.
      // NEU: ein Vektor je Chunk, alle in einer Anfrage.
      const vectors = await embedTexts(chunks.map(({ text }) => `${e5Model.passagePrefix}${text}`));
      const entries: IndexEntry<ChunkMetadata>[] = chunks.map(({ source, position, chunkFile, text }, index) => ({
        text,
        metadata: metadataFor(source, position, { chunkFile }),
        vector: vectors[index],
      }));

      // NEU: Index schreiben (Text + Metadaten + Vektor) und Statistik ausgeben.
      const indexFile = writeIndex('prepared', entries);
      printStats(indexFile, entries);
    });

    // NEU: Suche: Frage einbetten, mit allen Chunk-Vektoren vergleichen, die besten drei zeigen.
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

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
