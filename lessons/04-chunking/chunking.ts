// Gemeinsame Hilfsfunktionen für Lektion 04 (erstmals in 01-prepared-chunks.ts benutzt): alles, was
// in allen Teilen identisch sein muss, damit sich ihre Ergebnisse vergleichen lassen. Das
// Schneiden steht in den Teilen selbst. Die Index-Funktionen (Dateien lesen und schreiben, Ranking)
// liegen in `shared/index.ts`, weil auch Lektion 05 bis 08 sie brauchen; die Teile importieren sie von dort
// direkt. Hier liegen:
// - Konfiguration: `DEMO_QUESTION`, Pfade, Korpus-Konstanten, Beispieldokumente (`EXAMPLE_DOCUMENT`, `ALL_DOCUMENTS`)
// - Manifest und Chunks lesen: readManifest, readChunk(s), splitByHeadings, sourcesFor, exampleDocuments, percentile
// - Metadaten: metadataFor (inkl. Zugriffsgruppe `accessGroup`: "public" oder "internal")
// - Dateiformate: `formats.ts` (Versionsnummer und zod-Schema des Manifests; alte Dateien werden abgelehnt)
// - Suche und Ausgabe: embedTexts, searchTop (Top-k-Suche; Teil 1 bis 3 rufen sie mit `DEFAULT_TOP_K` aus `shared/index.ts` auf), printStats, printHits
// - Satzzerlegung für Teil 3: prepareSemanticChunk (Sätze und Überschriften eines vorbereiteten Chunks)
// - Fragen-Index aus Teil 4: Fortsetzen und atomares Speichern (readQuestionIndex, appendQuestionChunk)
// - Kinder für Teil 5: splitIntoChildren (Lektion 05, Teil 5 und Lektion 07, Teil 4 importieren es von hier)

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { assertVectorCount, e5Model } from '../shared/embeddings.ts';
import { contentDirectory } from '../shared/paths.ts';
import { MANIFEST_FILE, manifestSchema, type Manifest } from './formats.ts';
import { embeddings, indexFileFor, readIndex, rankEntries, writeIndex, indexCommands, requireEntries, chunkKey, questionEntrySchema, INTERNAL_DOCUMENTS, HEADING_SEPARATOR, sectionPath, type ChunkMetadata, type IndexEntry, type QuestionEntry } from '../shared/index.ts';

// Alle Teile stellen dieselbe Frage; nur die Art, wie die Chunks geschnitten wurden, unterscheidet
// sich. Ändere sie hier, um eine eigene auszuprobieren.
export const DEMO_QUESTION = 'Wie begrenze ich Prompt Injection?';

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors = await embeddings.embedDocuments(texts);
  assertVectorCount(vectors, texts.length);
  return vectors;
}

// Die vorbereiteten Chunks aus Teil 0: mehrere Dateien pro Dokument, benannt `<Dokument>--<Nummer>.md`.
export const CHUNK_DIRECTORY = join(contentDirectory, 'owasp-genai-top-10', 'chunks');
// Für welche Dokumente Teil 1 bis 3 die Detailausgabe zeigen (Chunk-Tabellen, in Teil 3 auch Abstände
// und Schnitte): false = nur EXAMPLE_DOCUMENT, true = alle (längere Ausgabe). Rein eine Anzeige: was
// indiziert wird, ändert der Schalter nie.
export const EXAMPLE_DOCUMENT = '01-llm01-prompt-injection.md';
export const ALL_DOCUMENTS = false;
// Die Ausgabe der OWASP-Liste. Sie gehört zum Korpus, deshalb bekommt jeder Chunk denselben Wert.
export const CORPUS_VERSION = '2025';
export type AccessGroup = ChunkMetadata['accessGroup'];

export interface Chunk {
  /** Der Überschriftenpfad als Liste [Titel, Abschnitt, …]; nur bei Chunks nach Überschriften gesetzt. */
  headingPath?: string[];
  /** Der Chunk-Text. Ist `headingPath` gesetzt, beginnt er mit dem Pfad (mit " › " verbunden). */
  text: string;
}

export function requirePreparedChunks(): void {
  if (!existsSync(CHUNK_DIRECTORY) || !existsSync(join(CHUNK_DIRECTORY, MANIFEST_FILE))) {
    throw new Error('Prepared chunks are missing. Generate them with npm run l04:0.');
  }
}

