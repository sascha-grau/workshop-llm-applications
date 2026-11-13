// Prüft die Dokumentation gegen den Code: npm-Skripte, Links samt Anker, Repo-Pfade, Bezeichner, Werte
// (Tabelle `valueAssertions`), Guide-Abschnitte ("Erklärt: … → Teil N"), SYNC/LEHRKOPIE-Ziele samt
// YAML-Kopien (Judge-Block, Rubrik), Namen in Backticks sowie die Parität von DE und EN (Überschriften,
// Anker, Linkziele, Tabellenzeilen, Zahlen, Vertiefungen), Zahlen neben Konstanten und `// Standard:`-
// Kommentare gegen den Code sowie festgelegte Versionen gegen package.json. Start: `npm run docs:check`
// oder `npm run check` (mit Typecheck und Lehrkopien-Tests); `--verbose` listet alle geprüften Verweise
// und die Regeln, `--help` nur die Regeln. Fehler: Exit-Code 1.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

type SourceLine = { text: string; line: number };
type CheckKind = 'scripts' | 'links' | 'paths' | 'identifiers' | 'values' | 'versions' | 'sync' | 'parity' | 'guide-sections';
type Failure = { file: string; line: number; reference: string; reason: string; kind: CheckKind };
type SourceMetadata = { source: string; code: string; names: Set<string>; lines: SourceLine[] };
type Heading = { text: string; level: number; line: number };
type MarkdownMetadata = { lines: SourceLine[]; headings: Heading[]; htmlAnchors: Map<string, number>; tableRows: number[] };

const verbose = process.argv.includes('--verbose');
const help = process.argv.includes('--help');
// Präfixe fremder Pakete: Sie stehen nicht in .env.example, weil dieses Repo sie nicht setzt.
const externalEnvironmentWildcards: Record<string, string> = {
  'LANGSMITH_*': 'env vars of the langsmith dependency mentioned in the npm-audit note',
};
const rules = [
  'Usage: node scripts/check-docs.ts [--verbose] [--help]',
  'Skipped template segments: N | NN | X | … | ...',
  'Template separators: / : . _ -; npm lesson segments: lN | lNN | lX | l… | l...',
  'Template examples: lNN:N | l04:N | lessons/NN/… | lessons/NN-…/GUIDE.de.md',
  'Skipped quantization: /^Q\\d+(_[A-Z0-9]+)*$/',
  'Environment prefixes: NAME_* | NAME_…; .env.example: NAME_<key>',
  'Automatic value claims: `NAME` = number | ist number | is number | : number | (number)',
  'Value claim examples: (Beispiel) | (example); same sentence',
  'Value claim ignore: <!-- docs:check-ignore -->; same sentence or directly preceding standalone line',
  ...Object.entries(externalEnvironmentWildcards).map(([pattern, reason]) => `External environment wildcard: ${pattern}; ${reason}`),
];
if (help || verbose) for (const rule of rules) console.log(rule);
if (help) process.exit(0);

const root = process.cwd();
const failures: Failure[] = [];
const counts: Record<CheckKind, number> = { scripts: 0, links: 0, paths: 0, identifiers: 0, values: 0, versions: 0, sync: 0, parity: 0, 'guide-sections': 0 };
const skippedDirectories = new Set(['.git', 'node_modules', 'results', 'indexes', 'content']);
const rootDirectories = new Set(['lessons', 'docs', 'content', ...readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
  .map(entry => entry.name)]);
const packageMetadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const scripts = new Set(Object.keys(packageMetadata.scripts ?? {}));
// REQUEST_TIMEOUT_MS gehört promptfoo und steht in keiner Lektionsdatei als Konstante; die Doku nennt
// es trotzdem.
const identifiers = new Set<string>(['REQUEST_TIMEOUT_MS']);
const environmentNames = new Set<string>();
// Alte Namen stehen nur in config.ts (Hinweis auf den neuen Namen). Die Doku darf sie nennen, wenn sie
// die Meldung erklärt.
const legacyEnvironmentNames = new Set<string>();
const uppercaseName = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

// Platzhalter wie N, NN, X oder … stehen für beliebige Werte (z. B. `lessons/NN-…/`, `lNN:N`). Sie
// verweisen auf keine echte Datei und kein echtes Skript und werden deshalb übersprungen.
function template(reference: string, npm = false): boolean {
  if (/(?:^|[/:._-])\.{3}(?=$|[/:._-])/.test(reference)
    || (npm && /(?:^|[/:._-])l\.{3}(?=$|[/:._-])/.test(reference))) return true;
  return reference.split(/[/:._-]/).some(segment => /^(?:N|NN|X|…)$/.test(segment)
    || (npm && /^l(?:N|NN|X|…)$/.test(segment)));
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      if (skippedDirectories.has(entry.name)) return [];
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(filename) : entry.isFile() ? [filename] : [];
    });
}

function typescriptParts(source: string): { code: string; comments: string } {
  const code = source.split('');
  const comments = source.replace(/[^\r\n]/g, ' ').split('');
  let position = 0;
  let previous = '';
  const blank = (start: number, end: number) => {
    for (let index = start; index < end; index++) {
      if (source[index] !== '\n' && source[index] !== '\r') code[index] = ' ';
    }
  };
  const quoted = (quote: string) => {
    const start = position++;
    while (position < source.length) {
      const character = source[position++];
      if (character === '\\') position++;
      else if (character === quote) break;
      else if (quote === '`' && character === '$' && source[position] === '{') {
        position++;
        expression(true);
      }
    }
    blank(start, position);
  };
  const expression = (templateExpression = false) => {
    let braces = 0;
    while (position < source.length) {
      const character = source[position];
      const next = source[position + 1];
      if (character === '/' && (next === '/' || next === '*')) {
        const start = position;
        position += 2;
        if (next === '/') {
          while (position < source.length && source[position] !== '\n') position++;
        } else {
          while (position < source.length && source.slice(position, position + 2) !== '*/') position++;
          position = Math.min(source.length, position + 2);
        }
        for (let index = start; index < position; index++) comments[index] = source[index];
        blank(start, position);
      } else if (character === '"' || character === "'" || character === '`') {
        quoted(character);
        previous = 'value';
      } else if (character === '/' && (!previous || /^(?:[=(:,!&|?;{}\[~%^<>+*\-]|return|throw|case|yield|await)$/.test(previous))) {
        const start = position++;
        let characterClass = false;
        while (position < source.length && source[position] !== '\n') {
          const current = source[position++];
          if (current === '\\') position++;
          else if (current === '[') characterClass = true;
          else if (current === ']') characterClass = false;
          else if (current === '/' && !characterClass) break;
        }
        while (/[a-z]/i.test(source[position] ?? '') && position < source.length) position++;
        blank(start, position);
        previous = 'value';
      } else if (/[\w$]/.test(character)) {
        const start = position++;
        while (position < source.length && /[\w$]/.test(source[position])) position++;
        previous = source.slice(start, position);
      } else {
        position++;
        if (character === '{') braces++;
        if (character === '}') {
          if (templateExpression && braces === 0) return;
          braces--;
        }
        if (!/\s/.test(character)) previous = character;
      }
    }
  };
  expression();
  return { code: code.join(''), comments: comments.join('') };
}

function yamlComments(source: string): SourceLine[] {
  const result: SourceLine[] = [];
  let quote = '';
  let blockIndent: number | undefined;
  for (const [index, text] of source.split(/\r?\n/).entries()) {
    const indent = text.match(/^\s*/)?.[0].length ?? 0;
    if (blockIndent !== undefined) {
      if (!text.trim() || indent > blockIndent) continue;
      blockIndent = undefined;
    }
    let commentStart = text.length;
    for (let column = 0; column < text.length; column++) {
      const character = text[column];
      if (quote) {
        if (quote === '"' && character === '\\') column++;
        else if (character === quote) {
          if (quote === "'" && text[column + 1] === "'") column++;
          else quote = '';
        }
      } else if ((character === '"' || character === "'") && (column === 0 || /[\s:[{,\-]/.test(text[column - 1]))) {
        quote = character;
      } else if (character === '#' && (column === 0 || /\s/.test(text[column - 1]))) {
        commentStart = column;
        result.push({ text: text.slice(column), line: index + 1 });
        break;
      }
    }
    if (!quote && /(?:^|:\s*|-\s+)[|>][1-9+-]*\s*$/.test(text.slice(0, commentStart))) blockIndent = indent;
  }
  return result;
}

function collectIdentifiers(code: string): Set<string> {
  const names = new Set<string>();
  const tokens = code.match(/[A-Za-z_$][\w$]*|\.{3}|[^\s]/g) ?? [];
  const skip = (start: number, stops: Set<string>): number => {
    const closing: string[] = [];
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    for (let index = start; index < tokens.length; index++) {
      const token = tokens[index];
      if (!closing.length && (stops.has(token) || /^[)\]}]$/.test(token)
        || /^(?:const|let|var|export|function|class)$/.test(token))) return index;
      if (pairs[token]) closing.push(pairs[token]);
      else if (closing.at(-1) === token) closing.pop();
    }
    return tokens.length;
  };
  const add = (name: string) => {
    names.add(name);
    if (uppercaseName.test(name)) identifiers.add(name);
  };
  const binding = (start: number): number => {
    let index = start;
    if (tokens[index] === '...') index++;
    if (/^[A-Za-z_$][\w$]*$/.test(tokens[index] ?? '')) {
      add(tokens[index]);
      return index + 1;
    }
    const object = tokens[index] === '{';
    if (!object && tokens[index] !== '[') return index;
    const closing = object ? '}' : ']';
    index++;
    while (index < tokens.length && tokens[index] !== closing) {
      if (tokens[index] === ',') { index++; continue; }
      const begin = index;
      if (object && tokens[index] !== '...') {
        if (tokens[index] === '[') index = skip(index + 1, new Set([']'])) + 1;
        else if (tokens[index] !== ':') index++;
        if (tokens[index] === ':') index = binding(index + 1);
        else add(tokens[begin]);
      } else index = binding(index);
      if (tokens[index] === '=') index = skip(index + 1, new Set([',', closing]));
      if (index === begin) break;
      if (tokens[index] !== ',' && tokens[index] !== closing) break;
    }
    return tokens[index] === closing ? index + 1 : index;
  };
  for (let index = 0; index < tokens.length; index++) {
    if (!/^(?:const|let|var)$/.test(tokens[index])) continue;
    let next = index + 1;
    while (next < tokens.length) {
      const begin = next;
      next = binding(next);
      if (next === begin) break;
      if (tokens[next] === ':') next = skip(next + 1, new Set(['=', ',', ';']));
      if (tokens[next] === '=') next = skip(next + 1, new Set([',', ';', 'of', 'in']));
      if (tokens[next] !== ',') break;
      next++;
    }
  }
  for (const match of code.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const binding of match[1].split(',')) {
      const name = binding.trim().split(/\s+as\s+/).at(-1);
      if (name) add(name);
    }
  }
  for (const match of code.matchAll(/\benum\s+\w+\s*\{([^}]+)\}/g)) {
    for (const member of match[1].matchAll(/(?:^|,)\s*([A-Z][A-Z0-9_]*)\s*(?==|,|$)/g)) add(member[1]);
  }
  for (const match of code.matchAll(/\b(?:function\s*\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) add(match[1]);
  for (const match of code.matchAll(/\bimport\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const item of match[1].split(',')) {
      const name = item.trim().replace(/^type\s+/, '').split(/\s+as\s+/).at(-1);
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) add(name);
    }
  }
  for (const match of code.matchAll(/\bimport\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)|\bimport\s+\*\s+as\s+([A-Za-z_$][\w$]*)/g)) add(match[1] ?? match[2]);
  return names;
}

