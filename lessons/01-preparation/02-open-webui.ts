// Lektion 01 – Vorbereitung, Teil 2: Open WebUI als Chat-Oberfläche
//
// Lernziel: Du verstehst, wie ein eigenes Programm als "Modell" in Open WebUI auftaucht.
// Braucht:  wie Teil 1, dazu Open WebUI mit einer Ollama-Verbindung auf die Fassade (Wurzel-README).
// Start:    npm run l01:2   (oder F5; läuft, bis du Strg+C drückst)
// Erklärt:  lessons/01-preparation/GUIDE.de.md → „Teil 2“
//
// Aufgabe:
//   1. Wähle "lesson-01-part-2" in Open WebUI und stelle eine Frage. Welche Zeilen erscheinen im Log?
//   2. Ändere `ADVERTISED_MODEL` und lade Open WebUI neu. Wie heißt das Modell jetzt?
//      ↺ Danach zurück auf 'lesson-01-part-2'.
//   3. Füge in `postApiChat` ein `console.log(chatRequest.messages)` ein. Was schickt Open WebUI alles mit?
//      ↺ Danach die Zeile wieder entfernen.
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Handwerk.
import express from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { createOllamaApiFacade } from 'ollama-api-facade-js';
import { remoteModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { logHttpRequests, logInvocation } from '../shared/logging.ts';
import { listenWithLogging, logHttpErrors, prepareFacade } from '../shared/server.ts';
import { toPlainMessages } from '../shared/messages.ts';
import { requestAbortSignal, sendChatStream } from '../shared/stream.ts';
import { runMain } from '../shared/startup.ts';

// Standard: 'lesson-01-part-2'. Unter diesem Namen listet Open WebUI das Programm als Modell.
const ADVERTISED_MODEL = 'lesson-01-part-2';

async function main() {
  const model = new ChatOpenAI({
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    // Keine automatischen Wiederholungen: Fehler sollen sofort im Log und in Open WebUI sichtbar werden.
    maxRetries: 0,
    // Rohantwort behalten: Sie enthält die Denkschritte (siehe shared/text.ts).
    __includeRawResponse: true,
    configuration: { baseURL: remoteModel.baseURL },
  });

  const app = express();
  logHttpRequests(app);
  // Prüft die Version der Fassade und lässt nur bekannte Host-Header zu (Schutz vor DNS-Rebinding).
  prepareFacade(app);
  // KERN 1: Die Fassade gibt sich gegenüber Open WebUI als Ollama-Server aus und meldet ADVERTISED_MODEL.
  const ollamaApi = createOllamaApiFacade(app, model, ADVERTISED_MODEL);

  // KERN 2: Dein Handler für Ollamas `POST /api/chat`. `chatRequest.messages` sind die Nachrichten aus
  // Open WebUI, `chatResponse` ist der Rückweg dorthin.
  ollamaApi.postApiChat(async (chatRequest, chatModel, chatResponse) => {
    // Bricht die Modell-Anfrage ab, wenn du in Open WebUI auf "Stopp" klickst.
    const signal = requestAbortSignal(chatResponse);
    await logInvocation('Model', { messages: chatRequest.messages.length }, async () => {
      // KERN 3: Nachrichten als einfache { role, content }-Objekte an das Modell, die Antwort Stück für Stück
      // zurück an Open WebUI (`sendChatStream`, siehe shared/stream.ts).
      const stream = await chatModel.stream(toPlainMessages(chatRequest.messages), { signal });
      await sendChatStream(chatResponse, stream, signal);
    });
  });

  logHttpErrors(app);

  await checkModelServer({ viaBurp: false });
  listenWithLogging(app, ADVERTISED_MODEL);
}

await runMain(main);
