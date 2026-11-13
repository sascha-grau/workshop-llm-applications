// Lektion 04 – Chunking, Teil 0: Chunks vorbereiten
//
// Lernziel: Einen Text in Chunks unter dem Token-Limit von E5 (512) zerlegen und das Limit prüfen.
// Braucht:  den E5-Tokenizer (`npm run tokenizer:fetch`, einmalig), sonst LM Studio mit E5. Läuft einmal
//           vor Teil 1–4 (meist durch die Trainerin oder den Trainer).
// Schreibt: content/owasp-genai-top-10/chunks/ (ein Chunk je Datei + manifest.json) – gelesen von Teil 1–4.
// Start:    npm run l04:0   ·   prüfen: npm run l04:0 -- --verify   ·   Hilfe: npm run l04:0 -- --help
// Erklärt:  lessons/04-chunking/GUIDE.de.md → „Teil 0“
//
// Aufgabe:
//   1. Öffne `chunks/01-llm01-prompt-injection--001.md` und `--002.md`: An welcher Grenze hat KERN 3
//      geschnitten (Absatz, Listenpunkt oder Satz)?
//   2. Lies `counting_method` in `chunks/manifest.json` und suche es in der Tabelle im Guide: Wurde exakt
//      gezählt (Tokenizer oder Server) oder nur geschätzt?
//   3. Benenne `chunks/` in `chunks-512/` um (VS Code: Explorer, F2). `TOKEN_LIMIT_OVERRIDE` auf 256,
//      `npm run l04:0`: Wie viele Chunks entstehen?
//      ↺ Danach `undefined`, den neuen Ordner `chunks/` löschen und `chunks-512/` zurück in `chunks/`
//        umbenennen (sonst lehnen Teil 1–4 die Chunks ab).
//
// Lesen: die Zeilen `// KERN 1–4`. Der Rest ist Absicherung (Kalibrierung, Prüfsummen, Neuversuch).

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
import { E5_TOKENIZER, loadE5TokenCounter } from './tokenizer.ts';

// Standard: undefined (= 512, das Limit von E5). Nur für Aufgabe 3; erlaubt sind ganze Zahlen 1–512.
const TOKEN_LIMIT_OVERRIDE: number | undefined = undefined;
// Standard: 1 Zeichen je Token, nur im Schätzmodus. Absichtlich viel zu vorsichtig: lieber zu kleine
// Chunks als zu große, die der Server stillschweigend kürzen könnte.
const ESTIMATE_CHARACTERS_PER_TOKEN = 1;
// Die Schätzung reserviert zusätzlich Start- und End-Token (`SPECIAL_TOKEN_RESERVE` in shared/embeddings.ts).
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

// KERN 1: Zählen über den Server (Rückfall, wenn der lokale Tokenizer fehlt). Erkennt in einer Fehlerantwort „Eingabe zu lang“ und liest die
// Token-Zahl heraus. Der Wortlaut hängt vom Server ab, deshalb mehrere Muster ("too large", "exceeds").
function overflowResult(body: string): Probe | undefined {
  if (!/(?:tokens?|context[-_\s]*(?:size|length|window|limit)|prompt.{0,30}too long|input.{0,30}too (?:large|long))/i.test(body)
      || !/(?:too (?:large|long|many)|exceed|overflow|context[-_\s]*(?:size|length|window|limit)|maximum.{0,20}tokens)/i.test(body)) return;
  const match = body.match(/input\s*\((\d+)\s*tokens?\)/i)
    ?? body.match(/(?:requested|input|has|contains|got)\D{0,30}(\d+)\s*tokens?/i)
    ?? body.match(/(\d+)\s*tokens?\D{0,30}(?:too (?:large|long|many)|exceed)/i);
  return { overflow: true, tokens: match ? Number(match[1]) : undefined };
}

// Eine Anfrage an den Embedding-Endpunkt: abgelehnt (mit Token-Zahl) oder angenommen (mit
// `usage.prompt_tokens`, falls geliefert). Ohne beides kann der Server still kürzen; dann bleibt nur
// die Zeichenschätzung. Die drei Zählmethoden: GUIDE.de.md → „Teil 0“.
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

