// Lektion 08 – Evaluierung, Teil 1: Trefferquote (Hit Ratio) und MRR
//
// Lernziel: Du misst die Suche an einem Fragen-Set mit zwei Zahlen, ohne Sprachmodell.
// Braucht:  LM Studio mit E5-Modell; Index aus `npm run l04:0` und `npm run l04:2`.
// Start:    npm run l08:1   (oder F5)
// Erklärt:  lessons/08-evaluations/GUIDE.de.md → „Teil 1“
//
// Aufgabe:
//   1. Welche Fragen stehen nicht auf Rang 1, welche auf Rang 0? Was liegt laut "sources" davor?
//   2. Setze `TOP_K` auf 1, dann auf 10: Welche Zahl ändert sich stark, welche kaum?
//      ↺ Danach zurücksetzen: `TOP_K` auf `5` (sonst passen deine Zahlen nicht mehr zum Guide).
//   3. Ergänze in `../05-retrieval-strategies/question-set.json` eine eigene Frage. Welchen Rang?
//      ↺ Danach die Frage wieder löschen (die Datei ist geteilt: l05:5, l08:3 bis l08:6 lesen sie mit).
//
// Lesen: die Zeilen `// KERN 1–4`. Der Rest ist Handwerk.
import { basename } from 'node:path';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, rankEntries } from '../shared/index.ts';
import { loadIndex, loadQuestionSet, INDEX_STRATEGY } from '../05-retrieval-strategies/retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Standard: 5. Größer = höhere Trefferquote. Nimm das k, das deine Anwendung in den Prompt gibt;
// was dahinter liegt, sieht das Sprachmodell nie.
const TOP_K = 5;

async function main() {
  useBurpIfConfigured();

  // Vollständig mit internen Chunks (`loadIndex`, nicht `loadPublicIndex`): F-11 erwartet den
  // internen Anhang. Unbedenklich, weil hier kein Chunk-Text an ein Chat-Modell geht.
  const index = loadIndex();
  const questionSet = loadQuestionSet();
  console.log(`Index: ${index.length} chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  try {
    // Ins Log nur die Zahl der Fragen, nie ihr Text (Regel in shared/logging.ts).
    const questionCount = questionSet.questions.filter(({ expectedSources }) => expectedSources.length).length;
    await logInvocation('Search', { model: remoteEmbeddingModel.name, questionCount }, async () => {
      // LEHRKOPIE (→ evaluation.ts#measureRetrieval): dieselbe Rechnung, hier ausgeschrieben, mit
      // Tabelle je Frage.
      const results: { id: string; rank: number; sources: string }[] = [];
      let hitCount = 0;
      let reciprocalRankSum = 0;

      for (const { id, question, expectedSources } of questionSet.questions) {
        if (!expectedSources.length) continue;

        // KERN 1: Suchen ohne Sprachmodell: ein Embedding je Frage, dann ranken. `embeddingQuery`
        // setzt das E5-Präfix "query: " davor (Lektion 03).
        const queryVector = await embeddings.embedQuery(embeddingQuery(question));
        const hits = rankEntries(index, queryVector, TOP_K);

        // KERN 2: Rang des ersten Chunks aus einem erwarteten Dokument. `findIndex` liefert -1 ohne
        // Treffer; + 1 macht daraus Rang ab 1 und 0 für "nicht unter den Top-k".
        const rank = hits.findIndex(({ metadata }) => expectedSources.includes(metadata.source)) + 1;
        results.push({
          id,
          rank,
          // Zeigt, was statt des erwarteten Dokuments vorn liegt.
          sources: hits.map(({ metadata }) => basename(metadata.source, '.md')).join(', '),
        });
        if (rank > 0) {
          hitCount += 1;
          reciprocalRankSum += 1 / rank;
        }
      }

      console.log(`Retrieval over ${results.length} questions, top-${TOP_K}:`);
      console.table(results);

      // KERN 3: Trefferquote = Anteil mit Rang > 0. MRR = Mittelwert von 1 / Rang (Fehltreffer 0),
      // deshalb nie größer als die Trefferquote. Ohne gewertete Frage 0 statt Division durch null.
      const hitRatio = results.length ? hitCount / results.length : 0;
      const mrr = results.length ? reciprocalRankSum / results.length : 0;
      console.log(`Hit ratio: ${hitRatio.toFixed(2)} · MRR: ${mrr.toFixed(2)}`);

      // KERN 4: Die Frage ohne Quelle hat keinen Rang und zählt nicht mit; als Fehltreffer würde sie
      // beide Zahlen drücken. Solche Fragen fängt der Schwellenwert ab (Lektion 05, Teil 4).
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

await runMain(main);
