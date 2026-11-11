// Lektion 07 – RAG, Teil 6: RAG mit Metadaten-Filter
//
// Lernziel: Du siehst, wie ein Metadaten-Filter (Lektion 05, Teil 3) im RAG-Ablauf bestimmt, welche
// Chunks das Modell überhaupt zu sehen bekommt, und was passiert, wenn der Filter nichts übrig lässt.
//
// Gegenüber Teil 1 (`01-heading-rag.ts`, die Referenz mit dem vollständigen Ablauf) ändern sich
// Trefferauswahl und Ablauf bei leerer Trefferliste. `metadataRetrieval` (aus `retrieval.ts`) behält
// vor dem Ranking nur Chunks, deren Metadaten `FILTER` erfüllen, und sucht erst dann die `TOP_K`
// ähnlichsten (Pre-Filter). Der Filter hier lässt nur Chunks aus den Dokumenten in `ALLOWED_SOURCES`
// durch (Metadatenfeld `source`), standardmäßig nur das Dokument zu Prompt Injection. Die
// Zugriffsgruppe prüft schon `loadRagIndex` beim Laden (siehe README, Zugriffsgruppen): Der Filter
// kommt zusätzlich dazu und kann den Kreis nur enger ziehen, nie weiter. Bleibt kein Chunk übrig
// (die Frage passt zu keinem erlaubten Dokument), antwortet das Programm mit der festen Antwort
// `NO_SOURCES_ANSWER` und ruft das Sprachmodell nicht auf, wie in Teil 7. Wichtig: Der Filter
// entscheidet nur, was gefunden werden darf. Auch ein erlaubtes Dokument liefert immer `TOP_K`
// Chunks, egal wie schlecht sie passen; erst ein Schwellenwert (Teil 7) schneidet nach Qualität.
//
// Es kann immer nur ein Teil von Lektion 07 laufen (gleicher Port, FACADE_PORT): Beende vorher
// den anderen mit Strg+C. In Open WebUI erscheint dieser Teil als Modell
// `lesson-07-metadata-filter`; lade bei Bedarf die Modellliste neu.
//
// Voraussetzungen: wie Teil 1, mit dem Index aus Lektion 04, Teil 2 (erst `npm run l04:0`, dann
// `npm run l04:2`). Burp ist optional.
// Start: npm run l07:6
//
// Aufgabe:
//   1. Stelle in Teil 1 und Teil 6 eine Frage zu einem anderen Dokument als Prompt Injection (z. B.
//      zur Lieferkette). Welche Quellen zeigt `RAG sources`, und was antwortet das Programm jeweils?
//      Warum ruft Teil 6 das Sprachmodell dafür gar nicht erst auf?
//   2. Stelle in Teil 6 eine Frage zu Prompt Injection ("Wie begrenze ich Prompt Injection?").
//      Kommen nur Quellen aus dem erlaubten Dokument, und wie unterscheiden sie sich von Teil 1?
//   3. Nimm in `ALLOWED_SOURCES` ein zweites Dokument auf (z. B.
//      '06-llm06-uebermaessige-handlungsfreiheit.md') und starte neu. Welche Fragen funktionieren
//      jetzt? Füge danach den Anhang (`11-appendix-…`) hinzu und frage nach der Bedrohungsmodellierung.
//      Kommt er in den Kontext? Warum nicht (siehe `loadRagIndex`)?
import { createRagAnswer, loadRagIndex, startRag } from './rag.ts';
import { metadataRetrieval, NO_SOURCES_ANSWER } from './retrieval.ts';
import type { ChunkMetadata } from '../shared/index.ts';
import { runMain } from '../shared/startup.ts';

// Name, unter dem die Fassade das Modell in Open WebUI anbietet.
const ADVERTISED_MODEL = 'lesson-07-metadata-filter';
// So viele Chunks kommen als Kontext in den Prompt.
const TOP_K = 3;
// Dokumente, deren Chunks die Suche überhaupt sehen darf (Dateiname wie in `metadata.source`).
const ALLOWED_SOURCES = ['01-llm01-prompt-injection.md'];
// Der Pre-Filter (Lektion 05, Teil 3): Nur Chunks, für die er true liefert, werden überhaupt gerankt.
// Er prüft nur das Dokument; die Zugriffsgruppe hat `loadRagIndex` schon geprüft.
const FILTER = (metadata: ChunkMetadata) => ALLOWED_SOURCES.includes(metadata.source);

async function main() {
  const index = loadRagIndex('headings');
  // `noSourcesAnswer`: Lässt der Filter nichts übrig, kommt diese feste Antwort ohne Modellaufruf.
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    answer: createRagAnswer(index, TOP_K, metadataRetrieval(FILTER), { noSourcesAnswer: NO_SOURCES_ANSWER }),
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
