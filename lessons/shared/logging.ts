// Logzeilen `<ISO-Zeitstempel> <LEVEL> <Meldung> { Details }`, per Uhrzeit neben Burps HTTP-History lesbar.
// Regel: nur Metadaten (Status, Dauer, Anzahlen), nie Prompts oder Modelltext. Ausnahme: Fehlermeldungen von
// Bibliothek oder Server; darin schwärzt `redactSecrets` nur REMOTE_MODEL_API_KEY. Übersicht: lessons/shared/README.de.md
import type { NextFunction, Request, Response, Express } from 'express';

type Level = 'INFO' | 'WARN' | 'ERROR';

/** Ein Abbruch (z. B. Stopp in Open WebUI) ist kein Fehler: ein `AbortError` oder, mit `signal`, dessen Grund. */
export const isAbortError = (error: unknown, signal?: AbortSignal): boolean =>
  (error instanceof Error && error.name === 'AbortError') ||
  (signal?.aborted === true && error === signal.reason);

function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  function visit(value: unknown, depth: number): void {
    if (value === undefined || value === null || depth >= 4 || seen.has(value)) return;
    seen.add(value);
    chain.push(value);
    if (typeof value === 'object') {
      if ('cause' in value) visit(value.cause, depth + 1);
      if (value instanceof AggregateError) {
        for (const nested of value.errors) visit(nested, depth + 1);
      }
    }
  }
  visit(error, 0);
  return chain;
}

/** Die Stacktraces der Fehlerkette (API-Schlüssel geschwärzt), nur wenn DEBUG gesetzt ist. */
export function debugErrorDetails(error: unknown) {
  if (!process.env.DEBUG) return {};
  const stacks = errorChain(error).flatMap((entry) =>
    entry instanceof Error && entry.stack ? [redactSecrets(entry.stack)] : []);
  return stacks.length ? { stack: [...new Set(stacks)].join('\nCaused by: ') } : {};
}

/** Gibt eine Logzeile aus: Fehler auf stderr, alles andere auf stdout. */
export function log(level: Level, message: string, details: object = {}) {
  const output = level === 'ERROR' ? console.error : console.log;
  const line = `${new Date().toISOString()} ${level} ${message}`;
  if (Object.keys(details).length) output(line, details);
  else output(line);
}

function redactSecrets(value: string): string {
  const secret = process.env.REMOTE_MODEL_API_KEY?.trim();
  return secret ? value.replaceAll(secret, '[redacted]') : value;
}

/** Meldung eines Fehlers plus die seiner Ursachen (`cause`, AggregateError), etwa ECONNREFUSED bei
 *  Netzwerkfehlern; der API-Schlüssel wird zu "[redacted]". */
export function errorDetails(error: unknown) {
  const messages = errorChain(error).map((entry) => {
    const text = entry instanceof Error ? entry.message
      : typeof entry === 'object' && entry !== null && 'message' in entry ? String(entry.message) : String(entry);
    const code = typeof entry === 'object' && entry !== null && 'code' in entry && entry.code != null ? String(entry.code) : '';
    return redactSecrets(code && !text.includes(code) ? `${text}${text ? ' ' : ''}(${code})` : text).replace(/\s+/g, ' ').trim();
  });
  const message = messages[0] ?? redactSecrets(String(error));
  const causes = messages.slice(1).filter((part, index) => part && part !== message && messages.indexOf(part) === index + 1);
  return { message, cause: causes.length ? causes.join(' – ') : undefined };
}

// Merkt sich, welche Fehler schon protokolliert wurden, damit derselbe Fehler nicht zweimal erscheint.
const loggedErrors = new WeakSet<object>();

/** Eine ERROR-Zeile `<message> – Cause: <Ursache>`: vorne, was scheiterte (ohne `message` die Fehlermeldung),
 *  hinten, warum. Stacktrace nur mit DEBUG. Jeder Fehler erscheint einmal; weiterwerfen muss der Aufrufer. */
export function logError(error: unknown, message?: string, details: object = {}): void {
  const failure = error !== null && (typeof error === 'object' || typeof error === 'function')
    ? error
    : new Error(String(error));
  if (!loggedErrors.has(failure)) {
    const summary = errorDetails(failure);
    const causes = message ? [summary.message, summary.cause] : [summary.cause];
    const cause = causes.filter((part, index) => part && causes.indexOf(part) === index).join(' – ');
    const line = `${message ?? summary.message}${cause ? ` – Cause: ${cause}` : ''}`;
    log('ERROR', redactSecrets(line).replace(/\s+/g, ' ').trim(), { ...details, ...debugErrorDetails(failure) });
    loggedErrors.add(failure);
  }
}

/** Start, Ende und Dauer jeder Anfrage an die Fassade. Vor `createOllamaApiFacade` registrieren, sonst
 *  antworten deren Routen zuerst und nichts wird protokolliert. */
export function logHttpRequests(app: Express) {
  let requestCount = 0;

  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = ++requestCount;
    const started = Date.now();
    log('INFO', 'HTTP request started', { requestId, method: request.method, path: request.path });

    response.on('finish', () => {
      // Nur Serverfehler (5xx) zählen als Fehler. Open WebUI fragt regelmäßig Endpunkte ab, die die
      // Fassade nicht kennt (z. B. GET /api/ps). Diese 404er sind normal und würden das Log fluten.
      const level = response.statusCode >= 500 ? 'ERROR' : 'INFO';
      log(level, 'HTTP request completed', { requestId, status: response.statusCode, durationMs: Date.now() - started });
    });
    // 'close' ohne abgeschlossene Antwort heißt: Open WebUI hat die Anfrage abgebrochen.
    response.on('close', () => {
      if (!response.writableFinished) log('INFO', 'Request cancelled.', { requestId });
    });
    next();
  });
}

/** Führt `fn` aus und protokolliert Start, Dauer und Fehler unter `label`. Fehler werden protokolliert weitergeworfen,
 *  damit `logHttpErrors` noch antworten kann; einen Abbruch meldet eine andere Stelle, einmal. */
export async function logInvocation<T>(
  label: string,
  details: object,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  log('INFO', `${label}: Call started`, details);
  try {
    const result = await fn();
    log('INFO', `${label}: Call completed`, { ...details, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    if (isAbortError(error)) throw error;
    logError(error, `${label}: Call failed`, {
      ...details, durationMs: Date.now() - started,
    });
    throw error;
  }
}
