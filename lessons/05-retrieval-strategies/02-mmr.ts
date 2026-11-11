// Lektion 05 – Retrieval-Strategien, Teil 2: MMR (Maximal Marginal Relevance)
//
// Lernziel: Du verstehst MMR als Retrieval-Strategie, die neben der Ähnlichkeit zur Frage auch die
// Ähnlichkeit der Treffer untereinander beachtet. Du siehst, wie `LAMBDA` zwischen Relevanz und
// Vielfalt abwägt.
//
// Teil 1 hat gezeigt (Aufgabe 1): Top-k liefert oft mehrere Chunks, die fast dasselbe sagen (alle
// aus einem Dokument). Jeder davon belegt Platz im Prompt, bringt aber kaum neue Information. MMR
// wählt die Treffer deshalb einzeln nacheinander und zieht jedem Kandidaten Punkte ab, wenn er
// einem schon gewählten Chunk ähnelt. Schritte:
//   1. Index laden: der Überschriften-Index aus Lektion 04, Teil 2, nur öffentliche Chunks (wie in
//      Teil 1).
//   2. Frage einbetten, mit dem E5-Präfix "query: " (`embeddingQuery` setzt es davor).
//   3. Kandidaten holen: die besten `FETCH_K` Chunks nach Ähnlichkeit (Top-k aus Teil 1). Nur aus
//      ihnen wählt MMR aus.
//   4. Auswählen: `TOP_K` Runden. In jeder Runde gewinnt der Kandidat mit dem höchsten Wert
//        LAMBDA × Relevanz − (1 − LAMBDA) × Redundanz
//      Relevanz ist die Ähnlichkeit zur Frage (`similarity`), Redundanz die höchste Ähnlichkeit zu
//      einem schon gewählten Chunk (`redundancy`). Ein Beispiel mit LAMBDA = 0,5:
//        Kandidat A: Relevanz 0,88, Redundanz 0,91  →  0,5 × 0,88 − 0,5 × 0,91 = −0,015
//        Kandidat B: Relevanz 0,85, Redundanz 0,87  →  0,5 × 0,85 − 0,5 × 0,87 = −0,010
//      B gewinnt, obwohl A besser zur Frage passt: A wiederholt zu viel von dem, was schon gewählt
//      ist. Negative Werte sind normal; es zählt nur, welcher Kandidat den höchsten Wert hat. Die
//      Tabelle zeigt je Wert in `LAMBDA_VALUES` die Auswahl neben dem Platz, den der
//      Chunk bei Top-k hätte.
//
// Merke: `LAMBDA = 1` ist reines Top-k, `LAMBDA = 0` achtet nur noch auf Vielfalt und nimmt auch
// unpassende Chunks. MMR braucht keinen weiteren Modellaufruf: Die Vektoren der Chunks stehen
// schon im Index. MMR findet nichts, was nicht unter den `FETCH_K` Kandidaten ist, und es prüft
// nicht, ob ein Chunk die Frage beantwortet; "anders als die bisherigen" heißt nicht "nützlich".
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und geladenem E5-Modell; der Index aus
// Lektion 04, Teil 2 muss existieren (erst `npm run l04:0`, dann `npm run l04:2`). Ein Chat-Modell
// und Open WebUI braucht dieser Teil nicht. Burp ist optional.
// Start: npm run l05:2   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Vergleiche die Tabellen für die Werte in `LAMBDA_VALUES`. Bei welchem Wert ändert sich nur
//      die Reihenfolge, ab welchem weicht die Auswahl von Top-k ab, und welche Top-k-Plätze
//      fallen dafür weg? Passen die neuen Chunks besser oder schlechter zur Frage?
//   2. Setze `FETCH_K` auf denselben Wert wie `TOP_K`. Was ändert `LAMBDA` dann noch, und warum?
//      Setze `FETCH_K` danach auf 50: Passen die Treffer bei kleinem `LAMBDA` noch zur Frage?
//   3. Stelle eine Frage, deren Antwort in mehreren Dokumenten steht (z. B. "Welche Risiken
//      entstehen durch zu viele Berechtigungen?"). Mit welchem `LAMBDA` deckt die Auswahl mehr
//      Dokumente ab als Top-k mit demselben `TOP_K`?
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { cosineSimilarity, embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, rankEntries, sectionPath } from '../shared/index.ts';
import { loadPublicIndex, INDEX_STRATEGY } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Die Frage, zu der passende Chunks gesucht werden. Fast die Frage aus Teil 1, aber mit
// "verhindere" statt "begrenze": Dazu passen auch Abschnitte anderer Dokumente, sodass MMR etwas
// zur Auswahl hat.
const QUESTION = 'Wie verhindere ich Prompt Injection?';
// Wie viele Chunks am Ende in den Prompt kämen.
const TOP_K = 3;
// Wie viele Kandidaten Top-k vorab holt. MMR wählt nur aus ihnen; je größer der Wert, desto mehr
// Vielfalt ist möglich, aber auch desto mehr schwache Treffer stehen zur Wahl.
const FETCH_K = 20;
// Die Werte für LAMBDA, die das Programm nacheinander zeigt: 1 = nur Relevanz (Top-k),
// 0 = nur Vielfalt. Üblich sind Werte um 0,5 bis 0,7. Bei E5 liegen alle Ähnlichkeiten eng
// beieinander (Lektion 03): Mit diesem Index und dieser Frage tauscht 0,6 nur zwei Plätze, erst
// 0,5 wählt andere Chunks. Die Werte sind an diesem Index gemessen, kein allgemeiner Richtwert.
const LAMBDA_VALUES = [1, 0.6, 0.5];

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Die Anfrage zeigt die gesendete Frage und
  // den rohen Vektor der Antwort.
  useBurpIfConfigured();

  // Schritt 1: Index laden und filtern, wie in Teil 1 (`loadPublicIndex` in retrieval.ts).
  const index = loadPublicIndex();
  console.log(`Index: ${index.length} public chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  try {
    await logInvocation('Search', { model: remoteEmbeddingModel.name, question: QUESTION }, async () => {
      // Schritt 2: Frage einbetten. Das ist der einzige Modellaufruf; MMR rechnet danach nur noch
      // mit Vektoren aus dem Index.
      const queryVector = await embeddings.embedQuery(embeddingQuery(QUESTION));
      // Schritt 3: Kandidaten holen. Das Ranking aus Teil 1, aber mit `FETCH_K` statt `TOP_K`.
      const candidates = rankEntries(index, queryVector, FETCH_K)
        .map((candidate, position) => ({ ...candidate, topKRank: position + 1 }));

      for (const lambda of LAMBDA_VALUES) {
        // NEU: Schritt 4: Auswählen. Dieselben Kandidaten, je LAMBDA eine andere Auswahl.
        const hits = selectByMmr(candidates, TOP_K, lambda);
        const documentCount = new Set(hits.map(({ metadata }) => metadata.source)).size;
        console.log(
          `MMR with lambda ${lambda} for “${QUESTION}”: ${hits.length} of ${candidates.length} candidates` +
          ` from ${documentCount} document(s)`,
        );
        console.table(hits.map(({ metadata, similarity, redundancy, topKRank }, position) => ({
          rank: position + 1,
          // Der Platz, den der Chunk bei reinem Top-k hätte. Lücken zeigen übersprungene Chunks.
          'top-k rank': topKRank,
          similarity: similarity.toFixed(3),
          // Redundanz: höchste Ähnlichkeit zu einem vorher gewählten Chunk; der erste hat noch
          // keinen Vorgänger.
          redundancy: position === 0 ? '–' : redundancy.toFixed(3),
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

// NEU: Die MMR-Auswahl. `candidates` ist absteigend nach Ähnlichkeit zur Frage sortiert. Jede
// Runde berechnet für jeden übrigen Kandidaten seinen MMR-Wert und nimmt den besten; danach zählt
// der gewählte Chunk bei allen folgenden Runden als "schon gesagt". `T` steht für "irgendein
// Kandidat mit Vektor und Ähnlichkeit": Die Funktion gibt dieselben Objekte zurück, ergänzt um
// ihre Redundanz. Dieselbe Funktion steht auch in `retrieval.ts` (Teil 5 importiert sie von dort);
// hier bleibt sie zum Lesen im Text der Datei. Ändere beide Kopien gemeinsam.
function selectByMmr<T extends { vector: number[]; similarity: number }>(candidates: T[], topK: number, lambda: number) {
  const remaining = [...candidates];
  const selected: (T & { redundancy: number })[] = [];

  while (selected.length < topK && remaining.length) {
    let best = { position: 0, score: -Infinity, redundancy: 0 };
    remaining.forEach((candidate, position) => {
      // Redundanz: wie stark der Kandidat dem ähnlichsten schon gewählten Chunk gleicht. In der
      // ersten Runde ist noch nichts gewählt, also 0; dann gewinnt der beste Top-k-Treffer.
      const redundancy = Math.max(0, ...selected.map(({ vector }) => cosineSimilarity(candidate.vector, vector)));
      // Die MMR-Formel: Relevanz belohnen, Redundanz bestrafen, gewichtet mit LAMBDA.
      const score = lambda * candidate.similarity - (1 - lambda) * redundancy;
      if (score > best.score) best = { position, score, redundancy };
    });
    const [winner] = remaining.splice(best.position, 1);
    selected.push({ ...winner, redundancy: best.redundancy });
  }
  return selected;
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
