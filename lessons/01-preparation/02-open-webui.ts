// Lektion 01 – Vorbereitung, Teil 2: Open WebUI als Chat-Oberfläche
//
// Lernziel: Du verstehst, wie ein eigenes Programm als "Modell" in Open WebUI auftaucht.
//
// Open WebUI kann mit Ollama sprechen. Die Fassade (Facade) ist ein kleiner Server, der sich wie
// Ollama verhält (Port FACADE_PORT) und jede Chat-Nachricht an unser Programm weiterreicht. So
// erscheint dieses Programm in Open WebUI als Modell "lesson-01-part-2". Einrichtung von Open WebUI: siehe README.de.md im Repo-Root.
// Alles aus ../shared/ ist Infrastruktur – siehe lessons/shared/README.de.md.
//
// Voraussetzungen: LM Studio läuft mit geladenem Chat-Modell, Server gestartet.
//   Open WebUI läuft und zeigt auf die Fassade (Quick Start: https://docs.openwebui.com/getting-started/quick-start/).
//   Burp wird nicht benötigt.
// Start: npm run l01:2   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Starte das Programm, wähle "lesson-01-part-2" in Open WebUI und stelle eine Frage.
//   2. Ändere `ADVERTISED_MODEL` und lade Open WebUI neu. Wie heißt das Modell jetzt?
//   3. Füge in `postApiChat` ein `console.log(chatRequest.messages)` ein. Was schickt Open WebUI alles mit?
//      (Open WebUI schickt zusätzlich eigene Hilfsanfragen für Titel und Tags; sie beginnen mit `### Task:`.)
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

// Unter diesem Namen listet Open WebUI unser Programm als Modell auf.
const ADVERTISED_MODEL = 'lesson-01-part-2';

async function main() {
  const model = new ChatOpenAI({
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    // Keine automatischen Wiederholungen: Fehler sollen sofort im Log und in Open WebUI sichtbar werden.
    maxRetries: 0,
    configuration: { baseURL: remoteModel.baseURL },
  });

  const app = express();
  logHttpRequests(app);
  // `prepareFacade` richtet die Fassade ein (Infrastruktur, siehe shared/README.de.md).
  prepareFacade(app);
  // NEU: Die Fassade gibt sich gegenüber Open WebUI als Ollama-Server aus.
  const ollamaApi = createOllamaApiFacade(app, model, ADVERTISED_MODEL);

  // NEU: `postApiChat` registriert den Handler für Chat-Anfragen von Open WebUI (Ollamas `POST /api/chat`).
  // `chatRequest.messages` ist das ganze bisherige Gespräch in einem Format, das LangChain versteht.
  // `chatResponse` schickt die Antwort als Stream zurück, hier über unseren Helfer (siehe shared/stream.ts).
  ollamaApi.postApiChat(async (chatRequest, chatModel, chatResponse) => {
    // `requestAbortSignal` bricht die Modell-Anfrage ab, wenn du in Open WebUI auf "Stopp" klickst.
    const signal = requestAbortSignal(chatResponse);
    await logInvocation('Model', { messages: chatRequest.messages.length }, async () => {
      // `toPlainMessages` wandelt die Nachrichten in einfache { role, content }-Objekte um.
      const stream = await chatModel.stream(toPlainMessages(chatRequest.messages), { signal });
      await sendChatStream(chatResponse, stream, signal);
    });
  });

  logHttpErrors(app);

  await checkModelServer({ viaBurp: false });
  listenWithLogging(app, ADVERTISED_MODEL);
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
