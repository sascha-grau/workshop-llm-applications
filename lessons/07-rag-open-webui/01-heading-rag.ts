// Lektion 07 – RAG, Teil 1: RAG mit Überschriften-Chunks
//
// Lernziel: RAG von Anfang bis Ende: Chunks suchen, als Kontext in den Prompt legen, antworten lassen.
// Braucht:  Index aus `npm run l04:0` und `npm run l04:2`, LM Studio mit Chat- und E5-Modell, Open WebUI.
//           Nur ein Teil von Lektion 07 zur Zeit (gleicher FACADE_PORT): den laufenden mit Strg+C beenden.
// Start:    npm run l07:1   (oder F5), dann in Open WebUI das Modell `lesson-07-headings` wählen
// Erklärt:  lessons/07-rag-open-webui/GUIDE.de.md → „Teil 1“
//
// Aufgabe:
//   1. Frage "Wie wird das Wetter morgen?": Was antwortet das Modell, und welche Quellen stehen darunter?
//   2. `TOP_K` auf 1, neu starten, "Wie begrenze ich Prompt Injection?"; dann dasselbe mit 8.
//      Wie ändern sich Länge der Antwort und die höchste zitierte Nummer [n]?
//      ↺ Danach `TOP_K` auf 3 und neu starten.
//   3. `ENABLE_INJECTION_DEMO` auf true, neu starten, dieselbe Frage: Antwortet das Modell nur "HALLO"?
//      ↺ Danach `ENABLE_INJECTION_DEMO` auf false und neu starten.
//
// Lesen: die Zeilen `// KERN 1–6`. Der Rest ist Handwerk.
import { embeddingQuery } from '../shared/embeddings.ts';
import { log } from '../shared/logging.ts';
import { sendChatStream } from '../shared/stream.ts';
import { formatSourceList } from '../shared/text.ts';
import { rankEntries } from '../shared/index.ts';
import { contextFor, embedRagQuestion, loadRagIndex, promptFor, sourceLabelFor, startRag, withInjection } from './rag.ts';
import { runMain } from '../shared/startup.ts';

// Unter diesem Namen erscheint der Teil im Modell-Dropdown von Open WebUI.
const ADVERTISED_MODEL = 'lesson-07-headings';
// Standard: 3. Mehr = mehr Kontext, längerer Prompt (Top-k, Lektion 05, Teil 1).
const TOP_K = 3;
// Standard: false. true hängt an den ersten Treffer eine eingeschmuggelte Anweisung (Aufgabe 3).
const ENABLE_INJECTION_DEMO = false;

async function main() {
  // KERN 1: Index einmal beim Start laden. `loadRagIndex` behält nur öffentliche Chunks: Was nie
  // im Kontext steht, kann das Modell nicht ausplaudern (Pre-Filter, Lektion 05, Teil 3).
  const index = loadRagIndex('headings');
  await startRag({
    advertisedModel: ADVERTISED_MODEL,
    // LEHRKOPIE (→ rag.ts#createRagAnswer): die Schritte pro Frage, hier ausgeschrieben zum Lesen.
    answer: async ({ question, messages, systemPrompts, chatModel, chatResponse, signal }) => {
      // KERN 2: Frage einbetten, mit E5-Präfix "query: " und gekürzt auf das Limit von E5.
      const queryVector = await embedRagQuestion(embeddingQuery(question), signal);
      // KERN 3: Ranken, die `TOP_K` ähnlichsten Chunks. Hier würden MMR oder ein Schwellenwert anders wählen.
      const ranked = rankEntries(index, queryVector, TOP_K);
      const hits = ENABLE_INJECTION_DEMO ? withInjection(ranked) : ranked;
      signal.throwIfAborted();
      log('INFO', 'RAG sources', { sources: hits.map(sourceLabelFor) });
      // KERN 4: Kontext bauen. Chunks sind fremde Daten und können Anweisungen enthalten (indirekte
      // Prompt Injection); der Block <retrieved_context> und der System-Prompt mindern das nur.
      const context = contextFor(hits);
      // KERN 5: Prompt bauen; `hits.length` ist N in "zitiere nur [1] bis [N]".
      const prompt = promptFor(question, messages, systemPrompts, context, hits.length);
      // KERN 6: Streamen. Die Quellenliste hängt der Code an, nicht das Modell:
      // Kleine Modelle lassen Quellen aus oder erfinden welche.
      const stream = await chatModel.stream(prompt, { signal });
      await sendChatStream(chatResponse, stream, signal, { footer: formatSourceList(hits.map(sourceLabelFor)) });
    },
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
