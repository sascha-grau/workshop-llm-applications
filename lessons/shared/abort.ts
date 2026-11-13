// Warten abbrechen für APIs ohne AbortSignal. Übersicht: lessons/shared/README.de.md
// Grenze: `promise` läuft weiter, nur das Warten endet mit einem AbortError (docs/architecture.de.md#bekannte-grenzen).
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
