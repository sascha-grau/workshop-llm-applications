/**
 * Einstellungen für alle Lektionen. Sie stammen aus der Datei `.env` im Repo-Root (Vorlage: `.env.example`).
 *
 * Eine Einstellung wird erst geprüft, wenn ein Programm sie zum ersten Mal liest, nicht schon beim
 * Start. Ein Programm meldet sich also nur wegen der Einstellungen, die es wirklich braucht. Fehlt
 * eine Pflicht-Einstellung oder ist sie ungültig, wirft das einen Fehler mit englischer Meldung,
 * den `runMain` (startup.ts) als eine Zeile ausgibt.
 * API-Schlüssel sind optional. Ist keiner gesetzt, steht ein Platzhalter im Code, weil der
 * OpenAI-Client auf einem Wert besteht.
 *
 * Die Startkonfiguration von VS Code (F5) und Code Runner laden `.env` automatisch. Im Terminal
 * startest du ein Programm mit `node --env-file-if-exists=.env <Pfad zur Datei>`, zum
 * Beispiel `lessons/01-preparation/01-hello-llm.ts`, oder einfacher mit `npm run l01:1`.
 */

// Alte Schlüssel aus früheren Versionen der `.env`. Zwei Fälle führen zu einer Fehlermeldung:
// 1. Ein umbenannter Schlüssel (`replacedSettingsByNewName`): Der alte steht in `.env`, der neue fehlt.
//    Meldung "has been replaced" mit dem Namen des neuen Schlüssels.
// 2. Ein früher getrennter Wert, der jetzt für Chat und Embeddings gemeinsam gilt
//    (`sharedModelSettingsByNewName`): Der alte Schlüssel steht noch in `.env` und weicht vom neuen ab.
//    Meldung "is no longer used". Gleiche Werte sind kein Fehler. Bei Adressen (`kind: 'url'`) wird vor
//    dem Vergleich ein Schrägstrich am Ende ignoriert.
const replacedSettingsByNewName: Record<string, string> = {
  REMOTE_EMBEDDING_MODEL_NAME: 'REMOTE_EMBEDDING_MODEL',
};
const sharedModelSettingsByNewName: Record<string, { previousName: string; kind: 'url' | 'text' }> = {
  REMOTE_MODEL_BASE_URL: { previousName: 'REMOTE_EMBEDDING_MODEL_BASE_URL', kind: 'url' },
  REMOTE_MODEL_API_KEY: { previousName: 'REMOTE_EMBEDDING_MODEL_API_KEY', kind: 'text' },
};

function normalizedSharedValue(kind: 'url' | 'text', value: string | undefined): string | undefined {
  if (kind !== 'url' || !value) return value;
  try {
    return new URL(value).href.replace(/\/+$/, '');
  } catch {
    return value;
  }
}

function configuredEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  const sharedSetting = sharedModelSettingsByNewName[name];
  const previousSharedKey = sharedSetting?.previousName;
  const previousValue = previousSharedKey ? process.env[previousSharedKey]?.trim() : undefined;
  if (sharedSetting && previousValue && normalizedSharedValue(sharedSetting.kind, previousValue) !== normalizedSharedValue(sharedSetting.kind, value)) {
    throw new Error(`${previousSharedKey} is no longer used: chat and embeddings now use ${name}. Remove the old entry from .env.`);
  }
  const replaced = replacedSettingsByNewName[name];
  if (replaced && process.env[replaced]?.trim() && !value) {
    throw new Error(`The setting ${replaced} has been replaced. Set ${name} in .env (template: .env.example).`);
  }
  return value;
}

function requireEnv(name: string): string {
  const value = configuredEnv(name);
  if (!value) {
    throw new Error(`The setting ${name} is missing from .env (template: .env.example).`);
  }
  return value;
}

export function optionalBooleanEnv(name: string): boolean | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new Error(`${name} must be true or false, got "${value}".`);
}

function validatedURL(name: string, required = true): string | undefined {
  const value = required ? requireEnv(name) : process.env[name]?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
    return url.href;
  } catch {
    throw new Error(`The setting ${name} must be a valid HTTP or HTTPS URL.`);
  }
}

/** Der OpenAI-kompatible Server für Chat und Embeddings (Lektion 01 bis 08). */
export const remoteModel = {
  /** Name des Chat-Modells, genau so, wie der Server ihn kennt. */
  get name() { return requireEnv('REMOTE_MODEL_NAME'); },
  get apiKey() { return configuredEnv('REMOTE_MODEL_API_KEY') || 'not-required'; },
  get baseURL() { return validatedURL('REMOTE_MODEL_BASE_URL')!; },
};

/** Das Embedding-Modell (Lektion 03 bis 08) auf demselben Server wie das Chat-Modell. */
export const remoteEmbeddingModel = {
  get name() { return requireEnv('REMOTE_EMBEDDING_MODEL_NAME'); },
  get gemmaName() { return requireEnv('REMOTE_EMBEDDING_GEMMA_MODEL_NAME'); },
  get apiKey() { return remoteModel.apiKey; },
  get baseURL() { return remoteModel.baseURL; },
};

export const settings = {
  /** Adresse des Proxy-Listeners von Burp Suite. Ab Lektion 01, Teil 3 läuft der ausgehende Verkehr darüber, wenn sie gesetzt ist. */
  get burpProxyURL(): string | undefined {
    return validatedURL('BURP_PROXY_URL', false);
  },
  get burpCACert(): string | undefined { return process.env.BURP_CA_CERT?.trim() || undefined; },
  /** Adresse von Qdrant, der Vektordatenbank ab Lektion 06. Ohne Eintrag: die Standardadresse eines lokalen Qdrant. */
  get qdrantURL(): string { return validatedURL('QDRANT_URL', false) ?? 'http://localhost:6333/'; },
  get facadeHost(): string { return process.env.FACADE_HOST?.trim() || '127.0.0.1'; },

  /**
   * Port der Ollama-Fassade (ab Lektion 01, Teil 2). Es ist nicht Ollamas Standardport 11434, damit die
   * Programme neben einer echten Ollama-Installation laufen können. Open WebUI braucht diesen Port
   * in seiner Ollama-Verbindung.
   */
  get facadePort(): number {
    const port = Number(configuredEnv('FACADE_PORT') || '11435');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('FACADE_PORT in .env must be a port number between 1 and 65535.');
    }
    return port;
  },
};
