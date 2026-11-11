// Lektion 01 – Vorbereitung, Teil 3: Den Datenverkehr in Burp Suite beobachten
//
// Lernziel: Du siehst in der HTTP-History von Burp, was dein Programm wirklich an das Modell schickt.
//
// Derselbe Chat-Server wie in Teil 2, aber jede ausgehende Anfrage läuft jetzt über Burp.
// Ein Proxy sitzt zwischen Programm und Server und zeigt jede HTTP-Anfrage an. So erscheinen
// Prompts und Antworten in der HTTP-History von Burp. Achtung: Die History zeigt auch den Header
// `Authorization: Bearer …`, also den API-Schlüssel im Klartext. Teile Burp-Screenshots oder
// Projektdateien nicht, ohne ihn vorher zu schwärzen.
//
// Voraussetzungen: LM Studio (Server gestartet) und Open WebUI laufen. Burp ist in diesem Teil der Kern, aber
//   technisch optional. In `.env.example` ist BURP_PROXY_URL leer, der Proxy ist also freiwillig. Für diesen Teil trägst du
//   in `.env` BURP_PROXY_URL=http://localhost:8080 ein (der Standard-Listener von Burp). Ist die Adresse gesetzt, muss Burp laufen (Intercept aus).
//   Ohne BURP_PROXY_URL läuft das Programm ohne Proxy und du siehst nichts in Burp.
//   Burp Community: https://portswigger.net/burp/communitydownload
//   CA-Zertifikat (nur HTTPS, ab Lektion 02, Teil 2): https://portswigger.net/burp/documentation/desktop/external-browser-config/certificate (nur exportieren, nicht im Browser installieren; siehe README.de.md im Repo-Root)
// Start: npm run l01:3   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Stelle in Open WebUI eine Frage und suche die Anfrage in der HTTP-History von Burp. Wo steht dein Text?
//   2. Schalte in Burp "Intercept on", ändere deine Frage in der Anfrage und leite sie weiter. Antwortet das Modell auf die geänderte Frage?
//   3. Streaming ausprobieren: Setze `disableStreaming` auf `false` und ersetze die zwei Zeilen im Handler
//      durch den auskommentierten Block unter dem Handler. Wie sieht die Antwort in Burp jetzt aus?
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
const MODEL_TIMEOUT_MS = 60_000;

async function main() {
  // NEU: Ab hier läuft jede ausgehende Anfrage dieses Prozesses über Burp (falls konfiguriert).
  // Der "Dispatcher" ist das Objekt von undici (Nodes HTTP-Client), das entscheidet, über welche Verbindung eine Anfrage
  // rausgeht; ein Proxy-Dispatcher schickt sie über Burp. `setGlobalDispatcher` macht ihn zum Standard für alle Anfragen.
  // Später in Lektion 02, Teil 2 gilt das auch für das Laden von Webseiten.
  // Ab Lektion 02 erledigt `useBurpIfConfigured()` dasselbe in einer Zeile.
  if (getBurpDispatcher()) setGlobalDispatcher(getBurpDispatcher()!);

  const model = new ChatOpenAI({
    timeout: MODEL_TIMEOUT_MS,
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    // Wiederholungen würden in Burp als verwirrende Doppelanfragen auftauchen: lieber sofort scheitern.
    maxRetries: 0,
    // NEU: Eine vollständige Antwort ist in Burp viel leichter zu lesen als viele kleine Stücke.
    disableStreaming: true,
    configuration: { baseURL: remoteModel.baseURL },
  });

  const app = express();
  logHttpRequests(app);
  prepareFacade(app);
  const ollamaApi = createOllamaApiFacade(app, model, ADVERTISED_MODEL);

  ollamaApi.postApiChat(async (chatRequest, chatModel, chatResponse) => {
    const signal = requestAbortSignal(chatResponse);
    await logInvocation('Model', { messages: chatRequest.messages.length }, async () => {
      // `invoke` wartet auf die ganze Antwort; `.text` ist ihr Text.
      const response = await chatModel.invoke(toPlainMessages(chatRequest.messages), { signal });
      await sendChatStream(chatResponse, response.text, signal);
    });
  });

  // Zum Ausprobieren (Aufgabe 3) einkommentieren und im Handler `invoke` + `sendChatStream(... response.text ...)` ersetzen:
  //   const stream = await chatModel.stream(toPlainMessages(chatRequest.messages), { signal });
  //   await sendChatStream(chatResponse, stream, signal);

  logHttpErrors(app);

  await checkModelServer({ viaBurp: true });
  listenWithLogging(app, ADVERTISED_MODEL);
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
