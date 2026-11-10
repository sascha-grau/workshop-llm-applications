/**
 * Logging für alle Lektionen.
 *
 * Jede Zeile hat die Form `<ISO-Zeitstempel> <LEVEL> <Meldung> { Details }`. So kannst du die
 * Ausgabe eines Programms anhand der Uhrzeit neben die Anfragen in Burps HTTP-History legen.
 *
 * Regel: Protokolliert werden Metadaten (Statuscodes, Dauer, Anzahlen), niemals Prompts oder
 * Antworten. Die einzige Ausnahme ist die Meldung eines Fehlers. Sie erklärt, was schiefging,
 * stammt aber aus einer Bibliothek oder vom Server und kann Teile einer Anfrage zitieren.
 * `redactSecrets` schwärzt darin die konfigurierten API-Schlüssel, andere Geheimnisse erkennt es
 * nicht. Im Workshop teilst du oft Bildschirm und Terminal, schau die Ausgabe also an, bevor du
 * sie weitergibst.
 */
import type { NextFunction, Request, Response, Express } from 'express';

type Level = 'INFO' | 'WARN' | 'ERROR';

/**
 * Erkennt einen Abbruch (z. B. Stopp in Open WebUI), der kein echter Fehler ist: ein `AbortError`
 * oder, mit übergebenem `signal`, der Grund, mit dem dieses Signal abgebrochen wurde.
 */
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

/**
 * Reduziert einen beliebigen Fehler auf seine Meldung und, falls vorhanden, die Meldungen seiner
 * Ursachen (`cause`, höchstens vier Ebenen). Bei Netzwerkfehlern steht dort z. B. ECONNREFUSED. Die
 * konfigurierten API-Schlüssel werden durch "[redacted]" ersetzt.
 */
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

/**
 * Gibt einen Fehler als eine ERROR-Zeile aus: `<message> – Cause: <kurze Ursache>`. Der Text vor
 * "– Cause:" sagt, was fehlgeschlagen ist, der Text danach, warum. Den Stacktrace zeigt das Log
 * nur mit gesetztem DEBUG. Ein schon protokollierter Fehler wird nicht noch einmal ausgegeben.
 * Ohne `message` dient die Meldung des Fehlers selbst als Text vor der Ursache. Die Funktion gibt
 * nichts zurück: Wer den Fehler weiterwerfen will, wirft das Original danach selbst.
 */
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

/**
 * Protokolliert Start, Ende und Dauer jeder HTTP-Anfrage, die die Fassade erhält. Registriere es
 * vor `createOllamaApiFacade`, sonst antworten zuerst die Routen der Fassade und die Anfrage
 * wird nie protokolliert.
 */
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

/**
 * Führt `fn` sofort aus und protokolliert Start, Dauer und bei einem Fehler die Zeile
 * "<label>: Call failed – Cause: …", alles unter dem Namen `label` (z. B. "Model",
 * "Embedding", "Hacker News"). `details` steht in jeder Zeile. Fehler werden weitergeworfen (schon
 * protokolliert), damit `logHttpErrors` dem Client noch antworten kann. Ein Abbruch wird nicht hier,
 * sondern nur einmal an anderer Stelle gemeldet.
 */
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
