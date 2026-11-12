// Lektion 08 – Evaluierung, Teil 4: Regression – jeden Lauf speichern und mit dem letzten vergleichen
//
// Lernziel: Du speicherst jede Messung und vergleichst sie mit der vorigen. So siehst du, ob eine
// Änderung (anderes k, anderes Chunking, anderes Modell) die Suche besser oder schlechter macht,
// und erkennst eine Verschlechterung (Regression), bevor sie in den Betrieb geht.
//
// Teil 1 liefert zwei Zahlen. Eine einzelne Zahl sagt aber wenig: Ist eine Trefferquote von 0,83
// gut? Das zeigt erst der Vergleich mit dem Lauf davor. Dieser Teil misst wie Teil 1, schreibt das
// Ergebnis als JSON-Datei nach `results/lesson-08-regression/` und zeigt die Differenz zum jüngsten
// gespeicherten Lauf. Schritte:
//   1. Index und Fragen-Set laden: der Überschriften-Index aus Lektion 04, Teil 2, vollständig wie
//      in Teil 1, und das Fragen-Set aus Lektion 05.
//   2. Vorlauf laden: die jüngste Datei in `RESULTS_DIRECTORY`, falls es eine gibt.
//   3. Messen: Trefferquote und MRR über alle Fragen mit erwartetem Dokument (`measureRetrieval`,
//      dieselbe Rechnung wie Teil 1).
//   4. Vergleichen: Tabelle mit Vorlauf, diesem Lauf und Differenz; Hinweis, wenn die Läufe nicht
//      vergleichbar sind (anderes Modell, anderer Index, andere Zahl von Fragen).
//   5. Speichern: dieser Lauf als neue Datei, benannt nach Datum und Uhrzeit.
//
// KERN: Vergleichbar sind zwei Läufe nur, wenn sich genau eine Sache geändert hat. Jeder Lauf
// speichert deshalb nicht nur seine Zahlen, sondern auch, womit er gemessen hat: Embedding-Modell,
// Index, `TOP_K` und die Zahl der Fragen. Ändert sich mehr als das, was du prüfen willst, misst
// die Differenz zwei Dinge auf einmal.
//
// Merke: Die Suche ist deterministisch: Ohne Änderung ergibt ein neuer Lauf dieselben Zahlen, jede
// Differenz kommt also von deiner Änderung. In einer Build-Pipeline (CI) würde ein Rückgang den
// Build scheitern lassen; hier meldet das Programm ihn nur und endet normal, denn ein Rückgang ist
// ein Messergebnis, kein Programmfehler. Der Ordner `results/` steht in `.gitignore`: Die Läufe
// gehören zu deinem Rechner, wie die Indizes.
//
// Voraussetzungen: wie Teil 1. LM Studio läuft mit gestartetem Server und geladenem E5-Modell;
// der Index aus Lektion 04, Teil 2 muss existieren (erst `npm run l04:0`, dann `npm run l04:2`).
// Ein Chat-Modell und Open WebUI braucht dieser Teil nicht. Burp ist optional.
// Start: npm run l08:4   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Starte das Programm zweimal, ohne etwas zu ändern. Was zeigt der Vergleich beim zweiten
//      Lauf? (Erwartung: Beide Kennzahlen "unchanged", denn die Suche ist deterministisch.)
//   2. Setze `TOP_K` auf 3 und starte erneut. Welche Kennzahl sinkt, welche kaum, und meldet das
//      Programm eine Regression? Setze `TOP_K` danach zurück auf 5 und vergleiche noch einmal.
//      (Erwartung: Die Trefferquote sinkt eher als der MRR, siehe Teil 1, Aufgabe 2.)
//   3. Ergänze in `../05-retrieval-strategies/question-set.json` eine eigene Frage (wie in Teil 1,
//      Aufgabe 3) und starte erneut. Warum warnt das Programm, dass die Läufe nicht vergleichbar
//      sind, und was müsstest du tun, um die Wirkung einer Änderung trotzdem sauber zu messen?
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteEmbeddingModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { indexFileFor } from '../shared/index.ts';
import { rootPath } from '../shared/paths.ts';
import { loadIndex, loadQuestionSet, INDEX_STRATEGY } from '../05-retrieval-strategies/retrieval.ts';
import { measureRetrieval } from './evaluation.ts';
import { runMain } from '../shared/startup.ts';

// Ändere `TOP_K` (etwa auf 3) und starte erneut: Die Differenz zum Vorlauf zeigt, was die Änderung bewirkt.
const TOP_K = 5;
// Hier liegen die gespeicherten Läufe, eine JSON-Datei je Lauf. Ein eigener Ordner je Teil, damit
// nur Läufe dieser Messung verglichen werden.
const RESULTS_DIRECTORY = rootPath('results', 'lesson-08-regression');
// Kleinere Differenzen gelten als unverändert: Die Kennzahlen werden mit zwei Nachkommastellen
// gezeigt, und Rundungsreste sollen keine Regression melden.
const TOLERANCE = 0.005;

// Ein gespeicherter Lauf: womit gemessen wurde und was herauskam. Die Datei kommt von der Platte
// und kann von Hand geändert worden sein, deshalb prüft das Schema sie beim Lesen.
const runSchema = z.object({
  createdAt: z.string(),
  embeddingModel: z.string(),
  indexStrategy: z.string(),
  topK: z.number().int().positive(),
  questionCount: z.number().int().nonnegative(),
  hitRatio: z.number(),
  mrr: z.number(),
});
type Run = z.infer<typeof runSchema>;

