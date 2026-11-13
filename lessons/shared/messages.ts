// Nachrichten der Fassade für LangChain umwandeln und aufteilen. Übersicht: lessons/shared/README.de.md
import type { ChatRequest } from 'ollama-api-facade-js';

/** Trennt System-Prompts aus Open WebUI ab, damit ein Programm sie mit seinen eigenen zusammenfügt: Viele
 *  Chat-Vorlagen erlauben nur eine System-Nachricht am Anfang, bei zwei lehnt der Server ab (HTTP 500). */
export function splitSystemPrompts(messages: ChatRequest['messages']) {
  return {
    systemPrompts: messages.filter((message) => message.getType() === 'system').map((message) => message.text),
    conversation: messages.filter((message) => message.getType() !== 'system'),
  };
}

// Ein Typ-Alias statt eines Interfaces: LangChain erwartet Objekte, die zu `Record<string, unknown>`
// passen, und TypeScript behandelt nur Typ-Aliasse so.
export type PlainMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

// UMGEHUNG (ollama-api-facade-js 1.0.7): Die Fassade liefert Nachrichten einer älteren LangChain-Version, die
// `createAgent` ablehnt; `{ role, content }` geht mit jeder. Sicherheit: Ein unbekannter Typ wirft, statt still
// `system` zu werden und einem Fremdtext die Rechte einer Anweisung zu geben.
export function toPlainMessages(messages: ChatRequest['messages']): PlainMessage[] {
  return messages.map((message) => {
    const type = message.getType();
    switch (type) {
      case 'ai': return { role: 'assistant', content: message.text };
      case 'human': return { role: 'user', content: message.text };
      case 'system': return { role: 'system', content: message.text };
      default: throw new Error(`Unsupported message type: ${type}.`);
    }
  });
}

// Hilfsanfragen von Open WebUI (Titel, Tags) beginnen mit `### Task:`.
export const isOpenWebUITask = (question: string): boolean => /^\s*###\s*Task\s*:/i.test(question);

// Kontext vor die letzte Nutzer-Nachricht statt als eigene Nachricht, damit die Rollen abwechselnd bleiben.
export function withLastUserContext(messages: PlainMessage[], context: string): PlainMessage[] {
  const lastUser = messages.findLastIndex(({ role }) => role === 'user');
  return messages.map((message, index) => index === lastUser
    ? { ...message, content: `${context}\n\n${message.content}` }
    : message);
}
