// Lektion 07 – RAG, Teil 4: RAG mit Parent-Document-Retrieval
//
// Lernziel: Du siehst, wie Parent-Document-Retrieval (Lektion 04, Teil 5) in einen vollständigen
// RAG-Ablauf passt: Die Suche läuft über kleine Kinder, im Prompt steht der ganze Abschnitt.
//
// Gegenüber Teil 1 (`01-heading-rag.ts`, die Referenz mit dem vollständigen Ablauf) ändert sich nur
// die Trefferauswahl. Der Index bleibt der Überschriften-Index aus Lektion 04, Teil 2; seine
// Abschnitte sind die Parents. Beim Start teilt `buildChildren` (aus `parent-document.ts`) jeden
// Parent in Kinder von etwa `CHILD_SIZE` Zeichen und bettet sie ein (eine Anfrage pro Dokument,
// das dauert einen Moment). Pro Frage sucht `parentRetrieval` über die Kinder, holt dazu
// `CHILD_CANDIDATES` Treffer und liefert die ersten `TOP_K` verschiedenen Parents. Das Modell
// bekommt also ganze Abschnitte als Kontext, auch wenn nur ein kleines Stück der Frage ähnelt. Der
// Preis: mehr Zeichen und Tokens im Prompt als bei Kindern allein.
//
// Es kann immer nur ein Teil von Lektion 07 laufen (gleicher Port, FACADE_PORT): Beende vorher
// den anderen mit Strg+C. In Open WebUI erscheint dieser Teil als Modell
// `lesson-07-parent-document`; lade bei Bedarf die Modellliste neu.
//
// Voraussetzungen: wie Teil 1, mit dem Index aus Lektion 04, Teil 2 (erst `npm run l04:0`, dann
// `npm run l04:2`). Die Kinder legt dieser Teil selbst im Speicher an, es gibt keinen eigenen
// Index; dafür muss LM Studio schon beim Start mit dem E5-Modell laufen. Burp ist optional.
// Start: npm run l07:4
//
// Aufgabe:
//   1. Stelle dieselbe Frage (z. B. "Wie begrenze ich Prompt Injection?") in Teil 1 und Teil 4.
//      Vergleiche in der Zeile `RAG sources` und in der Antwort: Sind die Abschnitte dieselben,
//      und wirkt die Antwort mit den vollständigen Parents ausführlicher?
//   2. Setze `CHILD_SIZE` auf 150 und auf 600 und starte jeweils neu. Wie ändern sich die
//      Quellen und die Dauer der Antwort (mehr Kinder heißt längeres Einbetten beim Start)?
//   3. Stelle eine sehr spezielle Frage zu einem Detail mitten in einem langen Abschnitt. Findet
//      Teil 4 den Abschnitt eher als Teil 1, in dem der ganze Abschnitt eingebettet ist?
import { createRagAnswer, loadRagIndex, startRag } from './rag.ts';
import { buildChildren, parentRetrieval } from './parent-document.ts';
import { runMain } from '../shared/startup.ts';

// Name, unter dem die Fassade das Modell in Open WebUI anbietet.
const ADVERTISED_MODEL = 'lesson-07-parent-document';
// So viele Parents (ganze Abschnitte) kommen als Kontext in den Prompt.
const TOP_K = 5;
// Größe eines Kindes in Zeichen (Lektion 04, Teil 5). Kleiner heißt genauerer Vektor, aber mehr Kinder
// und längeres Einbetten beim Start.
const CHILD_SIZE = 300;
// So viele Kinder holt die Suche, bevor sie nach Parents zusammenfasst. Mehrere Kinder können zum
// selben Parent gehören, deshalb mehr als `TOP_K`.
const CHILD_CANDIDATES = 4 * TOP_K;

async function main() {
  // Die Parents: der Überschriften-Index aus Lektion 04, Teil 2 (nur öffentliche Chunks).
  const parents = loadRagIndex('headings');
  // Die Kinder brauchen schon beim Start das Embedding-Modell. `startRag` richtet Burp einmal ein und
  // reicht eine gemeinsame, nur einmal ausgeführte Erreichbarkeitsprüfung (`checkServer`) an die
  // übergebene Funktion weiter; `startRag` prüft damit nicht ein zweites Mal.
  await startRag(async (checkServer) => {
    await checkServer();
    // Kinder bilden und einbetten (nur im Speicher, kein Index auf der Platte).
    const children = await buildChildren(parents, CHILD_SIZE);
    return {
      advertisedModel: ADVERTISED_MODEL,
      // Die Trefferauswahl sucht über die Kinder und liefert ihre Parents.
      answer: createRagAnswer(parents, TOP_K, parentRetrieval(children, CHILD_CANDIDATES)),
    };
  });
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
