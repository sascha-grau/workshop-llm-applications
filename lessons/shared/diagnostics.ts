/**
 * Erreichbarkeits-Checks beim Start. Sie beantworten "Läuft der Modell-Server, und funktioniert
 * der Weg über Burp?", bevor die erste Chat-Anfrage mit einer weniger hilfreichen Fehlermeldung
 * scheitert.
 *
 * Die Checks prüfen nur, ob der Server per HTTP antwortet und den konfigurierten API-Schlüssel
 * akzeptiert. Über Burp prüfen sie zusätzlich, ob `/models` die erwartete JSON-Form liefert. Ob das
 * Modell wirklich Text erzeugen kann, prüfen sie nicht. Schlägt ein Check fehl, wirft er einen Fehler
 * mit einer englischen Meldung, die sagt, was du prüfen sollst. Das Programm bricht dann mit genau
 * dieser Meldung ab.
 *
 * Über Burp lassen sich Fehler unterscheiden: Zuerst wird getestet, ob Burp auf der Adresse aus
 * BURP_PROXY_URL überhaupt lauscht ("Burp is not running at ..."). Kommt die Anfrage über Burp nicht
 * durch, ist oft Intercept an und hält sie fest. Eine 2xx-Antwort mit gültiger `/models`-Liste gilt
 * als Erfolg. Ist die Antwort über Burp kein 2xx oder keine `/models`-Liste, folgt genau eine direkte
 * Prüfung ohne Burp. Schlägt sie fehl, gilt ihre Meldung (Server nicht erreichbar, oder HTTP-Status
 * wie 401 bei falschem Schlüssel). Nur wenn der Server direkt erreichbar ist, heißt es "Something
 * other than Burp answers at …" (z. B. Open WebUI auf Port 8080). Bei einer fehlgeschlagenen Anfrage
 * steht die kurze Ursache hinter "– Cause:"; mit DEBUG=1 kommt der Stacktrace dazu.
 */
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
  /**
   * Bearer-Token, der mitgeschickt wird. Mit Token oder über Burp muss die Antwort ein 2xx sein.
   * Gibt es beides nicht, zählt jede HTTP-Antwort als "erreichbar". `checkModelServer` übergibt
   * immer den konfigurierten Schlüssel, ein abgelehnter Schlüssel (401) zeigt sich also als
   * fehlgeschlagener Check.
   */
  token?: string;
}

/** Schickt eine GET-Anfrage über einen eigenen Verbindungspool. Antwortet der Dienst nicht wie erwartet, wirft sie einen Fehler mit englischer Meldung. */
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

/**
 * Ruft den `/models`-Endpunkt eines Modell-Servers auf (Chat und Embeddings laufen auf demselben Server, eine
 * Prüfung gilt also für beide Modelle), direkt und, bei Programmen mit Burp, zusätzlich über Burp. Beide Prüfungen senden den
 * konfigurierten API-Schlüssel wie die echten Modell-Anfragen. Der Vergleich beider Ergebnisse
 * zeigt, ob der Server ausgefallen ist oder Burp das Problem ist (Listener gestoppt, Intercept an
 * und hält die Anfrage fest). Der Weg über Burp wird zuerst geprüft.
 */
export async function checkModelServer({ viaBurp }: { viaBurp: boolean }) {
  const modelsURL = `${remoteModel.baseURL.replace(/\/$/, '')}/models`;

  if (viaBurp && getBurpDispatcher()) {
    await checkService('Model API through Burp', modelsURL, { viaBurp: true, token: remoteModel.apiKey });
  }
  await checkService('Model API directly', modelsURL, { token: remoteModel.apiKey });
}
