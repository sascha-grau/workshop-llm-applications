// Lektion 07 – RAG, Teil 4: RAG mit Parent-Document-Retrieval
//
// Lernziel: Über kleine Kinder suchen, den ganzen Abschnitt (Parent) in den Prompt legen.
// Braucht:  Index aus `npm run l04:0` und `npm run l04:2`; LM Studio mit E5 schon beim Start.
//           Nur ein Teil von Lektion 07 zur Zeit (gleicher FACADE_PORT): den laufenden mit Strg+C beenden.
// Start:    npm run l07:4   (oder F5), Modell `lesson-07-parent-document`
// Erklärt:  lessons/07-rag-open-webui/GUIDE.de.md → „Teil 4“
//
// Aufgabe:
//   1. Frage "Wie begrenze ich Prompt Injection?": Vergleiche Quellen und Antwort mit Teil 1.
//   2. `CHILD_SIZE` auf 150, neu starten: Wie ändert sich die Zeile `Parent-document index ready`?
//      ↺ Danach `CHILD_SIZE` auf 300 und neu starten.
//   3. Frage nach einem Detail mitten in einem langen Abschnitt: Findet Teil 4 ihn eher als Teil 1?
//
// Lesen: die Zeilen `// KERN 1–2`. Der Rest des Ablaufs ist wie in Teil 1.
import { createRagAnswer, loadRagIndex, startRag } from './rag.ts';
import { buildChildren, parentRetrieval } from './parent-document.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-07-parent-document';
// Standard: 5. So viele verschiedene Parents (ganze Abschnitte) kommen in den Prompt.
const TOP_K = 5;
// Standard: 300 Zeichen. Kleiner = genauerer Vektor, aber mehr Kinder und längeres Einbetten beim Start.
const CHILD_SIZE = 300;
// Mehr als `TOP_K`, weil mehrere Kinder zum selben Parent gehören können.
const CHILD_CANDIDATES = 4 * TOP_K;

async function main() {
  const parents = loadRagIndex('headings');
  // Die Kinder brauchen das Embedding-Modell schon beim Start. `checkServer` prüft den Server
  // deshalb vorab; die Prüfung läuft nur einmal, `startRag` wiederholt sie nicht.
  await startRag(async (checkServer) => {
    await checkServer();
    // KERN 1: Parents in Kinder teilen und einbetten, nur im Speicher, bei jedem Start neu.
    const children = await buildChildren(parents, CHILD_SIZE);
    return {
      advertisedModel: ADVERTISED_MODEL,
      // KERN 2: Über die Kinder suchen, ihre Parents liefern.
      answer: createRagAnswer(parents, TOP_K, parentRetrieval(children, CHILD_CANDIDATES)),
    };
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