export function readManifest(): Manifest {
  requirePreparedChunks();
  let manifest: Manifest;
  try {
    manifest = manifestSchema.parse(JSON.parse(readFileSync(join(CHUNK_DIRECTORY, MANIFEST_FILE), 'utf8')));
    if (manifest.limit !== e5Model.tokenLimit || manifest.passage_prefix !== e5Model.passagePrefix) {
      throw new Error('The chunk manifest does not match the format, token limit or passage prefix of the embedding model.');
    }
  } catch (cause) {
    throw new Error('The chunk manifest is invalid or outdated. Regenerate the chunks with npm run l04:0.', { cause });
  }
  return manifest;
}

// Die Nummern in den Dateinamen legen die Reihenfolge fest: erst das Dokument, dann der Chunk darin.
export function sourcesFor(subset: string[] = [], manifest = readManifest()): string[] {
  const sources = manifest.sources.map(({ file }) => file);
  const unknown = subset.filter((source) => !sources.includes(source));
  if (unknown.length) throw new Error(`Unknown document in SUBSET: ${unknown.join(', ')}. Check manifest.json.`);
  return subset.length ? subset : sources;
}

// Die Dokumente für die Detailausgabe: nur EXAMPLE_DOCUMENT, mit ALL_DOCUMENTS alle aus dem Manifest.
// `scope` (Teil 2: die indizierten Dokumente) grenzt das "alle" ein.
export function exampleDocuments(manifest = readManifest(), scope?: string[]): string[] {
  const sources = manifest.sources.map(({ file }) => file);
  if (ALL_DOCUMENTS) return scope ?? sources;
  if (!sources.includes(EXAMPLE_DOCUMENT)) throw new Error(`Unknown EXAMPLE_DOCUMENT: ${EXAMPLE_DOCUMENT}. Check manifest.json.`);
  return [EXAMPLE_DOCUMENT];
}

// Liest eine vorbereitete Chunk-Datei, z. B. `01-llm01-prompt-injection--003.md` (Teil von
// `01-llm01-prompt-injection.md`).
export const readChunk = (file: string) => readFileSync(`${CHUNK_DIRECTORY}/${file}`, 'utf8').trim();

/** Alle Chunks eines Dokuments: seine vorbereiteten Chunks in Reihenfolge, jeder an seinen Überschriften geschnitten. */
export function readChunks(source: string, manifest = readManifest()): Chunk[] {
  sourcesFor([source], manifest);
  return manifest.sources.find(({ file }) => file === source)!.chunks.flatMap(({ file }) => splitByHeadings(readChunk(file)));
}

export const metadataFor = (source: string, position: number, { headingPath, chunkFile }: Pick<ChunkMetadata, 'headingPath' | 'chunkFile'> = {}): ChunkMetadata => ({
  source, position, ...(headingPath ? { headingPath } : {}), ...(chunkFile ? { chunkFile } : {}), version: CORPUS_VERSION,
  accessGroup: INTERNAL_DOCUMENTS.includes(source) ? 'internal' : 'public',
});

// Vorschau für einen Chunk mit Überschriftenpfad: der Anfang seines eigenen Texts, ohne den
// Pfad davor (previewText ist die Variante für Chunks ohne Pfad).
export const previewChunk = ({ headingPath, text }: Chunk) => text.slice(headingPath?.join(HEADING_SEPARATOR).length ?? 0).trim().slice(0, 60).replace(/\s+/g, ' ');

/**
 * Schneidet einen Markdown-Text an seinen Überschriften (# bis ###). Eine Überschrift ohne eigenen
 * Text, direkt gefolgt von einer Unterüberschrift, ergibt keinen Chunk; sie taucht nur in den
 * Überschriftenpfaden darunter auf. Das gilt auch für die Überschriften, die ein vorbereiteter
 * Chunk an seinem Anfang wiederholt, um zu sagen, wohin er gehört.
 *
 * Das ist kein Markdown-Parser: Eine Zeile, die in einem Codeblock mit "# " beginnt, würde für
 * eine Überschrift gehalten. Der Korpus enthält keine Codeblöcke.
 */
