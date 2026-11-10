// Burp-Anbindung: ein `ProxyAgent` von undici leitet HTTP-Anfragen über Burp. Ab Lektion 02 setzt
// `useBurpIfConfigured()` ihn als globalen Dispatcher (Lektion 01, Teil 3 zeigt die lange Form mit `setGlobalDispatcher`). Ohne BURP_PROXY_URL ist `getBurpDispatcher()` undefined, die Programme
// verbinden dann direkt, Burp ist also optional. Ist die Adresse gesetzt, muss Burp laufen.
// Für HTTPS braucht Node das CA-Zertifikat von Burp (BURP_CA_CERT, Pfad relativ zum Repo-Root).
// Es wird zu den normalen Root-Zertifikaten hinzugefügt, nicht an deren Stelle gesetzt.
// Der Agent wird erst beim ersten Aufruf von `getBurpDispatcher()` gebaut und danach wiederverwendet.
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { rootCertificates } from 'node:tls';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { settings } from './config.ts';
import { rootPath } from './paths.ts';

let dispatcher: ProxyAgent | undefined;

/** Liefert den Burp-Agenten oder `undefined`, wenn BURP_PROXY_URL leer ist. */
export function getBurpDispatcher(): ProxyAgent | undefined {
  const proxyURL = settings.burpProxyURL;
  if (!proxyURL || dispatcher) return dispatcher;
  const certificatePath = settings.burpCACert;
  let requestTls;
  if (certificatePath) {
    try {
      requestTls = { ca: [...rootCertificates, readFileSync(rootPath(certificatePath), 'utf8')] };
    } catch (cause) {
      throw new Error(`Cannot read BURP_CA_CERT: ${certificatePath}. Check the path and read permissions.`, { cause });
    }
  }
  dispatcher = new ProxyAgent({ uri: proxyURL, requestTls, proxyTls: requestTls });
  return dispatcher;
}

/**
 * Macht den Burp-Agenten zum globalen Dispatcher, wenn BURP_PROXY_URL gesetzt ist: Danach läuft jede
 * ausgehende Anfrage des Programms über Burp. Ohne Adresse passiert nichts. Ab Lektion 02 ruft jedes Programm das
 * am Anfang auf; Lektion 01, Teil 3 zeigt dieselben Schritte ausgeschrieben mit `setGlobalDispatcher`.
 */
export function useBurpIfConfigured(): void {
  const proxy = getBurpDispatcher();
  if (proxy) setGlobalDispatcher(proxy);
}

/**
 * Bricht mit einer Anleitung ab, wenn eine HTTPS-Adresse über Burp laufen soll, aber BURP_CA_CERT
 * fehlt (Lektion 02, Teil 2 ruft das für die Hacker-News-Seite auf). Ohne Zertifikat würde Node Burps
 * gefälschte Zertifikate ablehnen.
 */
export function requireBurpCertificate(url: string): void {
  if (settings.burpProxyURL && new URL(url).protocol === 'https:' && !settings.burpCACert) {
    throw new Error('BURP_CA_CERT is missing for HTTPS through Burp. Export Burp’s CA certificate as DER and convert it with openssl x509 -inform der -in burp.der -out burp.pem. Set BURP_CA_CERT=burp.pem or clear BURP_PROXY_URL in .env.');
  }
}

/** Prüft per TCP-Verbindung (5 Sekunden Timeout), ob auf der Adresse aus BURP_PROXY_URL etwas lauscht. */
export async function burpProxyReachable(): Promise<boolean> {
  const proxyURL = settings.burpProxyURL;
  if (!proxyURL) return true;
  const url = new URL(proxyURL);
  return new Promise((resolve) => {
    const socket = createConnection({
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    });
    const finish = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(5_000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}
