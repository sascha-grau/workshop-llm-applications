// Lektion 02 – Tool-Calls, Teil 3: Tool-Calls Schritt für Schritt
//
// Lernziel: Du verstehst, wie ein Modell Werkzeuge anfordert und wie dein Code sie ausführt.
// Braucht:  wie Teil 1.
// Start:    npm run l02:3   (oder F5; läuft, bis du Strg+C drückst)
// Erklärt:  lessons/02-tool-calls/GUIDE.de.md → „Teil 3“
//
// Aufgabe:
//   1. Frage "Welcher Tag ist heute?" und suche in Burp `tools` in der Anfrage und `tool_calls` in der Antwort.
//   2. Baue ein zweites Werkzeug `randomNumber` (Schema `z.object({ max: z.number() })`, Funktion
//      `({ max }) => String(Math.floor(Math.random() * max))`), trage es in `toolsByName` ein und frage danach.
//      ↺ Danach das Werkzeug wieder entfernen.
//   3. Setze `MAX_TOOL_ROUNDS` auf 1. Was passiert bei der Datumsfrage?
//      ↺ Danach zurück auf 5.
//
// Lesen: die Zeilen `// KERN 1–4`. Der Rest ist Fehlerbehandlung.
import express from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { createOllamaApiFacade } from 'ollama-api-facade-js';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { tool, ToolMessage, type BaseMessage } from 'langchain';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { remoteModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { toPlainMessages, type PlainMessage } from '../shared/messages.ts';
import { log, logHttpRequests, logInvocation } from '../shared/logging.ts';
import { listenWithLogging, logHttpErrors, prepareFacade } from '../shared/server.ts';
import { requestAbortSignal, sendChatStream } from '../shared/stream.ts';
import { modelText } from '../shared/text.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-02-part-3';
// Ein Tool-Durchlauf bedeutet mindestens zwei Modell-Aufrufe, also mehr Zeit als eine einfache Antwort.
const MODEL_TIMEOUT_MS = 120_000;
// Standard: 5. Obergrenze der Runden, falls das Modell immer wieder Werkzeuge anfordert (OWASP LLM10).
// Kleiner = früher Schluss, aber eine Frage mit mehreren Werkzeugen scheitert eher.
const MAX_TOOL_ROUNDS = 5;

async function main() {
  useBurpIfConfigured();

  const model = new ChatOpenAI({
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    disableStreaming: true,
    timeout: MODEL_TIMEOUT_MS,
    // Wiederholungen würden in Burp als verwirrende Doppelanfragen auftauchen: lieber sofort scheitern.
    maxRetries: 0,
    temperature: 0,
    // Rohantwort behalten: Sie enthält die Denkschritte (siehe shared/text.ts).
    __includeRawResponse: true,
    configuration: { baseURL: remoteModel.baseURL },
  });

  // KERN 1: Ein Werkzeug ist eine normale Funktion plus Name, Beschreibung und Eingabe-Schema. Das Modell
  // sieht nur Beschreibung und Schema; die Beschreibung entscheidet also, wann es das Werkzeug nutzt.
  const dateTime = tool(
    () => {
      log('INFO', 'Tool dateTime: called');
      return new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin',
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date());
    },
    {
      name: 'dateTime',
      description: 'Gibt das aktuelle Datum und die Uhrzeit in Deutschland (Europe/Berlin) zurück.',
      // Keine Argumente: ein leeres, striktes Objekt.
      schema: z.object({}).strict(),
    },
  );

  // Das Modell nennt Werkzeuge beim Namen. `StructuredToolInterface` passt auch für ein Werkzeug mit anderem Schema.
  const toolsByName = new Map<string, StructuredToolInterface>([[dateTime.name, dateTime]]);

  // KERN 2: `bindTools` hängt die Werkzeugbeschreibungen an jede Anfrage; das Modell entscheidet, ob es sie nutzt.
  const modelWithTools = model.bindTools([...toolsByName.values()]);

  // KERN 3: Die Schleife: fragen, angeforderte Werkzeuge ausführen, Ergebnisse anhängen, wieder fragen,
  // bis das Modell mit reinem Text antwortet.
  async function answerWithTools(conversation: PlainMessage[], signal: AbortSignal): Promise<string> {
    const messages: Array<PlainMessage | BaseMessage> = [...conversation];

    for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
      const reply = await modelWithTools.invoke(messages, { signal });

      // Keine Tool-Calls heißt: Das ist die endgültige Antwort.
      const toolCalls = reply.tool_calls ?? [];
      const invalidToolCalls = reply.invalid_tool_calls ?? [];
      if (toolCalls.length === 0 && invalidToolCalls.length === 0) return modelText(reply);

      log('INFO', 'The model requested tools', {
        round, tools: [...toolCalls, ...invalidToolCalls].map((call) => call.name),
      });
      // Kaputte Argumente (kein JSON): Korrektur als `user`-Nachricht, davor eine `assistant`-Nachricht, damit nie
      // zwei `user`-Nachrichten aufeinanderfolgen. Sind gültige Aufrufe dabei, läuft in dieser Runde trotzdem
      // kein Werkzeug; das Modell versucht es in der nächsten Runde noch einmal.
      if (invalidToolCalls.length) {
        // `modelText` lässt Denkschritte aus dem Verlauf weg (mit SHOW_THINKING=true bleiben sie drin).
        messages.push({ role: 'assistant', content: modelText(reply) || '(ungültiger Tool-Aufruf)' });
        messages.push({
          role: 'user',
          content: invalidToolCalls.map((call) =>
            `Ungültige JSON-Argumente für das Werkzeug "${call.name ?? 'unbekannt'}". Verwende ein JSON-Objekt, das zum Schema passt.`).join(' '),
        });
        continue;
      }
      messages.push(reply);
      for (const call of toolCalls) {
        const selectedTool = toolsByName.get(call.name);
        signal.throwIfAborted();
        // Unbekannter Werkzeugname: Fehler mit den verfügbaren Namen an das Modell zurückgeben.
        if (!selectedTool) {
          messages.push(new ToolMessage({
            content: `Unbekanntes Werkzeug "${call.name}". Verfügbare Werkzeuge: ${[...toolsByName.keys()].join(', ')}.`,
            tool_call_id: call.id ?? '',
            status: 'error',
          }));
          continue;
        }

        // KERN 4: Mit dem ganzen Tool-Call aufgerufen, liefert das Werkzeug eine ToolMessage mit der ID des Calls.
        // Daran erkennt das Modell, auf welche seiner Anfragen das Ergebnis antwortet.
        try {
          messages.push(await selectedTool.invoke(call, { signal }));
        } catch {
          signal.throwIfAborted();
          messages.push(new ToolMessage({
            content: `Das Werkzeug "${call.name}" ist fehlgeschlagen. Prüfe seine Argumente anhand des Schemas.`,
            tool_call_id: call.id ?? '',
            status: 'error',
          }));
        }
      }
    }

    throw new Error(`The model was still requesting tools after ${MAX_TOOL_ROUNDS} rounds.`);
  }

  const app = express();
  logHttpRequests(app);
  prepareFacade(app);
  const ollamaApi = createOllamaApiFacade(app, model, ADVERTISED_MODEL);

  ollamaApi.postApiChat(async (chatRequest, _chatModel, chatResponse) => {
    const signal = requestAbortSignal(chatResponse);
    await logInvocation('Model', { messages: chatRequest.messages.length }, async () => {
      const answer = await answerWithTools(toPlainMessages(chatRequest.messages), signal);
      if (!answer) throw new Error('The model returned no answer text.');

      // Die Schleife streamt nicht: Die fertige Antwort geht als Ollama-Stream aus einem Stück an Open WebUI.
      await sendChatStream(chatResponse, answer, signal);
    });
  });

  logHttpErrors(app);

  await checkModelServer({ viaBurp: true });
  listenWithLogging(app, ADVERTISED_MODEL);
}

await runMain(main);