// Liest die alten Namen aus den Tabellen in lessons/shared/config.ts, damit es keine zweite Liste gibt.
function collectLegacyEnvironmentNames(source: string, code: string) {
  for (const name of ['replacedSettingsByNewName', 'sharedModelSettingsByNewName']) {
    const declaration = new RegExp(`\\bconst\\s+${name}\\b`).exec(code);
    if (!declaration) continue;
    const equals = code.indexOf('=', declaration.index + declaration[0].length);
    if (equals === -1) continue;
    const start = equals + 1 + (code.slice(equals + 1).match(/^\s*/)?.[0].length ?? 0);
    if (code[start] !== '{') continue;
    let depth = 1;
    let end = start + 1;
    while (end < code.length && depth) {
      if (code[end] === '{') depth++;
      if (code[end] === '}') depth--;
      end++;
    }
    const initializer = code.slice(start, end);
    const property = name === 'replacedSettingsByNewName'
      ? /(?:^|[,{])\s*[A-Z][A-Z0-9_]*\s*:/g
      : /\bpreviousName\s*:/g;
    for (const match of initializer.matchAll(property)) {
      const value = source.slice(start + match.index + match[0].length).match(/^\s*(['"])([A-Z][A-Z0-9_]*)\1/);
      if (value) legacyEnvironmentNames.add(value[2]);
    }
  }
}

function report(file: string, line: number, reference: string, reason: string, kind: CheckKind = 'identifiers') {
  failures.push({ file: path.relative(root, file), line, reference, reason, kind });
}

function checked(kind: keyof typeof counts, file: string, line: number, reference: string) {
  counts[kind]++;
  if (verbose) console.log(`${path.relative(root, file)}:${line}: [${kind}] ${reference}`);
}

function generated(filename: string): boolean {
  const relative = path.relative(root, filename).split(path.sep).join('/');
  return /^(?:indexes|results)(?:\/|$)/.test(relative)
    || /^content\/owasp-genai-top-10\/chunks(?:\/|$)/.test(relative);
}

// Anker wie auf GitHub: Kleinbuchstaben, Leerzeichen zu "-", Satzzeichen weg, Buchstaben samt Umlauten
// bleiben. Doppelte Überschriften bekommen "-1", "-2" (siehe `add` in `anchors`).
function headingSlug(text: string): string {
  return text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s-]/gu, '').replace(/\s/g, '-');
}

const anchorCache = new Map<string, Set<string>>();
const markdownCache = new Map<string, MarkdownMetadata>();

function markdownMetadata(filename: string): MarkdownMetadata {
  const cached = markdownCache.get(filename);
  if (cached) return cached;
  const metadata: MarkdownMetadata = { lines: [], headings: [], htmlAnchors: new Map(), tableRows: [] };
  const visible: string[] = [];
  let fence = '';
  let fenceLength = 0;
  let previous: SourceLine | undefined;
  for (const [index, text] of readFileSync(filename, 'utf8').split(/\r?\n/).entries()) {
    const line = index + 1;
    const marker = text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) { fence = marker[1][0]; fenceLength = marker[1].length; }
      else if (marker[1][0] === fence && marker[1].length >= fenceLength && !marker[2].trim()) fence = '';
      previous = undefined;
      visible.push('');
      continue;
    }
    if (fence) { visible.push(''); continue; }
    metadata.lines.push({ text, line });
    visible.push(text);
    const heading = text.match(/^ {0,3}(#{1,6})(?:\s+(.+?)\s*|\s*)$/);
    if (heading) metadata.headings.push({ text: (heading[2] ?? '').replace(/\s+#+\s*$/, ''), level: heading[1].length, line });
    else if (previous?.text.trim() && /^ {0,3}(?:=+|-+)\s*$/.test(text)) {
      metadata.headings.push({ text: previous.text.trim(), level: text.trim()[0] === '=' ? 1 : 2, line: previous.line });
    }
    if (/^\s*\|.*\|\s*$/.test(text) && !/^\s*\|[\s:|\-]+\|\s*$/.test(text)) metadata.tableRows.push(line);
    previous = { text, line };
  }
  const html = visible.join('\n').replace(/(`+)[\s\S]*?\1|<!--[\s\S]*?-->/g, match => match.replace(/[^\n]/g, ' '));
  for (const tag of html.matchAll(/<a\b((?:[^"'>]|"[^"]*"|'[^']*')*)>/gi)) {
    for (const attribute of tag[1].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      if (/^(?:id|name)$/i.test(attribute[1])) {
        const value = attribute[2] ?? attribute[3] ?? attribute[4];
        if (value) metadata.htmlAnchors.set(value, html.slice(0, tag.index).split('\n').length);
      }
    }
  }
  markdownCache.set(filename, metadata);
  return metadata;
}

function headingAnchors(metadata: MarkdownMetadata): Map<string, number> {
  const result = new Map<string, number>();
  metadata.headings.forEach((heading, index) => {
    const base = headingSlug(heading.text);
    let slug = base;
    let suffix = 0;
    while (result.has(slug)) slug = `${base}-${++suffix}`;
    result.set(slug, index);
  });
  return result;
}

function anchors(filename: string): Set<string> {
  const cached = anchorCache.get(filename);
  if (cached) return cached;
  const metadata = markdownMetadata(filename);
  const result = new Set([...headingAnchors(metadata).keys(), ...metadata.htmlAnchors.keys()]);
  anchorCache.set(filename, result);
  return result;
}

function checkFileReference(file: string, line: number, reference: string, kind: 'links' | 'paths') {
  if (!reference || (kind === 'links' && /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(reference))) return;
  if (/[*<>]/.test(reference)) return;
  let decoded: string;
  try { decoded = decodeURIComponent(reference); }
  catch {
    checked(kind, file, line, reference);
    report(file, line, reference, 'Invalid URL encoding', kind);
    return;
  }
  const hash = decoded.indexOf('#');
  const target = (hash === -1 ? decoded : decoded.slice(0, hash)).split('?')[0];
  if (template(target)) return;
  const fragment = hash === -1 ? '' : decoded.slice(hash + 1);
  const filename = target ? path.resolve(kind === 'paths' ? root : path.dirname(file), target) : file;
  if (generated(filename)) return;
  checked(kind, file, line, reference);
  if (!existsSync(filename)) {
    report(file, line, reference, kind === 'links' ? 'Link target does not exist' : 'Repository path does not exist', kind);
  } else if (fragment && /\.md$/i.test(filename) && statSync(filename).isFile() && !anchors(filename).has(fragment)) {
    report(file, line, reference, `Heading anchor does not exist: #${fragment}`, kind);
  }
}

function markdownLinks(text: string): string[] {
  const result: string[] = [];
  const withoutCode = text.replace(/(`+)(.*?)\1/g, match => ' '.repeat(match.length));
  const destination = (start: number): { value: string; end: number } => {
    let position = start;
    while (/\s/.test(withoutCode[position] ?? '') && position < withoutCode.length) position++;
    if (withoutCode[position] === '<') {
      const end = withoutCode.indexOf('>', position + 1);
      return { value: end === -1 ? '' : withoutCode.slice(position + 1, end), end };
    }
    const begin = position;
    let depth = 0;
    while (position < withoutCode.length) {
      const character = withoutCode[position];
      if (character === '\\') { position += 2; continue; }
      if (character === '(') depth++;
      if (character === ')') {
        if (depth === 0) break;
        depth--;
      }
      if (/\s/.test(character) && depth === 0) break;
      position++;
    }
    return { value: withoutCode.slice(begin, position).replace(/\\([()])/g, '$1'), end: position };
  };
  for (const match of withoutCode.matchAll(/\]\(\s*/g)) result.push(destination(match.index + match[0].length).value);
  const definition = withoutCode.match(/^ {0,3}\[[^\]]+\]:\s*/);
  if (definition) result.push(destination(definition[0].length).value);
  return result;
}

// Werte, die die Doku nennt: `source` liefert den echten Wert (Konstante im Code oder Schlüsselpfad in
// der YAML-Datei), `docRegex` findet die Nennung im Text, `part` grenzt auf einen Teil ein, wenn
// derselbe Name in mehreren Dateien vorkommt.
type ValueAssertion = {
  name: string;
  source: { file: string; extractor: string };
  docRegex: RegExp;
  part?: number;
  unit?: 'ms';
};

const valueAssertions: ValueAssertion[] = [
  { name: 'timeout', source: { file: 'lessons/08-evaluations/05-promptfoo-strategies.yaml', extractor: 'yaml:defaultTest.options.provider.config.timeout' }, docRegex: /\btimeout\b/g, part: 5, unit: 'ms' },
  { name: 'max_tokens', source: { file: 'lessons/08-evaluations/05-promptfoo-strategies.yaml', extractor: 'yaml:defaultTest.options.provider.config.max_tokens' }, docRegex: /\bmax_tokens\b/g, part: 5 },
  { name: 'temperature', source: { file: 'lessons/08-evaluations/05-promptfoo-strategies.yaml', extractor: 'yaml:defaultTest.options.provider.config.temperature' }, docRegex: /\btemperature\b/g, part: 5 },
  { name: 'faithful', source: { file: 'lessons/08-evaluations/05-promptfoo-strategies.yaml', extractor: 'yaml:defaultTest.assert[metric=faithful].threshold' }, docRegex: /\bfaithful\b/g, part: 5 },
  { name: 'MODEL_TIMEOUT_MS', source: { file: 'lessons/08-evaluations/evaluation.ts', extractor: 'const:MODEL_TIMEOUT_MS' }, docRegex: /\bMODEL_TIMEOUT_MS\b/g },
  { name: 'MAX_SUBSECTIONS_PER_HIT', source: { file: 'lessons/08-evaluations/evaluation.ts', extractor: 'const:MAX_SUBSECTIONS_PER_HIT' }, docRegex: /\bMAX_SUBSECTIONS_PER_HIT\b/g },
  { name: 'MAX_ADDED_SUBSECTIONS', source: { file: 'lessons/08-evaluations/evaluation.ts', extractor: 'const:MAX_ADDED_SUBSECTIONS' }, docRegex: /\bMAX_ADDED_SUBSECTIONS\b/g },
  { name: 'DISTANCE_PERCENTILE', source: { file: 'lessons/04-chunking/03-semantic-chunking.ts', extractor: 'const:DISTANCE_PERCENTILE' }, docRegex: /\bDISTANCE_PERCENTILE\b/g, part: 3 },
  { name: 'TOP_K', source: { file: 'lessons/08-evaluations/03-correctness.ts', extractor: 'const:TOP_K' }, docRegex: /\bTOP_K\b/g, part: 3 },
  { name: 'TOP_K', source: { file: 'lessons/08-evaluations/01-hitratio-mrr.ts', extractor: 'const:TOP_K' }, docRegex: /\bTOP_K\b/g, part: 1 },
  { name: 'EXPAND_SECTIONS', source: { file: 'lessons/08-evaluations/03-correctness.ts', extractor: 'const:EXPAND_SECTIONS' }, docRegex: /\bEXPAND_SECTIONS\b/g, part: 3 },
  { name: 'FULL_CORPUS', source: { file: 'lessons/04-chunking/04-question-generation-chunking.ts', extractor: 'const:FULL_CORPUS' }, docRegex: /\bFULL_CORPUS\b/g, part: 4 },
  { name: 'ALL_DOCUMENTS', source: { file: 'lessons/04-chunking/chunking.ts', extractor: 'const:ALL_DOCUMENTS' }, docRegex: /\bALL_DOCUMENTS\b/g },
  { name: 'QUESTIONS_PER_CHUNK', source: { file: 'lessons/04-chunking/04-question-generation-chunking.ts', extractor: 'const:QUESTIONS_PER_CHUNK' }, docRegex: /\bQUESTIONS_PER_CHUNK\b/g, part: 4 },
  { name: 'CHILD_SIZE', source: { file: 'lessons/04-chunking/05-parent-document.ts', extractor: 'const:CHILD_SIZE' }, docRegex: /\bCHILD_SIZE\b/g, part: 5 },
  { name: 'CHILD_SIZE', source: { file: 'lessons/05-retrieval-strategies/99-full-demo.ts', extractor: 'const:CHILD_SIZE' }, docRegex: /\bCHILD_SIZE\b/g, part: 5 },
  { name: 'CHILD_SIZE', source: { file: 'lessons/07-rag-open-webui/04-parent-document-rag.ts', extractor: 'const:CHILD_SIZE' }, docRegex: /\bCHILD_SIZE\b/g, part: 4 },
  { name: 'DEFAULT_TOP_K', source: { file: 'lessons/shared/index.ts', extractor: 'const:DEFAULT_TOP_K' }, docRegex: /\bDEFAULT_TOP_K\b/g },
  { name: 'DEFAULT_TOP_K', source: { file: 'lessons/08-evaluations/promptfoo-assistant.ts', extractor: 'const:DEFAULT_TOP_K' }, docRegex: /\bDEFAULT_TOP_K\b/g, part: 5 },
];

const sourceMetadata = new Map<string, SourceMetadata>();
const yamlDocuments = new Map<string, unknown>();
const assertionValues = new Map<ValueAssertion, number | boolean>();

type Scalar = number | boolean | string | null | undefined;
type LiteralDefinition = { name: string; file: string; line: number; value: Scalar };
const literalDefinitions = new Map<string, LiteralDefinition[]>();
const automaticClaims = new Set<string>();
const automaticComparisons = new Set<string>();
// Beispiele nennen absichtlich andere Zahlen: "(Beispiel)" im Satz oder `docs:check-ignore` davor.
const ignoredClaim = /\((?:Beispiel|example)\)|<!--\s*docs:check-ignore\s*-->/i;

// Aufgaben und Rücksetz-Zeilen (↺) nennen absichtlich andere Werte als den Standard.
function skipValueChecks(file: string, source: SourceLine): boolean {
  return exerciseLines.has(`${file}:${source.line}`) || /↺/.test(source.text);
}

// Liest ein Literal am Textanfang (Zahl, Text, true/false). Doku darf Dezimalkomma schreiben, Code nicht.
function scalarLiteral(text: string, decimalComma = true): { value: Scalar; length: number } | undefined {
  const match = text.match(decimalComma
    ? /^\s*`?\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|true\b|false\b|null\b|undefined\b|[-+]?\d[\d_]*(?:[.,]\d+)?)/
    : /^\s*`?\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|true\b|false\b|null\b|undefined\b|[-+]?\d[\d_]*(?:\.\d+)?)/);
  if (!match) return undefined;
  const raw = match[1];
  let value: Scalar;
  if (raw[0] === '"' || raw[0] === "'") {
    try {
      value = raw[0] === '"' ? JSON.parse(raw) : raw.slice(1, -1).replace(/\\(?:u([\da-f]{4})|x([\da-f]{2})|(.))/gi, (_, unicode: string, hex: string, character: string) => unicode || hex ? String.fromCharCode(parseInt(unicode || hex, 16)) : ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' }[character] ?? character));
    } catch { return undefined; }
  } else value = raw === 'true' ? true : raw === 'false' ? false : raw === 'null' ? null : raw === 'undefined' ? undefined : Number(raw.replaceAll('_', '').replace(',', '.'));
  return { value, length: match[0].length };
}

// Sammelt `const NAME = <Literal>` aus dem Code. Nur reine Literale zählen: Ausdrücke haben keinen
// festen Wert, den die Doku nennen könnte.
function collectLiteralDefinitions(file: string, metadata: SourceMetadata) {
  const initializers: { name: string; offset: number; start: number }[] = [];
  for (const match of metadata.code.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)(?:\s*:[^=;\n]+)?\s*=/g)) {
    const offset = match.index + match[0].length;
    initializers.push({ name: match[1], offset, start: match.index });
    const closing: string[] = [];
    for (let position = offset; position < metadata.code.length; position++) {
      const token = metadata.code[position];
      if (!closing.length && (token === ';' || /^(?:const|let|export|function|class)\b/.test(metadata.code.slice(position)))) break;
      if (!closing.length && token === ',') {
        const next = metadata.code.slice(position).match(/^,\s*([A-Za-z_$][\w$]*)(?:\s*:[^=;\n]+)?\s*=/);
        if (next) initializers.push({ name: next[1], offset: position + next[0].length, start: position + next[0].indexOf(next[1]) });
      }
      if (token === '(') closing.push(')');
      else if (token === '[') closing.push(']');
      else if (token === '{') closing.push('}');
      else if (token === closing.at(-1)) closing.pop();
    }
  }
  for (const { name, offset, start } of initializers) {
    const literal = scalarLiteral(metadata.source.slice(offset), false);
    if (!literal) continue;
    const rest = metadata.code.slice(offset + literal.length).split(/\r?\n/)[0];
    if (!/^\s*(?:as\s+const\s*)?(?:[,;}]|$)/.test(rest)) continue;
    const definition = { name, file, line: metadata.source.slice(0, start).split('\n').length, value: literal.value };
    literalDefinitions.set(definition.name, [...literalDefinitions.get(definition.name) ?? [], definition]);
  }
}

// Welche Definition meint die Doku? Gleicher Name in mehreren Dateien: erst die eigene Datei, dann eine
// genannte, dann die Lektion samt Teil. Bleibt es mehrdeutig, wird nicht geprüft.
function scopedLiteral(name: string, file: string, source: SourceLine, sentence: string): LiteralDefinition | undefined {
  const candidates = literalDefinitions.get(name) ?? [];
  const one = (values: LiteralDefinition[]) => {
    if (values.length === 1) return values[0];
    if (verbose) console.log(`${path.relative(root, file)}:${source.line}: [values] skipped ambiguous ${name}`);
    return undefined;
  };
  if (candidates.length === 1) return candidates[0];
  const current = candidates.filter(candidate => candidate.file === file);
  if (current.length) return one(current);
  const references = resolveSourceReferences(sentence, file);
  const explicit = candidates.filter(candidate => references.some(reference => reference.file === candidate.file));
  if (explicit.length) return one(explicit);
  const lesson = path.relative(root, file).match(/^lessons\/([^/]+)\//)?.[1];
  const local = candidates.filter(candidate => path.relative(root, candidate.file).startsWith(`lessons/${lesson}/`));
  if (local.length === 1) return local[0];
  const part = markdownCache.get(file)?.headings.filter(heading => heading.line <= source.line)
    .map(heading => heading.text.match(/^(?:Teil|Part)\s+(\d+)\b/i)?.[1]).filter(Boolean).at(-1);
  if (part) {
    const matching = local.filter(candidate => {
      const headerPart = sourceMetadata.get(candidate.file)?.lines.map(line => line.text.match(/(?:Erklärt|Explains|Explained):.*(?:Teil|Part)\s+(\d+)\b/i)?.[1]).find(Boolean);
      return Number(headerPart ?? path.basename(candidate.file).match(/^(\d+)-/)?.[1]) === Number(part);
    });
    if (matching.length === 1) return matching[0];
  }
  if (verbose) console.log(`${path.relative(root, file)}:${source.line}: [values] skipped ${candidates.length ? 'ambiguous' : 'absent literal'} ${name}`);
  return undefined;
}

// Automatische Wertprüfung: Steht neben einem Namen in Backticks eine Zahl ("`NAME` = 5", "`NAME` ist 5"),
// muss sie zum Code passen. Bei `_MS`-Namen wird eine Angabe in Sekunden umgerechnet.
function checkAutomaticClaims(file: string, source: SourceLine) {
  if (skipValueChecks(file, source)) return;
  const previous = sourceMetadata.get(file)?.source.split(/\r?\n/)[source.line - 2]
    ?? markdownCache.get(file)?.lines.find(line => line.line === source.line - 1)?.text ?? '';
  const ignoredPrevious = /^\s*(?:(?:\/\/|\/\*+|\*)\s*)?<!--\s*docs:check-ignore\s*-->\s*(?:\*\/)?\s*$/.test(previous);
  for (const sentence of source.text.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„“*`])/)) {
    for (const match of sentence.matchAll(/(`+)([^`]+)\1/g)) {
      const named = match[2].match(/^([A-Z][A-Z0-9_]*)\b([\s\S]*)$/);
      if (!named) continue;
      const name = named[1];
      const tail = named[2].trim() ? named[2] : sentence.slice(match.index + match[0].length);
      const connector = tail.match(/^\s*(?:=|:|\bist\b|\bis\b|\()\s*/i);
      if (!connector) continue;
      const literal = scalarLiteral(tail.slice(connector[0].length));
      if (!literal || typeof literal.value !== 'number') continue;
      automaticClaims.add(`${file}:${source.line}:${name}`);
      if (ignoredPrevious || ignoredClaim.test(sentence)) continue;
      const definition = scopedLiteral(name, file, source, sentence);
      if (!definition) continue;
      let actual = literal.value;
      const unit = tail.slice(connector[0].length + literal.length).match(/^`?\s*(ms|s|seconds?|Sekunden?)\b/i)?.[1];
      if (name.endsWith('_MS') && typeof actual === 'number' && unit && !/^ms$/i.test(unit)) actual *= 1000;
      const comparison = `${file}:${source.line}:${name}:${JSON.stringify(actual)}:${definition.file}`;
      if (automaticComparisons.has(comparison)) continue;
      automaticComparisons.add(comparison);
      checked('values', file, source.line, `${name}=${JSON.stringify(actual)} [${path.relative(root, definition.file)}:${definition.line}]`);
      if (actual !== definition.value) report(file, source.line, `${name}=${JSON.stringify(actual)}`, `Expected ${JSON.stringify(definition.value)} from ${path.relative(root, definition.file)}:${definition.line}`, 'values');
    }
  }
}

// Ein Kommentar "Standard: …" an einer Konstante muss deren Wert nennen, sonst läuft er dem Code davon.
function checkStandardComments(file: string, metadata: SourceMetadata) {
  const comments = new Map(metadata.lines.map(line => [line.line, line.text]));
  const code = metadata.code.split(/\r?\n/);
  for (const definition of [...literalDefinitions.values()].flat().filter(definition => definition.file === file)) {
    const nearby: SourceLine[] = [];
    if (comments.has(definition.line)) nearby.push({ text: comments.get(definition.line)!, line: definition.line });
    for (let line = definition.line - 1; line > 0 && comments.has(line) && !code[line - 1].trim(); line--) nearby.push({ text: comments.get(line)!, line });
    const standard = nearby.find(line => /\bStandard\s*:/i.test(line.text));
    if (!standard) continue;
    if (skipValueChecks(file, standard)) continue;
    const valueText = standard.text.slice(standard.text.search(/\bStandard\s*:/i)).replace(/^Standard\s*:/i, '');
    const literal = scalarLiteral(valueText);
    if (!literal) continue;
    checked('values', file, standard.line, `Standard ${definition.name}=${JSON.stringify(literal.value)}`);
    if (literal.value !== definition.value) report(file, standard.line, `Standard ${definition.name}=${JSON.stringify(literal.value)}`, `Expected ${JSON.stringify(definition.value)} from ${path.relative(root, file)}:${definition.line}`, 'values');
  }
}

// Schlüsselpfad wie `a.b[metric=faithful].c`: `[feld=wert]` wählt in einer Liste den Eintrag, weil die
// assert-Einträge keine Namen haben.
function keypathValue(value: unknown, keypath: string): unknown {
  for (const segment of keypath.matchAll(/([^.[\]]+)|\[([^\]]+)\]/g)) {
    if (!value || typeof value !== 'object') return undefined;
    const key = segment[1] ?? segment[2];
    if (Array.isArray(value) && key.includes('=')) {
      const [field, expected] = key.split('=');
      value = value.find(entry => entry && typeof entry === 'object' && String(entry[field]) === expected);
    } else value = (value as Record<string, unknown>)[key];
  }
  return value;
}

// Zeile für die Fehlermeldung: Der YAML-Parser liefert keine Zeilen je Pfad, deshalb wird der Pfad
// anhand der Einrückung im Text gesucht. Ist er nicht auffindbar, zeigt die Meldung die nächste Zeile.
function yamlLine(file: string, keypath: string): number {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const selector = keypath.match(/\[metric=([^\]]+)\]/)?.[1];
  const finalKey = keypath.split('.').at(-1) ?? keypath;
  let selected = !selector;
  let closestLine = 1;
  const stack: { indent: number; key: string }[] = [];
  for (const [index, text] of lines.entries()) {
    if (selector && new RegExp(`^\\s*metric:\\s*['"]?${selector}['"]?\\s*$`).test(text)) selected = true;
    const match = text.match(/^(\s*)(?:-\s+)?([\w-]+):/);
    if (!match) continue;
    const indent = match[1].length;
    while (stack.length && stack.at(-1)!.indent >= indent) stack.pop();
    stack.push({ indent, key: match[2] });
    if (!selector && keypath.startsWith(`${stack.map(entry => entry.key).join('.')}.`)) closestLine = index + 1;
    if (selected && (selector ? match[2] === finalKey : stack.map(entry => entry.key).join('.') === keypath)) return index + 1;
  }
  return closestLine;
}

function loadAssertionValues() {
  for (const assertion of valueAssertions) {
    const file = path.join(root, assertion.source.file);
    if (!existsSync(file)) {
      report(file, 1, assertion.name, 'Assertion source does not exist', 'values');
      continue;
    }
    const [extractor, ...parts] = assertion.source.extractor.split(':');
    const selector = parts.join(':');
    let value: unknown;
    if (extractor === 'yaml') value = keypathValue(yamlDocuments.get(file), selector);
    else {
      const code = sourceMetadata.get(file)?.code ?? typescriptParts(readFileSync(file, 'utf8')).code;
      const match = new RegExp(`\\b(?:const\\s+)?${selector}\\s*(?::[^=;\\n]+)?=\\s*(-?\\d[\\d_]*(?:\\.\\d+)?|true|false)\\b`).exec(code);
      if (match) value = match[1] === 'true' ? true : match[1] === 'false' ? false : Number(match[1].replaceAll('_', ''));
    }
    if (typeof value === 'number' || typeof value === 'boolean') assertionValues.set(assertion, value);
    else if (extractor === 'yaml') report(file, yamlLine(file, selector), selector, 'Assertion YAML value does not exist or is not numeric/boolean', 'values');
    else if (verbose) console.log(`${assertion.source.file}: [values] skipped absent ${assertion.name}`);
  }
}

// Die Doku nennt Dateien oft ohne Pfad (`evaluation.ts`). Sie werden gegen alle gelesenen Quellen
// aufgelöst; mehrere Treffer sind möglich.
function resolveSourceReferences(text: string, file: string): { file: string; index: number; end: number }[] {
  const result: { file: string; index: number; end: number }[] = [];
  for (const match of text.matchAll(/(?:[\w.-]+\/)*[\w.-]+\.ts\b/g)) {
    const reference = match[0];
    const direct = reference.startsWith('lessons/') || reference.startsWith('scripts/')
      ? path.join(root, reference) : path.resolve(path.dirname(file), reference);
    const candidates = sourceMetadata.has(direct) ? [direct]
      : [...sourceMetadata.keys()].filter(candidate => path.relative(root, candidate).endsWith(`/${reference}`));
    for (const candidate of candidates) result.push({ file: candidate, index: match.index, end: match.index + match[0].length });
  }
  return result;
}

// Welche Werte gelten an dieser Stelle? Erst die Datei selbst, dann eine genannte Quelldatei, dann die
// Lektion samt "Teil N"-Überschrift. Bleibt es mehrdeutig, wird nicht geprüft: lieber keine Meldung
// als eine falsche.
function sourceScope(file: string, line: number, text: string, assertions: ValueAssertion[]): ValueAssertion[] {
  const current = assertions.filter(assertion => path.join(root, assertion.source.file) === file);
  if (current.length) return current;
  const references = resolveSourceReferences(text, file);
  if (references.length) {
    const matched = assertions.filter(assertion => references.some(reference => reference.file === path.join(root, assertion.source.file)));
    if (matched.length) return matched;
    if (!assertions[0]?.source.extractor.startsWith('yaml:')) return [];
  }
  const relative = path.relative(root, file);
  if (/^lessons\//.test(relative)) {
    const lesson = relative.split('/')[1];
    const local = assertions.filter(assertion => assertion.source.file.split('/')[1] === lesson);
    if (!local.length) return assertions.filter(assertion => assertion.source.file === 'lessons/shared/index.ts' && lesson === '04-chunking');
    const part = markdownCache.get(file)?.headings.filter(heading => heading.line <= line)
      .map(heading => heading.text.match(/^(?:Teil|Part)\s+(\d+)\b/i)?.[1]).filter(Boolean).at(-1);
    const matching = part ? local.filter(assertion => !assertion.part || assertion.part === Number(part)) : local;
    return matching.length === 1 ? matching : [];
  }
  if (assertions[0]?.source.extractor.startsWith('yaml:') && !/judge|promptfoo|faithful/i.test(text)) return [];
  if (assertions.length === 1) return assertions;
  if (new Set(assertions.map(assertion => assertionValues.get(assertion))).size === 1) return assertions.slice(0, 1);
  if (verbose) console.log(`${path.relative(root, file)}:${line}: [values] skipped ambiguous ${assertions[0]?.name}`);
  return [];
}

// Tabellen: Die Spalte "Default/Standard" bestimmt, welche Zelle den Wert nennt; Spalten mit einem
// erwarteten Ergebnis werden übersprungen, weil sie den Zustand nach einer Aufgabe beschreiben können.
function checkValueClaims(file: string, source: SourceLine) {
  if (skipValueChecks(file, source)) return;
  const metadata = markdownCache.get(file);
  const preceding = metadata?.lines.filter(entry => entry.line <= source.line) ?? [];
  let header = '';
  if (source.text.trim().startsWith('|')) {
    for (const entry of preceding.toReversed()) {
      if (!entry.text.trim().startsWith('|')) break;
      header = entry.text;
    }
  }
  if (/expected result|erwartetes ergebnis/i.test(header)) return;
  const columns = header.split('|');
  const defaultColumn = columns.findIndex(column => /\b(?:default|standard)\b/i.test(column));
  const defaultCell = defaultColumn === -1 ? undefined : source.text.split('|')[defaultColumn];
  for (const text of source.text.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„“*`])/)) checkValueClaimSentence(file, { text, line: source.line }, defaultCell);
  checkValueClaimSentence(file, source, defaultCell, 'faithful');
}

// Aufgaben und Rücksetz-Hinweise nennen absichtlich andere Werte als den Standard. Geprüft werden
// deshalb nur Sätze, die den Standard meinen (Wort "default"/"standard" oder keine Aufgabenformulierung).
function checkValueClaimSentence(file: string, source: SourceLine, defaultCell?: string, onlyName?: string) {
  const { text, line } = source;
  if (ignoredClaim.test(text)) return;
  const explicitDefault = defaultCell !== undefined || /\b(?:default|standard)\b/i.test(text);
  if (!explicitDefault && (/\b(?:Setze|set|sets|change|changing|task|Aufgabe|exercise|Übung|try|probier|zurücksetzen|reset|raise|lower|afterwards|danach|restore|undo|anschließend)\b|↺/i.test(text)
    || /\b(?:with|mit|if|wenn|bei|hast du)\b[^.\n]*\b[A-Z][A-Z_]+\s*=\s*(?:false|true|\d)/i.test(text)
    || /\d\s*→\s*\d/.test(text))) return;
  const scalar = '(-?\\d[\\d_]*(?:\\.\\d+)?|true|false)';
  for (const name of new Set(valueAssertions.map(assertion => assertion.name))) {
    if (onlyName ? name !== onlyName : name === 'faithful') continue;
    if (automaticClaims.has(`${file}:${line}:${name}`)) continue;
    const candidates = valueAssertions.filter(assertion => assertion.name === name && assertionValues.has(assertion));
    if (!candidates.length) continue;
    if (name === 'faithful' && !/\b(?:threshold|schwelle)\b/i.test(text)) continue;
    if (defaultCell !== undefined && !text.split('|')[1]?.includes(name)) continue;
    const occurrences = [...text.matchAll(candidates[0].docRegex)];
    if (!occurrences.length) continue;
    const scoped = sourceScope(file, line, text, candidates);
    for (const assertion of scoped) {
      const expected = assertionValues.get(assertion)!;
      const references = resolveSourceReferences(text, file).filter(reference => reference.file === path.join(root, assertion.source.file));
      const referenceWindows = candidates.length > 1 ? references
        .map(reference => ({ before: '', after: text.slice(reference.end), index: reference.index }))
        .filter(window => /^[`"'\s]*(?:=|:)/.test(window.after)) : [];
      const windows = referenceWindows.length ? referenceWindows
        : occurrences.map(match => ({ before: text.slice(Math.max(0, match.index - 45), match.index), after: text.slice(match.index + match[0].length), index: match.index }));
      for (const window of windows) {
        const after = window.after.slice(0, 200);
        const patterns = [
          new RegExp('^[`"\\s]*(?:=|:)\\s*[`"]?' + scalar + '\\b', 'i'),
          new RegExp('^[`]*\\s*\\(\\s*' + scalar + '\\b', 'i'),
          new RegExp('^[`]*\\s+' + scalar + '\\b', 'i'),
          new RegExp('^[^;\\n]{0,150}?\\b(?:default|standard|threshold|schwelle)(?:-schwelle)?\\s*(?:is|of|von|:|=)?\\s*[`*]*' + scalar + '\\b', 'i'),
        ];
        let match = name === 'faithful'
          ? new RegExp('^[^\\n]{0,500}?\\b(?:threshold|schwelle)\\s*(?:is|of|von|:|=)?\\s*[`*]*' + scalar + '\\b', 'i').exec(after)
          : defaultCell === undefined ? patterns.map(pattern => pattern.exec(after)).find(Boolean)
          : new RegExp(typeof expected === 'boolean' ? '\\b(true|false)\\b' : scalar, 'i').exec(defaultCell);
        if (!match && text.trim().startsWith('|')) {
          match = new RegExp('\\|\\s*[`*]*' + scalar + '[`*]*\\s*\\|').exec(after);
        }
        if (!match) match = new RegExp('\\b(?:default|standard)\\s*[:=]?\\s*[`*]*' + scalar + '\\b[^.;\\n]*$', 'i').exec(window.before);
        if (!match) match = new RegExp(scalar + '\\s*\\([` ]*$', 'i').exec(window.before);
        if (!match) continue;
        const raw = match[1];
        let actual: number | boolean = raw.toLowerCase() === 'true' ? true : raw.toLowerCase() === 'false' ? false : Number(raw.replaceAll('_', ''));
        const unit = after.slice((match.index ?? 0) + match[0].length).match(/^\s*`?\s*(ms|s|seconds?|Sekunden?)\b/i)?.[1];
        if ((name.endsWith('_MS') || assertion.unit === 'ms') && typeof actual === 'number' && unit && !/^ms$/i.test(unit)) actual *= 1000;
        checked('values', file, line, `${name}=${String(actual)} [${assertion.source.file}]`);
        if (actual !== expected) report(file, line, `${name}=${raw}`, `Expected ${String(expected)} from ${assertion.source.file}`, 'values');
      }
    }
  }
}

// Festgelegte Versionen stehen nur in package.json (und im Kommentar UMGEHUNG, der eine Version nennt).
const dependencyVersions = new Map<string, string>(Object.entries({
  ...packageMetadata.peerDependencies, ...packageMetadata.optionalDependencies,
  ...packageMetadata.devDependencies, ...packageMetadata.dependencies,
}).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  .map(([name, version]) => [name, version.replace(/^[~^]\s*/, '')]));
const versionClaims = new Set<string>();
let qdrantImageTag: string | undefined;

function checkVersionClaim(file: string, line: number, name: string, version: string) {
  const key = `${file}:${line}:${name}:${version}`;
  if (versionClaims.has(key)) return;
  versionClaims.add(key);
  checked('versions', file, line, `${name}@${version}`);
  const expected = dependencyVersions.get(name);
  if (!expected) report(file, line, `${name}@${version}`, 'Package is not declared in package.json dependencies', 'versions');
  else if (version !== expected) report(file, line, `${name}@${version}`, `Expected ${expected} from package.json`, 'versions');
}

function checkVersions(file: string, source: SourceLine) {
  const semver = '(\\d+\\.\\d+\\.\\d+(?:[-+][\\w.-]+)?)';
  for (const name of dependencyVersions.keys()) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('(?<![\\w@/.-])' + escaped + '(?:`|\\s|@)+v?' + semver, 'g');
    for (const match of source.text.matchAll(pattern)) checkVersionClaim(file, source.line, name, match[1]);
  }
  const workaround = new RegExp('\\bUMGEHUNG\\s*\\(\\s*`?([@\\w./-]+)`?(?:\\s|@)+v?' + semver + '`?\\s*\\)', 'g');
  for (const match of source.text.matchAll(workaround)) checkVersionClaim(file, source.line, match[1], match[2]);
  for (const match of source.text.matchAll(/\bqdrant\/qdrant:([\w.-]+)/g)) {
    if (template(match[1])) continue;
    checked('versions', file, source.line, match[0]);
    if (!qdrantImageTag) report(file, source.line, match[0], 'Canonical Qdrant image tag is missing in .env.example', 'versions');
    else if (match[1] !== qdrantImageTag) report(file, source.line, match[0], `Expected qdrant/qdrant:${qdrantImageTag} from .env.example`, 'versions');
  }
}

// EXPECTED_FACADE_VERSION in facade.ts muss zur Paketversion in package.json passen, sonst warnt die
// Laufzeitprüfung in der Fassade zu Unrecht oder zu spät.
function checkFacadeVersion() {
  const file = path.join(root, 'lessons', 'shared', 'facade.ts');
  const definition = literalDefinitions.get('EXPECTED_FACADE_VERSION')?.find(definition => definition.file === file);
  if (!definition) report(file, 1, 'EXPECTED_FACADE_VERSION', existsSync(file) ? 'Facade version literal is missing' : 'Facade version source does not exist', 'versions');
  else checkVersionClaim(definition.file, definition.line, 'ollama-api-facade-js', String(definition.value));
}

function resolveMarkerFile(reference: string, file: string): string {
  return /^(?:lessons|docs|scripts)\//.test(reference) ? path.join(root, reference) : path.resolve(path.dirname(file), reference);
}

// "Erklärt: … GUIDE.de.md → „Teil N“" im Dateikopf muss auf eine echte Überschrift im Guide zeigen.
function checkGuideSections(file: string, source: SourceLine) {
  for (const match of source.text.matchAll(/((?:[\w.…/-]+\/)?GUIDE(?:\.de)?\.md)\s*(?:→|->)\s*[„“"'«]?(?:Teil|Part)\s+(\d+)\b/gi)) {
    const reference = match[1];
    if (template(reference)) continue;
    const target = resolveMarkerFile(reference, file);
    checked('guide-sections', file, source.line, `${reference} → Part ${match[2]}`);
    if (!existsSync(target)) report(file, source.line, reference, 'Guide does not exist', 'guide-sections');
    else if (!markdownMetadata(target).headings.some(heading => new RegExp(`^(?:Teil|Part)\\s+${match[2]}\\b`, 'i').test(heading.text))) {
      report(file, source.line, `${reference} → Part ${match[2]}`, 'Guide part heading does not exist', 'guide-sections');
    }
  }
}

// Die Marker LEHRKOPIE und SYNC mit Pfeil und Ziel kennzeichnen Kopien. Das Ziel muss existieren (bei
// YAML: der Schlüsselpfad), damit eine Kopie nicht auf ein umbenanntes Original zeigt.
function checkSyncMarkers(file: string, source: SourceLine) {
  for (const match of source.text.matchAll(/\b(?:LEHRKOPIE|SYNC)\s*\(\s*(?:→|->)\s*([^\s,)]+)/g)) {
    const reference = match[1];
    if (template(reference.split('#')[0])) continue;
    const [targetPath, symbol] = reference.split('#');
    const target = resolveMarkerFile(targetPath, file);
    checked('sync', file, source.line, reference);
    if (!existsSync(target)) report(file, source.line, reference, 'Copy source does not exist', 'sync');
    else if (symbol && target.endsWith('.ts') && !sourceMetadata.get(target)?.names.has(symbol)) {
      report(file, source.line, reference, 'Copy source symbol is not declared', 'sync');
    } else if (symbol && /\.ya?ml$/.test(target) && keypathValue(yamlDocuments.get(target), symbol) === undefined) {
      report(file, source.line, reference, 'Copy source YAML keypath does not exist', 'sync');
    }
  }
}

// Vergleicht geparste Werte statt Text: Kommentare und Einrückung dürfen abweichen, der Inhalt nicht.
function structuralDifferences(left: unknown, right: unknown, prefix = ''): string[] {
  if (Object.is(left, right)) return [];
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return [prefix];
  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  return [...new Set([...Object.keys(leftObject), ...Object.keys(rightObject)])].sort()
    .flatMap(key => structuralDifferences(leftObject[key], rightObject[key], prefix ? `${prefix}.${key}` : key));
}

// Judge-Block und `correct`-Rubrik stehen in Teil 5 und Teil 6 als Kopie und müssen gleich bleiben,
// sonst sind die Spalten nicht vergleichbar.
function checkYamlCopies() {
  const files = ['05-promptfoo-strategies.yaml', '06-promptfoo-black-box.yaml'].map(file => path.join(root, 'lessons', '08-evaluations', file));
  const providerKey = 'defaultTest.options.provider';
  const providers = files.map(file => keypathValue(yamlDocuments.get(file), providerKey));
  files.forEach((file, index) => {
    checked('sync', file, existsSync(file) ? yamlLine(file, providerKey) : 1, providerKey);
    if (!providers[index] || typeof providers[index] !== 'object') report(file, 1, providerKey, 'Judge provider block is missing', 'sync');
  });
  if (providers.every(provider => provider && typeof provider === 'object')) {
    for (const difference of structuralDifferences(providers[0], providers[1], providerKey)) {
      report(files[1], yamlLine(files[1], difference), difference, `YAML copy differs from ${path.relative(root, files[0])}`, 'sync');
    }
  }
  const rubricKey = 'defaultTest.assert[metric=correct]';
  const rubrics = files.map(file => keypathValue(yamlDocuments.get(file), rubricKey));
  const validRubrics = rubrics.map(rubric => rubric && typeof rubric === 'object'
    && (rubric as Record<string, unknown>).type === 'llm-rubric' && typeof (rubric as Record<string, unknown>).value === 'string');
  files.forEach((file, index) => {
    checked('sync', file, existsSync(file) ? yamlLine(file, `${rubricKey}.value`) : 1, `${rubricKey}.value`);
    if (!validRubrics[index]) report(file, 1, rubricKey, 'Correct llm-rubric value is missing', 'sync');
  });
  if (validRubrics.every(Boolean)) {
    const values = rubrics.map(rubric => (rubric as Record<string, unknown>).value);
    if (values[0] !== values[1]) report(files[1], yamlLine(files[1], `${rubricKey}.value`), `${rubricKey}.value`, `YAML copy differs from ${path.relative(root, files[0])}`, 'sync');
  }
}

// Nur Guides und docs: Ein Name in Backticks neben einer Quelldatei muss dort vorkommen. Steht kein
// "in Datei" direkt dahinter, genügt eine Deklaration irgendwo in den Lektionen.
function checkCamelNames(file: string, source: SourceLine) {
  const relative = path.relative(root, file);
  if (!/^(?:docs\/.*\.md|lessons\/[^/]+\/GUIDE[^/]*\.md)$/.test(relative)) return;
  const common = new Set(['npm', 'node', 'tsc', 'npx', 'true', 'false', 'null', 'undefined', 'timeout', 'temperature', 'threshold', 'label', 'config', 'provider', 'correct', 'faithful', 'public', 'internal', 'prepared', 'headings', 'semantic', 'questions', 'query', 'passage', 'json', 'default', 'file', 'string', 'number', 'boolean', 'text', 'url', 'output', 'context', 'metadata', 'sources', 'strategy', 'error', 'content', 'role', 'signal', 'german']);
  const sentences = source.text.trim().startsWith('|') ? [source.text] : source.text.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ„“*])/);
  for (const sentence of sentences) {
    const references = resolveSourceReferences(sentence, file);
    if (!references.length) continue;
    for (const match of sentence.matchAll(/`([a-z][a-zA-Z0-9]+)(?:\([^`]*\))?`/g)) {
      const name = match[1];
      if (common.has(name)) continue;
      const afterName = sentence.slice(match.index + match[0].length);
      const nextReference = references.find(reference => reference.index >= match.index + match[0].length);
      const direct = nextReference && /^\s+(?:in|from|aus)\s+`?/.test(afterName);
      const scope = direct ? [nextReference] : references;
      const targets = [...new Set(scope.map(reference => reference.file))];
      const declares = (metadata: SourceMetadata | undefined) => metadata && (metadata.names.has(name)
        || new RegExp(`\\b${name}\\s*(?:[:?]|=(?!=))|\\.${name}\\b`).test(metadata.code));
      const globallyDeclared = [...sourceMetadata].some(([target, metadata]) => path.relative(root, target).startsWith(`lessons${path.sep}`) && declares(metadata));
      if (!direct && globallyDeclared) continue;
      checked('identifiers', file, source.line, `${name} [${targets.map(target => path.relative(root, target)).join(', ')}]`);
      if (!targets.some(target => declares(sourceMetadata.get(target)))) {
        report(file, source.line, name, `Name is not declared in ${targets.map(target => path.relative(root, target)).join(', ')}`, 'identifiers');
      }
    }
  }
}

// Bringt Linkziele von DE und EN auf eine Form (`.de.md` → `.md`, Überschrift-Anker → Ebene und Nummer),
// weil die Anker je Sprache anders heißen.
function canonicalLink(file: string, reference: string): string | undefined {
  if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(reference) || /[*<>]/.test(reference)) return undefined;
  let decoded: string;
  try { decoded = decodeURIComponent(reference); } catch { return undefined; }
  const [rawTarget, fragment = ''] = decoded.split('#');
  const target = path.resolve(path.dirname(file), rawTarget.split('?')[0] || path.basename(file));
  if (template(rawTarget) || generated(target)) return undefined;
  let canonicalFragment = fragment;
  if (fragment && existsSync(target) && target.endsWith('.md')) {
    const metadata = markdownMetadata(target);
    const decisionId = path.basename(target).startsWith('decisions.') && metadata.headings.some(heading => heading.level === 2 && heading.text === fragment);
    if (!metadata.htmlAnchors.has(fragment) && !decisionId) {
      const index = headingAnchors(metadata).get(fragment);
      if (index !== undefined) canonicalFragment = `heading:${metadata.headings[index].level}:${index}`;
    }
  }
  return `${path.relative(root, target).replace(/\.de\.md$/, '.md')}#${canonicalFragment}`;
}

// Findet die Überschrift, die in der anderen Sprache fehlt. Die längste gemeinsame Teilfolge über die
// "Form" (Unterüberschriften, Listen, Tabellenzeilen) zeigt die Meldung an die richtige Stelle statt ans Ende.
function unmatchedHeadings(left: MarkdownMetadata, right: MarkdownMetadata, level: number): Heading[] {
  const a = left.headings.filter(heading => heading.level === level);
  const b = right.headings.filter(heading => heading.level === level);
  const shape = (metadata: MarkdownMetadata, heading: Heading) => {
    const end = metadata.headings.find(next => next.line > heading.line && next.level <= heading.level)?.line ?? Infinity;
    return JSON.stringify([
      metadata.headings.filter(next => next.line > heading.line && next.line < end).map(next => next.level),
      metadata.lines.filter(source => source.line > heading.line && source.line < end && /^\s*(?:[-*+] |\d+\. )/.test(source.text)).length,
      metadata.tableRows.filter(line => line > heading.line && line < end).length,
    ]);
  };
  const shapesA = a.map(heading => shape(left, heading));
  const shapesB = b.map(heading => shape(right, heading));
  const lengths = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    lengths[i][j] = shapesA[i] === shapesB[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  }
  const unmatched: Heading[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length) {
    if (j < b.length && shapesA[i] === shapesB[j]) { i++; j++; }
    else if (j < b.length && lengths[i][j + 1] > lengths[i + 1][j]) j++;
    else unmatched.push(a[i++]);
  }
  return unmatched;
}

// Vereinheitlicht Zahlen für den DE/EN-Vergleich: "1.234,5", "1,234.5" und "1234.5" sind dieselbe Zahl.
function normalizedNumber(raw: string): string {
  let value = raw.replace(/[\s_\u00a0\u202f]/g, '');
  const decimal = Math.max(value.lastIndexOf(','), value.lastIndexOf('.'));
  if (value.includes(',') && value.includes('.')) value = value.slice(0, decimal).replace(/[.,]/g, '') + '.' + value.slice(decimal + 1);
  else if (/^[1-9]\d{0,2}(?:[.,]\d{3})+$/.test(value)) value = value.replace(/[.,]/g, '');
  else value = value.replace(',', '.');
  return String(Number(value));
}

// Zahlen eines Abschnitts. Pfade, Links, Versionen, Hashes und einstellige Ganzzahlen bleiben außen vor,
// weil sie je Sprache gleich oder zufällig sind.
function sectionNumbers(lines: SourceLine[]): Map<string, number[]> {
  const result = new Map<string, number[]>();
  for (const source of lines) {
    if (/^\s*(?:`{3,}|~{3,})/.test(source.text)) continue;
    const text = source.text.replace(/\]\([^)]*\)|<[^>]*>|https?:\/\/[^\s)]+|(?:[a-z][\w.-]*\/)+[\w./#?=-]+|\b[\w.-]+\.(?:ts|ya?ml|md|json|html)\b|#[\w-]+|\b[\da-f]{16,}\b|(?<!\w)v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?/gi, ' ');
    for (const match of text.matchAll(/[-+]?\d+(?:[_ \u00a0\u202f]\d{3})*(?:[.,]\d+)*/g)) {
      const raw = match[0];
      const before = text[match.index - 1] ?? '';
      const after = text.slice(match.index + raw.length);
      if (/[\p{L}\d_]/u.test(before) || (/^[\p{L}\d_]/u.test(after) && !/^(?:ms|s|min|h|MB|GB|tokens?|er)\b/i.test(after))) continue;
      if ((before === '.' && /\d/.test(text[match.index - 2] ?? '')) || /^\.\d/.test(after)) continue;
      if (!/[.,]/.test(raw) && raw.replace(/\D/g, '').length < 2) continue;
      const value = normalizedNumber(raw);
      if (!/[.,]/.test(raw) && Math.abs(Number(value)) < 10) continue;
      if (value !== 'NaN') result.set(value, [...result.get(value) ?? [], source.line]);
    }
  }
  return result;
}

// Gepaarte Abschnitte (nach Überschrift) müssen gleich viele Zahlen und Vertiefungs-Blöcke haben.
// Fehlende Überschriften werden vorher ausgelassen, damit eine Lücke nicht alle Folge-Abschnitte verschiebt.
function checkSectionParity(german: string, english: string, left: MarkdownMetadata, right: MarkdownMetadata) {
  const omittedLeft = new Set<number>();
  const omittedRight = new Set<number>();
  for (let level = 1; level <= 6; level++) {
    const a = left.headings.filter(heading => heading.level === level);
    const b = right.headings.filter(heading => heading.level === level);
    if (a.length > b.length) for (const heading of unmatchedHeadings(left, right, level)) omittedLeft.add(heading.line);
    if (b.length > a.length) for (const heading of unmatchedHeadings(right, left, level)) omittedRight.add(heading.line);
  }
  const a = left.headings.filter(heading => !omittedLeft.has(heading.line));
  const b = right.headings.filter(heading => !omittedRight.has(heading.line));
  const bodies = (file: string, metadata: MarkdownMetadata, heading?: Heading): SourceLine[] => {
    const start = heading?.line ?? 0;
    const end = metadata.headings.find(next => next.line > start)?.line ?? Infinity;
    return readFileSync(file, 'utf8').split(/\r?\n/).map((text, index) => ({ text, line: index + 1 }))
      .filter(source => source.line > start && source.line < end);
  };
  const compare = (headingA?: Heading, headingB?: Heading) => {
    const linesA = bodies(german, left, headingA);
    const linesB = bodies(english, right, headingB);
    const numbersA = sectionNumbers(linesA);
    const numbersB = sectionNumbers(linesB);
    const section = headingA?.text ?? '(preamble)';
    for (const value of new Set([...numbersA.keys(), ...numbersB.keys()])) {
      const occurrencesA = numbersA.get(value) ?? [];
      const occurrencesB = numbersB.get(value) ?? [];
      if (occurrencesA.length === occurrencesB.length) continue;
      const moreGerman = occurrencesA.length > occurrencesB.length;
      const line = moreGerman ? occurrencesA[occurrencesB.length] : occurrencesB[occurrencesA.length];
      report(moreGerman ? german : english, line, `${moreGerman ? section : headingB?.text ?? '(preamble)'}: ${value}`, `${occurrencesA.length} German numeric occurrences; ${occurrencesB.length} English occurrences in paired section`, 'parity');
    }
    const dives = (lines: SourceLine[], metadata: MarkdownMetadata) => lines.filter(source => metadata.lines.some(visible => visible.line === source.line) && /^\s*>\s*\*\*(?:Vertiefung|Deep dive)\b/i.test(source.text));
    const divesA = dives(linesA, left);
    const divesB = dives(linesB, right);
    if (divesA.length !== divesB.length) {
      const moreGerman = divesA.length > divesB.length;
      const location = moreGerman ? divesA[divesB.length] : divesB[divesA.length];
      report(moreGerman ? german : english, location.line, `${moreGerman ? section : headingB?.text ?? '(preamble)'}: Deep dive blocks`, `${divesA.length} German blocks; ${divesB.length} English blocks in paired section`, 'parity');
    }
  };
  compare();
  for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index].level === b[index].level) compare(a[index], b[index]);
}

// DE und EN müssen inhaltlich gleich aufgebaut sein: Überschriften je Ebene, Anker, Entscheidungs-IDs,
// relative Linkziele und Tabellenzeilen.
function checkParity(markdownFiles: string[]) {
  for (const german of markdownFiles.filter(file => file.endsWith('.de.md'))) {
    const relative = path.relative(root, german);
    if (!/^(?:README[^/]*\.de\.md|docs\/.*\.de\.md|lessons\/[^/]+\/(?:GUIDE|FAQ|README)[^/]*\.de\.md)$/.test(relative)) continue;
    const english = german.replace(/\.de\.md$/, '.md');
    checked('parity', german, 1, path.relative(root, english));
    if (!existsSync(english)) { report(german, 1, path.relative(root, english), 'English counterpart is missing', 'parity'); continue; }
    const left = markdownMetadata(german);
    const right = markdownMetadata(english);
    const originalLinks = new Map<string, string>();
    checkSectionParity(german, english, left, right);
    for (let level = 1; level <= 6; level++) {
      const a = left.headings.filter(heading => heading.level === level);
      const b = right.headings.filter(heading => heading.level === level);
      if (a.length !== b.length) {
        const extra = a.length > b.length ? unmatchedHeadings(left, right, level)[0] : unmatchedHeadings(right, left, level)[0];
        const target = a.length > b.length ? german : english;
        report(target, extra?.line ?? 1, `Heading level ${level}`, `${a.length} German headings; ${b.length} English headings in ${path.relative(root, english)}`, 'parity');
      }
    }
    const compareSets = (a: Map<string, number>, b: Map<string, number>, label: string) => {
      for (const [reference, line] of a) if (!b.has(reference)) report(german, line, originalLinks.get(`${german}:${reference}`) ?? reference, `${label} is missing in ${path.relative(root, english)}`, 'parity');
      for (const [reference, line] of b) if (!a.has(reference)) report(english, line, originalLinks.get(`${english}:${reference}`) ?? reference, `${label} is missing in ${path.relative(root, german)}`, 'parity');
    };
    compareSets(left.htmlAnchors, right.htmlAnchors, 'Explicit anchor');
    if (path.basename(german).startsWith('decisions.')) {
      const decisions = (metadata: MarkdownMetadata) => new Map(metadata.headings.filter(heading => heading.level === 2 && /^[a-z\d]+(?:-[a-z\d]+)+$/.test(heading.text)).map(heading => [heading.text, heading.line]));
      compareSets(decisions(left), decisions(right), 'Decision ID');
    }
    const links = (file: string, metadata: MarkdownMetadata) => {
      const result = new Map<string, number>();
      for (const source of metadata.lines) for (const reference of markdownLinks(source.text)) {
        const canonical = canonicalLink(file, reference);
        if (canonical) {
          result.set(canonical, source.line);
          originalLinks.set(`${file}:${canonical}`, reference);
        }
      }
      return result;
    };
    compareSets(links(german, left), links(english, right), 'Relative link target');
    if (left.tableRows.length !== right.tableRows.length) {
      report(german, left.tableRows[right.tableRows.length] ?? left.tableRows.at(-1) ?? 1, 'Table rows', `${left.tableRows.length} German rows; ${right.tableRows.length} English rows in ${path.relative(root, english)}`, 'parity');
    }
  }
}

function checkLine(file: string, source: SourceLine, markdown: boolean) {
  const { text, line } = source;
  for (const match of text.matchAll(/\bnpm\s+run\s+(?:["']([^"']+)["']|([\w:@./…-]+))/g)) {
    const rawName = match[1] ?? match[2];
    if (template(rawName, true)) continue;
    const name = rawName.replace(/[.,;]+$/, '');
    if (template(name, true)) continue;
    checked('scripts', file, line, `npm run ${name}`);
    if (!scripts.has(name)) report(file, line, `npm run ${name}`, 'Script is not defined in package.json', 'scripts');
  }
  const links = markdownLinks(text);
  for (const reference of links) checkFileReference(file, line, reference, 'links');
  const withoutCode = text.replace(/(`+)(.*?)\1/g, match => ' '.repeat(match.length));
  for (const match of withoutCode.matchAll(/(?<![\w./-])(?:docs|lessons)\/[^\s"'`<>()[\]{},;]+?\.(?:md|ts|ya?ml)(?![\w-]|\.[\w-])(?:#[\wÀ-ſ-]+)?/g)) {
    if (!links.includes(match[0])) checkFileReference(file, line, match[0], 'paths');
  }
  checkGuideSections(file, source);
  checkSyncMarkers(file, markdown ? { text: withoutCode, line } : source);
  for (const match of text.matchAll(/(`+)([^`]+)\1/g)) {
    const reference = match[2].trim();
    const suffix = text.slice(match.index + match[0].length).match(/^_?[*…]/)?.[0] ?? '';
    const prefixReference = reference + suffix;
    const prefix = prefixReference.match(/^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_)[*…]$/)?.[1];
    if (markdown && prefix) {
      checked('identifiers', file, line, prefixReference);
      if (!externalEnvironmentWildcards[`${prefix}*`] && ![...environmentNames].some(name => name.startsWith(prefix))) {
        report(file, line, prefixReference, 'Environment prefix is not declared in .env.example');
      }
    // Quantisierungen wie Q4_K_M sehen wie Konstanten aus, sind aber Modell-Kennungen und werden übersprungen.
    } else if (markdown && uppercaseName.test(reference) && !/^Q\d+(_[A-Z0-9]+)*$/.test(reference)) {
      checked('identifiers', file, line, reference);
      if (!identifiers.has(reference) && !environmentNames.has(reference) && !legacyEnvironmentNames.has(reference)
        // PROMPTFOO_*: Schalter von promptfoo selbst (promptfoo.env), keine Konstanten der Lektionen.
        && !/^PROMPTFOO_[A-Z0-9_]+$/.test(reference)) {
        report(file, line, reference, 'Identifier is not declared in lesson TypeScript or .env.example');
      }
    }
    const rootPath = reference.replace(/^\.\//, '').split('#')[0];
    const first = rootPath.split('/')[0];
    if (!rootPath.includes('/') || !rootDirectories.has(first) || /[\s*<>]/.test(rootPath)) continue;
    if (template(rootPath)) continue;
    if (!rootPath.endsWith('/') && !path.extname(rootPath)) continue;
    checkFileReference(file, line, reference, 'paths');
  }
}

const files = walk(root);
const commentSources: { file: string; lines: SourceLine[] }[] = [];
const exerciseLines = new Set<string>();
for (const file of files) {
  if (!/^(?:lessons|scripts)[\\/]/.test(path.relative(root, file))) continue;
  if (file.endsWith('.ts')) {
    const source = readFileSync(file, 'utf8');
    const parts = typescriptParts(source);
    const names = collectIdentifiers(parts.code);
    const lines = parts.comments.split(/\r?\n/).map((text, index) => ({ text, line: index + 1 }));
    const codeLines = parts.code.split(/\r?\n/);
    // Aufgabenblöcke im Dateikopf (bis `Lesen:` oder zum ersten Code) nennen absichtlich andere Werte.
    let exercise = false;
    for (const entry of lines) {
      if (/\b(?:Aufgaben?|tasks?|exercises?)\s*:/i.test(entry.text)) exercise = true;
      if (/\b(?:Lesen|Reading)\s*:/.test(entry.text) || codeLines[entry.line - 1].trim()) exercise = false;
      if (exercise) exerciseLines.add(`${file}:${entry.line}`);
    }
    sourceMetadata.set(file, { source, code: parts.code, names, lines: lines.filter(entry => entry.text.trim()) });
    if (file === path.join(root, 'lessons', 'shared', 'config.ts')) collectLegacyEnvironmentNames(source, parts.code);
    commentSources.push({ file, lines: lines.filter(entry => entry.text.trim()) });
  } else if (/\.ya?ml$/.test(file)) {
    commentSources.push({ file, lines: yamlComments(readFileSync(file, 'utf8')) });
  }
}
const yamlFiles = files.filter(file => /\.ya?ml$/.test(file));
if (yamlFiles.length) {
  // Der Name steht in einer Variablen, damit tsc kein Typ-Paket für js-yaml verlangt.
  const yamlModule: string = 'js-yaml';
  const { load } = await import(yamlModule) as { load: (source: string) => unknown };
  for (const file of yamlFiles) {
    try { yamlDocuments.set(file, load(readFileSync(file, 'utf8'))); }
    catch (error) {
      const failure = error as { message?: string; mark?: { line?: number } };
      report(file, (failure.mark?.line ?? 0) + 1, 'YAML', failure.message ?? String(error), 'sync');
    }
  }
}
const environment = path.join(root, '.env.example');
if (existsSync(environment)) {
  for (const match of readFileSync(environment, 'utf8').matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)) environmentNames.add(match[1]);
}
for (const [file, metadata] of sourceMetadata) collectLiteralDefinitions(file, metadata);
for (const [file, metadata] of sourceMetadata) checkStandardComments(file, metadata);
if (existsSync(environment)) qdrantImageTag = readFileSync(environment, 'utf8').match(/\bqdrant\/qdrant:([\w.-]+)/)?.[1];
checkFacadeVersion();
loadAssertionValues();
const markdownFiles = files.filter(file => file.endsWith('.md'));
for (const file of markdownFiles) {
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((text, index) => {
    const source = { text, line: index + 1 };
    checkLine(file, source, true);
    checkVersions(file, source);
  });
  for (const source of markdownMetadata(file).lines) {
    checkAutomaticClaims(file, source);
    checkValueClaims(file, source);
    checkCamelNames(file, source);
  }
}
for (const source of commentSources) for (const line of source.lines) {
  checkLine(source.file, line, false);
  checkAutomaticClaims(source.file, line);
  checkVersions(source.file, line);
  checkValueClaims(source.file, line);
}
checkYamlCopies();
checkParity(markdownFiles);
if (verbose) console.log(`Checks: ${Object.entries(counts).map(([kind, count]) => `${kind}=${count}`).join(', ')}`);

if (failures.length) {
  for (const file of [...new Set(failures.map(failure => failure.file))].sort()) {
    console.error(`${file}:`);
    for (const failure of failures.filter(failure => failure.file === file).sort((a, b) => a.line - b.line)) {
      console.error(`  ${file}:${failure.line}: ${failure.reference} — [${failure.kind}] ${failure.reason}`);
    }
  }
  console.error(`Docs check failed: ${failures.length} invalid references.`);
  process.exitCode = 1;
} else {
  console.log(`Docs check passed: ${markdownFiles.length} Markdown files, ${commentSources.length} source files, ${Object.values(counts).reduce((sum, count) => sum + count, 0)} references.`);
}
