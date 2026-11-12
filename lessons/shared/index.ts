// Indexdateien unter `indexes/` lesen und schreiben, Ranking. Lektion 04 schreibt die Indizes, die Lektionen 05 bis 08 lesen sie (Lektion 06 lädt sie in Qdrant).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { remoteEmbeddingModel } from './config.ts';
import { cosineSimilarity, createEmbeddings } from './embeddings.ts';
import { indexesDirectory } from './paths.ts';

// Format der Indexdateien; erhöhe die Zahl, wenn sich ihre Form ändert (alte Dateien werden dann abgelehnt).
export const INDEX_FORMAT_VERSION = 2;
// Wie viele Treffer die Suche in Lektion 04 standardmäßig behält (die Lektionen 05 bis 08 setzen eigene Werte je Datei).
export const DEFAULT_TOP_K = 3;
// Die vier Schneide-Strategien von Lektion 04; je Strategie gibt es eine Indexdatei.
export type Strategy = 'prepared' | 'headings' | 'semantic' | 'questions';
// Das npm-Skript, das den Index der jeweiligen Strategie erzeugt (für Fehlermeldungen).
export const indexCommands: Record<Strategy, string> = {
  prepared: 'l04:1', headings: 'l04:2', semantic: 'l04:3', questions: 'l04:4',
};

// Trennzeichen, mit dem ein Überschriftenpfad (als Liste gespeichert) für die Anzeige zu Text wird.
export const HEADING_SEPARATOR = ' › ';
// Der Pfad ohne Dokumenttitel, nur für die Anzeige mit " › " verbunden (gespeichert wird er als
// Liste): Die Tabellen zeigen ein Dokument oder nennen die Datei ohnehin, und der volle Pfad
// passte nicht auf den Bildschirm. "–" steht für Text direkt unter dem Titel.
export const sectionPath = (headingPath?: string[]) => headingPath?.slice(1).join(HEADING_SEPARATOR) || '–';

/** Ein Eintrag der Indexdatei: der Chunk-Text, seine Herkunft und sein Vektor. */
export type IndexEntry<TMetadata = ChunkMetadata> =
  Omit<z.infer<typeof indexEntrySchema>, 'metadata'> & { metadata: TMetadata };

// Der gemeinsame Embedding-Client (Fabrik aus shared/embeddings.ts: Fließkommazahlen, Zeilenumbrüche
// bleiben erhalten, keine Wiederholungen), für alle Teile von Lektion 04 bis 08.
export const embeddings = createEmbeddings();

/**
 * Strategie und Modell sind Teil des Dateinamens: Ein anderes Modell schreibt eine neue Datei,
 * statt seine Vektoren mit denen eines anderen Modells zu vermischen. Zeichen, die das Verzeichnis
 * ändern könnten (ein Modellname wie "intfloat/multilingual-e5-base"), werden ersetzt.
 */
export function indexFileFor(strategy: Strategy): string {
  return join(indexesDirectory, `${strategy}__${remoteEmbeddingModel.name.replace(/[^\w.-]/g, '_')}.json`);
}

// Die Dokumente tragen selbst keine Zugriffsinformation. Der Anhang steht stellvertretend für ein
// Dokument, das nicht jeder lesen darf (die Lektionen 05 und 07 und Lektion 08, Teil 2, 3 und 5 filtern ihn aus der Suche; Lektion 06 sucht bewusst ungefiltert).
export const INTERNAL_DOCUMENTS = ['11-appendix-llm-application-architecture-and-threat-modeling.md'];

/**
 * `source` ist das Dokument, `position` die Stelle des Chunks im Dokument. `chunkFile` ist der
 * vorbereitete Chunk, aus dem das Stück geschnitten wurde; mehrere Einträge können ihn teilen.
 */
export type ChunkMetadata = z.infer<typeof indexEntrySchema>['metadata'];

// Der Zugriffsfilter von Lektion 05, 07 und 08 (Teil 2, 3 und 5): Ein Chunk gilt nur dann als öffentlich, wenn seine
// Metadaten "public" sagen UND sein Dokument nicht als intern geführt ist. Die zweite Prüfung
// fängt einen falsch beschrifteten oder von Hand bearbeiteten Index ab: im Zweifel draußen.
export const isPublicChunk = ({ accessGroup, source }: Pick<ChunkMetadata, 'accessGroup' | 'source'>) =>
  accessGroup === 'public' && !INTERNAL_DOCUMENTS.includes(source);

