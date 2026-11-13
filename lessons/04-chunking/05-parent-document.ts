// Lektion 04 – Chunking, Teil 5: Klein suchen, groß liefern (Parent-Document)
//
// Lernziel: Die Suche vergleicht die Frage mit kleinen Stücken (Kinder), geliefert wird der ganze
//           Abschnitt, aus dem das Stück stammt (Parent).
// Braucht:  Index `headings` aus `npm run l04:2`, LM Studio mit E5.
// Schreibt: nichts (die Kinder liegen nur im Speicher).
// Start:    npm run l04:5   (oder F5)
// Erklärt:  lessons/04-chunking/GUIDE.de.md → „Teil 5“
//
// Aufgabe:
//   1. Vergleiche die beiden Tabellen: Welche Parents sind länger als ihr bestes Kind, um wie viel?
//   2. `CHILD_SIZE` auf 150, danach auf 600: Wie ändern sich Zahl der Kinder, Ähnlichkeiten und Parents?
//      ↺ Danach zurück auf 300 (es entsteht kein Index; nur damit die Ausgabe zum Guide passt).
//   3. Vergleiche die gelieferten Parents mit den Top 3 aus Teil 2: Kommt ein Abschnitt neu dazu?
//
// Lesen: die Zeilen `// KERN 1–3`.
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { e5Model } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { readIndex, indexFileFor, uniqueChunks, sectionPath, type IndexEntry } from '../shared/index.ts';
import { embedTexts, splitIntoChildren, searchTop, printHits, previewChunk, DEMO_QUESTION } from './chunking.ts';
import { runMain } from '../shared/startup.ts';

// Standard: 5 Parents, die am Ende in den Prompt kämen.
const TOP_K = 5;
// Standard: 300 Zeichen je Kind (ohne Überschriftenpfad). Kleiner = mehr, genauere Kinder; ein kurzer
// Parent bleibt ein einziges Kind.
const CHILD_SIZE = 300;
// Mehr Kinder als `TOP_K`, weil mehrere zum selben Parent gehören können. Faktor 4 ist eine
// Faustregel; reicht er nicht, liefert die Suche weniger Parents (die Ausgabe zeigt die Zahl).
const CHILD_CANDIDATES = 4 * TOP_K;

async function main() {
  useBurpIfConfigured();

  const parents = loadParents();
  console.log(`Parents: ${parents.length} sections from ${indexFileFor('headings')}`);

  await checkModelServer({ viaBurp: true });

  try {
    const children = await logInvocation('Embedding', { model: remoteEmbeddingModel.name, parentCount: parents.length }, async () => {
      const entries: Child[] = [];
      let embeddingCalls = 0;
      // Eine Anfrage je Dokument wie in Teil 2. Die Parents selbst werden nicht neu eingebettet.
      for (const source of new Set(parents.map(({ metadata }) => metadata.source))) {
        // KERN 1: Jeden Parent in gleich große Kinder von etwa `CHILD_SIZE` Zeichen teilen. Jedes Kind
        // bekommt den Überschriftenpfad des Parents vorangestellt und einen Verweis auf ihn.
        const pieces = parents.filter(({ metadata }) => metadata.source === source).flatMap((parent) => splitIntoChildren(parent, CHILD_SIZE));
        const vectors = await embedTexts(pieces.map(({ text }) => `${e5Model.passagePrefix}${text}`));
        embeddingCalls += 1;
        pieces.forEach((piece, position) => entries.push({ ...piece, vector: vectors[position] }));
      }
      console.log(`${parents.length} parents → ${entries.length} children of about ${CHILD_SIZE} characters`);
      console.log(`Embedding calls: ${embeddingCalls}, LLM calls: 0`);
      return entries;
    });

    await logInvocation('Search', { model: remoteEmbeddingModel.name }, async () => {
      // KERN 2: Gesucht wird in den Kindern, mit derselben Frage wie in Teil 1 bis 4.
      const childHits = await searchTop(children, CHILD_CANDIDATES);
      console.log(`Top ${TOP_K} children for “${DEMO_QUESTION}” (what the search compares):`);
      printHits(childHits.slice(0, TOP_K));

      // KERN 3: Von Kind zu Parent. Kinder tragen die Metadaten ihres Parents, also bleibt mit
      // `uniqueChunks` das beste Kind je Parent; geliefert wird der ganze Parent.
      const delivered = uniqueChunks(childHits, TOP_K);
      const childCharacters = childHits.slice(0, TOP_K).reduce((sum, { text }) => sum + text.length, 0);
      const parentCharacters = delivered.reduce((sum, { parent }) => sum + parent.text.length, 0);
      console.log(
        `Delivered: ${delivered.length} parents from the top ${childHits.length} children` +
        ` (${parentCharacters} characters of context instead of ${childCharacters} for ${TOP_K} children)`,
      );
      console.table(delivered.map(({ parent, similarity, text }) => ({
        file: parent.metadata.source,
        // Die Ähnlichkeit des besten Kindes; der Parent selbst wurde nicht mit der Frage verglichen.
        similarity: similarity.toFixed(3),
        section: sectionPath(parent.metadata.headingPath),
        'child characters': text.length,
        'parent characters': parent.text.length,
        preview: previewChunk({ headingPath: parent.metadata.headingPath, text: parent.text }),
      })));
    });
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
  }
}

/** Ein Kind: ein Stück seines Parents, mit dessen Metadaten und einem Verweis auf ihn. */
type Child = IndexEntry & { parent: IndexEntry };

// Die Parents: der Index aus Teil 2, ein Eintrag je Abschnitt. Fehlt er, nennt die Meldung die Skripte.
function loadParents(): IndexEntry[] {
  return readIndex('headings');
}

await runMain(main);
