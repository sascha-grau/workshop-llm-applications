// Hilfsmodul für Lektion 05: Index und Fragen-Set laden, MMR-Auswahl. Alle Teile laden denselben
// Index, damit sich die Strategien vergleichen lassen. Ranking und Indexdateien: shared/index.ts.
// `selectByMmr` hat eine Lehrkopie in 02-mmr.ts; ändere beide gemeinsam.
// Erklärt: lessons/05-retrieval-strategies/GUIDE.de.md

import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { cosineSimilarity } from '../shared/embeddings.ts';
import { indexFileFor, isPublicChunk, readIndex, type IndexEntry } from '../shared/index.ts';

// Standard: 'headings' (Lektion 04, Teil 2). Nicht dieselbe Konstante wie in
// lessons/06-hybrid-rerank/hybrid.ts; siehe docs/architecture.de.md#namensfallen.
export const INDEX_STRATEGY = 'headings';

// Relativ zu dieser Datei, nicht zum Arbeitsverzeichnis: So klappt der Start auch außerhalb des
// Repo-Roots.
export const QUESTION_SET_FILE = new URL('question-set.json', import.meta.url);

// Die Datei wird in Aufgaben von Hand bearbeitet. Ein Schema prüft sie, sonst fiele ein Tippfehler
// im Feldnamen erst als falsche Kennzahl auf. `withoutSource` hat leere `expectedSources`.
export const questionSchema = z.object({
  id: z.string(), question: z.string().trim().min(1), expectedSources: z.array(z.string()),
  keyPoint: z.string(), tags: z.array(z.string()),
});
export const questionSetSchema = z.object({ questions: z.array(questionSchema).min(1), withoutSource: questionSchema });

// Die Meldung nennt die Datei; das betroffene Feld hängt als `cause` daran.
export function loadQuestionSet(): z.infer<typeof questionSetSchema> {
  try {
    return questionSetSchema.parse(JSON.parse(readFileSync(QUESTION_SET_FILE, 'utf8')));
  } catch (cause) {
    throw new Error(`Cannot load the question set ${QUESTION_SET_FILE.pathname}. Check its JSON and fields.`, { cause });
  }
}

// Der ganze Index, auch interne Chunks. Nur für Teile, die selbst filtern oder keinen Chunk-Text an
// ein Sprachmodell geben.
export function loadIndex(): IndexEntry[] {
  return readIndex(INDEX_STRATEGY);
}

// Nur öffentliche Chunks (`isPublicChunk`), gefiltert vor der Suche: Interne Chunks können nie unter
// den Treffern landen. Siehe docs/decisions.de.md#pre-filter.
export function loadPublicIndex(): IndexEntry[] {
  const publicEntries = loadIndex().filter(({ metadata }) => isPublicChunk(metadata));
  if (!publicEntries.length) {
    throw new Error(`The index ${indexFileFor(INDEX_STRATEGY)} contains no public chunks.`);
  }
  return publicEntries;
}

// Original der MMR-Auswahl (Lehrkopie mit Erklärung: 02-mmr.ts). Wert eines Kandidaten =
// `lambda` × Relevanz − (1 − `lambda`) × Redundanz. `candidates` kommen absteigend sortiert.
export function selectByMmr<T extends { vector: number[]; similarity: number }>(candidates: T[], topK: number, lambda: number) {
  const remaining = [...candidates];
  const selected: (T & { redundancy: number })[] = [];
  while (selected.length < topK && remaining.length) {
    let best = { position: 0, score: -Infinity, redundancy: 0 };
    remaining.forEach((candidate, position) => {
      const redundancy = Math.max(0, ...selected.map(({ vector }) => cosineSimilarity(candidate.vector, vector)));
      const score = lambda * candidate.similarity - (1 - lambda) * redundancy;
      if (score > best.score) best = { position, score, redundancy };
    });
    const [winner] = remaining.splice(best.position, 1);
    selected.push({ ...winner, redundancy: best.redundancy });
  }
  return selected;
}
