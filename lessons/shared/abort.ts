// Wartet auf `promise`, bricht aber mit einem AbortError ab, sobald `signal` auslöst. Das Versprechen
// selbst läuft weiter, wir hören nur auf zu warten (für APIs, die kein Signal annehmen).
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Request cancelled.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
    if (signal.aborted) onAbort();
  });
}
