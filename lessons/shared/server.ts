/**
 * Hilfsfunktionen für die Programme, die die Ollama-Fassade betreiben: Fehlerbehandlung für die
 * Chat-Routen und der Serverstart auf FACADE_PORT. Außerdem weist die Fassade Anfragen mit fremdem
 * Host-Header mit 403 ab (Schutz vor DNS-Rebinding).
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { isIP } from 'node:net';
import { settings } from './config.ts';
import { EXPECTED_FACADE_VERSION, facadeRequire, facadeVersion } from './facade.ts';
import { isAbortError, log, logError } from './logging.ts';

/**
 * Richtet den JSON-Parser ein, den die Fassade braucht. Vor `createOllamaApiFacade` aufrufen.
 * Die Fassade bringt ihr eigenes Express (Version 4) mit. Wir nutzen deshalb dessen öffentlichen
 * JSON-Parser, damit Anfrage und Fassade zusammenpassen. Vorher prüft die Funktion, dass die Fassade
 * wirklich Version 1.0.7 ist und ihr Express die Hauptversion 4 hat; sonst bricht sie mit einer
 * klaren Meldung ab. Außerdem lehnt sie Anfragen mit fremdem Host-Header mit 403 ab (Schutz vor
 * DNS-Rebinding).
 */
export function prepareFacade(app: Express) {
  const expressPackage: { name?: unknown; version?: unknown } = facadeRequire('express/package.json');
  const facadeExpress: Pick<typeof import('express'), 'json'> = facadeRequire('express');
  if (facadeVersion !== EXPECTED_FACADE_VERSION || expressPackage.name !== 'express' ||
      typeof expressPackage.version !== 'string' || !expressPackage.version.startsWith('4.') ||
      typeof facadeExpress.json !== 'function') {
    throw new Error(`Expected ollama-api-facade-js ${EXPECTED_FACADE_VERSION} to resolve Express 4 with json().`);
  }
  const allowedHosts = new Set(['localhost', 'host.docker.internal', 'host.containers.internal', settings.facadeHost.toLowerCase()]);
  // Schutz vor DNS-Rebinding: Eine fremde Webseite könnte sonst über ihren eigenen Domainnamen, der auf
  // 127.0.0.1 zeigt, die Fassade in deinem Browser erreichen. Wir lassen deshalb nur localhost, IP-Adressen,
  // host.docker.internal (Docker), host.containers.internal (Podman) und den Namen aus FACADE_HOST
  // als Host-Header zu.
  app.use((request: Request, response: Response, next: NextFunction) => {
    const hostname = request.hostname?.toLowerCase() ?? '';
    const address = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
    if (allowedHosts.has(hostname) || isIP(address)) {
      next();
      return;
    }
    log('WARN', 'Rejected request with unexpected Host header. Use localhost, an IP address, host.docker.internal or the FACADE_HOST name in the Open WebUI connection.', { host: hostname || '(none)' });
    response.status(403).send('Forbidden');
  });
  app.use(facadeExpress.json({ limit: '10mb' }));
}

/**
 * Macht aus einem Fehler im Chat-Handler eine protokollierte Antwort. Registriere es nach
 * `postApiChat`: Express schickt Fehler nur an Handler, die nach der fehlerhaften Route kommen.
 * Ein Abbruch durch dich (Stopp in Open WebUI) ist kein Fehler und wird nur als INFO protokolliert.
 * Echte Fehler werden auch dann protokolliert, wenn Open WebUI die Verbindung schon geschlossen hat.
 * Die Zeile enthält die kurze Ursache; den Stacktrace gibt es nur, wenn die Umgebungsvariable DEBUG gesetzt ist.
 */
export function logHttpErrors(app: Express) {
  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (isAbortError(error)) {
      if (!response.destroyed) {
        log('INFO', 'Request cancelled.');
        response.end();
      }
      return;
    }
    logError(error, 'Request to the facade failed');
    if (response.destroyed) return;
    // Hat das Streaming schon begonnen, ist die Statuszeile raus. Dann schließt Express die Verbindung.
    if (response.headersSent) { response.end(); return; }
    const candidates = error && typeof error === 'object'
      ? ['status' in error ? error.status : undefined, 'statusCode' in error ? error.statusCode : undefined]
      : [];
    const status = candidates.find((candidate): candidate is number =>
      typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) ?? 500;
    response.status(status).json({ error: 'Die Anfrage an die Fassade ist fehlgeschlagen. Prüfe die Server-Logs.' });
  });
}

/**
 * Startet die Fassade auf FACADE_HOST und FACADE_PORT aus `.env` und protokolliert die Adresse, die
 * Open WebUI braucht. `onListening` läuft, sobald der Port belegt ist, z. B. für einen Selbsttest.
 */
export function listenWithLogging(
  app: Express,
  advertisedModel: string,
  onListening?: (address: string) => void,
) {
  const facadePort = settings.facadePort;
  const server = app.listen(facadePort, settings.facadeHost, () => {
    // Express 5 ruft diese Callback-Funktion auch auf, wenn das Binden fehlschlägt.
    if (!server.listening) return;
    const bound = server.address();
    if (!bound || typeof bound === 'string') return;
    const host = bound.address.includes(':') ? `[${bound.address}]` : bound.address;
    const address = `http://${host}:${bound.port}`;
    log('INFO', 'Facade ready', { address, advertisedModel });
    onListening?.(address);
  });

  // Häufigste Ursache: eine zweite Lektion (oder ein echtes Ollama) läuft noch auf demselben Port.
  server.on('error', (error) => {
    const message = 'code' in error && error.code === 'EADDRINUSE'
      ? `FACADE_PORT ${facadePort} is in use. Stop the other lesson or change FACADE_PORT in .env and the Ollama connection in Open WebUI.`
      : `The facade could not start on port ${facadePort}.`;
    logError(error, message);
    process.exitCode = 1;
  });
  return server;
}
