// Lektion 05 – Retrieval-Strategien, Teil 5: Alle Strategien im Vergleich
//
// Lernziel: Alle Strategien auf derselben Frage vergleichen und den Schwellenwert an einem Fragen-Set
//           ausmessen, statt ihn zu raten.
// Braucht:  wie Teil 1 (Index `headings`, LM Studio mit E5).
// Start:    npm run l05:5   (oder F5; Datei 99, aber Teil 5)
// Erklärt:  lessons/05-retrieval-strategies/GUIDE.de.md → „Teil 5“
//
// Aufgabe:
//   1. Welche Strategie liefert Chunks aus anderen Abschnitten als Top-k, welche den meisten Kontext?
//   2. Kalibrierung: Welche Fragen erreichen `THRESHOLD` nicht, obwohl die Antwort im Korpus steht?
//      Wo ist "best elsewhere" größer als "best expected"?
//   3. Ergänze in `question-set.json` eine eigene Frage samt erwarteten Dokumenten. Lässt `THRESHOLD`
//      sie durch und hält `withoutSource` weiter auf? Passe den Wert sonst an.
//      ↺ Danach `git checkout -- lessons/05-retrieval-strategies/question-set.json` und `THRESHOLD`
//        auf 0.83 (sonst misst Lektion 08 mit deiner Frage).
//
// Lesen: die Zeilen `// KERN 1–6`. Der Rest ist Ausgabe.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { assertVectorCount, cosineSimilarity, e5Model, embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, rankEntries, sectionPath, uniqueChunks, type ChunkMetadata, type IndexEntry } from '../shared/index.ts';
import { splitIntoChildren } from '../04-chunking/chunking.ts';
import { loadIndex, loadQuestionSet, INDEX_STRATEGY, QUESTION_SET_FILE, selectByMmr } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Standard: F-01 aus dem Fragen-Set, für alle Strategien dieselbe.
const QUESTION = 'Welche Maßnahmen schützen vor Prompt Injection?';
// Standard: 5 Chunks je Strategie, höchstens.
const TOP_K = 5;
// Standard: 20 Kandidaten und `LAMBDA` 0.5 für MMR (Teil 2).
const FETCH_K = 20;
const LAMBDA = 0.5;
// Standard: öffentlich und Ausgabe 2025. Nur Chunks, die in allen genannten Feldern übereinstimmen,
// werden überhaupt verglichen (Teil 3).
const FILTER: Partial<Pick<ChunkMetadata, 'accessGroup' | 'version'>> = { accessGroup: 'public', version: '2025' };
// Standard: 0.83. Kleiner = mehr Antworten, auch auf Fragen ohne Quelle. Gewählt an der Kalibrierung
// (KERN 6), gültig nur für E5 und diesen Korpus.
const THRESHOLD = 0.83;
// Standard: 300 Zeichen je Kind (ohne Überschriftenpfad), wie in Lektion 04, Teil 5.
const CHILD_SIZE = 300;

