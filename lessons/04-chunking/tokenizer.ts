// Lektion 04 – Teil 0: Tokens exakt und lokal zählen, mit dem Tokenizer von E5 (multilingual-e5-base).
// Er braucht keinen Server und ist deshalb unabhängig davon, wie LM Studio zählt oder kürzt.
// Die Tokenizer-Dateien (~16 MB) kommen beim ersten Aufruf nach `.cache/tokenizers/` (nicht eingecheckt);
// `npm run tokenizer:fetch` lädt sie vorab, der Ordner lässt sich für Offline-Teilnehmende kopieren.
// Erklärt: lessons/04-chunking/GUIDE.de.md → „Teil 0“ · Entscheidung: docs/decisions.de.md#exakter-tokenizer
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Tokenizer } from '@huggingface/tokenizers';
import { rootPath } from '../shared/paths.ts';

// Feste Revision und SHA256-Summen: Ein anderer oder beschädigter Tokenizer würde still falsche Zahlen
// liefern, und "main" auf Hugging Face kann sich ändern.
export const E5_TOKENIZER = {
  model: 'intfloat/multilingual-e5-base',
  revision: 'd128750597153bb5987e10b1c3493a34e5a4502a',
  files: {
    'tokenizer.json': '62c24cdc13d4c9952d63718d6c9fa4c287974249e16b7ade6d5a85e7bbb75626',
    'tokenizer_config.json': 'efb5c0d09722e5fe59a462cd2a9976ee216d55b037597d997cd3fe833216da15',
  },
} as const;

export const tokenizerCacheDirectory = rootPath('.cache', 'tokenizers', E5_TOKENIZER.model, E5_TOKENIZER.revision);
export type TokenCounter = (input: string) => number;

// Lädt den Tokenizer aus dem Cache. Fehlt eine Datei, wird sie einmal heruntergeladen und geprüft;
// ohne Download (`allowDownload: false`) oder bei falscher Summe gibt es einen Fehler.
export async function loadE5TokenCounter({ cacheDirectory = tokenizerCacheDirectory, allowDownload = true } = {}): Promise<TokenCounter> {
  const data: Record<string, object> = {};
  for (const [name, checksum] of Object.entries(E5_TOKENIZER.files)) {
    const path = join(cacheDirectory, name);
    let bytes: Buffer;
    try {
      bytes = await readFile(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !allowDownload) throw error;
      const response = await fetch(`https://huggingface.co/${E5_TOKENIZER.model}/resolve/${E5_TOKENIZER.revision}/${name}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`Tokenizer download failed: HTTP ${response.status} (${name}).`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error(`Tokenizer checksum mismatch: ${name}.`);
      await mkdir(cacheDirectory, { recursive: true });
      // Erst in eine temporäre Datei, dann umbenennen: Ein abgebrochener Download hinterlässt keine halbe Datei.
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, bytes);
        await rename(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error(`Tokenizer checksum mismatch: ${name}.`);
    data[name] = JSON.parse(bytes.toString('utf8'));
  }
  const tokenizer = new Tokenizer(data['tokenizer.json'], data['tokenizer_config.json']);
  // Mit Start- und End-Token: E5 setzt sie um jede Eingabe, und sie zählen gegen das Limit. Den Text
  // samt Präfix `passage: ` übergibt der Aufrufer.
  return (input) => tokenizer.encode(input, { add_special_tokens: true }).ids.length;
}
