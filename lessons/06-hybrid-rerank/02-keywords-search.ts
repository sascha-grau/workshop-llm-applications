// Lektion 06 – Hybrid-Suche und Reranking, Teil 2: Keyword-Suche mit BM25
//
// Lernziel: BM25 findet genaue Begriffe ohne Embedding, versteht aber keine Bedeutung.
// Braucht:  Collections aus `npm run l06:1`. Kein LM Studio.
// Start:    npm run l06:2   (oder F5)
// Erklärt:  lessons/06-hybrid-rerank/GUIDE.de.md → „Teil 2“
//
// Aufgabe:
//   1. Welche Wörter der Fragen zählen nicht (0 Chunks)? Passen die Treffer der zweiten und dritten Frage?
//   2. Ergänze in `QUESTIONS` 'Slopsquatting' und setze in Lektion 05, Teil 1 `QUESTION` auf denselben
//      Begriff: Welche Suche findet ihn zuverlässiger?  ↺ Danach beide Dateien zurücksetzen.
//   3. Setze `INDEX_STRATEGY` in hybrid.ts auf 'prepared': Wie ändern sich Zählung und BM25-Werte?
//      ↺ Danach zurück auf 'headings' (sonst suchen Teil 3 bis 7 und Lektion 07 im falschen Index).
//
// Lesen: die Zeilen `// KERN 1–2`. Der Rest ist Ausgabe.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { logInvocation } from '../shared/logging.ts';
import { sectionPath, type ChunkMetadata } from '../shared/index.ts';
import { getQdrantClient, requireCollection, getCollectionName } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Standard: ein seltener Fachbegriff, eine umgangssprachliche Frage (F-02 aus dem Fragen-Set von
// Lektion 05) und eine Frage ohne Bezug zum Korpus.
const QUESTIONS = [
  'PoisonGPT',
  'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?',
  'Wie wird das Wetter heute?',
];
// Standard: höchstens 5 Treffer; BM25 liefert nur Chunks mit mindestens einem Wort der Frage.
const TOP_K = 5;

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Die Suche sieht auch den internen Anhang.
// Lektion 07 ergänzt `PUBLIC_FILTER`; siehe docs/decisions.de.md#pre-filter.
async function main() {
  // Burp sieht in dieser Datei nichts: Der Qdrant-Client umgeht ihn (`getQdrantClient` in hybrid.ts).
  useBurpIfConfigured();

  await requireCollection(getCollectionName());

  for (const question of QUESTIONS) {
    try {
      await logInvocation('Keyword search', { collection: getCollectionName(), question }, async () => {
        // KERN 1: Wörter zählen. `match.text` nutzt den Volltextindex samt Stemmer und Stoppwörtern.
        // Je seltener ein Wort, desto mehr zählt es in BM25; 0 Chunks heißt: zählt gar nicht.
        const words = question.match(/[\p{L}\p{N}]+/gu) ?? [];
        const counts = await Promise.all(words.map(async (word) => {
          const { count } = await getQdrantClient().count(getCollectionName(), { filter: { must: [{ key: 'text', match: { text: word } }] }, exact: true });
          return `${word} ${count}`;
        }));
        console.log(`Keyword search (BM25) for “${question}”`);
        console.log(`Chunks per word (after stemmer and stop words): ${counts.join(' · ')}`);

        // KERN 2: `query.text` mit `using: 'text'` sucht im Volltextindex statt auf den Vektoren, ganz
        // ohne Embedding.
        const { points } = await getQdrantClient().query(getCollectionName(), { query: { text: question }, using: 'text', limit: TOP_K, with_payload: true });
        console.log(`Hits: ${points.length} of at most ${TOP_K}`);
        console.table(points.map(({ id, score, payload }, position) => {
          const metadata = payload as ChunkMetadata;
          return {
            rank: position + 1,
            point: id,
            // Keine Kosinus-Ähnlichkeit: nach oben offen, nur die Reihenfolge zählt.
            'BM25 score': score.toFixed(3),
            file: metadata.source,
            section: sectionPath(metadata.headingPath),
          };
        }));
      });
    } catch {
      // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
      process.exitCode = 1;
    }
  }
}

await runMain(main);
