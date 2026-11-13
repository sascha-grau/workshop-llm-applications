// Setzt Zeitlimits für Modell-Aufrufe wirklich durch: Node-HTTP (undici) bricht von sich aus nach 300 s ohne
// Antwortkopf oder Daten ab, auch wenn `timeout` größer ist. `modelFetch` hebt diese Grenzen auf das
// eingestellte Limit an (ein bestehender Dispatcher, etwa für Burp, bleibt erhalten), `withModelFetchTimeout`
// tut das für Bibliotheken, die den globalen `fetch` nutzen (promptfoo). Andere Clients, z. B. Qdrant, bleiben unberührt.
import { AsyncLocalStorage } from 'node:async_hooks';
import { fetch as undiciFetch, getGlobalDispatcher, type Dispatcher } from 'undici';

type FetchOptions = NonNullable<Parameters<typeof globalThis.fetch>[1]> & { dispatcher?: Dispatcher };
const timeoutScope = new AsyncLocalStorage<number>();
let scopedFetch: typeof globalThis.fetch | undefined;

// undici kennt `headersTimeout` und `bodyTimeout` (Standard je 300 s); `0` heißt dort "kein Limit" und bleibt so.
function timeoutOptions(init: FetchOptions | undefined, timeout: number): FetchOptions {
  const dispatcher = init?.dispatcher ?? getGlobalDispatcher();
  return {
    ...init,
    dispatcher: dispatcher.compose(dispatch => (options, handler) => dispatch({
      ...options,
      headersTimeout: options.headersTimeout === 0 ? 0 : Math.max(options.headersTimeout ?? timeout, timeout),
      bodyTimeout: options.bodyTimeout === 0 ? 0 : Math.max(options.bodyTimeout ?? timeout, timeout),
    }, handler)),
  };
}

export function modelFetch(
  timeout: number, implementation: typeof globalThis.fetch = undiciFetch as unknown as typeof globalThis.fetch,
): typeof globalThis.fetch {
  return (input, init) => implementation(input, timeoutOptions(init, timeout));
}

export function withModelFetchTimeout<T>(timeout: number, call: () => Promise<T>): Promise<T> {
  if (globalThis.fetch !== scopedFetch) {
    const original = globalThis.fetch;
    scopedFetch = (input, init) => {
      const activeTimeout = timeoutScope.getStore();
      return original(input, activeTimeout === undefined ? init : timeoutOptions(init, activeTimeout));
    };
    globalThis.fetch = scopedFetch;
  }
  return timeoutScope.run(timeout, call);
}
