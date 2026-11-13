// Einstellungen aus `.env` (Vorlage: `.env.example`), geprüft erst beim ersten Lesen: Ein Programm scheitert
// nur an Einstellungen, die es braucht, mit einer englischen Meldung, die `runMain` als eine Zeile ausgibt.
// Übersicht: lessons/shared/README.de.md

// Alte `.env`-Namen melden sich mit dem neuen Namen: umbenannt ("has been replaced", nur wenn der neue fehlt) oder
// jetzt gemeinsam für Chat und Embeddings ("is no longer used", nur bei abweichendem Wert; URLs ohne Schrägstrich
// am Ende verglichen). Invariante: `docs:check` liest die Altnamen aus diesen beiden Tabellen.
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

// Leer heißt "nicht gesetzt" (undefined): Dann gilt die Konstante im Code, z. B. bei ALL_DOCUMENTS.
export function optionalBooleanEnv(name: string): boolean | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new Error(`The setting ${name} in .env must be empty, true or false (also 1/0, yes/no), got "${value}".`);
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

/** Der OpenAI-kompatible Server für Chat und Embeddings. */
export const remoteModel = {
  /** Name des Chat-Modells, genau so, wie der Server ihn kennt. */
  get name() { return requireEnv('REMOTE_MODEL_NAME'); },
  // Optional: Der OpenAI-Client besteht auf einem Wert, lokale Server brauchen keinen.
  get apiKey() { return configuredEnv('REMOTE_MODEL_API_KEY') || 'not-required'; },
  get baseURL() { return validatedURL('REMOTE_MODEL_BASE_URL')!; },
};

/** Die Embedding-Modelle; Adresse und Schlüssel teilen sie mit dem Chat-Modell. */
export const remoteEmbeddingModel = {
  get name() { return requireEnv('REMOTE_EMBEDDING_MODEL_NAME'); },
  get gemmaName() { return requireEnv('REMOTE_EMBEDDING_GEMMA_MODEL_NAME'); },
  get apiKey() { return remoteModel.apiKey; },
  get baseURL() { return remoteModel.baseURL; },
};

export const settings = {
  /** `SHOW_THINKING` in `.env`, Standard: aus. Bedeutung: docs/decisions.de.md#show-thinking */
  get showThinking(): boolean { return optionalBooleanEnv('SHOW_THINKING') ?? false; },
  /** Burps Proxy-Listener. Ist er gesetzt, leitet `useBurpIfConfigured` den Verkehr darüber. */
  get burpProxyURL(): string | undefined {
    return validatedURL('BURP_PROXY_URL', false);
  },
  get burpCACert(): string | undefined { return process.env.BURP_CA_CERT?.trim() || undefined; },
  get qdrantURL(): string { return validatedURL('QDRANT_URL', false) ?? 'http://localhost:6333/'; },
  get facadeHost(): string { return process.env.FACADE_HOST?.trim() || '127.0.0.1'; },

  // Nicht Ollamas Standardport, damit die Fassade neben einem echten Ollama laufen kann. Open WebUI
  // braucht diesen Port in seiner Ollama-Verbindung.
  get facadePort(): number {
    const port = Number(configuredEnv('FACADE_PORT') || '11435');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('FACADE_PORT in .env must be a port number between 1 and 65535.');
    }
    return port;
  },
};
