// Lektion 05 – Retrieval-Strategien, Teil 1: Top-k
//
// Lernziel: Top-k behält die k ähnlichsten Chunks und schneidet nach Rang, nicht nach Qualität.
// Braucht:  Index `headings` (`npm run l04:0`, dann `npm run l04:2`), LM Studio mit E5.
// Start:    npm run l05:1   (oder F5)
// Erklärt:  lessons/05-retrieval-strategies/GUIDE.de.md → „Teil 1“
//
// Aufgabe:
//   1. Aus wie vielen Dokumenten stammen die Top 8? Zeigt "gap to previous" einen deutlichen Sprung?
//   2. Setze `QUESTION` auf 'Wie wird das Wetter morgen?': Sage vorher, wie viele Treffer kommen, dann prüfe es.
//      Wie hoch sind die Ähnlichkeiten?
//      ↺ Danach zurücksetzen: `QUESTION` auf 'Wie begrenze ich Prompt Injection?'.
//   3. Setze `QUESTION` auf 'Welche Risiken entstehen durch zu viele Berechtigungen?' und ergänze in
//      `TOP_K_VALUES` größere Werte: Ab welchem k sind alle passenden Dokumente dabei?
//      ↺ Danach zurücksetzen: `QUESTION` wie in Aufgabe 2, `TOP_K_VALUES` auf [1, 3, 8].
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Ausgabe.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { CHARACTERS_PER_TOKEN, embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, rankEntries, sectionPath } from '../shared/index.ts';
import { loadPublicIndex, INDEX_STRATEGY } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Standard: 'Wie begrenze ich Prompt Injection?', dieselbe Frage wie `DEMO_QUESTION` in Lektion 04.
const QUESTION = 'Wie begrenze ich Prompt Injection?';
// Standard: [1, 3, 8]. Größer = mehr Kontext, aber auch mehr Rauschen im Prompt.
const TOP_K_VALUES = [1, 3, 8];

async function main() {
  useBurpIfConfigured();

  // KERN 1: Nur öffentliche Chunks, gefiltert vor der Suche: Der interne Anhang kann nie unter den
  // Treffern landen. Warum vorher und nicht nachher, zeigt Teil 3.
  const index = loadPublicIndex();
  console.log(`Index: ${index.length} public chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Search', { model: remoteEmbeddingModel.name, question: QUESTION }, async () => {
      const queryVector = await embeddings.embedQuery(embeddingQuery(QUESTION));
      // KERN 2: Einmal ranken, für das größte k. Jedes kleinere k ist der Anfang dieser Liste.
      const ranked = rankEntries(index, queryVector, Math.max(...TOP_K_VALUES));

      for (const topK of TOP_K_VALUES) {
        // KERN 3: Abschneiden. Top-k behält die ersten k Treffer, egal wie gut sie passen.
        const hits = ranked.slice(0, topK);
        const characterCount = hits.reduce((sum, { text }) => sum + text.length, 0);
        console.log(
          `Top ${topK} for “${QUESTION}”: ${hits.length} chunks, ${characterCount} characters` +
          ` (about ${Math.ceil(characterCount / CHARACTERS_PER_TOKEN)} tokens of context)`,
        );
        console.table(hits.map(({ metadata, similarity }, position) => ({
          rank: position + 1,
          similarity: similarity.toFixed(3),
          // Abstand zum Platz davor: Ein großer Sprung zeigt, wo die passenden Treffer enden.
          'gap to previous': position === 0 ? '–' : (hits[position - 1].similarity - similarity).toFixed(3),
          file: metadata.source,
          // Der Überschriftenpfad ohne Dokumenttitel; "–" steht für Text direkt unter dem Titel.
          section: sectionPath(metadata.headingPath),
        })));
      }
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

await runMain(main);
