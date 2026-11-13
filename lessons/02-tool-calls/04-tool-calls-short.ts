// Lektion 02 – Tool-Calls, Teil 4: Tool-Calls, die kurze Variante
//
// Lernziel: Du ersetzt die handgeschriebene Tool-Schleife aus Teil 3 durch `createAgent`.
// Braucht:  wie Teil 1.
// Start:    npm run l02:4   (oder F5; läuft, bis du Strg+C drückst)
// Erklärt:  lessons/02-tool-calls/GUIDE.de.md → „Teil 4“
//
// Aufgabe:
//   1. Stelle dieselbe Datumsfrage wie in Teil 3 und vergleiche die Anfragen in Burp. Was ist gleich?
//   2. Vergleiche die Zeilenzahl von `answerWithTools` (Teil 3) mit `createAgent` hier. Was übernimmt der Agent?
//   3. Füge das Werkzeug `randomNumber` aus Teil 3, Aufgabe 2 in `tools: [...]` ein. Wie viel Code brauchst du?
//      ↺ Danach das Werkzeug wieder entfernen.
//
// Lesen: die Zeilen `// KERN 1–2`. Der Rest ist wie in Teil 3.
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
import { modelText } from '../shared/text.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-02-part-4';
// Ein Tool-Durchlauf bedeutet mindestens zwei Modell-Aufrufe, also mehr Zeit als eine einfache Antwort.
const MODEL_TIMEOUT_MS = 120_000;
// Standard: 5. Wie in Teil 3; unten wird daraus `recursionLimit: 2 * MAX_TOOL_ROUNDS`, denn der Agent zählt
// Graph-Schritte, und eine Runde sind zwei (Modell, Werkzeug). Danach wirft LangChain einen Fehler (OWASP LLM10).
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

  // Dasselbe Werkzeug wie in Teil 3.
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

  // KERN 1: Der Agent führt die Schleife aus Teil 3 aus: Modell aufrufen, angeforderte Werkzeuge ausführen,
  // Ergebnisse zurückgeben und wiederholen, bis das Modell mit reinem Text antwortet.
  const agent = createAgent({ model, tools: [dateTime] });

  const app = express();
  logHttpRequests(app);
  prepareFacade(app);

  const ollamaApi = createOllamaApiFacade(app, model, ADVERTISED_MODEL);

  ollamaApi.postApiChat(async (chatRequest, _chatModel, chatResponse) => {
    const signal = requestAbortSignal(chatResponse);
    await logInvocation('Model', { messages: chatRequest.messages.length }, async () => {
      // KERN 2: Ein Aufruf ersetzt die ganze Schleife; `recursionLimit` begrenzt sie wie MAX_TOOL_ROUNDS in Teil 3.
      const response = await agent.invoke({ messages: toPlainMessages(chatRequest.messages) }, { signal, recursionLimit: 2 * MAX_TOOL_ROUNDS });

      // Die letzte Nachricht ist die endgültige Antwort des Modells; die davor sind der Tool-Durchlauf.
      const message = response.messages.at(-1);
      const answer = message ? modelText(message) : '';
      if (!answer) throw new Error('The model returned no answer text.');

      // Der Agent streamt nicht: Die fertige Antwort geht als Ollama-Stream aus einem Stück an Open WebUI.
      await sendChatStream(chatResponse, answer, signal);
    });
  });

  logHttpErrors(app);

  await checkModelServer({ viaBurp: true });

  listenWithLogging(app, ADVERTISED_MODEL);
}

await runMain(main);
