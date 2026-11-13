// Modell-Antworten als Ollama-Stream (NDJSON: ein JSON-Objekt je Zeile, zuletzt `done: true`) an Open WebUI,
// ohne Denkschritte (außer mit SHOW_THINKING), optional mit festem `footer`. Übersicht: lessons/shared/README.de.md
import type { Response } from 'express';
import type { ChatHandler } from 'ollama-api-facade-js';
import { EXPECTED_FACADE_VERSION, facadeVersion } from './facade.ts';
import { abortable } from './abort.ts';
import { modelReasoning, modelText, stripThinking, type ModelOutput } from './text.ts';
import { settings } from './config.ts';

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

// Entfernt `<think>…</think>` aus einem Modell-Stream, ohne das Streaming aufzugeben. Mit SHOW_THINKING setzt es
// stattdessen das Feld `reasoning` der Rohantwort (`modelReasoning`) als `<think>…</think>` in den Stream.
// Grenze: Steht `<think>` schon im Prompt, kommt nur `</think>`; was davor kam, ist gesendet (`stripThinking` erkennt das).
export async function* withoutThinking(chunks: AsyncIterable<ModelOutput>): AsyncGenerator<{ text: string }> {
  if (settings.showThinking) {
    let thinking = false;
    for await (const chunk of chunks) {
      const reasoning = modelReasoning(chunk);
      if (reasoning) {
        if (!thinking) yield { text: THINK_OPEN };
        thinking = true;
        yield { text: reasoning };
      }
      if (chunk.text && thinking) {
        yield { text: THINK_CLOSE };
        thinking = false;
      }
      if (chunk.text || !reasoning) yield chunk;
    }
    if (thinking) yield { text: THINK_CLOSE };
    return;
  }
  // Ein Tag kann über zwei Stücke verteilt ankommen ("<thi" + "nk>"): Ein Ende, das ein Tag-Anfang sein könnte,
  // bleibt in `pending`, bis das nächste Stück entscheidet. Leerraum vor dem ersten sichtbaren Text fällt weg,
  // weil Modelle nach `</think>` meist "\n\n" schreiben.
  let pending = ''; // empfangen, aber noch nicht entschieden
  let thinking = false; // gerade innerhalb von <think>…</think>?
  let started = false; // schon sichtbaren Text ausgegeben?
  const emit = (text: string) => {
    const visible = started ? text : text.trimStart();
    if (visible) started = true;
    return visible;
  };
  for await (const { text } of chunks) {
    pending += text;
    let output = '';
    for (;;) {
      const tag = thinking ? THINK_CLOSE : THINK_OPEN;
      const position = pending.toLowerCase().indexOf(tag);
      if (position === -1) {
        // Kein vollständiges Tag: alles bis auf einen möglichen Tag-Anfang am Ende entscheiden.
        const keep = partialTagLength(pending, tag);
        if (!thinking) output += pending.slice(0, pending.length - keep);
        pending = pending.slice(pending.length - keep);
        break;
      }
      if (!thinking) output += pending.slice(0, position);
      pending = pending.slice(position + tag.length);
      thinking = !thinking;
    }
    const visible = emit(output);
    if (visible) yield { text: visible };
  }
  // Am Ende: Ein zurückgehaltener Rest außerhalb eines Blocks war doch kein Tag; ein offener Block fällt weg.
  const rest = thinking ? '' : emit(pending);
  if (rest) yield { text: rest };
}

// Wie viele Zeichen am Ende von `text` der Anfang von `tag` sein könnten (z. B. "<thi" für "<think>").
function partialTagLength(text: string, tag: string): number {
  for (let length = Math.min(tag.length - 1, text.length); length > 0; length--) {
    if (tag.startsWith(text.slice(-length).toLowerCase())) return length;
  }
  return 0;
}

// UMGEHUNG (ollama-api-facade-js 1.0.7): Die rohe Express-Antwort ist nur über das private Feld `response` erreichbar,
// nur hier gelesen. Version und Form werden geprüft: Ändert sich das Feld, gibt es einen klaren Fehler statt eines
// stillen Defekts. Siehe docs/decisions.de.md#fassade-gepinnt

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

/** Löst aus, wenn Open WebUI die Verbindung vorzeitig schließt (z. B. "Stopp"). Was kein Signal annimmt, läuft
 *  trotzdem weiter (`abortable`, docs/architecture.de.md#bekannte-grenzen). */
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

// UMGEHUNG (ollama-api-facade-js 1.0.7): eigener Stream statt `asStream`, das Stücke aus reinem Leerraum verwirft und
// so Absätze zusammenschiebt. Der `footer` kommt vom Code, nicht vom Modell. Bei vollem Puffer wartet `write` auf
// `drain` (Rückstau), statt Stücke im Speicher zu stapeln.
export async function sendChatStream(
  chatResponse: Parameters<ChatHandler>[2],
  source: string | ModelOutput | AsyncIterable<ModelOutput>,
  signal: AbortSignal = requestAbortSignal(chatResponse),
  options: { footer?: string } = {},
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
  // Denkschritte erreichen Open WebUI nicht (außer mit SHOW_THINKING). Einzige Lücke im Stream: `</think>` ohne
  // öffnendes Tag (siehe `withoutThinking`); ein fertiger Text deckt auch das ab.
  if (typeof source === 'string' || 'text' in source) {
    const answer = typeof source === 'string' ? stripThinking(source) : modelText(source);
    if (answer) await write(answer);
  } else {
    for await (const chunk of withoutThinking(source)) await write(chunk.text);
  }
  if (options.footer) await write(options.footer);
  signal.throwIfAborted();
  response.write(`${JSON.stringify({ done: true })}\n`);
  response.end();
}
