// Lektion 08 – Evaluierung, Teil 4: Regression – jeden Lauf speichern und mit dem letzten vergleichen
//
// Lernziel: Du erkennst eine Verschlechterung (Regression) im Vergleich mit dem vorigen Lauf.
// Braucht:  wie Teil 1 (LM Studio mit E5-Modell, Index aus `npm run l04:2`).
// Schreibt: je Lauf eine JSON-Datei nach `results/lesson-08-regression/`; der nächste Lauf liest sie.
// Start:    npm run l08:4   (oder F5)
// Erklärt:  lessons/08-evaluations/GUIDE.de.md → „Teil 4“
//
// Aufgabe:
//   1. Sage vorher, was der Vergleich zeigt, wenn du zweimal ohne Änderung startest. Prüfe es dann.
//   2. Setze `TOP_K` auf 3 und starte. Welche Kennzahl sinkt, meldet das Programm eine Regression?
//      ↺ Danach zurücksetzen: `TOP_K` auf `5` und einmal starten (neuer Vergleichslauf).
//   3. Ergänze eine Frage in `../05-retrieval-strategies/question-set.json` und starte. Warum warnt es?
//      ↺ Danach die Frage löschen und einmal starten (die Datei ist geteilt mit l05:5, l08:1 bis l08:6).
//
// Lesen: die Zeilen `// KERN 1–4`. Der Rest ist Handwerk.
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

// Standard: 5, wie Teil 1. Kleiner = niedrigere Trefferquote.
const TOP_K = 5;
// Eigener Ordner, damit nur Läufe dieser Messung verglichen werden. Steht in `.gitignore`.
const RESULTS_DIRECTORY = rootPath('results', 'lesson-08-regression');
// Standard: 0.005. Kleinere Differenzen gelten als unverändert, damit Rundungsreste der zwei
// angezeigten Nachkommastellen keine Regression melden. Größer = toleranter.
const TOLERANCE = 0.005;

// KERN 2: Ein Lauf speichert neben den Zahlen, womit gemessen wurde. Nur so lässt sich später
// prüfen, ob sich genau eine Sache geändert hat. Die Datei kann von Hand geändert sein: Schema.
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
  useBurpIfConfigured();

  // Vollständig wie in Teil 1 (F-11 erwartet den internen Anhang).
  const index = loadIndex();
  const questionSet = loadQuestionSet();
  console.log(`Index: ${index.length} chunks from ${indexFileFor(INDEX_STRATEGY)}`);

  // KERN 1: Vorlauf laden, vor der Messung: Ist die Datei kaputt, bricht das Programm ab, bevor es
  // Anfragen schickt.
  mkdirSync(RESULTS_DIRECTORY, { recursive: true });
  const previous = loadLatestRun();

  await checkModelServer({ viaBurp: true });

  // Dieselbe Rechnung wie Teil 1, nur ohne Tabelle (`measureRetrieval` in evaluation.ts).
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

  if (previous) {
    compareRuns(previous.run, run, previous.file);
  } else {
    console.log(`No previous run in ${RESULTS_DIRECTORY}; this run becomes the baseline.`);
    console.log(`Hit ratio: ${run.hitRatio.toFixed(2)} · MRR: ${run.mrr.toFixed(2)} (top-${run.topK}, ${run.questionCount} questions)`);
  }

  // Dateiname = Zeitstempel ohne ":" (Windows verbietet es); so sortiert der jüngste Lauf nach hinten.
  const file = join(RESULTS_DIRECTORY, `${run.createdAt.replaceAll(':', '-')}.json`);
  writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
  console.log(`Saved: ${file}`);
}

// Eine kaputte Datei bricht mit klarer Meldung ab, statt still einen falschen Vergleich zu rechnen.
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

function compareRuns(previous: Run, current: Run, previousFile: string): void {
  console.log(`Previous run: ${previousFile}`);
  // KERN 3: Erst prüfen, ob die Läufe vergleichbar sind. Ändert sich mehr als eine Sache, misst die
  // Differenz zwei Dinge auf einmal.
  const differences = [
    previous.embeddingModel !== current.embeddingModel && 'embedding model',
    previous.indexStrategy !== current.indexStrategy && 'index',
    previous.questionCount !== current.questionCount && 'number of questions',
  ].filter((difference) => difference !== false);
  if (differences.length) {
    console.log(`Warning: the runs differ in ${differences.join(', ')}; the change below does not measure one change alone.`);
  }

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

  // KERN 4: Regression = eine Kennzahl sinkt um mehr als `TOLERANCE`. Ein Messergebnis, kein
  // Programmfehler, deshalb Exit-Code 0 (in CI würde man hier den Build scheitern lassen).
  const dropped = [
    current.hitRatio < previous.hitRatio - TOLERANCE && 'hit ratio',
    current.mrr < previous.mrr - TOLERANCE && 'MRR',
  ].filter((measure) => measure !== false);
  console.log(dropped.length
    ? `Regression: ${dropped.join(' and ')} dropped compared with the previous run.`
    : 'No regression: no measure dropped compared with the previous run.');
}

await runMain(main);
