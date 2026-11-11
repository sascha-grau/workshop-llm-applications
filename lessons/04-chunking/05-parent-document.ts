// Lektion 04 – Chunking, Teil 5: Klein suchen, groß liefern (Parent-Document)
//
// Lernziel: Du verstehst Parent-Document-Retrieval (auch "Small-to-Big"): Die Suche vergleicht die
// Frage mit kleinen Stücken, geliefert wird der ganze Abschnitt, aus dem das Stück stammt.
//
// Teil 2 (`02-heading-chunking.ts`) hat gezeigt: Ein kleiner, thematisch reiner Chunk hat einen
// genaueren Vektor. Für die Antwort braucht das Sprachmodell aber den Zusammenhang, also eher den
// ganzen Abschnitt. Parent-Document trennt beides: Jeder Abschnitt aus dem Index von Teil 2 ist
// ein "Parent". Das Programm teilt ihn in gleich große "Kinder" von etwa `CHILD_SIZE` Zeichen und
// bettet nur die Kinder ein. Jedes Kind beginnt mit dem Überschriftenpfad seines Parents (wie in
// Teil 2) und trägt einen Verweis auf ihn. Der Parent selbst wird hier nicht neu eingebettet; er
// reist nur mit.
//
// Die Suche findet Kinder. Stehen mehrere Kinder desselben Parents oben, zählt nur das beste;
// deshalb holt die Suche `CHILD_CANDIDATES` Kinder, mehr als `TOP_K`. Geliefert werden die ersten
// `TOP_K` verschiedenen Parents, jeder einmal und vollständig.
//
// Diese Demo hält die Kinder nur im Speicher und schreibt keinen Index. Jeder Lauf bettet sie neu
// ein, eine Anfrage pro Dokument; ein Sprachmodell ist nicht beteiligt.
//
// Merke: Das Kind bestimmt, ob ein Abschnitt gefunden wird, der Parent, was im Prompt steht. Mehr
// Kontext heißt auch mehr Zeichen und Tokens: Vergleiche die Zeichenzahl der Kinder mit der der
// Parents. Die Kinder hier sind einfach nach Zeichen geschnitten, auch mitten im Wort; der
// Überschriftenpfad sorgt dafür, dass jedes Kind trotzdem weiß, wohin es gehört.
//
// Voraussetzungen: LM Studio läuft mit gestartetem Server und geladenem E5-Modell; der Index aus
// Teil 2 existiert (erst `npm run l04:0`, dann `npm run l04:2`). Burp ist optional.
// Start: npm run l04:5   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Vergleiche die beiden Tabellen: Wie viele der besten Kinder gehören zum selben Parent, und
//      wie viel länger ist der gelieferte Kontext als die Kinder allein?
//   2. Setze `CHILD_SIZE` auf 150 und danach auf 600. Wie ändern sich die Zahl der Kinder, die
//      Ähnlichkeiten und die gelieferten Parents?
//   3. Vergleiche die gelieferten Parents mit den Treffern aus Teil 2 (`npm run l04:2`). Findet
//      die Suche über Kinder andere Abschnitte für `DEMO_QUESTION`?
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { e5Model } from '../shared/embeddings.ts';
import { logInvocation } from '../shared/logging.ts';
import { readIndex, indexFileFor, uniqueChunks, sectionPath, type IndexEntry } from '../shared/index.ts';
import { embedTexts, splitIntoChildren, searchTop, printHits, previewChunk, DEMO_QUESTION } from './chunking.ts';
import { runMain } from '../shared/startup.ts';

// Wie viele Parents am Ende in den Prompt kämen.
const TOP_K = 5;
// NEU: Die Größe eines Kindes in Zeichen (ohne den Überschriftenpfad davor). Ein Parent bekommt so
// viele Kinder, dass jedes etwa so lang ist; ein kurzer Parent bleibt ein einziges Kind.
const CHILD_SIZE = 300;
// Wie viele Kinder die Suche holt. Mehrere davon können zum selben Parent gehören, deshalb mehr
// als `TOP_K`. Der Faktor 4 ist eine Faustregel, kein gemessener Wert: Ein Abschnitt hat bei
// `CHILD_SIZE = 300` meist nur wenige Kinder, daher ergeben 4 Kinder je gewünschtem Parent mit hoher
// Wahrscheinlichkeit mindestens `TOP_K` verschiedene Parents. Reicht es nicht, liefert die Suche
// weniger Parents (die Ausgabe zeigt die Zahl); ein größerer Faktor kostet nur etwas Rechenzeit.
const CHILD_CANDIDATES = 4 * TOP_K;

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Jedes Dokument ist eine Anfrage, mit den
  // Texten der Kinder hinaus und den rohen Vektoren zurück.
  useBurpIfConfigured();

  // Die Parents: der Index aus Teil 2, ein Eintrag je Abschnitt.
  const parents = loadParents();
  console.log(`Parents: ${parents.length} sections from ${indexFileFor('headings')}`);

  await checkModelServer({ viaBurp: true });

  try {
    const children = await logInvocation('Embedding', { model: remoteEmbeddingModel.name, parentCount: parents.length }, async () => {
      const entries: Child[] = [];
      let embeddingCalls = 0;
      // Eine Anfrage pro Dokument, wie in Teil 2: Die Parents stehen im Index nach Dokument sortiert.
      for (const source of new Set(parents.map(({ metadata }) => metadata.source))) {
        // NEU: Teilt einen Parent in gleich große Kinder von etwa `CHILD_SIZE` Zeichen. Der Text eines
        // Parents beginnt mit seinem Überschriftenpfad (siehe `splitByHeadings` in chunking.ts); geteilt
        // wird nur der Text danach, und jedes Kind bekommt den Pfad wieder vorangestellt.
        const pieces = parents.filter(({ metadata }) => metadata.source === source).flatMap((parent) => splitIntoChildren(parent, CHILD_SIZE));
        // Das Präfix "passage: " gehört zum Modell, nicht zum Kind (siehe Lektion 03, Teil 3).
        const vectors = await embedTexts(pieces.map(({ text }) => `${e5Model.passagePrefix}${text}`));
        embeddingCalls += 1;
        pieces.forEach((piece, position) => entries.push({ ...piece, vector: vectors[position] }));
      }
      console.log(`${parents.length} parents → ${entries.length} children of about ${CHILD_SIZE} characters`);
      console.log(`Embedding calls: ${embeddingCalls}, LLM calls: 0`);
      return entries;
    });

    await logInvocation('Search', { model: remoteEmbeddingModel.name }, async () => {
      // NEU: Gesucht wird in den Kindern, mit derselben Frage wie in Teil 1 bis 4.
      const childHits = await searchTop(children, CHILD_CANDIDATES);
      console.log(`Top ${TOP_K} children for “${DEMO_QUESTION}” (what the search compares):`);
      printHits(childHits.slice(0, TOP_K));

      // NEU: Von Kind zu Parent. Kinder tragen die Metadaten ihres Parents, also bleibt mit
      // `uniqueChunks` das beste Kind je Parent; geliefert wird dann der ganze Parent.
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

// Lädt den Index aus Teil 2. Fehlt die Datei oder ist sie veraltet, sagt die Meldung, welche
// npm-Skripte sie erzeugen.
function loadParents(): IndexEntry[] {
  return readIndex('headings');
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