export function splitByHeadings(markdown: string): Chunk[] {
  // Die Überschriften über dem aktuellen Abschnitt, nach Ebene: [Titel, Abschnitt, Unterabschnitt].
  const headingStack: string[] = [];

  // Das Lookahead `(?=…)` schneidet vor jeder Überschriftenzeile, ohne sie zu entfernen; jeder Abschnitt
  // beginnt also mit seiner eigenen Überschrift. Das Flag `m` lässt `^` an jedem Zeilenanfang gelten,
  // nicht nur am Textanfang.
  return markdown.split(/^(?=#{1,3} )/m).flatMap((section) => {
    // Regex: 1 bis 3 `#`, ein Leerzeichen, dann der Titel. Gruppe 1 sind die `#` (ihre Zahl ist die
    // Ebene), Gruppe 2 der Titel. Kein Treffer heißt: Text vor der ersten Überschrift.
    const heading = /^(#{1,3}) (.*)/.exec(section);
    if (heading) {
      const level = heading[1].length;
      // Eine neue Überschrift der Ebene n beendet alle Abschnitte der Ebene n und tiefer: Sie fliegen
      // aus dem Stapel, dann kommt die neue Überschrift an ihre Stelle.
      headingStack.length = level - 1;
      headingStack[level - 1] = heading[2].trim();
    }

    // Eine übersprungene Ebene (### direkt unter #) hinterlässt eine Lücke im Stapel; filter entfernt sie.
    const headingPath = headingStack.filter(Boolean);
    // Text vor der ersten Überschrift hat keine Überschriftenzeile, die zu entfernen wäre.
    const body = section.slice(heading?.[0].length ?? 0).trim();
    if (!body) return [];
    // Der Pfad ist die erste Zeile des Chunks: So weiß der Vektor (in Teil 4 auch das Sprachmodell
    // beim Fragenschreiben), worum es im Abschnitt geht.
    return [{ headingPath, text: [headingPath.join(HEADING_SEPARATOR), body].filter(Boolean).join('\n\n') }];
  });
}

// Vorschau für einen reinen Text (Chunk ohne Pfad): der Anfang des eigenen Texts. Die wiederholten Überschriften werden übersprungen; sie
// sind bei benachbarten Chunks gleich und ließen alle Vorschauen gleich aussehen.
export const previewText = (text: string) =>
  text.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#')).join(' ').slice(0, 60);

// Perzentil: der Wert bei dem angegebenen Prozentsatz der sortierten Liste, ohne Interpolation.
// Leere Liste: 0.
export const percentile = (values: number[], percent: number) =>
  [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * percent / 100) - 1)] ?? 0;

// Statistik des gespeicherten Index (alle Dokumente in der Datei), nicht dieses Laufs. Die
// `? :`-Teile verhindern, dass ein leerer Index Infinity oder NaN ausgibt.
export function printStats(file: string, entries: { text: string }[]): void {
  const lengths = entries.map(({ text }) => text.length);
  const characterCount = lengths.reduce((sum, length) => sum + length, 0);
  console.log(
    `${entries.length} chunks in ${file}, characters min ${lengths.length ? Math.min(...lengths) : 0}` +
    ` / average ${lengths.length ? Math.round(characterCount / lengths.length) : 0}` +
    ` / max ${lengths.length ? Math.max(...lengths) : 0}`,
  );
}

export async function searchTop<T extends IndexEntry<unknown>>(entries: T[], topK: number) {
  requireEntries(entries, 'No entries available for search. Generate an index first.');
  // Suchen heißt: Frage mit demselben Modell einbetten, die Kosinus-Ähnlichkeit zu jedem Eintrag
  // berechnen, sortieren (`rankEntries` aus shared/index.ts). `DEMO_QUESTION` ist oben in dieser Datei
  // definiert, weil jeder Teil dieser Lektion dieselbe stellt.
  const questionVector = await embeddings.embedQuery(`${e5Model.queryPrefix}${DEMO_QUESTION}`);
  return rankEntries(entries, questionVector, topK);
}

// Prüft den Fragen-Index (Form und Zahl der Einträge je Chunk).
export function validateQuestionEntries(entries: IndexEntry[], questionsPerChunk: number): asserts entries is QuestionEntry[] {
  z.array(questionEntrySchema).parse(entries);
  // Jeder Chunk braucht alle seine Fragen. Eine Gruppe anderer Größe (bearbeitete Datei oder ein
  // anderes questionsPerChunk als beim Indizieren) würde als fertig gelten und halbfertig
  // durchsucht.
  const groupSizes = new Map<string, number>();
  for (const { metadata } of entries) {
    const key = chunkKey(metadata.source, metadata.position);
    groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
  }
  if ([...groupSizes.values()].some((count) => count !== questionsPerChunk)) {
    throw new Error(`The index must contain exactly ${questionsPerChunk} entries per chunk.`);
  }
}

