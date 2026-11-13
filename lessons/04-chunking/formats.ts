// Format von `manifest.json` aus Teil 0: Versionsnummer und zod-Schema. Eine Datei mit anderer Version
// oder Form wird mit „neu erzeugen“ abgelehnt, statt still falsche Ergebnisse zu liefern.
// Das Indexformat steht in shared/index.ts. Erklärt: lessons/04-chunking/GUIDE.de.md → „Teil 0“

import { z } from 'zod';
import { SPECIAL_TOKEN_RESERVE } from '../shared/embeddings.ts';

// Erhöhe die Zahl, wenn sich das Format ändert.
export const MANIFEST_FORMAT_VERSION = 3;

export const MANIFEST_FILE = 'manifest.json';
export const COUNTING_METHOD = {
  tokenizer: 'tokenizer',
  usage: 'embeddings-usage', overflow: 'embeddings-overflow', estimate: 'character-estimate',
} as const;
export const manifestSchema = z.object({
  format_version: z.literal(MANIFEST_FORMAT_VERSION),
  model: z.string().min(1),
  limit: z.number().int().positive(),
  passage_prefix: z.string(),
  special_token_reserve: z.literal(SPECIAL_TOKEN_RESERVE),
  counting_method: z.enum(COUNTING_METHOD),
  sources: z.array(z.object({
    file: z.string().min(1), sha256: z.string().min(1),
    chunks: z.array(z.object({
      file: z.string().min(1), source_start: z.number().int().nonnegative(),
      source_end: z.number().int().positive(), sha256: z.string().min(1), token_count: z.number().int().positive(),
    }).refine((chunk) => chunk.source_end > chunk.source_start)).min(1),
  })).min(1),
}).refine((manifest) => manifest.sources.every(({ chunks }) => chunks.every(({ token_count }) => token_count <= manifest.limit)));
export type Manifest = z.infer<typeof manifestSchema>;
export type CountingMethod = Manifest['counting_method'];
