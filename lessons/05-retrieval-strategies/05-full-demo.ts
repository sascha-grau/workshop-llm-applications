// Lektion 05 – Retrieval-Strategien, Teil 5: Alle Strategien im Vergleich
//
// Lernziel: Du siehst alle Retrieval-Strategien dieser Lektion nebeneinander, mit derselben Frage
// auf demselben Index, und misst den Schwellenwert an einem Fragen-Set aus, statt ihn zu raten.
//
// Teil 1 bis 4 zeigen je eine Strategie, Lektion 04, Teil 5 das Parent-Document-Retrieval. Hier
// laufen alle fünf hintereinander; danach prüft das Programm den Schwellenwert an
// `question-set.json`. Schritte:
//   1. Index laden: der Überschriften-Index aus Lektion 04, Teil 2, vollständig (wie in Teil 3).
//   2. Kinder bilden: Jeder Abschnitt (Parent) wird in Stücke von etwa `CHILD_SIZE` Zeichen
//      geteilt und eingebettet, wie in Lektion 04, Teil 5. Die Kinder bleiben im Speicher.
//   3. Frage einbetten, mit dem E5-Präfix "query: " (`embeddingQuery` setzt es davor).
//   4. Die Strategien, je eine Tabelle:
//        a. Top-k (Teil 1): die besten `TOP_K` Chunks, mit der Verteilung ihrer Ähnlichkeiten.
//        b. MMR (Teil 2): `TOP_K` aus den besten `FETCH_K`, gewichtet mit `LAMBDA`.
//        c. Metadaten-Filter (Teil 3): Top-k nur über Chunks, deren Metadaten `FILTER` erfüllen.
//        d. Schwellenwert (Teil 4): von den Top-k-Treffern nur die mit mindestens `THRESHOLD`.
//        e. Parent-Document (Lektion 04, Teil 5): Kinder suchen, ganze Parents liefern.
//   5. Kalibrieren: Für jede Frage aus `question-set.json` die beste Ähnlichkeit in den erwarteten
//      Dokumenten und die beste in allen anderen, und ob der beste Treffer `THRESHOLD` erreicht.
//
// Merke: Eine gute Schwelle lässt alle Fragen mit Antwort im Korpus durch und hält die Frage ohne
// Antwort auf (`withoutSource`). Den Wert gibt es nur für dieses Modell und diesen Korpus; ändert
// sich eins davon, miss neu. Liegt die Frage ohne Antwort nur knapp unter den anderen, ist die
// Schwelle eine Wette: Eine neue, etwas andere Frage kann auf der falschen Seite landen.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und geladenem E5-Modell; der Index aus
// Lektion 04, Teil 2 muss existieren (erst `npm run l04:0`, dann `npm run l04:2`). Ein Chat-Modell
// und Open WebUI braucht dieser Teil nicht. Burp ist optional.
// Start: npm run l05:5   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Vergleiche die fünf Tabellen: Welche Strategie liefert Chunks aus anderen Abschnitten als
//      Top-k, und welche liefert den meisten Kontext?
//   2. Lies die Kalibrierung: Welche Fragen erreichen `THRESHOLD` nicht, obwohl die Antwort im
//      Korpus steht? Bei welchen liegt die beste Ähnlichkeit in einem anderen Dokument höher als
//      in den erwarteten ("best elsewhere" größer als "best expected")?
//   3. Ergänze in `question-set.json` eine eigene Frage mit ihren erwarteten Dokumenten und passe
//      `THRESHOLD` so an, dass alle Fragen mit Antwort durchkommen und `withoutSource` nicht.
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { assertVectorCount, cosineSimilarity, e5Model, embeddingQuery } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { embeddings, indexFileFor, rankEntries, sectionPath, uniqueChunks, type ChunkMetadata, type IndexEntry } from '../shared/index.ts';
import { splitIntoChildren } from '../04-chunking/chunking.ts';
import { loadIndex, INDEX_STRATEGY, selectByMmr } from './retrieval.ts';
import { runMain } from '../shared/startup.ts';