// Fortsetzbares Indizieren für Teil 4, Chunk für Chunk. Ein Chunk ist durch Dokument und Position
// bestimmt. Nach jedem neuen Chunk wird der ganze Index geprüft und gespeichert (erst in eine
// Temp-Datei, dann umbenannt, damit ein unterbrochenes Schreiben die Datei nicht abschneidet).
// Ein Abbruch oder Fehler verliert höchstens den Chunk in Arbeit; der nächste Lauf überspringt
// jeden Chunk, der schon im Index steht.

/**
 * Liest den gespeicherten Index. Noch keine Datei ist der normale erste Lauf und ergibt einen
 * leeren Index. Jedes andere Problem (unlesbare Datei, ungültiger Inhalt) wird geworfen statt mit
 * einem leeren Index beantwortet, den das nächste Speichern über die alte Datei schreiben würde.
 */
export function readQuestionIndex(questionsPerChunk: number): QuestionEntry[] {
  const file = indexFileFor('questions');
  try {
    const index = readIndex('questions');
    validateQuestionEntries(index, questionsPerChunk);
    return index;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : error;
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
    throw new Error(`Cannot load the question index ${file}. Check the file and QUESTIONS_PER_CHUNK, or regenerate it with npm run l04:0 followed by npm run ${indexCommands.questions}.`, { cause: error });
  }
}

// Steht der Chunk (Dokument + Position) schon im Index?
export function hasChunk(entries: IndexEntry[], source: string, position: number): boolean {
  return entries.some(({ metadata }) => chunkKey(metadata.source, metadata.position) === chunkKey(source, position));
}

// Nach jedem Chunk speichern: Die neuen Einträge werden angehängt, alte bleiben unberührt, der
// ganze Index wird geprüft und über writeIndex atomar geschrieben (Temp-Datei, dann umbenennen).
// Zurückgegeben wird der neue Index; der Aufrufer ersetzt seine Liste erst nach erfolgreichem
// Speichern, sodass Speicher und Datei übereinstimmen.
export function appendQuestionChunk(entries: QuestionEntry[], chunkEntries: QuestionEntry[], questionsPerChunk: number): QuestionEntry[] {
  const nextEntries = [...entries, ...chunkEntries];
  validateQuestionEntries(nextEntries, questionsPerChunk);
  writeIndex('questions', nextEntries);
  return nextEntries;
}


export function printHits(hits: (IndexEntry & { similarity: number })[]): void {
  console.table(hits.map(({ text, metadata, similarity }) => ({
    file: metadata.chunkFile ?? metadata.source,
    similarity: similarity.toFixed(3),
    accessGroup: metadata.accessGroup,
    section: sectionPath(metadata.headingPath),
    preview: metadata.headingPath?.length ? previewChunk({ headingPath: metadata.headingPath, text }) : previewText(text),
  })));
}

// Ein Kind ist ein Index-Eintrag (Text, Vektor, Metadaten) mit Verweis auf seinen Parent.
export type Child = IndexEntry & { parent: IndexEntry };

// Teilt einen Parent in Stücke von etwa `childSize` Zeichen (ein kurzer Parent bleibt ein Kind).
// Der Überschriftenpfad steht am Anfang des Parent-Textes; er wird abgetrennt und jedem Kind
// wieder vorangestellt, damit jedes Stück weiß, wohin es gehört. Geschnitten wird nach Zeichen, auch
// mitten im Wort. Der Vektor fehlt noch (`Omit`): ihn setzt `buildChildren`.
export function splitIntoChildren(parent: IndexEntry, childSize: number): Omit<Child, 'vector'>[] {
  const path = parent.metadata.headingPath?.join(HEADING_SEPARATOR) ?? '';
  const body = parent.text.slice(path.length).trim();
  const count = Math.max(1, Math.round(body.length / childSize));
  return Array.from({ length: count }, (_unused, position) => {
    const piece = body.slice(Math.round((position * body.length) / count), Math.round(((position + 1) * body.length) / count));
    return { text: [path, piece.trim()].filter(Boolean).join('\n\n'), metadata: parent.metadata, parent };
  });
}


/**
 * Der Text zwischen zwei Überschriften eines vorbereiteten Chunks. `heading` ist die Überschrift
 * (oder sind die Überschriften) davor, samt Zeilenumbrüchen, und kann leer sein. `distances` hat
 * einen Eintrag weniger als `sentences`.
 */
