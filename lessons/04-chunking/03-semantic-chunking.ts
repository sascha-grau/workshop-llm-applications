// Lektion 04 – Chunking, Teil 3: Schneiden, wo das Thema wechselt
//
// Lernziel: Du verstehst semantisches Chunking: Das Embedding-Modell findet selbst die Stellen, an
// denen das Thema springt, und du steuerst das über ein Perzentil.
//
// Teil 1 (`01-prepared-chunks.ts`) liest vorbereitete Chunks, Teil 2 (`02-heading-chunking.ts`)
// schneidet sie an Überschriften. Beide schneiden nach Struktur und sehen nicht, was der Text
// sagt. Hier fragt das Programm zusätzlich das Embedding-Modell, wo das Thema springt: Es bettet
// benachbarte Sätze ein, misst ihren Abstand und schneidet an den größten Sprüngen.
//
// Eingabe sind die vorbereiteten Chunks aus Teil 0. Jede Datei bleibt eine harte Grenze, und ihre
// führenden Überschriften (Dokumenttitel, Abschnittsüberschriften) bleiben vor jedem Stück stehen.
// Auch eine Überschrift im Text ist eine harte Grenze: Sie beginnt ein neues Stück und bleibt beim
// Text darunter. Zwischen zwei Überschriften wird der Text in Sätze zerlegt. Jeder Satz wird
// zusammen mit Vorgänger und Nachfolger eingebettet (ein "Fenster"), damit ein kurzer Satz nicht
// allein entscheidet. Der Abstand zweier Nachbarfenster ist 1 minus ihrer Kosinus-Ähnlichkeit; die
// größten Abstände eines Dokuments werden zu Schnitten. Fenster und Abstände reichen nie über eine
// Überschrift hinweg.
//
// Perzentil: Ein Wert, unter dem ein bestimmter Anteil aller Werte liegt. Das 95. Perzentil der
// Abstände ist der Wert, unter dem 95 % aller Abstände liegen; nur die größten 5 % liegen darüber.
// Geschnitten wird bei Abständen, die größer als diese Schwelle sind. Ehrlich gesagt heißt das:
// Bei 95 gibt es erst ab etwa 20 Abständen überhaupt einen semantischen Schnitt, und bei weniger
// als 4 Abständen nie. Kurze Dokumente werden daher nur an Überschriften geschnitten. Eine
// Größenbegrenzung braucht es dafür nicht: Jedes Stück entstammt einem vorbereiteten Chunk, der
// schon unter dem Token-Limit liegt (siehe Teil 0); Schnitte machen Chunks nur kleiner.
//
// Zum Verstehen reichen die KERN-Zeilen (markiert mit `// KERN:`): Abstände berechnen,
// Perzentil-Schwelle, Schnitt. Der Rest ist Handwerk (Sätze zerlegen, Überschriften behandeln,
// Index schreiben).
//
// Das Programm zeigt die Abstände und Chunks von `EXAMPLE_DOCUMENT` (mit `ALL_DOCUMENTS = true`
// in chunking.ts oder in `.env` die aller Dokumente; nur die Ausgabe), bettet alle Chunks ein,
// schreibt Text, Metadaten und Vektor in die Indexdatei und durchsucht sie mit der Frage aus Teil 1.
//
// Das Finden der Schnitte kostet eine eigene Runde Embeddings zusätzlich zu der für die fertigen
// Chunks, aber noch immer keinen Sprachmodell-Aufruf. Das Programm gibt die Zahl der
// Embedding-Aufrufe aus, zum Vergleich mit Teil 2.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und geladenem E5-Modell; die
// vorbereiteten Chunks existieren (`npm run l04:0`). Burp ist optional.
// Start: npm run l04:3   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Ändere `DISTANCE_PERCENTILE` von 95 auf 80. Wie viele semantische Schnitte und Chunks
//      zeigt die Ausgabe jetzt? (Bei einem kurzen Dokument ändert sich evtl. nichts: siehe oben.)
//   2. Setze den Wert auf 100. Wie viele semantische Schnitte bleiben, und warum? (Tipp: Geschnitten
//      wird nur bei Abstand > Schwelle.)
//   3. Vergleiche die Zahl der Embedding-Aufrufe mit Teil 2 und die Chunk-Anfänge in der Tabelle.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { cosineSimilarity, e5Model } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { writeIndex, readIndex, DEFAULT_TOP_K, type IndexEntry, type ChunkMetadata } from '../shared/index.ts';
import { requirePreparedChunks, embedTexts, exampleDocuments, previewText, metadataFor, printStats, searchTop, DEMO_QUESTION, printHits, readManifest, prepareSemanticChunk, type HeadingSection, type PreparedChunk, percentile } from './chunking.ts';
import type { Manifest } from './formats.ts';
import { runMain } from '../shared/startup.ts';

