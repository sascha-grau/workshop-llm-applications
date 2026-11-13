// Gemeinsamer Startrahmen für jedes Programm. Übersicht: lessons/shared/README.de.md
import { isAbortError, log, logError } from './logging.ts';

/** Ein Fehler wird eine englische Zeile `<was fehlschlug> – Cause: <warum>` mit Exit-Code 1 statt eines
 *  Stacktraces (den gibt es mit DEBUG). Ein Abbruch durch dich ist kein Fehler, nur INFO. */
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