// Zählmethode wählen: Der lokale Tokenizer hat Vorrang, weil er exakt ist und LM Studio selbst nicht
// verlässlich zählt (`usage` ist 0, zu lange Eingaben werden still gekürzt). Fehlt er (offline, kein Cache),
// läuft Teil 0 mit den Server-Methoden oder der Schätzung weiter, statt abzubrechen.
export async function createCounter(prefix: string, limit: number, loadTokenizer = loadE5TokenCounter): Promise<CountingContext> {
  try {
    const count = await loadTokenizer();
    return {
      prefix, limit, method: COUNTING_METHOD.tokenizer,
      calibration: { method: COUNTING_METHOD.tokenizer, model: E5_TOKENIZER.model, revision: E5_TOKENIZER.revision },
      count: async (text) => count(prefix + text.trim()),
      probe: async (input) => { const tokens = count(input); return { tokens, overflow: tokens > limit }; },
    };
  } catch {
    log('WARN', 'Local E5 tokenizer unavailable. Falling back to server counting or a character estimate. Run npm run tokenizer:fetch with internet access; if the cache is damaged, remove .cache/tokenizers and fetch again. Copy .cache/tokenizers for offline use.');
  }
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
  // KERN 2: Passt der Abschnitt samt Überschriften-Kette ins Budget, bleibt er ganz. Sonst wird er geteilt.
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
    // KERN 3: Binäre Suche nach dem spätesten Schnitt, bei dem der Teil noch ins Budget passt. Der Rest
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
      // KERN 4: Budget-Prüfung. Jeder fertige Chunk wird noch einmal gezählt und darf das Limit nicht überschreiten.
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

export function matchesManifest(value: unknown, model: string, counter: CountingContext, sources: Map<string, string>): value is Manifest {
  const result = manifestSchema.safeParse(value);
  if (!result.success) return false;
  const manifest = result.data;
  return manifest.model === model && manifest.limit === counter.limit
    && manifest.passage_prefix === counter.prefix
    && (manifest.counting_method === counter.method || (manifest.counting_method !== COUNTING_METHOD.estimate && counter.method !== COUNTING_METHOD.estimate))
    && manifest.sources.map((entry) => entry.file).join('\n') === [...sources.keys()].join('\n');
}

async function writeChunks(stage: string, sources: Map<string, string>, counter: CountingContext, rangesBySource: Map<string, Range[]>): Promise<Manifest> {
  const model = remoteEmbeddingModel.name;
  const manifest = {
    format_version: MANIFEST_FORMAT_VERSION, model, limit: counter.limit, passage_prefix: counter.prefix, special_token_reserve: SPECIAL_TOKEN_RESERVE,
    counting_method: counter.method,
    counting_request: counter.method === COUNTING_METHOD.estimate || counter.method === COUNTING_METHOD.tokenizer ? null : { method: 'POST', request: { model,
      input: counter.method === COUNTING_METHOD.overflow ? '<passage_prefix><trimmed_chunk_text><padding>' : '<passage_prefix><trimmed_chunk_text>' } },
    counting: counter.method === COUNTING_METHOD.estimate
      ? `Conservative estimate: one token per character of prefix and text, plus two special tokens; not a guaranteed token count.`
      : counter.method === COUNTING_METHOD.tokenizer
        ? 'Local intfloat/multilingual-e5-base tokenizer count for prefix and trimmed text, including special tokens; no truncation.'
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
      + 'Uses the local E5 tokenizer (first use downloads ~17 MB). Offline setup: npm run tokenizer:fetch, then copy .cache/tokenizers.\n'
      + 'Reads REMOTE_EMBEDDING_MODEL_NAME; server fallback also reads REMOTE_MODEL_BASE_URL and REMOTE_MODEL_API_KEY.');
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
        // Ist ein fertiger Chunk doch zu lang, wird nur er mit kleinerem Budget neu geteilt, statt abzubrechen.
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

if (import.meta.main) await runMain(main);
