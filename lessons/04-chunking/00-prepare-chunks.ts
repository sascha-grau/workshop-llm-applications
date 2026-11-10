// Lektion 04 – Chunking, Teil 0: Chunks vorbereiten
//
// Lernziel: Du kannst einen Text in Chunks unter dem Token-Limit zerlegen und das Limit prüfen.
//
// Das E5-Modell liest höchstens 512 Tokens pro Eingabe (Token = Wortstück). Dieses Programm schneidet
// die zwölf OWASP-Dokumente an Absätzen, Listenpunkten und Sätzen in Stücke; Überschriften bleiben
// beim Text, der darauf folgt. Jedes Stück bekommt seine Überschriften-Kette vorangestellt und wird
// mit dem Präfix "passage: " gegen das Limit geprüft. Jeder Chunk liegt in einer eigenen Datei,
// dazu entsteht `manifest.json` mit Modell, Limit, Prüfsummen, Token-Zahl und Quell-Position.
// Zum Verstehen reichen die KERN-Zeilen (markiert mit `// KERN:`): die Schnittschleife, die
// Budget-Prüfung und die Erkennung von zu langen Eingaben. Der Rest ist Absicherung.
//
// Wie die Tokens gezählt werden: LM Studio hat keinen eigenen Tokenizer-Endpunkt. Das Programm
// schickt deshalb vorab eine bewusst zu lange Eingabe an `/v1/embeddings` und schaut, was der Server
// tut. Daraus ergibt sich die Zählmethode, die im Manifest als `counting_method` steht:
//   1. `embeddings-overflow`: Der Server lehnt die zu lange Eingabe ab (eine Fehlerantwort, die eine
//      Token-Zahl nennt). Das Programm füllt jede Eingabe auf, liest die Zahl aus der Ablehnung und
//      zieht die Füllung wieder ab. Das ergibt die echte Zahl des Servers. Es braucht pro Zählung
//      eine Anfrage.
//   2. `embeddings-usage`: Der Server nimmt die lange Eingabe an und meldet in `usage.prompt_tokens`
//      eine Zahl über dem Limit. Dann zählt er ungekürzt, und diese Zahl wird verwendet.
//   3. `character-estimate`: Der Server nimmt die Eingabe an und liefert keine brauchbare Zahl, oder
//      er lehnt sie ohne Token-Zahl ab. Dann kann er stillschweigend abschneiden (so verhält sich
//      llama.cpp teils), und eine echte Zählung ist nicht möglich. Das Programm schätzt dann nur aus
//      der Zeichenzahl, mit einem Zeichen je Token. Das ist absichtlich sehr vorsichtig und
//      ergibt viele kleine Chunks. Eine garantierte Obergrenze ist es nicht: Der Server kann die
//      Eingabe trotzdem kürzen. Das Programm meldet das mit einer INFO-Zeile; hat der Server die lange
//      Kalibrierungsprobe mit einem Fehlerstatus abgelehnt (nicht Überlauf, nicht 401/403/404/429), gibt es
//      stattdessen eine Warnung und das Programm macht mit der Schätzung weiter.
// Lehnt der Server später einen Chunk doch ab, wird er mit einem kleineren Budget neu geteilt,
// statt dass das Programm abbricht.
//
// Anzahl der Anfragen für alle zwölf Dokumente (Beispiellauf mit einem Testserver): `embeddings-overflow`
// 759 Anfragen für 94 Chunks, `embeddings-usage` 755 Anfragen für 94 Chunks, `character-estimate`
// 352 Anfragen für 351 Chunks. `--verify` kommt je Methode noch einmal dazu (193, 189, 352).
// Wie lange das dauert, hängt von deiner Hardware ab.
//
// Eingabe:  content/owasp-genai-top-10/NN-*.md (zwölf Dateien)
// Ausgabe:  content/owasp-genai-top-10/chunks/<dokument>--NNN.md (ein Chunk pro Datei) und
//           chunks/manifest.json. Der Ordner `chunks/` wird nicht eingecheckt (steht in .gitignore),
//           du erzeugst ihn selbst.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server (Port 1234), und das E5-Modell
// (REMOTE_EMBEDDING_MODEL_NAME) ist geladen. Burp wird nicht gebraucht. Diesen Teil musst du einmal
// ausführen, bevor Lektion 04, Teil 1 bis 4 laufen. Lektion 05 braucht nur ihren Index (aus Teil 2, 3
// oder 4), und der entsteht aus diesen Chunks.
// Start: npm run l04:0
//
// Aufgabe:
//   1. Prüfe die erzeugten Chunks mit `npm run l04:0 -- --verify`. Das Programm vergleicht Quelle,
//      Prüfsummen und Token-Zahlen und gibt `minimum_tokens` und `maximum_tokens` aus (kleinste und größte Token-Zahl).
//   2. Setze oben `TOKEN_LIMIT_OVERRIDE` auf 256, lösche `content/owasp-genai-top-10/chunks/` und
//      starte neu: Es entstehen deutlich mehr Chunks. Danach setze `TOKEN_LIMIT_OVERRIDE` zurück auf
//      `undefined`, lösche `chunks/` und starte `npm run l04:0` erneut. Sonst passen Teil 1 bis 4 nicht
//      zu den Chunks.
//   3. Öffne `content/owasp-genai-top-10/chunks/manifest.json` und lies `format_version` (3), `counting_method` und
//      `counting`: Wie hat dein Server gezählt, und was heißt das für die Verlässlichkeit der Zahlen?
//
// Aufruf mit Optionen (vom Repo-Root):
//   npm run l04:0              erzeugt chunks/ (bricht ab, wenn der Ordner schon existiert)
//   npm run l04:0 -- --verify  prüft vorhandene Chunks gegen Quelle und Token-Limit
//   npm run l04:0 -- --help    zeigt eine Kurzhilfe

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { contentDirectory } from '../shared/paths.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { e5Model, SPECIAL_TOKEN_RESERVE } from '../shared/embeddings.ts';
import { MANIFEST_FORMAT_VERSION, MANIFEST_FILE, COUNTING_METHOD, manifestSchema, type Manifest, type CountingMethod } from './formats.ts';