// NEU: Die Schwelle ist dieses Perzentil aller Abstände eines Dokuments: Bei 95 werden höchstens
// etwa die größten 5 % der Sprünge zu Schnitten (kurze Dokumente bekommen keinen, siehe Kopf der
// Datei). Es gibt keinen festen Abstand, der "neues Thema" bedeutet; deshalb ist die Schwelle
// relativ zum Dokument. Die meisten Chunks eines Dokuments entstehen ohnehin an Überschriften,
// nicht an diesen Schnitten (die Ausgabe zeigt Schnitte gegen Chunks). Kleinerer Wert = mehr
// Schnitte, größerer = weniger.
const DISTANCE_PERCENTILE = 95;

async function main() {
  requirePreparedChunks();
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Die Anfragen zeigen die Satzfenster und Chunk-Texte
  // hinaus und die rohen Vektoren zurück.
  useBurpIfConfigured();


  type SemanticChunk = { chunkFile: string; text: string };
  const manifest = readManifest();

  /**
   * Schneidet die vorbereiteten Chunks eines Dokuments an den Überschriften darin und dort, wo das
   * Thema springt. Liefert die neuen Chunks, alle Abstände des Dokuments, die Schwelle, ab der ein
   * Abstand zum Schnitt wurde, und die Zahl der Embedding-Aufrufe für die Fenster.
   *
   * Jedes Stück gehört zu einem vorbereiteten Chunk, der laut Teil 0 in die 512 Tokens passt;
   * ein Schnitt wegen der Größe ist deshalb nicht nötig. Schnitte machen Chunks nur kleiner, und
   * Stücke können sehr klein werden.
   */
  async function splitSemantically(document: Manifest['sources'][number]) {
    // Die Satzzerlegung und das Trennen der Überschriften (mit ihren Regex-Erklärungen) stehen in
    // `prepareSemanticChunk` in chunking.ts; hier beginnt der eigentliche Kern dieses Teils.
    const preparedChunks = document.chunks.map(({ file }) => prepareSemanticChunk(file));

    const measuredPreparedChunks: PreparedChunk[] = [];
    // Anfragen für die Fenster: eine pro vorbereitetem Chunk, der Sätze hat.
    let embeddingCalls = 0;
    for (const preparedChunk of preparedChunks) {
      // KERN: Ein Fenster ist ein Satz mit Vorgänger und Nachfolger (±1), damit ein kurzer Satz nicht
      // allein entscheidet. Die Nachbarn kommen aus demselben Abschnitt: Der erste und der letzte
      // Satz eines Abschnitts haben nur einen Nachbarn, ein einzelner Satz keinen.
      const windows = preparedChunk.sections.flatMap(({ sentences }) => sentences.map((_sentence, index) =>
        sentences.slice(Math.max(0, index - 1), index + 2).join('')));
      // Ein Stapel pro vorbereitetem Chunk mit allen Fenstern, nicht ein Aufruf pro Satz. Zwei Fenster
      // miteinander zu vergleichen ist eine symmetrische Aufgabe, für die die Modellbeschreibung von
      // E5 "query: " nennt. Das Passage-Präfix bleibt für die fertigen Chunks unten, die Texte, die
      // durchsucht werden.
      // Ein vorbereiteter Chunk ohne Sätze hat keine Fenster und braucht keinen Aufruf.
      let vectors: number[][] = [];
      if (windows.length > 0) {
        vectors = await embedTexts(windows.map((text) => `${e5Model.queryPrefix}${text}`));
        embeddingCalls += 1;
      }
      // Die Vektoren kommen in der Reihenfolge der Fenster zurück und werden auf die Abschnitte
      // verteilt. In einem Abschnitt gehört distances[n] zur Lücke zwischen Satz n und n + 1; es gibt
      // also einen Abstand weniger als Sätze, und keinen bei einem Abschnitt mit nur einem Satz.
      let vectorOffset = 0;
      const sections = preparedChunk.sections.map(({ heading, sentences }): HeadingSection => {
        const sectionVectors = vectors.slice(vectorOffset, vectorOffset + sentences.length);
        vectorOffset += sentences.length;
        // KERN: Abstand zweier Nachbarfenster = 1 minus Kosinus-Ähnlichkeit.
        const distances = sectionVectors.slice(1).map((vector, index) => 1 - cosineSimilarity(sectionVectors[index], vector));
        return { heading, sentences, distances };
      });
      measuredPreparedChunks.push({ ...preparedChunk, sections });
    }

    // Eine Schwelle für das ganze Dokument, nicht eine je vorbereitetem Chunk. Alle Abstände werden
    // mit demselben Maß beurteilt, und ein Abschnitt ohne Themensprung bekommt keinen Schnitt.
    const distances = measuredPreparedChunks.flatMap(({ sections }) => sections.flatMap(({ distances }) => distances));
    // KERN: Schwelle = Perzentil der Abstände. Bei weniger als 4 Abständen ist sie unendlich: kein
    // semantischer Schnitt.
    const threshold = distances.length < 4 ? Infinity : percentile(distances, DISTANCE_PERCENTILE);
    const chunks: SemanticChunk[] = measuredPreparedChunks.flatMap(({ chunkFile, leadingHeadingBlock, sections }) =>
      sections.flatMap(({ heading, sentences, distances }) => {
        // Jeder Abschnitt beginnt ein neues Stück, mit seiner Überschrift davor: Dieser Schnitt kommt
        // aus der Struktur. Innerhalb eines Abschnitts beginnt vor jedem Satz, dessen Abstand zum
        // vorigen über der Schwelle liegt, ein weiteres Stück: Dieser Schnitt kommt aus dem Thema.
        const pieces = [heading];
        sentences.forEach((sentence, index) => {
          // KERN: Schnitt, wo der Abstand zum vorigen Satz größer als die Schwelle ist.
          if (index > 0 && distances[index - 1] > threshold) pieces.push('');
          pieces[pieces.length - 1] += sentence;
        });
        // Nur die führenden Überschriften des vorbereiteten Chunks stehen vor jedem Stück. Eine
        // Überschrift im Text bleibt vor dem Stück, das sie beginnt. Das trim entfernt den Leerraum,
        // den ein Stück vom Ende seines letzten Satzes mitnimmt.
        return pieces.map((piece) => ({ chunkFile, text: `${leadingHeadingBlock}${piece}`.trim() }));
      }));

    return { chunks, distances, threshold, embeddingCalls };
  }

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Embedding', { model: remoteEmbeddingModel.name, documentCount: manifest.sources.length }, async () => {
      const examples = new Set(exampleDocuments(manifest));
      const entries: IndexEntry<ChunkMetadata>[] = [];
      // Zählt jede Anfrage an den Embedding-Server, zum Vergleich mit Teil 2 am Ende.
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
          // Hier zählen nur die Themensprünge (Abstand > Schwelle) als Schnitte. Die Zahl der Chunks enthält auch die Stücke,
          // die an einer Überschrift beginnen.
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
        // Die zweite Runde Embeddings: jetzt die fertigen Chunks. Das Präfix sagt dem Modell, welche
        // Rolle ein Text spielt (siehe Lektion 03, Teil 3); es ist nur Teil der Eingabe, der Index
        // speichert den reinen Chunk-Text mit seinen Überschriften.
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
      // Semantisches Chunking bettet zweimal ein: erst jeden Satz bis zu dreimal in Fenstern, dann die
      // fertigen Chunks. Deshalb liegt diese Zahl weit über der von Teil 2 (Beispiellauf: 81 gegen
      // 12), und es ist trotzdem kein Sprachmodell beteiligt.
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

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
