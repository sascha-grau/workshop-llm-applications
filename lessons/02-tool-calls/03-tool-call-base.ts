// Lektion 02 – Tool-Calls, Teil 3: Tool-Calls Schritt für Schritt
//
// Lernziel: Du verstehst, wie ein Modell Werkzeuge anfordert und wie unser Code sie ausführt.
//
// In Teil 1 und 2 hat dein Code das Wissen in den Prompt gelegt; jetzt fordert das Modell es selbst an.
// Das Modell kennt weder Datum noch Uhrzeit. Hier bekommt es das Werkzeug `dateTime`. Ein Tool-Call
// (Werkzeugaufruf) ist die Bitte des Modells, eine Funktion mit bestimmten Argumenten auszuführen.
// Welche Argumente ein Werkzeug erwartet, beschreibt ein Schema (zod). Die Schleife ist von Hand
// geschrieben, damit jeder Schritt sichtbar ist:
//   1. Gespräch plus Werkzeugbeschreibungen an das Modell schicken.
//   2. Antwortet es mit Tool-Calls statt Text, führen wir die Werkzeuge selbst aus.
//   3. Ergebnisse an das Gespräch anhängen und zurück zu Schritt 1.
//
// Voraussetzungen: LM Studio (Chat-Modell geladen, Server gestartet) und Open WebUI laufen. Burp ist optional: Ist BURP_PROXY_URL gesetzt, muss Burp laufen (Intercept aus).
// Start: npm run l02:3   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Frage "Welcher Tag ist heute?" und suche in Burp `tools` in der Anfrage und `tool_calls` in der Antwort.
//   2. Füge ein zweites Werkzeug hinzu (z. B. `randomNumber`, Schema mit `max: z.number()`)
//      und trage es in `toolsByName` ein. Rufe es mit einer passenden Frage auf.
//      Tipp: Die Funktion bekommt ihre Argumente als Objekt, also `({ max }) => String(Math.floor(Math.random() * max))`
//      (die Argumente sind das, was das Schema beschreibt). In `toolsByName` ergänzt du
//      `[randomNumber.name, randomNumber]`.
//   3. Setze `MAX_TOOL_ROUNDS` auf 1. Was passiert bei der Datumsfrage?
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
import { stripThinking } from '../shared/text.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-02-part-3';
// Ein Tool-Durchlauf bedeutet mindestens zwei Modell-Aufrufe, also mehr Zeit als eine einfache Antwort.
const MODEL_TIMEOUT_MS = 120_000;
// Verhindert eine Endlosschleife, falls das Modell immer wieder Werkzeuge anfordert.
// 5 reicht für eine Anfrage mit ein paar Werkzeugen und bleibt bei Fehlverhalten überschaubar.
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
    configuration: { baseURL: remoteModel.baseURL },
  });

  // NEU: Ein Werkzeug ist eine normale Funktion plus Name, Beschreibung und Eingabe-Schema. Das Modell
  // sieht nur Beschreibung und Schema, die Beschreibung entscheidet also, wann es das Werkzeug nutzt.
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
      // Dieses Werkzeug braucht keine Argumente: ein leeres, striktes Objekt.
      schema: z.object({}).strict(),
    },
  );

  // Das Modell nennt Werkzeuge beim Namen, die Schleife muss ein Werkzeug also per Name finden.
  // Der Typ `StructuredToolInterface` passt für jedes Werkzeug, auch für ein zweites mit anderem Schema (Aufgabe 2).
  const toolsByName = new Map<string, StructuredToolInterface>([[dateTime.name, dateTime]]);

  // NEU: `bindTools` hängt die Werkzeugbeschreibungen an jede Anfrage; das Modell entscheidet, ob es sie nutzt.
  const modelWithTools = model.bindTools([...toolsByName.values()]);

  /** NEU: Führt die Tool-Schleife aus, bis das Modell mit reinem Text antwortet, und gibt diesen Text zurück. */
  async function answerWithTools(conversation: PlainMessage[], signal: AbortSignal): Promise<string> {
    const messages: Array<PlainMessage | BaseMessage> = [...conversation];

    for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
      const reply = await modelWithTools.invoke(messages, { signal });

      // Keine Tool-Calls heißt: Das ist die endgültige Antwort.
      const toolCalls = reply.tool_calls ?? [];
      const invalidToolCalls = reply.invalid_tool_calls ?? [];
      if (toolCalls.length === 0 && invalidToolCalls.length === 0) return reply.text;

      log('INFO', 'The model requested tools', {
        round, tools: [...toolCalls, ...invalidToolCalls].map((call) => call.name),
      });
      // Kaputte Argumente (kein gültiges JSON) melden wir dem Modell zurück, und zwar als Korrektur in einer
      // Nachricht mit der Rolle `user` (ohne passende Tool-Antwort geht es nicht anders). Davor steht
      // eine `assistant`-Nachricht (Antworttext oder "(ungültiger Tool-Aufruf)"), damit nie zwei
      // `user`-Nachrichten aufeinanderfolgen. Das gilt auch, wenn
      // gültige und ungültige Aufrufe gemischt sind: Dann läuft in dieser Runde gar kein Werkzeug, und das
      // Modell versucht es in der nächsten Runde noch einmal.
      if (invalidToolCalls.length) {
        // Denkschritte (`<think>…</think>`) gehören (außer mit SHOW_THINKING=true) nicht in den Verlauf, den das Modell in der nächsten Runde liest.
        messages.push({ role: 'assistant', content: stripThinking(reply.text) || '(ungültiger Tool-Aufruf)' });
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

        // Ruft man ein Werkzeug mit dem ganzen Tool-Call auf, kommt eine ToolMessage mit der ID des Calls
        // zurück. Daran erkennt das Modell, auf welche seiner Anfragen das Ergebnis antwortet.
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

      // Die Schleife streamt nicht, also senden wir die fertige Antwort als Ollama-Stream aus einem Teil.
      await sendChatStream(chatResponse, answer, signal);
    });
  });

  logHttpErrors(app);

  await checkModelServer({ viaBurp: true });
  listenWithLogging(app, ADVERTISED_MODEL);
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