// Die Identität eines Chunks: Dokument plus Position. JSON hält die beiden Teile auseinander, was
// auch immer der Dateiname enthält. Fortsetzen und Suche gehen beide nach diesem Schlüssel, nie
// nach dem Text.
export const chunkKey = (source: string, position: number) => JSON.stringify([source, position]);

export function requireEntries<T>(entries: T[], message: string): T[] {
  if (!entries.length) throw new Error(message);
  return entries;
}

// Der Vektorspeicher ist hier eine Datei. Jeder Lauf überschreibt sie vollständig, damit Chunks
// früherer Läufe nicht liegen bleiben. Erst in eine Temp-Datei, dann umbenennen: Ein Abbruch
// hinterlässt keine halbe Datei.
export function writeIndex<T>(strategy: Strategy, entries: IndexEntry<T>[]): string {
  const file = indexFileFor(strategy);
  requireEntries(entries, `The index ${file} is empty. Check SUBSET and the chunk corpus before indexing.`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify({ format_version: INDEX_FORMAT_VERSION, entries }));
  renameSync(`${file}.tmp`, file);
  return file;
}

export function readIndex(strategy: Strategy): z.infer<typeof indexEntrySchema>[] {
  try {
    const file = indexFileFor(strategy);
    const command = indexCommands[strategy];
    const index = JSON.parse(readFileSync(file, 'utf8'));
    const schema = strategy === 'questions' ? z.array(questionEntrySchema) : z.array(indexEntrySchema);
    const parsed = schema.safeParse(index?.entries);
    if (index?.format_version !== INDEX_FORMAT_VERSION || !parsed.success) {
      throw new Error(`The index ${file} is invalid or outdated. Regenerate the chunks with npm run l04:0, then regenerate the index with npm run ${command}.`);
    }
    return requireEntries(parsed.data, `The index ${file} is empty. Generate it again.`);
  } catch (cause) {
    throw indexLoadError(strategy, cause);
  }
}

// Die Fehlermeldung, wenn eine der Lektionen 05 bis 08 einen Index nicht laden kann: Sie nennt die Datei und
// die npm-Skripte, die sie erzeugen. `cause` ist der ursprüngliche Fehler.
export function indexLoadError(strategy: Strategy, cause: unknown): Error {
  return new Error(
    `Cannot load index ${indexFileFor(strategy)} (${strategy}). ` +
    `Generate it with npm run l04:0, then npm run ${indexCommands[strategy]}.`, { cause },
  );
}

// Die eigentliche Suche: Kosinus-Ähnlichkeit zwischen Fragevektor und jedem Eintrag, absteigend
// sortiert, die besten `topK` bleiben. Bei E5 liegen auch schlechte Treffer oft bei 0,7 bis 0,8;
// wichtig ist die Reihenfolge, nicht der Absolutwert (siehe Lektion 03).
export function rankEntries<T extends IndexEntry<unknown>>(entries: T[], queryVector: number[], topK = DEFAULT_TOP_K) {
  return entries.map((entry) => ({ ...entry, similarity: cosineSimilarity(queryVector, entry.vector) }))
    .sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

// Beschreibt die Form der Indexdatei. Sie ist Eingabe von außen (veraltet, bearbeitet oder
// beschädigt), deshalb wird das ungeprüfte JSON von readIndex mit diesem Schema geprüft, nicht
// blind vertraut.
export const indexEntrySchema = z.object({
  text: z.string().trim().min(1),
  vector: z.array(z.number().finite()).min(1),
  metadata: z.object({
    source: z.string(), position: z.number().int().nonnegative(), headingPath: z.array(z.string()).optional(),
    version: z.string(), accessGroup: z.enum(['internal', 'public']), chunkFile: z.string().optional(),
  }),
});
// Beim Fragen-Index kommt zu jedem Eintrag die generierte Frage hinzu.
export const questionEntrySchema = indexEntrySchema.extend({ generatedQuestion: z.string().trim().min(1) });

/** Ein Suchvektor. Einträge desselben Chunks teilen `text` und `metadata`; Frage und Vektor unterscheiden sich. */
export type QuestionEntry = z.infer<typeof questionEntrySchema>;

// Mehrere Einträge können zum selben Chunk gehören (Fragen-Index). Von oben nach unten im Ranking
// bleibt nur der erste Eintrag je Chunk (seine beste Frage); danach die ersten `topK`.
export function uniqueChunks<T extends IndexEntry>(ranked: T[], topK: number): T[] {
  const seen = new Set<string>();
  return ranked.filter(({ metadata }) => {
    const key = chunkKey(metadata.source, metadata.position);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, topK);
}
