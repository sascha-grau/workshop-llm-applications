// Lektion 05 – Retrieval-Strategien, Teil 4: Schwellenwert (Score Threshold)
//
// Lernziel: Du verstehst den Schwellenwert als Retrieval-Strategie, die nach Qualität statt nach
// Rang abschneidet: Nur Chunks mit einer Mindest-Ähnlichkeit zur Frage kommen in den Prompt. Du
// siehst, warum der passende Wert vom Embedding-Modell abhängt und ausgemessen werden muss.
//
// Teil 1 hat gezeigt: Top-k liefert immer genau k Chunks, auch wenn keiner zur Frage passt. Ein
// Schwellenwert dreht das um: Die Anzahl der Treffer ist offen, dafür gibt es eine Untergrenze
// für die Ähnlichkeit. Passt nichts, bleibt die Trefferliste leer, und die Anwendung kann "dazu
// steht nichts in den Dokumenten" antworten, statt aus unpassendem Kontext zu raten. Schritte:
//   1. Index laden: der Überschriften-Index aus Lektion 04, Teil 2, nur öffentliche Chunks (wie in
//      Teil 1).
//   2. Fragen einbetten, mit dem E5-Präfix "query: " (`embeddingQuery` setzt es davor): eine Frage,
//      die die Dokumente beantworten, und eine, zu der sie nichts sagen.
//   3. Ranken: je Frage die besten `MAX_K` Chunks nach Ähnlichkeit (Top-k aus Teil 1). `MAX_K`
//      bleibt als Obergrenze, damit ein zu niedriger Schwellenwert den Prompt nicht sprengt.
//   4. Abschneiden: Je Wert in `THRESHOLDS` bleiben nur die Treffer, deren Ähnlichkeit mindestens
//      so hoch ist. Die Ausgabe zeigt je Frage die Kandidaten und wie viele je Schwellenwert
//      übrig bleiben.
//
// Merke: Ein Schwellenwert gilt nur für ein Embedding-Modell und eine Art von Texten. Bei E5
// liegen auch unpassende Treffer oft bei 0,7 bis 0,8 (siehe Lektion 03); ein Wert wie 0,5, der
// bei anderen Modellen sinnvoll ist, lässt hier alles durch. Miss den Wert an eigenen Fragen aus:
// solchen mit und solchen ohne Antwort in den Dokumenten. Liegen beide Gruppen nah beieinander,
// trennt kein Schwellenwert sie sauber: Ein hoher Wert verwirft gute Treffer, ein niedriger lässt
// Rauschen durch. Dann hilft kein Drehen am Wert; es braucht eine zweite Prüfung, z. B. ein
// Sprachmodell, das offen sagt, wenn der Kontext die Frage nicht beantwortet (Lektion 07). In der
// Praxis kombiniert man Schwellenwert und Top-k.
// Ein Schwellenwert ist eine Qualitätsregel, kein Schutz: Er hält keine internen Chunks zurück
// (dafür ist der Filter aus Teil 3 da) und keine manipulierten Texte. Wer einen Text in den Index
// schmuggelt, kann ihn so schreiben, dass er der erwarteten Frage sehr ähnlich ist.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und geladenem E5-Modell; der Index aus
// Lektion 04, Teil 2 muss existieren (erst `npm run l04:0`, dann `npm run l04:2`). Ein Chat-Modell
// und Open WebUI braucht dieser Teil nicht. Burp ist optional.
// Start: npm run l05:4   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Vergleiche die beiden Fragen in `QUESTIONS`. Welcher Wert aus `THRESHOLDS` lässt bei der
//      ersten Frage Treffer durch und bei der zweiten keinen? Wie groß ist der Abstand zwischen
//      dem schlechtesten Treffer der ersten und dem besten der zweiten Frage?
//   2. Ergänze in `QUESTIONS` eine eigene Frage, die die Dokumente beantworten (z. B. "Welche
//      Risiken entstehen durch zu viele Berechtigungen?"). Lässt der Schwellenwert aus Aufgabe 1
//      auch hier die passenden Treffer durch?
//   3. Ergänze eine Frage, die nach Sicherheit klingt, aber nicht in den Dokumenten steht (z. B.
//      "Wie sichere ich mein WLAN zu Hause ab?"). Findest du einen Schwellenwert, der sie von
//      allen beantwortbaren Fragen trennt?
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, rankEntries, sectionPath } from '../shared/index.ts';
import { loadPublicIndex, INDEX_STRATEGY } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Die Fragen, zu denen passende Chunks gesucht werden: die erste beantworten die Dokumente (wie in
// Teil 1), die zweite nicht.
const QUESTIONS = ['Wie begrenze ich Prompt Injection?', 'Wie wird das Wetter morgen?'];
// Die Obergrenze für die Anzahl der Treffer. Der Schwellenwert kann weniger liefern, nie mehr.
const MAX_K = 5;
// NEU: Die Schwellenwerte, die das Programm nacheinander zeigt: die Mindest-Ähnlichkeit zur Frage,
// die ein Chunk braucht. Es sind Beispielwerte, an diesem Index mit E5 gemessen: 0,5 lässt alles
// durch (E5 geht kaum unter 0,7), 0,82 trennt die beiden Fragen, 0,88 verwirft auch gute Treffer.
// Mit einem anderen Modell oder anderen Dokumenten musst du neu messen.
const THRESHOLDS = [0.5, 0.82, 0.88];
// Die Regel des Schwellenwerts: Ein Chunk bleibt, wenn seine Ähnlichkeit mindestens so hoch ist.
const passes = (similarity: number, threshold: number) => similarity >= threshold;

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Die Anfragen zeigen die gesendeten Fragen
  // und die rohen Vektoren der Antworten.
  useBurpIfConfigured();

  // Schritt 1: Index laden und filtern (`loadPublicIndex` in retrieval.ts), wie in Teil 1.
  const index = loadPublicIndex();
  console.log(`Index: ${index.length} public chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  for (const question of QUESTIONS) {
    try {
      await logInvocation('Search', { model: remoteEmbeddingModel.name, question }, async () => {
        // Schritt 2: Frage einbetten, mit demselben Modell und dem Präfix "query: " wie in Teil 1.
        const queryVector = await embeddings.embedQuery(embeddingQuery(question));
        // Schritt 3: Ranken. Die besten `MAX_K` Chunks sind die Kandidaten für alle Schwellenwerte.
        const candidates = rankEntries(index, queryVector, MAX_K);

        console.log(`Candidates for “${question}”: top ${candidates.length} by similarity`);
        console.table(candidates.map(({ metadata, similarity }, position) => ({
          rank: position + 1,
          similarity: similarity.toFixed(3),
          // NEU: Schritt 4: Abschneiden. Je Schwellenwert eine Spalte: Bleibt der Chunk oder nicht?
          ...Object.fromEntries(THRESHOLDS.map((threshold) => [`≥ ${threshold}`, passes(similarity, threshold) ? 'keep' : '–'])),
          file: metadata.source,
          section: sectionPath(metadata.headingPath),
        })));

        for (const threshold of THRESHOLDS) {
          // Die Kandidaten sind absteigend sortiert: Die Treffer sind immer der Anfang der Liste.
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

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