async function main() {
  useBurpIfConfigured();

  // Der ganze Index, auch intern, damit der Filter (KERN 3) etwas zu tun hat. Kein Chunk-Text geht
  // an ein Sprachmodell.
  const index = loadIndex();
  const questionSet = loadQuestionSet();
  console.log(`Index: ${index.length} chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  try {
    // Kinder für Parent-Document (KERN 5) bilden und einbetten, eine Anfrage je Dokument.
    const children = await logInvocation('Embedding', { model: remoteEmbeddingModel.name, parentCount: index.length }, async () => {
      const entries: Child[] = [];
      for (const source of new Set(index.map(({ metadata }) => metadata.source))) {
        const pieces = index.filter(({ metadata }) => metadata.source === source).flatMap((parent) => splitIntoChildren(parent, CHILD_SIZE));
        const vectors = await embeddings.embedDocuments(pieces.map(({ text }) => `${e5Model.passagePrefix}${text}`));
        assertVectorCount(vectors, pieces.length);
        pieces.forEach((piece, position) => entries.push({ ...piece, vector: vectors[position] }));
      }
      console.log(`${index.length} parents → ${entries.length} children of about ${CHILD_SIZE} characters`);
      return entries;
    });

    await logInvocation('Search', { model: remoteEmbeddingModel.name, question: QUESTION }, async () => {
      // Alle Strategien nutzen denselben Fragevektor; nur die Auswahl unterscheidet sich.
      const queryVector = await embeddings.embedQuery(embeddingQuery(QUESTION));

      // KERN 1: Top-k (Teil 1).
      const topKHits = rankEntries(index, queryVector, TOP_K);
      printHits(`1. Top ${TOP_K} for “${QUESTION}”:`, topKHits);
      const similarities = topKHits.map(({ similarity }) => similarity);
      const average = similarities.reduce((sum, similarity) => sum + similarity, 0) / similarities.length;
      console.log(
        `Similarity of the top ${TOP_K}: min ${Math.min(...similarities).toFixed(3)}` +
        ` / average ${average.toFixed(3)} / max ${Math.max(...similarities).toFixed(3)}`,
      );

      // KERN 2: MMR (Teil 2) über die besten `FETCH_K` Kandidaten.
      printHits(`2. MMR with lambda ${LAMBDA} from the top ${FETCH_K}:`, selectByMmr(rankEntries(index, queryVector, FETCH_K), TOP_K, LAMBDA));

      // KERN 3: Pre-Filter (Teil 3): erst die Metadaten prüfen, dann nur im Rest suchen.
      const allowed = index.filter(({ metadata }) => Object.entries(FILTER).every(([field, value]) => metadata[field as keyof typeof FILTER] === value));
      printHits(`3. Filter ${JSON.stringify(FILTER)} (${allowed.length} of ${index.length} chunks), top ${TOP_K}:`, rankEntries(allowed, queryVector, TOP_K));

      // KERN 4: Schwellenwert (Teil 4) auf den Top-k-Treffern.
      const aboveThreshold = topKHits.filter(({ similarity }) => similarity >= THRESHOLD);
      printHits(`4. Threshold ${THRESHOLD}: ${aboveThreshold.length} of ${TOP_K} hits remain`, aboveThreshold);

      // KERN 5: Parent-Document (Lektion 04, Teil 5). Kinder tragen die Metadaten ihres Parents, also
      // bleibt mit `uniqueChunks` das beste Kind je Parent; geliefert wird der ganze Parent.
      const childHits = rankEntries(children, queryVector, 4 * TOP_K);
      const parents = uniqueChunks(childHits, TOP_K).map(({ parent, similarity }) => ({ ...parent, similarity }));
      printHits(`5. Parent-document: children searched, ${parents.length} parents delivered from the top ${childHits.length} children`, parents);
    });

    // KERN 6: Kalibrieren. `embedDocuments` mit dem Präfix "query: " bettet die Fragen trotzdem als
    // Fragen ein: Bei E5 entscheidet das Präfix, nicht die Methode.
    const allQuestions = [...questionSet.questions, questionSet.withoutSource];
    await logInvocation('Calibration', { model: remoteEmbeddingModel.name, questionCount: allQuestions.length }, async () => {
      const vectors = await embeddings.embedDocuments(allQuestions.map(({ question }) => embeddingQuery(question)));
      assertVectorCount(vectors, allQuestions.length);
      console.log(`Calibration with ${QUESTION_SET_FILE.pathname} (best similarity per question):`);
      console.table(allQuestions.map(({ id, question, expectedSources }, position) => {
        const best = (entries: IndexEntry[]) => entries.length
          ? Math.max(...entries.map(({ vector }) => cosineSimilarity(vectors[position], vector))).toFixed(3) : '–';
        const [topHit] = rankEntries(index, vectors[position], 1);
        return {
          id,
          'best expected': best(index.filter(({ metadata }) => expectedSources.includes(metadata.source))),
          'best elsewhere': best(index.filter(({ metadata }) => !expectedSources.includes(metadata.source))),
          // Ob die Anwendung antworten würde, entscheidet der beste Treffer, egal aus welchem Dokument.
          answers: topHit.similarity >= THRESHOLD,
          question,
        };
      }));
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

/** Ein Kind: ein Stück seines Parents, mit dessen Metadaten und einem Verweis auf ihn. */
type Child = IndexEntry & { parent: IndexEntry };

function printHits(title: string, hits: (IndexEntry & { similarity: number })[]): void {
  console.log(title);
  console.table(hits.map(({ metadata, similarity, text }, position) => ({
    rank: position + 1,
    similarity: similarity.toFixed(3),
    'access group': metadata.accessGroup,
    file: metadata.source,
    section: sectionPath(metadata.headingPath),
    characters: text.length,
  })));
}

await runMain(main);
