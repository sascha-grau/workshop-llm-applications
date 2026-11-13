// Burp-Anbindung: undici-`ProxyAgent` als globaler Dispatcher, wenn BURP_PROXY_URL gesetzt ist (dann muss Burp
// laufen); ohne Adresse verbinden die Programme direkt. Clients mit eigenem Agent wie Qdrant umgehen Burp
// (docs/architecture.de.md#bekannte-grenzen). Übersicht: lessons/shared/README.de.md
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
    // Burps CA kommt zu den normalen Root-Zertifikaten dazu, statt sie zu ersetzen. Pfad relativ zum Repo-Root.
    try {
      requestTls = { ca: [...rootCertificates, readFileSync(rootPath(certificatePath), 'utf8')] };
    } catch (cause) {
      throw new Error(`Cannot read BURP_CA_CERT: ${certificatePath}. Check the path and read permissions.`, { cause });
    }
  }
  dispatcher = new ProxyAgent({ uri: proxyURL, requestTls, proxyTls: requestTls });
  return dispatcher;
}

/** Macht den Burp-Agenten zum globalen Dispatcher; ohne BURP_PROXY_URL passiert nichts. Ausgeschrieben mit
 *  `setGlobalDispatcher`: lessons/01-preparation/03-burp-proxy.ts */
export function useBurpIfConfigured(): void {
  const proxy = getBurpDispatcher();
  if (proxy) setGlobalDispatcher(proxy);
}

/** Bricht mit Anleitung ab, wenn HTTPS über Burp laufen soll, aber BURP_CA_CERT fehlt: Node würde Burps
 *  gefälschte Zertifikate sonst ablehnen. */
export function requireBurpCertificate(url: string): void {
  if (settings.burpProxyURL && new URL(url).protocol === 'https:' && !settings.burpCACert) {
    throw new Error('BURP_CA_CERT is missing for HTTPS through Burp. Export Burp’s CA certificate as DER and convert it with openssl x509 -inform der -in burp.der -out burp.pem. Set BURP_CA_CERT=burp.pem or clear BURP_PROXY_URL in .env.');
  }
}

/** Prüft per TCP-Verbindung mit Timeout, ob auf der Adresse aus BURP_PROXY_URL etwas lauscht. */
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
