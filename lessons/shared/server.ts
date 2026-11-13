// Die Ollama-Fassade betreiben: vorbereiten (Host-Prüfung, JSON-Parser), Fehler beantworten, starten.
// Übersicht: lessons/shared/README.de.md
import type { Express, NextFunction, Request, Response } from 'express';
import { isIP } from 'node:net';
import { settings } from './config.ts';
import { EXPECTED_FACADE_VERSION, facadeRequire, facadeVersion } from './facade.ts';
import { isAbortError, log, logError } from './logging.ts';

// UMGEHUNG (ollama-api-facade-js 1.0.7): Die Fassade bringt ihr eigenes Express 4 mit; nur dessen JSON-Parser passt
// zu ihr. Prüft Version und Express-Hauptversion, sonst klarer Abbruch. Vor `createOllamaApiFacade` aufrufen.
export function prepareFacade(app: Express) {
  const expressPackage: { name?: unknown; version?: unknown } = facadeRequire('express/package.json');
  const facadeExpress: Pick<typeof import('express'), 'json'> = facadeRequire('express');
  if (facadeVersion !== EXPECTED_FACADE_VERSION || expressPackage.name !== 'express' ||
      typeof expressPackage.version !== 'string' || !expressPackage.version.startsWith('4.') ||
      typeof facadeExpress.json !== 'function') {
    throw new Error(`Expected ollama-api-facade-js ${EXPECTED_FACADE_VERSION} to resolve Express 4 with json().`);
  }
  const allowedHosts = new Set(['localhost', 'host.docker.internal', 'host.containers.internal', settings.facadeHost.toLowerCase()]);
  // Sicherheit (DNS-Rebinding): Eine fremde Webseite könnte über ihren Domainnamen, der auf 127.0.0.1 zeigt, die
  // Fassade aus deinem Browser erreichen. Erlaubt sind daher nur localhost, IP-Adressen, host.docker.internal
  // (Docker), host.containers.internal (Podman) und der Name aus FACADE_HOST.
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

/** Nach `postApiChat` registrieren: Express reicht Fehler nur an spätere Handler. Ein Abbruch (Stopp in Open WebUI)
 *  ist nur INFO; echte Fehler werden auch nach geschlossener Verbindung protokolliert. */
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

/** Startet auf FACADE_HOST und FACADE_PORT und protokolliert die Adresse für Open WebUI. `onListening` läuft,
 *  sobald der Port gebunden ist, z. B. für einen Selbsttest. */
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
