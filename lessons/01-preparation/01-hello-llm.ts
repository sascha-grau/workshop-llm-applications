// Lektion 01 – Vorbereitung, Teil 1: Hallo, Sprachmodell
//
// Lernziel: Du schickst einen Prompt an ein Sprachmodell und liest die Antwort Token für Token mit.
//
// Die Datei sendet eine Frage an einen OpenAI-kompatiblen Server und gibt die Antwort aus, sobald
// sie ankommt. Ein Token ist ein Wortstück (ca. 3–4 Zeichen); das Modell liest und erzeugt Text
// Token für Token. Streaming heißt: Die Antwort kommt stückweise statt am Ende auf einmal.
// Kein eigener Server, kein Proxy – nur der Modell-Client.
//
// Voraussetzungen: LM Studio läuft mit geladenem Chat-Modell, Server gestartet (https://lmstudio.ai).
//   Modellname und Adresse stehen in .env (REMOTE_MODEL_*, siehe .env.example); kopiere den Namen aus LM Studio.
//   Modell: Qwen3.5-4B, https://huggingface.co/Qwen/Qwen3.5-4B. Burp wird nicht benötigt.
// Start: npm run l01:1   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Ändere die Frage in `model.stream(...)` und starte neu.
//   2. Setze beim ChatOpenAI-Objekt `temperature: 1.5` und frage mehrmals dasselbe. Was ändert sich?
//      (`temperature` steuert, wie zufällig die Wortwahl ist; 0 = möglichst gleichbleibend.)
//   3. Ersetze `model.stream` durch `await model.invoke(...)` und gib `modelText(response)` aus (Import:
//      `import { modelText } from '../shared/text.ts';`; `.text` allein ließe die Denkschritte auch mit
//      `SHOW_THINKING=true` weg). Wann siehst du die Antwort?
import { ChatOpenAI } from '@langchain/openai';
import { remoteModel } from '../shared/config.ts';
import { logInvocation } from '../shared/logging.ts';
import { withoutThinking } from '../shared/stream.ts';
import { runMain } from '../shared/startup.ts';

async function main() {
  // ChatOpenAI spricht die OpenAI-API, die auch die meisten lokalen Modell-Server anbieten.
  // Mit `baseURL` zeigst du auf einen anderen Server, mehr ist nicht nötig.
  const model = new ChatOpenAI({
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    // Keine automatischen Wiederholungen: Fehler sollen sofort sichtbar werden.
    maxRetries: 0,
    // Rohantwort behalten: Sie enthält die Denkschritte (siehe shared/text.ts); nur für SHOW_THINKING nötig.
    __includeRawResponse: true,
    configuration: { baseURL: remoteModel.baseURL },
  });

  await logInvocation('Model', { model: remoteModel.name }, async () => {
    // `stream` liefert Stücke (Chunks), sobald das Modell sie erzeugt, statt auf die ganze Antwort zu warten.
    const stream = await model.stream('Erkläre in zwei Sätzen, was ein Sprachmodell ist.');
    // `withoutThinking` lässt die Denkschritte weg; mit SHOW_THINKING=true zeigt es sie als `<think>`-Block.
    for await (const chunk of withoutThinking(stream)) {
      process.stdout.write(chunk.text);
    }
    process.stdout.write('\n');
  });
}

// runMain ist nur der Rahmen: Geht in main() etwas schief, erscheint eine einzelne Fehlerzeile statt eines Stacktraces, und das Programm endet mit Exit-Code 1.
await runMain(main);
