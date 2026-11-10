/**
 * Schickt eine Modell-Antwort als Ollama-Stream an Open WebUI (Streaming: die Antwort kommt
 * stückweise statt auf einmal).
 *
 * Der Stream ist NDJSON: ein JSON-Objekt pro Zeile, jedes mit einem Stück der Antwort, am Ende
 * eine Zeile mit `done: true`. Die Lektionen nutzen diese Funktion statt `asStream` der Fassade. Das
 * verwirft Stücke, die nur aus Leerraum bestehen (z. B. "\n\n"), und würde so die Absätze einer
 * Antwort zusammenschieben. `source` ist ein fertiger Text (wird in einem Stück gesendet) oder
 * ein Modell-Stream (wird Stück für Stück gesendet).
 */
import type { Response } from 'express';
import type { ChatHandler } from 'ollama-api-facade-js';
import { EXPECTED_FACADE_VERSION, facadeVersion } from './facade.ts';
import { abortable } from './abort.ts';

// Die Fassade gibt keinen öffentlichen Zugriff auf die rohe Express-Antwort, die wir für den Stream
// brauchen. Deshalb liest `rawResponse` das private Feld `response` (in ChatResponse.d.ts als private
// deklariert). Das bleibt auf diese eine Hilfsfunktion beschränkt und klappt nur mit der exakt
// festgelegten Version aus package.json (ollama-api-facade-js 1.0.7). Version und Aufbau werden
// geprüft: Ändert eine andere Version das Feld, gibt es einen klaren Fehler statt eines stillen Defekts.

function rawResponse(chatResponse: Parameters<ChatHandler>[2]): Response {
  if (facadeVersion !== EXPECTED_FACADE_VERSION || !chatResponse || typeof chatResponse !== 'object') {
    throw new Error(`Expected ollama-api-facade-js ${EXPECTED_FACADE_VERSION} and a chat response object.`);
  }
  const response: Response = Reflect.get(chatResponse, 'response');
  if (!response || typeof response !== 'object' ||
      typeof response.type !== 'function' || typeof response.write !== 'function' ||
      typeof response.end !== 'function' || typeof response.once !== 'function' ||
      typeof response.off !== 'function' || typeof response.writableFinished !== 'boolean' ||
      typeof response.destroyed !== 'boolean') {
    throw new Error(`Expected ollama-api-facade-js ${EXPECTED_FACADE_VERSION} with chatResponse.response, type(), write(), end(), once(), off() and boolean writableFinished and destroyed fields.`);
  }
  return response;
}

/**
 * Liefert ein `AbortSignal`, das auslöst, wenn Open WebUI die Verbindung vorzeitig schließt
 * (z. B. weil du auf "Stopp" klickst). Damit kann ein Programm die Modell-Anfrage abbrechen.
 */
export function requestAbortSignal(chatResponse: Parameters<ChatHandler>[2]): AbortSignal {
  const response = rawResponse(chatResponse);
  const controller = new AbortController();
  const onClose = () => {
    if (!response.writableFinished) controller.abort(new DOMException('Request cancelled.', 'AbortError'));
    cleanup();
  };
  const cleanup = () => {
    response.off('close', onClose);
    response.off('finish', cleanup);
  };
  response.once('close', onClose);
  response.once('finish', cleanup);
  if (response.destroyed) onClose();
  return controller.signal;
}

/** Sendet `source` als NDJSON-Stream und wartet, wenn Open WebUI die Daten langsamer abnimmt (`drain`). */
export async function sendChatStream(
  chatResponse: Parameters<ChatHandler>[2],
  source: string | AsyncIterable<{ text: string }>,
  signal: AbortSignal = requestAbortSignal(chatResponse),
): Promise<void> {
  const response = rawResponse(chatResponse);
  signal.throwIfAborted();
  response.type('application/x-ndjson');
  async function write(content: string) {
    signal.throwIfAborted();
    const ready = response.write(`${JSON.stringify({
      created_at: new Date().toISOString(),
      message: { role: 'assistant', content },
      done: false,
    })}\n`);
    if (!ready) {
      let onDrain!: () => void;
      let onError!: (error: Error) => void;
      const drained = new Promise<void>((resolve, reject) => {
        onDrain = resolve;
        onError = reject;
        response.once('drain', onDrain);
        response.once('error', onError);
      });
      try {
        await abortable(drained, signal);
      } finally {
        response.off('drain', onDrain);
        response.off('error', onError);
      }
    }
  }
  if (typeof source === 'string') {
    await write(source);
  } else {
    for await (const chunk of source) await write(chunk.text);
  }
  signal.throwIfAborted();
  response.write(`${JSON.stringify({ done: true })}\n`);
  response.end();
}
