// Lektion 05 – Retrieval-Strategien, Teil 1: Top-k
//
// Lernziel: Du verstehst Top-k als einfachste Retrieval-Strategie: alle Chunks nach Ähnlichkeit zur
// Frage sortieren und die besten k behalten. Du siehst, was ein kleines und ein großes k bewirkt.
//
// Retrieval heißt: zu einer Frage die passenden Chunks aus dem Index holen. Lektion 04 hat das am
// Ende jedes Teils schon getan (`searchTop`, immer die besten drei). Eine Retrieval-Strategie ist
// die Regel, welche Chunks dabei übrig bleiben. Wozu das wichtig ist, zeigt Lektion 07 (RAG): Dort
// bekommt das Sprachmodell die gefundenen Chunks als Kontext in den Prompt und antwortet daraus.
// Was die Suche nicht liefert, kann es nicht wissen; was sie zu viel liefert, lenkt es ab.
//
// Hier steht die Suche deshalb allein, ohne Sprachmodell und ohne Open WebUI: Das Programm gibt
// für mehrere Werte von k aus, welche Chunks in den Prompt kämen. Neu in dieser Datei sind die
// gemeinsamen Hilfsfunktionen aus `retrieval.ts` (Index laden); Teil 2 bis 5 nutzen sie wieder.
// Schritte:
//   1. Index laden: der Überschriften-Index aus Lektion 04, Teil 2. Es bleiben nur öffentliche
//      Chunks (Zugriffsgruppe "public"); der Filter läuft vor der Suche. Warum, zeigt Teil 3.
//   2. Frage einbetten, mit dem E5-Präfix "query: " (`embeddingQuery` setzt es davor).
//   3. Ranken: Kosinus-Ähnlichkeit zu jedem Chunk, absteigend sortiert (`rankEntries`).
//   4. Abschneiden: Je Wert in `TOP_K_VALUES` bleiben die ersten k Treffer. Die Tabelle zeigt sie
//      mit Ähnlichkeit, Abstand zum Platz davor und geschätzter Länge des Kontexts.
//
// Merke: Top-k schneidet nach Rang, nicht nach Qualität. Es liefert immer genau k Chunks, auch
// wenn nur einer passt oder gar keiner (z. B. bei einer Frage zum Wetter). Bei E5 liegen auch
// unpassende Treffer oft bei 0,7 bis 0,8 (siehe Lektion 03); vergleiche die Reihenfolge und die
// Abstände, nicht die absoluten Werte. Ein kleines k übersieht Stellen, ein großes bringt
// Rauschen (Chunks, die nichts zur Antwort beitragen), einen längeren Prompt und eine langsamere
// Antwort.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und geladenem E5-Modell; der Index aus
// Lektion 04, Teil 2 muss existieren (erst `npm run l04:0`, dann `npm run l04:2`). Ein Chat-Modell
// und Open WebUI braucht dieser Teil nicht. Burp ist optional.
// Start: npm run l05:1   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Vergleiche die Tabellen für die Werte in `TOP_K_VALUES`. Aus wie vielen Dokumenten stammen
//      die acht Treffer, und sagen einige von ihnen fast dasselbe? Zeigt die Spalte "gap to
//      previous" einen deutlichen Sprung, an dem die passenden Treffer enden? (Erwartung: nein,
//      die Werte liegen dicht beieinander. Top-k verrät also nicht, wie viele Treffer gut sind.)
//   2. Ändere `QUESTION` in eine Frage, die die Dokumente nicht beantworten können (z. B. "Wie
//      wird das Wetter morgen?"). Wie viele Treffer liefert Top-k, und wie hoch sind die
//      Ähnlichkeiten im Vergleich zur ersten Frage?
//   3. Stelle eine Frage, deren Antwort in mehreren Dokumenten steht (z. B. "Welche Risiken
//      entstehen durch zu viele Berechtigungen?"). Welches k brauchst du, damit alle passenden
//      Dokumente unter den Treffern sind, und wie lang wird der Kontext dabei?
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { CHARACTERS_PER_TOKEN, embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, rankEntries, sectionPath } from '../shared/index.ts';
import { loadPublicIndex, INDEX_STRATEGY } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Die Frage, zu der passende Chunks gesucht werden (dieselbe wie `DEMO_QUESTION` in Lektion 04).
const QUESTION = 'Wie begrenze ich Prompt Injection?';
// Die Werte von k, die das Programm nacheinander zeigt. Die Suche läuft nur einmal; k entscheidet
// nur, wie viele Treffer vom Anfang des Rankings bleiben.
const TOP_K_VALUES = [1, 3, 8];

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Die Anfrage zeigt die gesendete Frage und
  // den rohen Vektor der Antwort.
  useBurpIfConfigured();

  // Schritt 1: Index laden und filtern (`loadPublicIndex` in retrieval.ts). Nur öffentliche
  // Chunks: `internal` (der Anhang) fliegt vor der Suche raus und kann nie unter den Treffern
  // landen. Teil 3 macht diesen Filter zum Thema.
  const index = loadPublicIndex();
  console.log(`Index: ${index.length} public chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Search', { model: remoteEmbeddingModel.name, question: QUESTION }, async () => {
      // Schritt 2: Frage einbetten, mit demselben Modell und dem Präfix "query: " wie bei der
      // Suche in Lektion 04.
      const queryVector = await embeddings.embedQuery(embeddingQuery(QUESTION));
      // NEU: Schritt 3: Ranken, einmal für das größte k. Jedes kleinere k ist der Anfang dieser Liste.
      const ranked = rankEntries(index, queryVector, Math.max(...TOP_K_VALUES));

      for (const topK of TOP_K_VALUES) {
        // NEU: Schritt 4: Abschneiden. Top-k behält die ersten k Treffer, egal wie gut sie passen.
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

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
