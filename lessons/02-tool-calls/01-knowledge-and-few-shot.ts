// Lektion 02 – Tool-Calls, Teil 1: Wissen und Few-Shot im Prompt
//
// Lernziel: Du gibst dem Modell Wissen und Antwortstil über Rollen, System-Prompt und Few-Shot mit.
//
// Das Modell kennt "Ano Nym" nicht. Die Fakten stehen deshalb als Kontext im System-Prompt.
// Rollen: `system` (Anweisung des Entwicklers, steht vor dem Gespräch), `user` (Mensch),
// `assistant` (Modell). Few-Shot: erfundene Beispiel-Dialoge, die Format und Stil vormachen.
// `temperature` steuert, wie zufällig die Wortwahl ist; 0 = möglichst gleichbleibend.
// Einordnung: Hier legt dein Code das Wissen selbst in den Prompt – die Vorstufe zu Tool-Calls, bei denen das Modell es ab Teil 3 selbst anfordert.
//
// Voraussetzungen: LM Studio (Chat-Modell geladen, Server gestartet) und Open WebUI laufen. Burp ist optional: Ist BURP_PROXY_URL gesetzt, muss Burp laufen (Intercept aus).
// Start: npm run l02:1   (oder Datei öffnen und F5 drücken)
//
// Aufgabe:
//   1. Frage nach etwas, das nicht im Kontext steht ("Wie alt ist Ano Nym?"). Was antwortet das Modell?
//   2. Entferne `...examples` aus `messages` und stelle die Frage aus Aufgabe 1 noch einmal.
//      Vergleiche Format und "(Quelle: Kontext)" mit vorher.
//   3. Suche den System-Prompt in Burp und setze `temperature` auf 1. Frage mehrmals dasselbe.
import express from 'express';
import { ChatOpenAI } from '@langchain/openai';
import { createOllamaApiFacade } from 'ollama-api-facade-js';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { remoteModel } from '../shared/config.ts';
import { checkModelServer } from '../shared/diagnostics.ts';
import { splitSystemPrompts, toPlainMessages } from '../shared/messages.ts';
import { logHttpRequests, logInvocation } from '../shared/logging.ts';
import { listenWithLogging, logHttpErrors, prepareFacade } from '../shared/server.ts';
import { requestAbortSignal, sendChatStream } from '../shared/stream.ts';
import { runMain } from '../shared/startup.ts';

const ADVERTISED_MODEL = 'lesson-02-part-1';

async function main() {
  // Burp bleibt an (Lektion 01, Teil 3): Jede Anfrage erscheint in der HTTP-History,
  // auch der komplette System-Prompt und die Few-Shot-Beispiele.
  useBurpIfConfigured();

  const model = new ChatOpenAI({
    model: remoteModel.name,
    apiKey: remoteModel.apiKey,
    // Wiederholungen würden in Burp als verwirrende Doppelanfragen auftauchen: lieber sofort scheitern.
    maxRetries: 0,
    disableStreaming: true,
    // NEU: Temperature 0 macht Antworten (fast) wiederholbar, alle Teilnehmenden sehen dasselbe Verhalten.
    temperature: 0,
    configuration: { baseURL: remoteModel.baseURL },
  });

  // NEU: Das Wissen steckt im Prompt, nicht im Modell.
  const knowledge = `Ano Nym ist ein geheimnisvoller Ethical Hacker. Niemand kennt das Gesicht oder den echten Namen.
Ano Nym findet Sicherheitslücken in Webanwendungen und Sprachmodellen und meldet sie verantwortungsvoll an die Betreiber.
Ano Nym veröffentlicht Berichte nur unter diesem Pseudonym und tritt nie persönlich auf Konferenzen auf.`;

  // NEU: System-Prompt. Die Beschränkung auf den Kontext und die erlaubte Antwort "weiß ich nicht"
  // halten das Modell davon ab, Fakten zu erfinden.
  const systemPrompt = `Beantworte Fragen ausschließlich mit dem folgenden Kontext. Steht die Antwort nicht darin, sage das offen. Antworte auf Deutsch.

Kontext:
${knowledge}`;

  // NEU: Few-Shot. Zwei Beispielpaare zeigen dem Modell das erwartete Antwortformat samt Quellenangabe.
  const examples = [
    { role: 'user', content: 'Wie sieht Ano Nym aus?' },
    { role: 'assistant', content: 'Niemand kennt das Gesicht von Ano Nym. (Quelle: Kontext)' },
    { role: 'user', content: 'Wo findet Ano Nym Sicherheitslücken?' },
    { role: 'assistant', content: 'In Webanwendungen und Sprachmodellen. (Quelle: Kontext)' },
  ];

  const app = express();
  logHttpRequests(app);
  prepareFacade(app);
  const ollamaApi = createOllamaApiFacade(app, model, ADVERTISED_MODEL);

  ollamaApi.postApiChat(async (chatRequest, chatModel, chatResponse) => {
    const signal = requestAbortSignal(chatResponse);
    await logInvocation('Model', { messages: chatRequest.messages.length }, async () => {
      // Die Reihenfolge zählt: erst die Anweisung, dann die Beispiele, dann das echte Gespräch.
      // Ein System-Prompt aus Open WebUI wird mit unserem zusammengeführt, weil die meisten Modelle nur einen akzeptieren.
      // Achtung: Diese System-Prompts kommen vom Client und sind nicht vertrauenswürdig. Hier ist das in Ordnung,
      // weil du selbst der Nutzer bist. In einer Mehrbenutzer-Anwendung würdest du sie verwerfen;
      // Zugriffsschutz darf nie vom Prompt abhängen.
      const { systemPrompts, conversation } = splitSystemPrompts(chatRequest.messages);
      const messages = [
        { role: 'system', content: [systemPrompt, ...systemPrompts].join('\n\n') },
        ...examples,
        ...toPlainMessages(conversation),
      ];
      const stream = await chatModel.stream(messages, { signal });
      await sendChatStream(chatResponse, stream, signal);
    });
  });

  logHttpErrors(app);

  await checkModelServer({ viaBurp: true });
  listenWithLogging(app, ADVERTISED_MODEL);
}

// Rahmen für saubere Fehlermeldungen, siehe Lektion 01, Teil 1.
await runMain(main);
