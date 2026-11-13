// Lektion 01 – Vorbereitung, Teil 3: Den Datenverkehr in Burp Suite beobachten
//
// Lernziel: Du siehst in der HTTP-History von Burp, was dein Programm wirklich an das Modell schickt.
// Braucht:  wie Teil 2, dazu Burp (Intercept aus) und `BURP_PROXY_URL=http://localhost:8080` in `.env`.
// Start:    npm run l01:3   (oder F5; läuft, bis du Strg+C drückst)
// Erklärt:  lessons/01-preparation/GUIDE.de.md → „Teil 3“
// Achtung:  Burp zeigt den API-Schlüssel im Klartext (`Authorization: Bearer …`). Vor dem Teilen schwärzen.
//
// Aufgabe:
//   1. Stelle in Open WebUI eine Frage und suche die Anfrage in der HTTP-History von Burp. Wo steht dein Text?
//   2. Schalte in Burp "Intercept on", ändere deine Frage in der festgehaltenen Anfrage und leite sie weiter.
//      Worauf antwortet das Modell?
//      ↺ Danach Intercept wieder aus (sonst hält Burp jede weitere Anfrage fest).
//   3. Setze `disableStreaming` auf `false` und ersetze die zwei Zeilen im Handler durch den Block darunter.
//      Wie sieht die Antwort in Burp jetzt aus?
//      ↺ Danach zurücksetzen: `git checkout -- lessons/01-preparation/03-burp-proxy.ts`.
//
// Lesen: die Zeilen `// KERN 1–2`. Der Rest ist wie in Teil 2.
import express from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { createOllamaApiFacade } from 'ollama-api-facade-js';
import { setGlobalDispatcher } from 'undici';
import { getBurpDispatcher } from '../shared/proxy.ts';
import { remoteModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { logHttpRequests, logInvocation } from '../shared/logging.ts';
import { listenWithLogging, logHttpErrors, prepareFacade } from '../shared/server.ts';
import { toPlainMessages } from '../shared/messages.ts';
import { requestAbortSignal, sendChatStream } from '../shared/stream.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-01-part-3';
// So lange wartet ein Modell-Aufruf, auch während Intercept die Anfrage festhält (Aufgabe 2).
const MODEL_TIMEOUT_MS = 60_000;

async function main() {
  // KERN 1: Ab hier läuft jede ausgehende Anfrage dieses Prozesses über Burp, falls BURP_PROXY_URL gesetzt ist.
  // Der Dispatcher von undici (Nodes HTTP-Client) wählt die Verbindung; ab Lektion 02 erledigt das
  // `useBurpIfConfigured()` in einer Zeile.
  if (getBurpDispatcher()) setGlobalDispatcher(getBurpDispatcher()!);

  const model = new ChatOpenAI({
    timeout: MODEL_TIMEOUT_MS,
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    // Wiederholungen würden in Burp als verwirrende Doppelanfragen auftauchen: lieber sofort scheitern.
    maxRetries: 0,
    // KERN 2: Eine vollständige Antwort ist in Burp viel leichter zu lesen als viele kleine Stücke.
    disableStreaming: true,
    // Rohantwort behalten: Sie enthält die Denkschritte (siehe shared/text.ts).
    __includeRawResponse: true,
    configuration: { baseURL: remoteModel.baseURL },
  });

  const app = express();
  logHttpRequests(app);
  prepareFacade(app);
  const ollamaApi = createOllamaApiFacade(app, model, ADVERTISED_MODEL);

  ollamaApi.postApiChat(async (chatRequest, chatModel, chatResponse) => {
    const signal = requestAbortSignal(chatResponse);
    await logInvocation('Model', { messages: chatRequest.messages.length }, async () => {
      // `invoke` wartet auf die ganze Antwort; `sendChatStream` schickt sie in einem Stück an Open WebUI.
      const response = await chatModel.invoke(toPlainMessages(chatRequest.messages), { signal });
      await sendChatStream(chatResponse, response, signal);
    });
  });

  // Für Aufgabe 3: Diese zwei Zeilen ersetzen im Handler `invoke` und `sendChatStream(…, response, …)`.
  //   const stream = await chatModel.stream(toPlainMessages(chatRequest.messages), { signal });
  //   await sendChatStream(chatResponse, stream, signal);

  logHttpErrors(app);

  await checkModelServer({ viaBurp: true });
  listenWithLogging(app, ADVERTISED_MODEL);
}

await runMain(main);
