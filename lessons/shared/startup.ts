// Gemeinsamer Rahmen für den Start eines Programms. Jede Datei einer Lektion packt ihr Programm in `runMain`.
// Wirft es einen Fehler, erscheint genau eine englische Zeile statt eines langen Stacktraces
// ("<was fehlschlug> – Cause: <warum>"), und der Prozess endet mit Exit-Code 1. Den Stacktrace
// zeigt das Log nur mit gesetztem DEBUG (z. B. `DEBUG=1 npm run l01:1`; Windows: siehe Haupt-README). Was schon protokolliert
// wurde, steht nicht noch einmal da. Ein Abbruch durch dich ist kein Fehler und wird als INFO gemeldet.
import { isAbortError, log, logError } from './logging.ts';

/** Führt `main` aus und gibt Fehler als eine Logzeile mit Ursache aus, statt das Programm abstürzen zu lassen. */
export async function runMain(main: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await main();
  } catch (error) {
    if (isAbortError(error)) {
      log('INFO', 'Request cancelled.');
      return;
    }
    logError(error);
    process.exitCode = 1;
  }
}
