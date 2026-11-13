// Indexdateien unter `indexes/` lesen und schreiben, Ranking, Zugriffsregel. Übersicht: lessons/shared/README.de.md
// Wer welchen Index schreibt und liest: docs/architecture.de.md#datenfluss
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { remoteEmbeddingModel } from './config.ts';
import { cosineSimilarity, createEmbeddings } from './embeddings.ts';
import { indexesDirectory } from './paths.ts';

// Format der Indexdateien; erhöhe die Zahl, wenn sich ihre Form ändert (alte Dateien werden dann abgelehnt).
export const INDEX_FORMAT_VERSION = 2;
// Standard: 3. Gilt, wenn ein Aufrufer kein `topK` übergibt; größer = mehr Treffer. Gleichnamige Konstante in
// Lektion 08: docs/architecture.de.md#namensfallen
export const DEFAULT_TOP_K = 3;
// Die Schneide-Strategien aus Lektion 04, je eine Indexdatei.
export type Strategy = 'prepared' | 'headings' | 'semantic' | 'questions';
// Das npm-Skript, das den Index der jeweiligen Strategie erzeugt (für Fehlermeldungen).
export const indexCommands: Record<Strategy, string> = {
  prepared: 'l04:1', headings: 'l04:2', semantic: 'l04:3', questions: 'l04:4',
};

// Trennzeichen, mit dem ein Überschriftenpfad (als Liste gespeichert) für die Anzeige zu Text wird.
export const HEADING_SEPARATOR = ' › ';
// Ohne Dokumenttitel, nur für die Anzeige: Die Tabellen nennen die Datei ohnehin, der volle Pfad passt nicht auf
// den Bildschirm. "–" = Text direkt unter dem Titel.
export const sectionPath = (headingPath?: string[]) => headingPath?.slice(1).join(HEADING_SEPARATOR) || '–';

/** Ein Eintrag der Indexdatei: der Chunk-Text, seine Herkunft und sein Vektor. */
export type IndexEntry<TMetadata = ChunkMetadata> =
  Omit<z.infer<typeof indexEntrySchema>, 'metadata'> & { metadata: TMetadata };

// Ein gemeinsamer Client, damit alle Indizes mit denselben Einstellungen eingebettet werden (`createEmbeddings`).
export const embeddings = createEmbeddings();

/** Modell im Dateinamen: Ein anderes Modell schreibt eine neue Datei, statt Vektoren zu vermischen. Zeichen, die
 *  das Verzeichnis ändern könnten (Modellname "intfloat/multilingual-e5-base"), werden ersetzt. */
export function indexFileFor(strategy: Strategy): string {
  return join(indexesDirectory, `${strategy}__${remoteEmbeddingModel.name.replace(/[^\w.-]/g, '_')}.json`);
}

// VEREINFACHT: Die Dokumente tragen keine Rechte; der Anhang steht für ein Dokument, das nicht jeder lesen darf
// (docs/production.de.md). Wo gefiltert wird: docs/decisions.de.md#pre-filter
export const INTERNAL_DOCUMENTS = ['11-appendix-llm-application-architecture-and-threat-modeling.md'];

/** `source` = Dokument, `position` = Stelle des Chunks darin. `chunkFile` = vorbereiteter Chunk, aus dem das Stück
 *  geschnitten wurde; mehrere Einträge können ihn teilen. */
export type ChunkMetadata = z.infer<typeof indexEntrySchema>['metadata'];

// Öffentlich nur, wenn die Metadaten "public" sagen UND das Dokument nicht intern ist. Die zweite Prüfung fängt
// einen falsch beschrifteten oder von Hand bearbeiteten Index ab: im Zweifel draußen.
export const isPublicChunk = ({ accessGroup, source }: Pick<ChunkMetadata, 'accessGroup' | 'source'>) =>
  accessGroup === 'public' && !INTERNAL_DOCUMENTS.includes(source);

// Identität eines Chunks: Dokument plus Position, als JSON, damit kein Dateiname die Teile vermischt.
// Fortsetzen und Suche gehen nach diesem Schlüssel, nie nach dem Text.
export const chunkKey = (source: string, position: number) => JSON.stringify([source, position]);

export function requireEntries<T>(entries: T[], message: string): T[] {
  if (!entries.length) throw new Error(message);
  return entries;
}

// VEREINFACHT: Der Vektorspeicher ist eine Datei (docs/production.de.md). Jeder Lauf überschreibt sie ganz, damit
// alte Chunks nicht liegen bleiben; erst `.tmp`, dann umbenennen, damit ein Abbruch keine halbe Datei hinterlässt.
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

// Nennt die Datei und die npm-Skripte, die sie erzeugen; `cause` ist der ursprüngliche Fehler.
export function indexLoadError(strategy: Strategy, cause: unknown): Error {
  return new Error(
    `Cannot load index ${indexFileFor(strategy)} (${strategy}). ` +
    `Generate it with npm run l04:0, then npm run ${indexCommands[strategy]}.`, { cause },
  );
}

// Die eigentliche Suche: Kosinus zu jedem Eintrag, absteigend, die besten `topK`. Bei E5 zählt die Reihenfolge,
// nicht der Absolutwert (lessons/03-embeddings/README.de.md).
export function rankEntries<T extends IndexEntry<unknown>>(entries: T[], queryVector: number[], topK = DEFAULT_TOP_K) {
  return entries.map((entry) => ({ ...entry, similarity: cosineSimilarity(queryVector, entry.vector) }))
    .sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

// Die Indexdatei ist Eingabe von außen (veraltet, bearbeitet, beschädigt): `readIndex` prüft sie mit diesem Schema.
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
