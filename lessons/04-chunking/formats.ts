// Dateiformate von Lektion 04: die Versionsnummer und das zod-Schema des Manifests. Teil 0
// (`00-prepare-chunks.ts`) schreibt das Manifest, `chunking.ts` liest und prüft es mit `manifestSchema`;
// Teil 1 bis 4 schreiben die Indexdateien, `shared/index.ts` liest und prüft sie (dort steht auch
// `INDEX_FORMAT_VERSION`). Eine Datei mit anderer Version oder Form wird mit der Meldung "neu erzeugen"
// abgelehnt, statt später unbemerkt falsche Ergebnisse zu liefern. Erhöhe die Zahl, wenn sich das
// Format ändert.

import { z } from 'zod';
import { SPECIAL_TOKEN_RESERVE } from '../shared/embeddings.ts';

// Format von `manifest.json` (die vorbereiteten Chunks aus Teil 0).
export const MANIFEST_FORMAT_VERSION = 3;

export const MANIFEST_FILE = 'manifest.json';
export const COUNTING_METHOD = {
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