// Die Frage, auf die alle Strategien angewendet werden.
const QUESTION = 'Welche Maßnahmen schützen vor Prompt Injection?';
// Wie viele Chunks jede Strategie höchstens liefert.
const TOP_K = 5;
// MMR (Teil 2): Aus den besten `FETCH_K` wählt MMR `TOP_K` aus; LAMBDA 1 ist reine Relevanz,
// 0 reine Vielfalt.
const FETCH_K = 20;
const LAMBDA = 0.5;
// Metadaten-Filter (Teil 3): Nur Chunks, deren Metadaten in allen genannten Feldern
// übereinstimmen, werden überhaupt verglichen.
const FILTER: Partial<Pick<ChunkMetadata, 'accessGroup' | 'version'>> = { accessGroup: 'public', version: '2025' };
// Schwellenwert (Teil 4): Ab dieser Ähnlichkeit gilt ein Treffer als Grundlage für eine Antwort.
// Ausgemessen mit der Kalibrierung unten (Schritt 5) für E5 und diesen Korpus: 0,82 aus Teil 4 lässt
// die Frage ohne Antwort durch (etwa 0,826); die Fragen F-00 bis F-10 liegen ab etwa 0,836.
const THRESHOLD = 0.83;
// Parent-Document (Lektion 04, Teil 5): die Größe eines Kindes in Zeichen, ohne Überschriftenpfad.
const CHILD_SIZE = 300;
// Das Fragen-Set für die Kalibrierung, neben dieser Datei.
const QUESTION_SET_FILE = new URL('question-set.json', import.meta.url);

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Die Anfragen zeigen die gesendeten Texte
  // und die rohen Vektoren der Antworten.
  useBurpIfConfigured();

  // Schritt 1: Index laden, vollständig mit internen Chunks (`loadIndex` in retrieval.ts), damit
  // der Filter in Schritt 4c etwas zu tun hat.
  const index = loadIndex();
  const questionSet = loadQuestionSet();
  console.log(`Index: ${index.length} chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  await checkModelServer({ viaBurp: true });

  try {
    // Schritt 2: Kinder bilden und einbetten, eine Anfrage pro Dokument (wie in Lektion 04, Teil 5).
    const children = await logInvocation('Embedding', { model: remoteEmbeddingModel.name, parentCount: index.length }, async () => {
      const entries: Child[] = [];
      for (const source of new Set(index.map(({ metadata }) => metadata.source))) {
        // Teilt einen Parent in gleich große Kinder von etwa `CHILD_SIZE` Zeichen, wie in Lektion 04,
        // Teil 5. Geteilt wird nur der Text nach dem Überschriftenpfad; jedes Kind bekommt ihn wieder
        // vorangestellt.
        const pieces = index.filter(({ metadata }) => metadata.source === source).flatMap((parent) => splitIntoChildren(parent, CHILD_SIZE));
        const vectors = await embeddings.embedDocuments(pieces.map(({ text }) => `${e5Model.passagePrefix}${text}`));
        assertVectorCount(vectors, pieces.length);
        pieces.forEach((piece, position) => entries.push({ ...piece, vector: vectors[position] }));
      }
      console.log(`${index.length} parents → ${entries.length} children of about ${CHILD_SIZE} characters`);
      return entries;
    });

    await logInvocation('Search', { model: remoteEmbeddingModel.name, question: QUESTION }, async () => {
      // Schritt 3: Frage einbetten. Alle Strategien nutzen denselben Fragevektor.
      const queryVector = await embeddings.embedQuery(embeddingQuery(QUESTION));

      // Schritt 4a: Top-k.
      const topKHits = rankEntries(index, queryVector, TOP_K);
      printHits(`1. Top ${TOP_K} for “${QUESTION}”:`, topKHits);
      const similarities = topKHits.map(({ similarity }) => similarity);
      const average = similarities.reduce((sum, similarity) => sum + similarity, 0) / similarities.length;
      console.log(
        `Similarity of the top ${TOP_K}: min ${Math.min(...similarities).toFixed(3)}` +
        ` / average ${average.toFixed(3)} / max ${Math.max(...similarities).toFixed(3)}`,
      );

      // Die MMR-Auswahlaus Teil 2: In jeder Runde gewinnt der Kandidat mit dem höchsten Wert
      // LAMBDA × Ähnlichkeit zur Frage − (1 − LAMBDA) × höchste Ähnlichkeit zu einem gewählten Chunk.
      // Schritt 4b: MMR über die besten `FETCH_K` Kandidaten.
      printHits(`2. MMR with lambda ${LAMBDA} from the top ${FETCH_K}:`, selectByMmr(rankEntries(index, queryVector, FETCH_K), TOP_K, LAMBDA));

      // Schritt 4c: Pre-Filter, erst die Metadaten prüfen, dann nur im Rest suchen.
      const allowed = index.filter(({ metadata }) => Object.entries(FILTER).every(([field, value]) => metadata[field as keyof typeof FILTER] === value));
      printHits(`3. Filter ${JSON.stringify(FILTER)} (${allowed.length} of ${index.length} chunks), top ${TOP_K}:`, rankEntries(allowed, queryVector, TOP_K));

      // Schritt 4d: Schwellenwert. Ohne ihn liefert jede Suche `TOP_K` Treffer, ob sie passen oder nicht.
      const aboveThreshold = topKHits.filter(({ similarity }) => similarity >= THRESHOLD);
      printHits(`4. Threshold ${THRESHOLD}: ${aboveThreshold.length} of ${TOP_K} hits remain`, aboveThreshold);

      // Schritt 4e: Parent-Document. Kinder tragen die Metadaten ihres Parents, also bleibt mit
      // `uniqueChunks` das beste Kind je Parent; geliefert wird der ganze Parent.
      const childHits = rankEntries(children, queryVector, 4 * TOP_K);
      const parents = uniqueChunks(childHits, TOP_K).map(({ parent, similarity }) => ({ ...parent, similarity }));
      printHits(`5. Parent-document: children searched, ${parents.length} parents delivered from the top ${childHits.length} children`, parents);
    });

    // Schritt 5: Kalibrieren. Alle Fragen in einer Anfrage: `embedDocuments` mit dem Präfix "query: "
    // bettet sie trotzdem als Fragen ein; das Präfix entscheidet, nicht die Methode.
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
          // Würde die Anwendung antworten? Das entscheidet der beste Treffer, egal aus welchem Dokument.
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

// Gibt Treffer als Tabelle aus, für alle Strategien gleich.
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

// Das Fragen-Set ist Eingabe von außen (von Hand bearbeitet), deshalb prüft ein Schema seine Form.
const questionSchema = z.object({
  id: z.string(), question: z.string().trim().min(1), expectedSources: z.array(z.string()),
  keyPoint: z.string(), tags: z.array(z.string()),
});
const questionSetSchema = z.object({ questions: z.array(questionSchema).min(1), withoutSource: questionSchema });

function loadQuestionSet(): z.infer<typeof questionSetSchema> {
  try {
    return questionSetSchema.parse(JSON.parse(readFileSync(QUESTION_SET_FILE, 'utf8')));
  } catch (cause) {
    throw new Error(`Cannot load the question set ${QUESTION_SET_FILE.pathname}. Check its JSON and fields.`, { cause });
  }
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
