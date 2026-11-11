// Lektion 06 – Hybrid-Suche und Reranking, Teil 2: Keyword-Suche mit BM25
//
// Lernziel: Du suchst mit dem Volltextindex aus Teil 1 statt mit Vektoren und siehst, wann das
// besser und wann es schlechter ist als die Ähnlichkeitssuche: BM25 findet genaue Begriffe, versteht
// aber keine Bedeutung.
//
// Bisher hat jede Suche die Frage eingebettet und Vektoren verglichen. Hier läuft die Suche ganz ohne
// Embedding-Modell: Qdrant zerlegt die Frage in Wörter (mit demselben Stemmer und denselben
// Stoppwörtern wie den Volltextindex) und bewertet jeden Chunk mit BM25. Schritte, je Frage in
// `QUESTIONS`:
//   1. Wörter zählen: Für jedes Wort der Frage zählt das Programm, in wie vielen Chunks es steht.
//      Das ist die Grundlage der Gewichtung: Ein seltenes Wort zählt viel, ein häufiges wenig, ein
//      Stoppwort oder ein Wort, das im Korpus fehlt, gar nicht.
//   2. Suchen: Die Keyword-Suche liefert höchstens `TOP_K` Chunks, sortiert nach BM25-Wert.
//
// IDF (inverse document frequency): das Gewicht eines Worts in BM25. Je weniger Chunks ein Wort
// enthalten, desto höher sein Gewicht. "PoisonGPT" steht nur in wenigen Chunks und entscheidet die
// Suche allein; "Prompt" steht in vielen und unterscheidet kaum.
//
// Merke: Ein BM25-Wert ist keine Ähnlichkeit zwischen 0 und 1, sondern eine Summe von Gewichten;
// vergleiche die Reihenfolge, nicht den Wert mit dem aus Lektion 05. In die Trefferliste kommt nur
// ein Chunk mit mindestens einem Wort der Frage, sie kann also kürzer als `TOP_K` sein oder leer.
// Eine umgangssprachliche Frage ("ausplaudern") trifft andere Wörter als das Dokument
// ("Offenlegung"); dafür braucht es die Vektorsuche. Teil 3 kombiniert beide.
//
// Voraussetzungen: Qdrant läuft (`QDRANT_URL` in .env), und Teil 1 hat die Collections geladen
// (`npm run l06:1`). LM Studio, Chat-Modell und Open WebUI braucht dieser Teil nicht.
// Start: npm run l06:2   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Vergleiche die beiden Fragen in `QUESTIONS`: Welche Wörter der zweiten Frage zählen nicht
//      (0 Chunks), und passen ihre Treffer zur Frage?
//   2. Ergänze in `QUESTIONS` einen Fachbegriff aus einem Dokument (z. B. "LoRA" oder "Slopsquatting")
//      und vergleiche mit der Vektorsuche aus Lektion 05, Teil 1 (`QUESTION` dort ändern): Welche
//      Suche findet den Begriff zuverlässiger?
//   3. Setze `INDEX_STRATEGY` in hybrid.ts auf `prepared` und starte neu. Wie ändern sich die
//      Zählung je Wort und die BM25-Werte, wenn die Chunks größer sind?
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { logInvocation } from '../shared/logging.ts';
import { sectionPath, type ChunkMetadata } from '../shared/index.ts';
import { getQdrantClient, requireCollection, getCollectionName } from './hybrid.ts';
import { runMain } from '../shared/startup.ts';

// Die Fragen, nacheinander: ein seltener Fachbegriff und eine umgangssprachliche Frage (F-02 aus dem
// Fragen-Set von Lektion 05).
const QUESTIONS = [
  'PoisonGPT',
  'Kann mein Chatbot aus Versehen Kundendaten oder Firmengeheimnisse ausplaudern, und was tue ich dagegen?',
  'Wie wird das Wetter heute?',
];
// Wie viele Chunks die Suche höchstens liefert.
const TOP_K = 5;

// Bewusst ohne Zugriffsfilter, der Übersicht halber: Die Suche sieht alle Chunks, auch den internen Anhang. Lektion 07 ergänzt `PUBLIC_FILTER` (OWASP LLM02/LLM08).
async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt, sieht aber keinen Aufruf dieser Datei:
  // Der Qdrant-Client umgeht den globalen Dispatcher (siehe hybrid.ts).
  useBurpIfConfigured();

  await requireCollection(getCollectionName());

  for (const question of QUESTIONS) {
    try {
      await logInvocation('Keyword search', { collection: getCollectionName(), question }, async () => {
        // NEU: Schritt 1: Wörter zählen. Der Filter `match.text` nutzt den Volltextindex, also auch
        // Stemmer und Stoppwörter; `count` zählt die Chunks, die das Wort enthalten.
        const words = question.match(/[\p{L}\p{N}]+/gu) ?? [];
        const counts = await Promise.all(words.map(async (word) => {
          const { count } = await getQdrantClient().count(getCollectionName(), { filter: { must: [{ key: 'text', match: { text: word } }] }, exact: true });
          return `${word} ${count}`;
        }));
        console.log(`Keyword search (BM25) for “${question}”`);
        console.log(`Chunks per word (after stemmer and stop words): ${counts.join(' · ')}`);

        // NEU: Schritt 2: Suchen. `query.text` mit `using: 'text'` sucht im Volltextindex statt auf den
        // Vektoren, ganz ohne Embedding.
        const { points } = await getQdrantClient().query(getCollectionName(), { query: { text: question }, using: 'text', limit: TOP_K, with_payload: true });
        console.log(`Hits: ${points.length} of at most ${TOP_K}`);
        console.table(points.map(({ id, score, payload }, position) => {
          const metadata = payload as ChunkMetadata;
          return {
            rank: position + 1,
            point: id,
            // Ein BM25-Wert, keine Kosinus-Ähnlichkeit: nach oben offen, nur die Reihenfolge zählt.
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

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