async function main() {
  // Burp (Lektion 01, Teil 3) bleibt aktiv, falls gesetzt: Er zeigt je Frage eine Anfrage an das
  // Embedding-Modell.
  useBurpIfConfigured();

  // Schritt 1: Index vollständig laden wie in Teil 1 (Frage F-11 erwartet den internen Anhang)
  // und das Fragen-Set aus Lektion 05.
  const index = loadIndex();
  const questionSet = loadQuestionSet();
  console.log(`Index: ${index.length} chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  // Schritt 2: Vorlauf laden, vor der Messung: Ist die Datei kaputt, bricht das Programm ab, bevor
  // es Anfragen schickt. Der Ordner entsteht beim ersten Lauf.
  mkdirSync(RESULTS_DIRECTORY, { recursive: true });
  const previous = loadLatestRun();

  await checkModelServer({ viaBurp: true });

  // Schritt 3: Messen, dieselbe Rechnung wie Teil 1.
  let scores;
  try {
    scores = await measureRetrieval(index, questionSet.questions, TOP_K);
  } catch {
    // logInvocation hat den Fehler schon protokolliert; es bleibt nur der Exit-Code.
    process.exitCode = 1;
    return;
  }
  const run: Run = {
    createdAt: new Date().toISOString(),
    embeddingModel: remoteEmbeddingModel.name,
    indexStrategy: INDEX_STRATEGY,
    topK: TOP_K,
    ...scores,
  };

  // NEU: Schritt 4: Vergleichen.
  if (previous) {
    compareRuns(previous.run, run, previous.file);
  } else {
    console.log(`No previous run in ${RESULTS_DIRECTORY}; this run becomes the baseline.`);
    console.log(`Hit ratio: ${run.hitRatio.toFixed(2)} · MRR: ${run.mrr.toFixed(2)} (top-${run.topK}, ${run.questionCount} questions)`);
  }

  // Schritt 5: Speichern. Der Dateiname ist Datum und Uhrzeit (ohne ":", das Windows nicht
  // erlaubt); so sortiert der jüngste Lauf alphabetisch nach hinten.
  const file = join(RESULTS_DIRECTORY, `${run.createdAt.replaceAll(':', '-')}.json`);
  writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
  console.log(`Saved: ${file}`);
}

// Liest den jüngsten gespeicherten Lauf oder `undefined`, wenn es noch keinen gibt. Eine kaputte
// Datei bricht mit einer klaren Meldung ab, statt still einen falschen Vergleich zu rechnen.
function loadLatestRun(): { file: string; run: Run } | undefined {
  const latest = readdirSync(RESULTS_DIRECTORY).filter((name) => name.endsWith('.json')).sort().at(-1);
  if (!latest) return undefined;
  const file = join(RESULTS_DIRECTORY, latest);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`Cannot read the previous run ${file}. Delete the file and run again.`);
  }
  const parsed = runSchema.safeParse(json);
  if (!parsed.success) throw new Error(`The previous run ${file} has an unexpected shape. Delete the file and run again.`);
  return { file, run: parsed.data };
}

// KERN: Zeigt Vorlauf, diesen Lauf und die Differenz und meldet eine Regression, wenn eine
// Kennzahl um mehr als `TOLERANCE` sinkt. Vorher prüft sie, ob die Läufe überhaupt vergleichbar sind.
function compareRuns(previous: Run, current: Run, previousFile: string): void {
  console.log(`Previous run: ${previousFile}`);
  const differences = [
    previous.embeddingModel !== current.embeddingModel && 'embedding model',
    previous.indexStrategy !== current.indexStrategy && 'index',
    previous.questionCount !== current.questionCount && 'number of questions',
  ].filter((difference) => difference !== false);
  if (differences.length) {
    console.log(`Warning: the runs differ in ${differences.join(', ')}; the change below does not measure one change alone.`);
  }

  // Differenz mit Vorzeichen; Anzahlen ganzzahlig (`digits` 0), Kennzahlen mit zwei Nachkommastellen.
  const change = (before: number, after: number, digits = 2) => {
    const delta = after - before;
    return Math.abs(delta) < TOLERANCE ? 'unchanged' : `${delta > 0 ? '+' : ''}${delta.toFixed(digits)}`;
  };
  console.table([
    { measure: 'top-k', previous: previous.topK, current: current.topK, change: change(previous.topK, current.topK, 0) },
    { measure: 'questions', previous: previous.questionCount, current: current.questionCount, change: change(previous.questionCount, current.questionCount, 0) },
    { measure: 'hit ratio', previous: previous.hitRatio.toFixed(2), current: current.hitRatio.toFixed(2), change: change(previous.hitRatio, current.hitRatio) },
    { measure: 'MRR', previous: previous.mrr.toFixed(2), current: current.mrr.toFixed(2), change: change(previous.mrr, current.mrr) },
  ]);

  const dropped = [
    current.hitRatio < previous.hitRatio - TOLERANCE && 'hit ratio',
    current.mrr < previous.mrr - TOLERANCE && 'MRR',
  ].filter((measure) => measure !== false);
  console.log(dropped.length
    ? `Regression: ${dropped.join(' and ')} dropped compared with the previous run.`
    : 'No regression: no measure dropped compared with the previous run.');
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