export type HeadingSection = { heading: string; sentences: string[]; distances: number[] };
/** Eine vorbereitete Chunk-Datei; ihre führenden Überschriften sind von den Abschnitten des Textes getrennt. */
export type PreparedChunk = { chunkFile: string; leadingHeadingBlock: string; sections: HeadingSection[] };

// Zerlegt Text nach den Regeln der Sprache in Sätze. Jede nicht leere Zeile gilt als eigener Satz,
// auch ein Listenpunkt ohne Punkt am Ende.
const segmenter = new Intl.Segmenter('de', { granularity: 'sentence' });
export function prepareSemanticChunk(chunkFile: string) {
  const text = readChunk(chunkFile);
  // Die Überschriftenzeilen am Anfang (Dokumenttitel, Abschnittsüberschriften) samt leeren Zeilen
  // dazwischen. Sie werden nicht zerlegt und stehen vor jedem Stück, damit jedes Stück auch
  // allein verständlich ist.
  // Regex: ab Textanfang (`^`) beliebig viele (`*`) Zeilen, die entweder leer sind
  // (`[ \t]*\r?\n`) oder eine Überschrift `#` bis `###` samt Zeilenende (`#{1,3}[ \t]+…`). Die erste
  // Zeile mit echtem Text beendet den Treffer; ohne Treffer bleibt der Block leer.
  const leadingHeadingBlock = /^(?:[ \t]*\r?\n|#{1,3}[ \t]+[^\r\n]*(?:\r?\n|$))*/.exec(text)?.[0] ?? '';
  const body = text.slice(leadingHeadingBlock.length);
  // Der Text wird vor jeder Überschriftenzeile in Abschnitte geteilt. Das Lookahead lässt die
  // Überschrift beim Text darunter. Weder diese noch die führenden Überschriften sind Teil eines
  // Fensters, eine Überschrift nimmt also nie an einem Abstand teil. Text vor der ersten
  // Überschrift, falls es welchen gibt, ist ein Abschnitt ohne Überschrift.
  // Eine Überschrift ohne Text darunter (direkt gefolgt von der nächsten) wird in
  // `pendingHeadings` zum nächsten Abschnitt mitgenommen, damit kein Stück nur aus einer
  // Überschrift besteht.
  let pendingHeadings = '';
  // Regex 1 (split): `(?=…)` ist ein Lookahead und schneidet vor jeder Zeile (`m` = Zeilenanfang
  // gilt für `^`), die mit `#` bis `###` und einem Leerzeichen beginnt, ohne etwas zu entfernen.
  // Regex 2 (exec): holt die Überschriftenzeile samt Zeilenende vom Anfang eines Abschnitts.
  const sections = body.split(/^(?=#{1,3}[ \t]+)/m).flatMap((section) => {
    const headingLine = /^#{1,3}[ \t]+[^\r\n]*(?:\r?\n|$)/.exec(section)?.[0] ?? '';
    const sectionBody = section.slice(headingLine.length);
    if (!sectionBody.trim()) {
      pendingHeadings += section;
      return [];
    }
    const heading = `${pendingHeadings}${headingLine}`;
    pendingHeadings = '';
    const sentences: string[] = [];
    // Ein Segment nur aus Leerraum (eine Leerzeile) ist kein Satz: Es bekäme ein eigenes Fenster
    // und einen eigenen Abstand, und das Modell hätte nichts zu vergleichen. Würde man es
    // weglassen, verschwänden die Zeilenumbrüche aus dem Chunk-Text. Deshalb wird es an den
    // Satz davor gehängt, oder an den nächsten, falls noch keiner kam.
    let leadingWhitespace = '';
    for (const { segment } of segmenter.segment(sectionBody)) {
      if (segment.trim()) {
        sentences.push(`${leadingWhitespace}${segment}`);
        leadingWhitespace = '';
      } else if (sentences.length > 0) {
        sentences[sentences.length - 1] += segment;
      } else {
        leadingWhitespace += segment;
      }
    }
    return [{ heading, sentences }];
  });
  // Überschriften ganz am Ende haben keinen Abschnitt nach sich. Sie bleiben als eigener Abschnitt
  // erhalten, damit kein Text des vorbereiteten Chunks verloren geht. Ein vorbereiteter Chunk mit
  // Überschriften, aber ohne Text, ergibt am Ende gar keinen Abschnitt und keinen Chunk.
  if (pendingHeadings) sections.push({ heading: pendingHeadings, sentences: [] });
  return { chunkFile, leadingHeadingBlock, sections };
}
