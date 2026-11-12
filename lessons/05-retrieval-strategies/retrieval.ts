// Gemeinsame Hilfsfunktionen für Lektion 05 (erstmals in 01-top-k.ts benutzt): das Laden des
// Index, das in allen Teilen identisch sein muss, damit sich die Strategien vergleichen lassen,
// das Laden des Fragen-Sets `question-set.json` (Teil 5 und Lektion 08) und die MMR-Auswahl `selectByMmr`.
// Sie wird von `99-full-demo.ts` (Teil 5) mitbenutzt. Teil 2 (`02-mmr.ts`) enthält dieselbe
// Rechnung absichtlich noch einmal im Text der Datei, damit man sie dort Schritt für Schritt
// lesen kann (Lehrkopie); ändere beide Stellen gemeinsam.
// Ranking, Indexdateien und die Anzeige des Überschriftenpfads liegen in
// `shared/index.ts` (`rankEntries`, `readIndex`, `sectionPath`); die Teile importieren sie von
// dort direkt. Hier liegen:
// - loadIndex: alle Chunks (Teil 3 und 5; Lektion 08, Teil 1 und 4)
// - loadPublicIndex: nur öffentliche Chunks (Teil 1, 2 und 4; Lektion 08, Teil 2 und 3)
// - loadQuestionSet: das geprüfte Fragen-Set (Teil 5; Lektion 08, Teil 1 und 3 bis 6)
// - selectByMmr: MMR-Auswahl (Teil 5; Teil 2 hat eine eigene Lehrkopie)

import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { cosineSimilarity } from '../shared/embeddings.ts';
import { indexFileFor, isPublicChunk, readIndex, type IndexEntry } from '../shared/index.ts';

// Alle Teile durchsuchen denselben Index: den Überschriften-Index aus Lektion 04, Teil 2, den auch
// Lektion 06 (Qdrant) und Lektion 07, Teil 1 laden.
export const INDEX_STRATEGY = 'headings';

// Das Fragen-Set liegt neben dieser Datei. Der Pfad ist relativ zur Datei gebildet, nicht zum
// Arbeitsverzeichnis: So findet ihn das Programm auch, wenn du es nicht aus dem Repo-Root startest.
// Teil 5 (Kalibrierung des Schwellenwerts) und Lektion 08, Teil 1 (Trefferquote und MRR) lesen
// dieselbe Datei, damit beide Messungen auf denselben Fragen beruhen und sich vergleichen lassen.
// Lektion 08 importiert Pfad und Loader von hier, so wie Lektion 07 aus Lektion 05 importiert.
export const QUESTION_SET_FILE = new URL('question-set.json', import.meta.url);

// Die Form des Fragen-Sets. Die Datei ist Eingabe von außen (du bearbeitest sie in den Aufgaben von
// Hand), deshalb prüft ein Schema sie, statt dem JSON zu vertrauen: Ein Tippfehler in einem
// Feldnamen fiele sonst erst als falsche Kennzahl auf. `expectedSources` sind die Dateinamen der
// Dokumente, in denen die Antwort steht; `keyPoint` und `tags` beschreiben die Frage für Menschen
// und werden hier nicht ausgewertet. `withoutSource` ist die eine Frage, zu der nichts im Korpus
// steht (leere `expectedSources`): Sie prüft den Schwellenwert und zählt bei Trefferquote und MRR
// (Lektion 08, Teil 1) nicht mit.
export const questionSchema = z.object({
  id: z.string(), question: z.string().trim().min(1), expectedSources: z.array(z.string()),
  keyPoint: z.string(), tags: z.array(z.string()),
});
export const questionSetSchema = z.object({ questions: z.array(questionSchema).min(1), withoutSource: questionSchema });

// Lädt und prüft das Fragen-Set. Fehlt die Datei, ist das JSON kaputt oder passt ein Feld nicht,
// nennt die Meldung die Datei; die Ursache (z. B. das betroffene Feld) hängt als `cause` daran.
export function loadQuestionSet(): z.infer<typeof questionSetSchema> {
  try {
    return questionSetSchema.parse(JSON.parse(readFileSync(QUESTION_SET_FILE, 'utf8')));
  } catch (cause) {
    throw new Error(`Cannot load the question set ${QUESTION_SET_FILE.pathname}. Check its JSON and fields.`, { cause });
  }
}

// Lädt den Index vollständig, mit öffentlichen und internen Chunks (Teil 3 filtert selbst; Teil 5
// und Lektion 08, Teil 1 arbeiten bewusst auf dem ganzen Index). Fehlt
// die Datei oder ist sie veraltet, sagt die Meldung, welche npm-Skripte sie erzeugen.
export function loadIndex(): IndexEntry[] {
  return readIndex(INDEX_STRATEGY);
}

// Lädt den Index und behält nur öffentliche Chunks. Die Regel dafür ist `isPublicChunk` in
// shared/index.ts, dieselbe wie in Lektion 07: `internal` (der Anhang, siehe INTERNAL_DOCUMENTS
// dort) fliegt vor der Suche raus und kann nie unter den Treffern landen. Teil 1, 2 und 4 und
// Lektion 08, Teil 2 und 3 nutzen diese Funktion; Teil 3 zeigt, was der Filter bewirkt.
export function loadPublicIndex(): IndexEntry[] {
  const publicEntries = loadIndex().filter(({ metadata }) => isPublicChunk(metadata));
  if (!publicEntries.length) {
    throw new Error(`The index ${indexFileFor(INDEX_STRATEGY)} contains no public chunks.`);
  }
  return publicEntries;
}

// MMR-Auswahl (Teil 2 hat eine identische Lehrkopie; diese hier nutzt Teil 5): wählt `topK` Kandidaten nacheinander. Der Wert eines
// Kandidaten ist `lambda` × Relevanz − (1 − `lambda`) × Redundanz, wobei Redundanz seine höchste
// Ähnlichkeit zu einem schon gewählten Chunk ist. `lambda` = 1 ist reines Top-k. Die Kandidaten
// kommen sortiert nach Ähnlichkeit, der Erste gewinnt die erste Runde (Redundanz 0).
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

