// Erreichbarkeit beim Start: Antwortet der Modell-Server und nimmt den API-Schlüssel an, und klappt der Weg über
// Burp? Ob das Modell Text erzeugt, prüft es nicht. Übersicht: lessons/shared/README.de.md
import { Agent, fetch as httpFetch } from 'undici';
import { remoteModel, settings } from './config.ts';
import { log } from './logging.ts';
import { getBurpDispatcher, burpProxyReachable } from './proxy.ts';

const CHECK_TIMEOUT_MS = 5_000;

function isModelList(value: unknown): boolean {
  return value !== null && typeof value === 'object' && 'data' in value && Array.isArray(value.data)
    && value.data.every((model: unknown) => model !== null && typeof model === 'object' && 'id' in model && typeof model.id === 'string');
}

interface CheckOptions {
  /** Den Check über Burp schicken statt direkt zu verbinden. */
  viaBurp?: boolean;
  /** Bearer-Token. Mit Token oder über Burp zählt nur eine 2xx-Antwort, sonst jede HTTP-Antwort;
   *  so fällt ein abgelehnter Schlüssel (401) auf. */
  token?: string;
}

/** GET-Anfrage; antwortet der Dienst nicht wie erwartet, wirft sie mit einer englischen Meldung, was zu prüfen ist. */
export async function checkService(label: string, url: string, { viaBurp = false, token }: CheckOptions = {}): Promise<void> {
  // Ein eigener Dispatcher (Verbindungspool) umgeht den globalen Burp-Dispatcher, den ein Programm setzen kann.
  viaBurp = viaBurp && Boolean(getBurpDispatcher());
  const dispatcher = viaBurp ? getBurpDispatcher()! : new Agent();
  const burpAddress = viaBurp ? settings.burpProxyURL?.replace(/\/+$/, '') : undefined;
  const burpRequestError = `${label}: The request through Burp failed or timed out. Check the listener and turn Intercept off.`;
  try {
    if (viaBurp && !await burpProxyReachable()) {
      throw new Error(`Burp is not running at ${burpAddress} – start Burp or clear BURP_PROXY_URL in .env.`);
    }
    // Sicherheit: Über Burp zuerst Burps Willkommensseite ohne API-Schlüssel abfragen. So geht der Schlüssel nie an
    // einen fremden Dienst auf Burps Port (etwa Open WebUI); der fällt auf, bevor `/models` läuft.
    if (viaBurp) {
      let probe;
      try {
        probe = await httpFetch('http://burp/', {
          dispatcher,
          signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
      } catch (cause) {
        throw new Error(burpRequestError, { cause });
      }
      const welcome = await probe.text();
      if (!probe.ok || !/<(?:title|h1)\b[^>]*>\s*Burp Suite(?:\s+(?:Community|Professional|Enterprise) Edition)?\s*<\/(?:title|h1)>/i.test(welcome)) {
        throw new Error(`Something other than Burp answers at ${burpAddress} (HTTP ${probe.status}). Is Open WebUI or another server using that port? Move one of them or fix BURP_PROXY_URL in .env.`);
      }
    }
    let response;
    try {
      response = await httpFetch(url, {
        dispatcher,
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (cause) {
      throw new Error(viaBurp
        ? burpRequestError
        : `${label}: The model server is unreachable or timed out. Check the address and start the server.`, { cause });
    }
    if (viaBurp) {
      let models: unknown;
      if (response.ok) {
        try {
          models = await response.json();
        } catch (cause) {
          if (cause instanceof SyntaxError) models = undefined;
          else throw new Error(burpRequestError, { cause });
        }
      } else await response.body?.cancel();
      if (!response.ok || !isModelList(models)) {
        await checkService('Model API directly', url, { token });
        throw new Error(`Something other than Burp answers at ${burpAddress} (HTTP ${response.status}). Is Open WebUI or another server using that port? Move one of them or fix BURP_PROXY_URL in .env.`);
      }
    } else await response.body?.cancel();
    if (token && !response.ok) {
      throw new Error(`${label}: The connectivity check returned HTTP ${response.status}. Check the model server and API key.`);
    }
    log('INFO', `${label}: reachable`, { status: response.status });
  } finally {
    if (!viaBurp) await dispatcher.close();
  }
}

/** Prüft `/models` über Burp (zuerst) und direkt, beide mit API-Schlüssel. Der Vergleich zeigt, ob der Server
 *  oder Burp das Problem ist (Listener gestoppt, Intercept an). Ein Server für Chat und Embeddings, eine Prüfung. */
export async function checkModelServer({ viaBurp }: { viaBurp: boolean }) {
  const modelsURL = `${remoteModel.baseURL.replace(/\/$/, '')}/models`;

  if (viaBurp && getBurpDispatcher()) {
    await checkService('Model API through Burp', modelsURL, { viaBurp: true, token: remoteModel.apiKey });
  }
  await checkService('Model API directly', modelsURL, { token: remoteModel.apiKey });
}
