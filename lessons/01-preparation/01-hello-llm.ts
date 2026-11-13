// Lektion 01 – Vorbereitung, Teil 1: Hallo, Sprachmodell
//
// Lernziel: Du schickst einen Prompt an ein Sprachmodell und liest die Antwort Token für Token mit.
// Braucht:  LM Studio mit geladenem Chat-Modell, Server gestartet; `REMOTE_MODEL_*` in `.env`.
// Start:    npm run l01:1   (oder F5)
// Erklärt:  lessons/01-preparation/GUIDE.de.md → „Teil 1“
//
// Aufgabe:
//   1. Ändere die Frage in `model.stream(...)` und starte neu.
//      ↺ Danach die ursprüngliche Frage zurück.
//   2. Setze im ChatOpenAI-Objekt `temperature: 1.5` und starte dreimal. Was ändert sich?
//      ↺ Danach die Zeile `temperature` wieder entfernen.
//   3. Ersetze `model.stream` und die Schleife durch `const response = await model.invoke(...)` und gib
//      `modelText(response)` aus (Import aus `../shared/text.ts`). Wann siehst du die Antwort?
//      ↺ Danach zurücksetzen: `git checkout -- lessons/01-preparation/01-hello-llm.ts`.
//
// Lesen: die Zeilen `// KERN 1–3`. Der Rest ist Handwerk.
import { ChatOpenAI } from '@langchain/openai';
import { remoteModel } from '../shared/config.ts';
import { logInvocation } from '../shared/logging.ts';
import { withoutThinking } from '../shared/stream.ts';
import { runMain } from '../shared/startup.ts';

async function main() {
  // KERN 1: ChatOpenAI spricht die OpenAI-API, die auch LM Studio und die meisten lokalen Server anbieten.
  // `baseURL` aus `.env` zeigt auf deinen Server statt auf OpenAI; mehr ist nicht nötig.
  const model = new ChatOpenAI({
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    // Keine automatischen Wiederholungen: Fehler sollen sofort sichtbar werden.
    maxRetries: 0,
    // Rohantwort behalten: Nur darin stehen die Denkschritte (siehe shared/text.ts); nötig für SHOW_THINKING.
    __includeRawResponse: true,
    configuration: { baseURL: remoteModel.baseURL },
  });

  await logInvocation('Model', { model: remoteModel.name }, async () => {
    // KERN 2: `stream` liefert Stücke, sobald das Modell sie erzeugt, statt auf die ganze Antwort zu warten.
    const stream = await model.stream('Erkläre in zwei Sätzen, was ein Sprachmodell ist.');
    // KERN 3: Jedes Stück sofort ausgeben. `withoutThinking` lässt die Denkschritte weg; mit
    // SHOW_THINKING=true zeigt es sie als `<think>`-Block.
    for await (const chunk of withoutThinking(stream)) {
      process.stdout.write(chunk.text);
    }
    process.stdout.write('\n');
  });
}

// runMain ist nur der Rahmen: Ein Fehler in main() wird eine einzelne Fehlerzeile statt eines Stacktraces,
// und das Programm endet mit Exit-Code 1.
await runMain(main);
