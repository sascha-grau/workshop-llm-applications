/**
 * Schickt eine Modell-Antwort als Ollama-Stream an Open WebUI (Streaming: die Antwort kommt
 * stückweise statt auf einmal).
 *
 * Der Stream ist NDJSON: ein JSON-Objekt pro Zeile, jedes mit einem Stück der Antwort, am Ende
 * eine Zeile mit `done: true`. Die Lektionen nutzen diese Funktion statt `asStream` der Fassade. Das
 * verwirft Stücke, die nur aus Leerraum bestehen (z. B. "\n\n"), und würde so die Absätze einer
 * Antwort zusammenschieben. `source` ist ein fertiger Text oder eine fertige Modell-Antwort (beide
 * werden in einem Stück gesendet) oder ein Modell-Stream (wird Stück für Stück gesendet). Mit
 * `options.footer` hängt die Funktion nach der Antwort noch einen festen Text an (die Quellenliste
 * der Lektionen 02 und 07). Denkschritte von Reasoning-Modellen entfernt sie vorher, in beiden Fällen
 * (`withoutThinking`). Mit SHOW_THINKING=true bleiben sie stattdessen als `<think>`-Block stehen.
 */
import type { Response } from 'express';
import type { ChatHandler } from 'ollama-api-facade-js';
import { EXPECTED_FACADE_VERSION, facadeVersion } from './facade.ts';
import { abortable } from './abort.ts';
import { modelReasoning, modelText, stripThinking, type ModelOutput } from './text.ts';
import { settings } from './config.ts';

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

// Entfernt Denkschritte (`<think>…</think>`, siehe `stripThinking` in text.ts) aus einem Modell-Stream,
// ohne das Streaming aufzugeben. Das Feld `reasoning` der Rohantwort (siehe `modelReasoning`) wird mit
// SHOW_THINKING=true als `<think>…</think>` in den Stream gesetzt, sonst ignoriert. Die Schwierigkeit: Ein
// Tag kann über zwei Stücke verteilt ankommen ("<thi" und "nk>"). Deshalb hält die Funktion das Ende
// eines Stücks zurück, solange es der Anfang eines Tags sein könnte, und gibt es erst mit dem nächsten
// Stück weiter. Innerhalb eines Blocks wird nichts ausgegeben.
// Leerraum vor dem ersten sichtbaren Text fällt weg: Modelle schreiben nach `</think>` meist "\n\n".
// Grenze: Setzt die Chat-Vorlage `<think>` schon in den Prompt, kommt nur `</think>` an. Was davor stand, ist dann
// bereits gesendet: Ein Stream kann nicht zurücknehmen. `stripThinking` (fertiger Text) erkennt diesen Fall.
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

// Sendet erst die Antwort, dann den optionalen `footer` (z. B. die Quellenliste) als letztes Stück und zuletzt
// `done: true`. So hängt der Code Text deterministisch an, ohne dass das Modell ihn kennen muss. Bei Abbruch
// (`signal`) hören wir sofort auf. Liefert `write` false, ist der Puffer voll: Dann warten wir auf `drain`
// (Rückstau), statt Speicher mit unausgelieferten Stücken zu füllen.
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
  // Denkschritte erreichen Open WebUI weder im fertigen Text noch im Stream (außer mit SHOW_THINKING=true).
  // Einzige Lücke im Stream: ein `</think>` ohne öffnendes Tag (siehe `withoutThinking`); der fertige Text
  // deckt auch diesen Fall ab.
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