import { log } from '../shared/logging.ts';
import { runMain } from '../shared/startup.ts';

// Nur für die Aufgabe 2: Ersetzt für diesen Lauf das Token-Limit von E5 (512), ohne `shared/embeddings.ts`
// zu ändern. Erlaubt sind ganze Zahlen von 1 bis 512. `undefined` heißt: normales Limit.
const TOKEN_LIMIT_OVERRIDE: number | undefined = undefined;
// Zeichen je Token in der Notfall-Schätzung. 1 ist absichtlich viel zu vorsichtig: lieber zu kleine Chunks
// als zu große, die der Server stillschweigend kürzen könnte.
const ESTIMATE_CHARACTERS_PER_TOKEN = 1;
// Die Reserve für das Start- und das End-Token, die E5 (Tokenizer XLM-R) um den Text setzt, steht
// als `SPECIAL_TOKEN_RESERVE` in `shared/embeddings.ts`; die Zeichenschätzung reserviert beide zusätzlich.
const relativeLinkPattern = /\]\((?![a-z][a-z\d+.-]*:|\/|#)([^)]+)\)/gi;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const EMBEDDING_REQUEST_FAILED_MESSAGE = 'The embedding request failed. Check REMOTE_MODEL_BASE_URL, start the LM Studio server and load the model configured in REMOTE_EMBEDDING_MODEL_NAME.';

type Range = [number, number];
type SourceRecord = Manifest['sources'][number];
type ChunkRecord = SourceRecord['chunks'][number];
interface ServerContext { endpoint: string; model: string; headers: Record<string, string> }
interface Probe { overflow: boolean; tokens?: number; rejectedStatus?: number }
interface CountingContext {
  prefix: string; limit: number; method: CountingMethod;
  calibration: Record<string, string | number | null>;
  count(text: string, fresh?: boolean): Promise<number>;
  probe(input: string): Promise<Probe>;
}
class OverlongChunk extends Error {
  sourceFile: string;
  tokens?: number;
  file: string;
  source_start: number;
  source_end: number;
  constructor(sourceFile: string, file: string, [start, end]: Range, tokens?: number) {
    super(`The chunk exceeds the token limit: ${file}`);
    this.sourceFile = sourceFile;
    this.file = file;
    this.tokens = tokens;
    this.source_start = start;
    this.source_end = end;
  }
}

// KERN: Erkennt in einer Fehlerantwort, dass die Eingabe zu lang war, und liest die Token-Zahl heraus.
// Das hängt vom Server ab, deshalb sucht es mit mehreren Mustern nach Wörtern wie "too large" oder
// "exceeds" und einer Zahl vor "tokens".
function overflowResult(body: string): Probe | undefined {
  if (!/(?:tokens?|context[-_\s]*(?:size|length|window|limit)|prompt.{0,30}too long|input.{0,30}too (?:large|long))/i.test(body)
      || !/(?:too (?:large|long|many)|exceed|overflow|context[-_\s]*(?:size|length|window|limit)|maximum.{0,20}tokens)/i.test(body)) return;
  const match = body.match(/input\s*\((\d+)\s*tokens?\)/i)
    ?? body.match(/(?:requested|input|has|contains|got)\D{0,30}(\d+)\s*tokens?/i)
    ?? body.match(/(\d+)\s*tokens?\D{0,30}(?:too (?:large|long|many)|exceed)/i);
  return { overflow: true, tokens: match ? Number(match[1]) : undefined };
}

// Schickt eine Eingabe an den Embedding-Endpunkt und liest daraus die Token-Zahl. Das Programm geht
// davon aus, dass LM Studio eine Eingabe über 512 Tokens entweder mit der echten Token-Zahl
// ablehnt oder sie annimmt und ungekürzt in `usage.prompt_tokens` zählt. Nimmt der Server sie an
// und liefert keine solche Zahl, kann er stillschweigend abschneiden. Dann gilt nur die
// konservative Zeichenschätzung (siehe Kopf der Datei), und die ist keine garantierte Obergrenze.
async function embeddingProbe(server: ServerContext, input: string, calibration = false): Promise<Probe> {
  let response;
  try {
    response = await fetch(server.endpoint, {
      method: 'POST', headers: server.headers, body: JSON.stringify({ model: server.model, input, encoding_format: 'float' }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (cause) {
    throw new Error(EMBEDDING_REQUEST_FAILED_MESSAGE, { cause });
  }
  let payload: unknown;
  try {
    payload = response.ok ? await response.json() : await response.text();
  } catch (cause) {
    throw new Error(EMBEDDING_REQUEST_FAILED_MESSAGE, { cause });
  }
  if (response.ok) {
    const value = payload as { usage?: { prompt_tokens?: unknown } };
    const tokens = value.usage?.prompt_tokens;
    return { overflow: false, tokens: typeof tokens === 'number' && Number.isInteger(tokens) && tokens >= 0 ? tokens : undefined };
  }
  const body = payload as string;
  const message = `The embedding endpoint returned HTTP ${response.status}: ${body}`;
  const fatalStatus = [401, 403, 404, 429].includes(response.status);
  const overflow = !fatalStatus && !/rate.?limit|too many requests/i.test(body) ? overflowResult(body) : undefined;
  if (overflow) return overflow;
  if (calibration && !fatalStatus) return { overflow: false, rejectedStatus: response.status };
  throw new Error(EMBEDDING_REQUEST_FAILED_MESSAGE, { cause: new Error(message) });
}

// Zählen ohne Tokenizer: Die Eingabe wird so weit aufgefüllt, dass sie sicher abgelehnt wird. Aus
// der Ablehnung liest man die Gesamtzahl und zieht die Füllung wieder ab. Ergebnis ist die
// Zählung des Servers für Präfix + Text.
async function embeddingCount(server: ServerContext, prefix: string, text: string, pad = e5Model.tokenLimit): Promise<number> {
  const result = await embeddingProbe(server, prefix + text.trim() + ' a'.repeat(pad));
  if (!result.overflow || result.tokens === undefined) {
    throw new Error('The embedding server did not return a reliable token count for the padded input.');
  }
  return result.tokens - pad;
}

async function countTokens(
  { server, prefix, limit, method, cache }: {
    server: ServerContext; prefix: string; limit: number; method: CountingMethod; cache: Map<string, number>;
  }, text: string, fresh = false,
): Promise<number> {
  const input = prefix + text.trim();
  if (!fresh && cache.has(input)) return cache.get(input)!;
  let tokens: number;
  if (method === COUNTING_METHOD.estimate) tokens = Math.ceil(input.length / ESTIMATE_CHARACTERS_PER_TOKEN) + SPECIAL_TOKEN_RESERVE;
  else if (method === COUNTING_METHOD.overflow) tokens = await embeddingCount(server, prefix, text);
  else {
    const result = await embeddingProbe(server, input);
    if (result.overflow) return result.tokens ?? limit + 1;
    if (result.tokens === undefined) throw new Error('The embedding server is no longer returning a reliable token count.');
    tokens = result.tokens;
  }
  cache.set(input, tokens);
  return tokens;
}

async function createCounter(prefix: string, limit: number): Promise<CountingContext> {
  const server: ServerContext = {
    model: remoteEmbeddingModel.name,
    endpoint: `${remoteEmbeddingModel.baseURL.replace(/\/$/, '')}/embeddings`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${remoteEmbeddingModel.apiKey}` },
  };
  const cache = new Map<string, number>();
  const longProbe = await embeddingProbe(server, prefix + 'Kalibrierung '.repeat(1024), true);
  const method: CountingMethod = longProbe.overflow && longProbe.tokens !== undefined ? COUNTING_METHOD.overflow
    : !longProbe.overflow && longProbe.tokens !== undefined && longProbe.tokens > e5Model.tokenLimit ? COUNTING_METHOD.usage : COUNTING_METHOD.estimate;
  let calibration: CountingContext['calibration'] = { method, long_probe_tokens: longProbe.tokens ?? null };
  if (method === COUNTING_METHOD.overflow) {
    calibration = {
      method, prefix_count: await embeddingCount(server, prefix, ''), one_more_padding: await embeddingCount(server, prefix, '', e5Model.tokenLimit + 1),
      double_padding: await embeddingCount(server, prefix, '', e5Model.tokenLimit * 2), three_words: await embeddingCount(server, prefix, 'eins zwei drei'),
    };
    // Jede Füllung muss genau ein Token kosten, sonst stimmt die Subtraktion oben nicht.
    if (calibration.one_more_padding !== calibration.prefix_count || calibration.double_padding !== calibration.prefix_count
      || Number(calibration.three_words) <= Number(calibration.prefix_count)) {
      throw new Error('Embedding token count calibration failed. Each padding segment must correspond to one token.');
    }
  }
  if (method === COUNTING_METHOD.estimate) {
    const reason = longProbe.rejectedStatus !== undefined ? `The long calibration probe was rejected (HTTP ${longProbe.rejectedStatus}).`
      : longProbe.overflow ? 'The rejection contains no usable token count.'
      : 'The server did not return a reliable token count for the long input.';
    const message = `No reliable token count: ${reason} Using a conservative estimate of one token per character; the server may silently truncate input.`;
    if (longProbe.rejectedStatus !== undefined) log('WARN', message);
    else log('INFO', message);
  }
  return {
    prefix, limit, method, calibration,
    probe: (input) => embeddingProbe(server, input),
    count: (text, fresh) => countTokens({ server, prefix, limit, method, cache }, text, fresh),
  };
}

function rebaseLinks(text: string) {
  return text.replace(relativeLinkPattern, '](../$1)');
}

function protectedRanges(text: string) {
  const ranges: Range[] = [];
  for (const expression of [
    /!?\[[^\]]*\]\((?:[^()\n]|\([^()\n]*\))*\)/g,
    /`+[^`\n]+`+/g,
    /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*(?:\n|$)/gm,
  ]) {
    for (const match of text.matchAll(expression)) ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function headingContext(source: string, [start, end]: Range) {
  const stack: { level: number; text: string }[] = [];
  for (const match of source.slice(0, start).matchAll(/^(#{1,3}) [^\n]+/gm)) {
    const level = match[1].length;
    while (stack.length && stack.at(-1)!.level >= level) stack.pop();
    stack.push({ level, text: match[0] });
  }
  const opening = source.slice(start, end).match(/^(?:\s*#{1,3} [^\n]+(?:\n|$))+/)?.[0] ?? '';
  const levels = [...opening.matchAll(/^(#{1,3}) /gm)].map((match) => match[1].length);
  if (levels.length) while (stack.length && stack.at(-1)!.level >= Math.min(...levels)) stack.pop();
  return stack.map(({ text }) => text).join('\n\n');
}

function renderChunk(source: string, [start, end]: Range) {
  const headings = headingContext(source, [start, end]);
  const body = source.slice(start, end).trim();
  return rebaseLinks((headings ? headings + '\n\n' : '') + body) + '\n';
}

function blocks(source: string) {
  const result: Range[] = [];
  let start = 0;
  for (const match of source.matchAll(/\n\s*\n/g)) {
    const end = match.index + match[0].length;
    if (source.slice(start, end).trim()) result.push([start, end]);
    start = end;
  }
  if (start < source.length) result.push([start, source.length]);
  // Überschriften bleiben beim Absatz oder der Liste, die darauf folgt.
  for (let index = result.length - 2; index >= 0; index--) {
    if (/^#{1,3} [^\n]+$/.test(source.slice(...result[index]).trim())) {
      result[index][1] = result[index + 1][1];
      result.splice(index + 1, 1);
    }
  }
  return result;
}

async function splitLargeBlock(source: string, start: number, end: number, counter: CountingContext, budget: number): Promise<Range[]> {
  // KERN: Passt der Abschnitt samt Überschriften-Kette ins Budget, bleibt er ganz. Sonst wird er
  // geteilt.
  if (await counter.count(renderChunk(source, [start, end])) <= budget) return [[start, end]];
  const body = source.slice(start, end);
  const protectedSpans = protectedRanges(body);
  const safe = (position: number) => !protectedSpans.some(([a, b]) => a < position && position < b);
  // Bevorzugt an Listenpunkten schneiden, dann an Sätzen; an Wörtern nur, wenn schon ein Satz zu groß ist.
  for (const expression of [/\n(?=(?:\d+\.|[-*]) )/g, /[.!?][”’»"']?\s+(?=\S)/g, /\s+(?=\S)/g]) {
    const positions = [...body.matchAll(expression)]
      .map((match) => match.index + match[0].length)
      .filter((position) => safe(position) && body.slice(0, position).trim()
        && !/^\s*(?:#{1,3} [^\n]+\s*)+$/.test(body.slice(0, position)));
    // KERN: Binäre Suche nach dem spätesten Schnitt, bei dem der Teil noch ins Budget passt. Der Rest
    // wird rekursiv weiter geteilt.
    let low = 0;
    let high = positions.length - 1;
    let accepted = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (await counter.count(renderChunk(source, [start, start + positions[middle]])) <= budget) {
        accepted = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    if (accepted !== -1) {
      const cut = start + positions[accepted];
      return [[start, cut], ...await splitLargeBlock(source, cut, end, counter, budget)];
    }
  }
  throw new Error('An indivisible Markdown link, code block or heading exceeds the token budget.');
}

async function sourceChunks(source: string, counter: CountingContext, budget: number): Promise<Range[]> {
  const atoms: Range[] = [];
  for (const [start, end] of blocks(source)) atoms.push(...await splitLargeBlock(source, start, end, counter, budget));
  const result: Range[] = [];
  let current: Range | null = null;
  for (const atom of atoms) {
    if (current && await counter.count(renderChunk(source, [current[0], atom[1]])) <= budget) current[1] = atom[1];
    else {
      if (current) result.push(current);
      current = [...atom];
    }
  }
  if (current) result.push(current);
  return result;
}

async function validate({ directory, manifest, sources, counter, verified = new Set<string>() }: {
  directory: string; manifest: Manifest; sources: Map<string, string>; counter: CountingContext; verified?: Set<string>;
}) {
  const expected = new Set([MANIFEST_FILE]);
  const counts: number[] = [];
  for (const entry of manifest.sources) {
    const source = sources.get(entry.file);
    if (!source || sha256(source) !== entry.sha256) throw new Error(`The source has changed: ${entry.file}`);
    let covered = 0;
    for (const chunk of entry.chunks) {
      if (chunk.source_start !== covered || chunk.source_end <= covered) {
        throw new Error(`Gap or overlap in source coverage: ${chunk.file}`);
      }
      covered = chunk.source_end;
      const text = await readFile(join(directory, chunk.file), 'utf8');
      if (text !== renderChunk(source, [chunk.source_start, chunk.source_end]) || sha256(text) !== chunk.sha256) {
        throw new Error(`Chunk content does not match: ${chunk.file}`);
      }
      // KERN: Budget-Prüfung. Jeder fertige Chunk wird noch einmal gezählt und darf das Limit nicht überschreiten.
      const tokenCount = await counter.count(text, !verified.has(chunk.sha256));
      if (tokenCount > counter.limit) {
        throw new OverlongChunk(entry.file, chunk.file, [chunk.source_start, chunk.source_end], tokenCount);
      }
      // Dass der Server den Chunk annimmt, beweist nicht, dass er ihn ungekürzt einbettet. Im
      // Schätzmodus gilt deshalb nur die Zeichenheuristik, keine echte Zählung.
      const probe = verified.has(chunk.sha256) ? { overflow: false } : await counter.probe(counter.prefix + text.trim());
      if (probe.overflow || (probe.tokens !== undefined && probe.tokens > counter.limit)) {
        throw new OverlongChunk(entry.file, chunk.file, [chunk.source_start, chunk.source_end], probe.tokens);
      }
      if (tokenCount !== chunk.token_count) {
        throw new Error(`Token verification failed: ${chunk.file}`);
      }
      verified.add(chunk.sha256);
      for (const match of text.matchAll(relativeLinkPattern)) {
        if (!existsSync(resolve(directory, match[1].split('#')[0]))) {
          throw new Error(`Invalid relative link in ${chunk.file}`);
        }
      }
      expected.add(chunk.file);
      counts.push(tokenCount);
    }
    if (covered !== source.length) throw new Error(`Incomplete source coverage: ${entry.file}`);
  }
  const files = (await readdir(directory)).filter((name) => !name.startsWith('.'));
  if (files.length !== expected.size || files.some((name) => !expected.has(name))) {
    throw new Error('The output has missing or unexpected files.');
  }
  return { counted_with: counter.method, chunks: counts.length, minimum_tokens: Math.min(...counts), maximum_tokens: Math.max(...counts) };
}

async function listSources(sourceDirectory: string): Promise<Map<string, string>> {
  const names = (await readdir(sourceDirectory)).filter((name) => /^\d{2}-.+\.md$/.test(name)).sort();
  if (names.length !== 12) throw new Error('Expected exactly 12 numbered source documents.');
  return new Map(await Promise.all(names.map(async (name) => [name, await readFile(join(sourceDirectory, name), 'utf8')] as const)));
}

function matchesManifest(value: unknown, model: string, counter: CountingContext, sources: Map<string, string>): value is Manifest {
  const result = manifestSchema.safeParse(value);
  if (!result.success) return false;
  const manifest = result.data;
  return manifest.model === model && manifest.limit === counter.limit
    && manifest.passage_prefix === counter.prefix && manifest.counting_method === counter.method
    && manifest.sources.map((entry) => entry.file).join('\n') === [...sources.keys()].join('\n');
}

async function writeChunks(stage: string, sources: Map<string, string>, counter: CountingContext, rangesBySource: Map<string, Range[]>): Promise<Manifest> {
  const model = remoteEmbeddingModel.name;
  const manifest = {
    format_version: MANIFEST_FORMAT_VERSION, model, limit: counter.limit, passage_prefix: counter.prefix, special_token_reserve: SPECIAL_TOKEN_RESERVE,
    counting_method: counter.method,
    counting_request: counter.method === COUNTING_METHOD.estimate ? null : { method: 'POST', request: { model,
      input: counter.method === COUNTING_METHOD.overflow ? '<passage_prefix><trimmed_chunk_text><padding>' : '<passage_prefix><trimmed_chunk_text>' } },
    counting: counter.method === COUNTING_METHOD.estimate
      ? `Conservative estimate: one token per character of prefix and text, plus two special tokens; not a guaranteed token count.`
      : 'Token count from the embedding endpoint for prefix and text, including special tokens.',
    source_offsets: 'JavaScript UTF-16 code units; contiguous, nonoverlapping ranges cover every character of the original source.',
    calibration: counter.calibration, sources: [] as SourceRecord[],
  } as const;
  for (const [file, source] of sources) {
    const chunks: ChunkRecord[] = [];
    const ranges = rangesBySource.get(file)!;
    for (const [index, [start, end]] of ranges.entries()) {
      const name = `${file.slice(0, -3)}--${String(index + 1).padStart(3, '0')}.md`;
      const text = renderChunk(source, [start, end]);
      const tokens = await counter.count(text);
      if (tokens > counter.limit) throw new OverlongChunk(file, name, [start, end], tokens);
      await writeFile(join(stage, name), text);
      chunks.push({ file: name, source_start: start, source_end: end, sha256: sha256(text), token_count: tokens });
    }
    manifest.sources.push({ file, sha256: sha256(source), chunks });
  }
  await writeFile(join(stage, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  if ([...flags].some((flag) => !['--verify', '--help'].includes(flag))) throw new Error('Supported options: --verify, --help');
  if (flags.has('--help')) {
    console.log('npm run l04:0              Generate chunks and check them against the token limit.\n'
      + 'npm run l04:0 -- --verify Verify existing chunks and source coverage.\n'
      + 'Reads REMOTE_MODEL_BASE_URL, REMOTE_MODEL_API_KEY and REMOTE_EMBEDDING_MODEL_NAME.');
    return;
  }
  const sourceDirectory = join(contentDirectory, 'owasp-genai-top-10');
  const outputDirectory = join(sourceDirectory, 'chunks');
  if (flags.has('--verify')) {
    if (!existsSync(join(outputDirectory, MANIFEST_FILE))) throw new Error('Prepared chunks are missing. Generate them with npm run l04:0.');
  } else if (existsSync(outputDirectory)) {
    throw new Error('chunks already exists. Use --verify or move the existing directory first.');
  }
  const limit = TOKEN_LIMIT_OVERRIDE ?? e5Model.tokenLimit;
  if (!Number.isInteger(limit) || limit < 1 || limit > e5Model.tokenLimit) throw new Error(`The token limit must be an integer between 1 and ${e5Model.tokenLimit}.`);
  const sources = await listSources(sourceDirectory);
  const counter = await createCounter(e5Model.passagePrefix, limit);
  if (flags.has('--verify')) {
    let manifest: unknown;
    try { manifest = JSON.parse(await readFile(join(outputDirectory, MANIFEST_FILE), 'utf8')); } catch {
      throw new Error('The chunk manifest is invalid. Regenerate the chunks with npm run l04:0.');
    }
    if (!matchesManifest(manifest, remoteEmbeddingModel.name, counter, sources)) {
      throw new Error('The chunk manifest format, settings or document list do not match. Regenerate the chunks with npm run l04:0.');
    }
    console.log(JSON.stringify(await validate({ directory: outputDirectory, manifest, sources, counter })));
    return;
  }
  const stage = join(sourceDirectory, `.chunks-stage-${process.pid}`);
  const rangesBySource = new Map<string, Range[]>();
  for (const [file, source] of sources) rangesBySource.set(file, await sourceChunks(source, counter, limit));
  const budgets = new Map<string, number>();
  const verified = new Set<string>();
  let manifest: Manifest | undefined;
  try {
    while (true) {
      await mkdir(stage);
      try {
        manifest = await writeChunks(stage, sources, counter, rangesBySource);
        const summary = await validate({ directory: stage, manifest, sources, counter, verified });
        await rename(stage, outputDirectory);
        for (const { file, chunks } of manifest.sources) console.log(`${file}: ${chunks.length} chunks prepared`);
        console.log(JSON.stringify(summary));
        return;
      } catch (error) {
        if (!(error instanceof OverlongChunk)) throw error;
        const rangeKey = JSON.stringify([error.sourceFile, error.source_start, error.source_end]);
        const previous = budgets.get(rangeKey) ?? limit;
        const next = Math.floor(previous * Math.min(0.75, error.tokens ? limit / error.tokens * 0.9 : 0.5));
        if (next < 1 || next >= previous) throw error;
        const ranges = rangesBySource.get(error.sourceFile)!;
        const index = ranges.findIndex(([start, end]) => start === error.source_start && end === error.source_end);
        const smaller = await splitLargeBlock(sources.get(error.sourceFile)!, error.source_start, error.source_end, counter, next);
        if (index === -1) throw error;
        ranges.splice(index, 1, ...smaller);
        for (const [start, end] of smaller) budgets.set(JSON.stringify([error.sourceFile, start, end]), next);
        log('INFO', `${error.sourceFile}: A chunk is too long; splitting again with a smaller budget of ${next} tokens.`);
        await rm(stage, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

await runMain(main);
