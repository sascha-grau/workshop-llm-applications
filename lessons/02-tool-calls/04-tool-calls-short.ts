// Lektion 02 – Tool-Calls, Teil 4: Tool-Calls, die kurze Variante
//
// Lernziel: Du ersetzt die handgeschriebene Tool-Schleife aus Teil 3 durch `createAgent`.
//
// Dasselbe Werkzeug `dateTime` wie in Teil 3. Die Schleife (Modell fragen, angeforderte Werkzeuge
// ausführen, Ergebnisse zurückschicken) übernimmt jetzt `createAgent` von LangChain statt unseres
// eigenen Codes. Die Anfragen in Burp sehen aus wie in Teil 3.
//
// Voraussetzungen: LM Studio (Chat-Modell geladen, Server gestartet) und Open WebUI laufen. Burp ist optional: Ist BURP_PROXY_URL gesetzt, muss Burp laufen (Intercept aus).
// Start: npm run l02:4   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Stelle dieselbe Datumsfrage wie in Teil 3 und vergleiche die Anfragen in Burp. Was ist gleich?
//   2. Vergleiche die Zeilenzahl von `answerWithTools` (Teil 3) mit `createAgent` hier. Was übernimmt der Agent?
//   3. Füge ein zweites Werkzeug in `tools: [...]` ein. Wie viel Code brauchst du im Vergleich zu Teil 3?
//      Tipp: Die Funktion bekommt ihre Argumente als Objekt, z. B. `({ max }) => String(Math.floor(Math.random() * max))`
//      mit dem Schema `z.object({ max: z.number() })`.
import express from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { createOllamaApiFacade } from 'ollama-api-facade-js';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { createAgent, tool } from 'langchain';
import { z } from 'zod';
import { remoteModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { toPlainMessages } from '../shared/messages.ts';
import { log, logHttpRequests, logInvocation } from '../shared/logging.ts';
import { listenWithLogging, logHttpErrors, prepareFacade } from '../shared/server.ts';
import { requestAbortSignal, sendChatStream } from '../shared/stream.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-02-part-4';
// Ein Tool-Durchlauf bedeutet mindestens zwei Modell-Aufrufe, also mehr Zeit als eine einfache Antwort.
const MODEL_TIMEOUT_MS = 120_000;
const MAX_TOOL_ROUNDS = 5;
// Das Limit für `agent.invoke` (`recursionLimit: 2 * MAX_TOOL_ROUNDS`): `createAgent` läuft als Graph, und eine
// Tool-Runde besteht aus zwei Schritten (Modell aufrufen, Werkzeug ausführen). Zwei Schritte pro Runde ergeben
// also höchstens MAX_TOOL_ROUNDS Runden; danach wirft LangChain einen Fehler, statt endlos weiterzuschleifen.
// Das ist das ausdrückliche Gegenstück zu `MAX_TOOL_ROUNDS` aus Teil 3, wo die Schleife selbst zählt:
// Ein Modell, das immer wieder Werkzeuge anfordert, darf keine unbegrenzten Aufrufe auslösen (OWASP LLM10, Unbounded Consumption).

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

  // Dasselbe Werkzeug wie in Teil 3: Funktion plus Name, Beschreibung und Eingabe-Schema (zod).
  // Das Modell sieht nur Beschreibung und Schema, die Beschreibung entscheidet also, wann es das Werkzeug nutzt.
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
      schema: z.object({}).strict(),
    },
  );

  // NEU: Der Agent führt die Schleife aus: Modell aufrufen, angeforderte Tool-Calls ausführen, Ergebnisse
  // zurückgeben und wiederholen, bis das Modell mit reinem Text antwortet.
  const agent = createAgent({ model, tools: [dateTime] });

  const app = express();
  logHttpRequests(app);
  prepareFacade(app);

  const ollamaApi = createOllamaApiFacade(app, model, ADVERTISED_MODEL);

  ollamaApi.postApiChat(async (chatRequest, _chatModel, chatResponse) => {
    const signal = requestAbortSignal(chatResponse);
    await logInvocation('Model', { messages: chatRequest.messages.length }, async () => {
      // NEU: Ein einziger Aufruf ersetzt die ganze Schleife aus Teil 3.
      const response = await agent.invoke({ messages: toPlainMessages(chatRequest.messages) }, { signal, recursionLimit: 2 * MAX_TOOL_ROUNDS });

      // Die letzte Nachricht ist die endgültige Antwort des Modells; die davor sind der Tool-Durchlauf.
      const answer = response.messages.at(-1)?.text;
      if (!answer) throw new Error('The model returned no answer text.');

      // Der Agent streamt nicht, also senden wir die fertige Antwort als Ollama-Stream aus einem Teil.
      await sendChatStream(chatResponse, answer, signal);
    });
  });

  logHttpErrors(app);

  await checkModelServer({ viaBurp: true });

  listenWithLogging(app, ADVERTISED_MODEL);
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
