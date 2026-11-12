// Lektion 08 – Evaluierung, Teil 1: Trefferquote (Hit Ratio) und MRR
//
// Lernziel: Du misst die Suche mit zwei Kennzahlen an einem Fragen-Set, statt einzelne Tabellen
// nach Gefühl zu beurteilen: Die Trefferquote sagt, wie oft das richtige Dokument unter den Top-k
// steht, der MRR zusätzlich, wie weit oben.
//
// Lektion 05 bis 07 stellen Suche und RAG nach Augenmaß ein: eine Frage, eine Tabelle, eine
// Antwort. Ob eine Änderung (anderes k, anderes Chunking, anderes Embedding-Modell) die Suche
// besser macht, sieht man so nicht: Eine Frage wird besser, eine andere schlechter. Dafür braucht
// es viele Fragen und eine Zahl. Diese Lektion misst: Teil 1 die Suche, Teil 2 die Antwort.
//
// KERN: Retrieval misst man ohne Sprachmodell. Das Fragen-Set (`question-set.json` in Lektion 05)
// sagt zu jeder Frage, in welchem Dokument die Antwort steht (`expectedSources`). Gezählt wird nur, an welcher
// Stelle der Top-k der erste Chunk aus einem dieser Dokumente steht. Das ist billig (ein
// Embedding je Frage, kein Chat-Aufruf), wiederholbar (dieselbe Eingabe ergibt dieselbe Zahl, kein
// Modell formuliert oder urteilt) und in Sekunden fertig. So kannst du nach jeder Änderung neu
// messen. Was das Sprachmodell aus den Treffern macht, misst erst Teil 2. Schritte:
//   1. Index und Fragen-Set laden (`loadIndex` und `loadQuestionSet` aus retrieval.ts in Lektion
//      05, so wie Lektion 07 Hilfsfunktionen aus Lektion 05 importiert). Der Index
//      ist vollständig, mit internen Chunks: Frage F-11 erwartet den internen Anhang.
//   2. Je Frage: einbetten mit dem E5-Präfix "query: " (`embeddingQuery`), ranken (`rankEntries`),
//      die besten `TOP_K` behalten.
//   3. Rang bestimmen: der Platz des ersten Treffers aus einem erwarteten Dokument, von 1 an
//      gezählt; 0 heißt, keiner der Top-k stammt aus einem erwarteten Dokument (Spalte "rank").
//   4. Kennzahlen bilden:
//        Trefferquote (Hit Ratio) = Fragen mit Rang > 0 / alle gewerteten Fragen
//        MRR (Mean Reciprocal Rank) = Mittelwert von 1 / Rang; ein Fehltreffer zählt 0
//      Rang 1 zählt also 1, Rang 2 zählt 0,5, Rang 5 zählt 0,2.
//      Beispiel mit drei Fragen und den Rängen 1, 2 und 0: Zwei von drei Fragen haben einen
//      Treffer, die Trefferquote ist 2 / 3 = 0,67. Der MRR ist (1 + 0,5 + 0) / 3 = 0,50. Jede
//      Frage trägt zum MRR höchstens so viel bei wie zur Trefferquote (0,5 statt 1 bei Rang 2),
//      deshalb liegt er nie darüber.
//   5. Die Frage ohne Quelle (`withoutSource`) getrennt zeigen, mit ihrer besten Ähnlichkeit.
//
// Merke: Die Trefferquote fragt "irgendwo in den Top-k?", der MRR "wie weit oben?". Der MRR kann
// nie größer sein als die Trefferquote; sind beide gleich, steht jeder Treffer auf Platz 1. Beide
// Zahlen gelten nur für dieses Fragen-Set, diesen Index und dieses `TOP_K`; zwölf Fragen sind eine
// Stichprobe, eine einzelne Frage verschiebt die Trefferquote schon um etwa 0,08. Gemessen wird
// das Dokument, nicht der Abschnitt: Ein Treffer aus dem richtigen Dokument kann trotzdem der
// falsche Chunk sein.
// Die Frage `withoutSource` zählt in keiner der beiden Zahlen mit: Zu ihr gibt es kein erwartetes
// Dokument, also keinen Rang, den man messen könnte. Top-k liefert trotzdem immer k Chunks
// (Lektion 05, Teil 1); als Fehltreffer gewertet, würde sie beide Zahlen drücken, obwohl die Suche
// nichts falsch gemacht hat. Ob die Anwendung bei ihr schweigt, entscheidet der Schwellenwert
// (Lektion 05, Teil 4 und 5), nicht die Rangfolge.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und geladenem E5-Modell; der Index aus
// Lektion 04, Teil 2 muss existieren (erst `npm run l04:0`, dann `npm run l04:2`). Ein Chat-Modell
// und Open WebUI braucht dieser Teil nicht. Burp ist optional.
// Start: npm run l08:1   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Lies die Ränge je Frage (Spalte "rank"). Welche Fragen stehen nicht auf Platz 1, welche
//      haben Rang 0? Sieh in der Spalte "sources" nach, welche Dokumente stattdessen vorn liegen,
//      und vergleiche mit den `tags` der Frage in `question-set.json` (Ordner von Lektion 05).
//   2. Vergleiche Trefferquote und MRR. Setze `TOP_K` auf 1 und auf 10: Welche der beiden Zahlen
//      ändert sich stark, welche kaum, und warum? (Erwartung: Bei `TOP_K` = 1 sind beide gleich.
//      Ein größeres k hebt die Trefferquote; den MRR hebt es kaum, weil hintere Ränge wenig zählen.)
//   3. Ergänze in `../05-retrieval-strategies/question-set.json` unter `questions` eine eigene
//      Frage mit `id`, `question`, `expectedSources` (Dateiname des Dokuments), `keyPoint` und
//      `tags`. Auf welchem Rang landet sie, und wie ändern sich die beiden Zahlen? Die Datei ist
//      geteilt: Deine Frage erscheint danach auch in der Kalibrierung von `npm run l05:5`.
import { basename } from 'node:path';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, rankEntries } from '../shared/index.ts';
import { loadIndex, loadQuestionSet, INDEX_STRATEGY } from '../05-retrieval-strategies/retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Wie tief gemessen wird: Ein erwartetes Dokument zählt nur, wenn es unter den besten `TOP_K`
// Chunks steht. Nimm das k, das deine Anwendung in den Prompt gibt; was dahinter liegt, sieht das
// Sprachmodell nie.
const TOP_K = 5;

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Er zeigt je Frage eine Anfrage an das
  // Embedding-Modell.
  useBurpIfConfigured();

  // Schritt 1: Index vollständig laden, mit internen Chunks (`loadIndex`, nicht `loadPublicIndex`):
  // Frage F-11 erwartet den internen Anhang und hätte sonst immer Rang 0. Das Fragen-Set ist
  // dasselbe wie in der Kalibrierung in Lektion 05, Teil 5; `loadQuestionSet` prüft seine Form.
  const index = loadIndex();
  const questionSet = loadQuestionSet();
  console.log(`Index: ${index.length} chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  try {
    // In den Log-Details steht nur die Zahl der gewerteten Fragen (mit erwartetem Dokument, siehe
    // Schritt 5), nie ihr Text (Regel in shared/logging.ts). So zählt das Log wie Teil 4.
    const questionCount = questionSet.questions.filter(({ expectedSources }) => expectedSources.length).length;
    await logInvocation('Search', { model: remoteEmbeddingModel.name, questionCount }, async () => {
      const results: { id: string; rank: number; sources: string }[] = [];
      let hitCount = 0;
      let reciprocalRankSum = 0;

      for (const { id, question, expectedSources } of questionSet.questions) {
        // Ohne erwartetes Dokument gibt es nichts zu messen; eine solche Frage zählt nicht mit.
        if (!expectedSources.length) continue;

        // Schritt 2: Frage einbetten und ranken. `embeddingQuery` setzt das E5-Präfix "query: "
        // davor (ohne Präfix sinkt die Trefferqualität, siehe Lektion 03) und kürzt die Frage auf
        // das 512-Token-Limit von E5.
        const queryVector = await embeddings.embedQuery(embeddingQuery(question));
        const hits = rankEntries(index, queryVector, TOP_K);

        // NEU: Schritt 3: Rang. Es zählt der erste Chunk aus einem erwarteten Dokument, denn ihn
        // liest das Sprachmodell zuerst. `findIndex` zählt ab 0 und liefert -1, wenn nichts passt;
        // mit + 1 wird daraus ein Rang ab 1 und die 0 für "nicht unter den Top-k".
        const rank = hits.findIndex(({ metadata }) => expectedSources.includes(metadata.source)) + 1;
        results.push({
          id,
          rank,
          // Die Dokumente der Top-k in Rangfolge, ohne ".md": So siehst du, was statt des
          // erwarteten Dokuments vorn liegt.
          sources: hits.map(({ metadata }) => basename(metadata.source, '.md')).join(', '),
        });
        if (rank > 0) {
          hitCount += 1;
          reciprocalRankSum += 1 / rank;
        }
      }

      console.log(`Retrieval over ${results.length} questions, top-${TOP_K}:`);
      console.table(results);

      // NEU: Schritt 4: Kennzahlen, beide über die gewerteten Fragen. Trefferquote: Anteil der
      // Fragen mit einem Treffer irgendwo in den Top-k. MRR: Mittelwert von 1 / Rang, ein
      // Fehltreffer trägt 0 bei. Der MRR belohnt also Treffer weit oben und kann die Trefferquote
      // nie übersteigen. Ohne gewertete Frage bleibt beides 0, statt durch null zu teilen.
      const hitRatio = results.length ? hitCount / results.length : 0;
      const mrr = results.length ? reciprocalRankSum / results.length : 0;
      console.log(`Hit ratio: ${hitRatio.toFixed(2)} · MRR: ${mrr.toFixed(2)}`);

      // Schritt 5: die Frage ohne Quelle. Zu ihr steht nichts im Korpus, also gibt es kein
      // erwartetes Dokument und keinen Rang; in Trefferquote und MRR zählt sie deshalb nicht mit.
      // Als Fehltreffer gewertet, würde sie beide Zahlen drücken, obwohl die Suche hier nichts
      // finden kann. Gezeigt wird nur ihre beste Ähnlichkeit: Sie liegt kaum unter der echter
      // Treffer, und Top-k würde trotzdem `TOP_K` Chunks liefern. Solche Fragen fängt der
      // Schwellenwert ab (Lektion 05, Teil 4), nicht die Rangfolge.
      const { id, question } = questionSet.withoutSource;
      const queryVector = await embeddings.embedQuery(embeddingQuery(question));
      const [bestHit] = rankEntries(index, queryVector, 1);
      console.log(
        `Without source (${id}): best similarity ${bestHit ? bestHit.similarity.toFixed(3) : '–'};` +
        ' excluded from hit ratio and MRR.',
      );
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
