// Lektion 05 – Retrieval-Strategien, Teil 4: Schwellenwert (Score Threshold)
//
// Lernziel: Ein Schwellenwert schneidet nach Mindest-Ähnlichkeit; sein Wert muss gemessen werden.
// Braucht:  wie Teil 1 (Index `headings`, LM Studio mit E5).
// Start:    npm run l05:4   (oder F5)
// Erklärt:  lessons/05-retrieval-strategies/GUIDE.de.md → „Teil 4“
//
// Aufgabe:
//   1. Welcher Wert in `THRESHOLDS` lässt bei der ersten Frage Treffer durch, bei der zweiten keinen?
//      Wie groß ist der Abstand zwischen dem schlechtesten Treffer der ersten und dem besten der zweiten?
//   2. Ergänze in `QUESTIONS` 'Welche Risiken entstehen durch zu viele Berechtigungen?': Kommen ihre
//      passenden Treffer über diesen Wert?  ↺ Danach die Frage wieder entfernen.
//   3. Ergänze 'Wie sichere ich mein WLAN zu Hause ab?' (klingt nach Sicherheit, steht nicht im
//      Korpus): Trennt ein Wert sie von allen beantwortbaren Fragen?  ↺ Danach wieder entfernen.
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Ausgabe.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, rankEntries, sectionPath } from '../shared/index.ts';
import { loadPublicIndex, INDEX_STRATEGY } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Standard: eine Frage, die die Dokumente beantworten (wie in Teil 1), und eine, die sie nicht beantworten.
const QUESTIONS = ['Wie begrenze ich Prompt Injection?', 'Wie wird das Wetter morgen?'];
// Standard: 5. Obergrenze, damit ein zu niedriger Schwellenwert den Prompt nicht sprengt.
const MAX_K = 5;
// Standard: [0.5, 0.82, 0.88]. Der erste Wert ist bei anderen Modellen üblich, die beiden anderen
// sind für E5 und diesen Index gewählt. Anderes Modell oder andere Dokumente = neu messen.
const THRESHOLDS = [0.5, 0.82, 0.88];
// KERN 2: Ein Chunk bleibt, wenn seine Ähnlichkeit mindestens so hoch ist. Eine Qualitätsregel,
// kein Schutz: Sie hält weder interne Chunks zurück (dafür Teil 3) noch untergeschobene Texte.
const passes = (similarity: number, threshold: number) => similarity >= threshold;

async function main() {
  useBurpIfConfigured();

  const index = loadPublicIndex();
  console.log(`Index: ${index.length} public chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  for (const question of QUESTIONS) {
    try {
      await logInvocation('Search', { model: remoteEmbeddingModel.name, question }, async () => {
        const queryVector = await embeddings.embedQuery(embeddingQuery(question));
        // KERN 1: Ranken wie in Teil 1. Die besten `MAX_K` sind die Kandidaten für alle Schwellenwerte.
        const candidates = rankEntries(index, queryVector, MAX_K);

        console.log(`Candidates for “${question}”: top ${candidates.length} by similarity`);
        console.table(candidates.map(({ metadata, similarity }, position) => ({
          rank: position + 1,
          similarity: similarity.toFixed(3),
          ...Object.fromEntries(THRESHOLDS.map((threshold) => [`≥ ${threshold}`, passes(similarity, threshold) ? 'keep' : '–'])),
          file: metadata.source,
          section: sectionPath(metadata.headingPath),
        })));

        for (const threshold of THRESHOLDS) {
          // KERN 3: Die Zahl der Treffer ist offen, auch null. Dann gibt es keinen Kontext, und die
          // Anwendung sollte "steht nicht in den Dokumenten" antworten, statt zu raten.
          const hits = candidates.filter(({ similarity }) => passes(similarity, threshold));
          console.log(
            `Threshold ${threshold}: ${hits.length} of ${candidates.length} candidates` +
            (hits.length ? '' : ' – no context, the application should answer “not in the documents”'),
          );
        }
      });
    } catch {
      // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
      process.exitCode = 1;
    }
  }
}

await runMain(main);
