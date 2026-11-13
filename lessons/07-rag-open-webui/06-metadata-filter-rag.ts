// Lektion 07 – RAG, Teil 6: RAG mit Metadaten-Filter
//
// Lernziel: Ein Filter vor der Suche (Lektion 05, Teil 3) bestimmt, welche Chunks das Modell sehen kann.
// Braucht:  Index aus `npm run l04:0` und `npm run l04:2`, sonst wie Teil 1.
//           Nur ein Teil von Lektion 07 zur Zeit (gleicher FACADE_PORT): den laufenden mit Strg+C beenden.
// Start:    npm run l07:6   (oder F5), Modell `lesson-07-metadata-filter`
// Erklärt:  lessons/07-rag-open-webui/GUIDE.de.md → „Teil 6“
//
// Aufgabe:
//   1. Frage "Welche Risiken gibt es in der Lieferkette?": Woher stammen die Quellen, was antwortet das Modell?
//   2. In `ALLOWED_SOURCES` '03-llm03-lieferkette.md' ergänzen, neu starten, dieselbe Frage: Was ändert sich?
//      ↺ Danach `ALLOWED_SOURCES` auf ['01-llm01-prompt-injection.md'] und neu starten.
//   3. `ALLOWED_SOURCES` nur mit '11-appendix-llm-application-architecture-and-threat-modeling.md',
//      neu starten, beliebige Frage: Was antwortet die Anwendung, und warum?
//      ↺ Danach `ALLOWED_SOURCES` auf ['01-llm01-prompt-injection.md'] und neu starten.
//
// Lesen: die Zeilen `// KERN 1–2`. Der Rest des Ablaufs ist wie in Teil 1.
import { createRagAnswer, loadRagIndex, startRag } from './rag.ts';
import { metadataRetrieval, NO_SOURCES_ANSWER } from './retrieval.ts';
import type { ChunkMetadata } from '../shared/index.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-07-metadata-filter';
// Standard: 3. Auch ein schlecht passendes erlaubtes Dokument liefert so viele Chunks.
const TOP_K = 3;
// Standard: nur das Dokument zu Prompt Injection (Dateiname wie in `metadata.source`).
const ALLOWED_SOURCES = ['01-llm01-prompt-injection.md'];
// KERN 1: Nur Chunks, für die der Filter true liefert, werden gerankt. Er kann den Kreis nur
// enger ziehen: Interne Dokumente hat `loadRagIndex` schon vorher entfernt.
const FILTER = (metadata: ChunkMetadata) => ALLOWED_SOURCES.includes(metadata.source);

async function main() {
  const index = loadRagIndex('headings');
  // KERN 2: Bleibt kein erlaubter Chunk übrig, kommt `NO_SOURCES_ANSWER` ohne Modellaufruf.
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    answer: createRagAnswer(index, TOP_K, metadataRetrieval(FILTER), { noSourcesAnswer: NO_SOURCES_ANSWER }),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
