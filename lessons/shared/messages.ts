/**
 * Hilfsfunktionen für die Nachrichten in den Chat-Handlern.
 */
import type { ChatRequest } from 'ollama-api-facade-js';

/**
 * Trennt die System-Prompts ab, die jemand in Open WebUI gesetzt hat, damit ein Programm sie mit
 * seinen eigenen Anweisungen zusammenfügen kann. Die Chat-Vorlagen vieler Modelle erlauben nur
 * eine System-Nachricht ganz am Anfang. Bei zwei lehnt der Server die Anfrage ab (HTTP 500).
 */
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

/**
 * Die Fassade liefert das Gespräch als Nachrichten-Klassen einer älteren LangChain-Version. Die
 * lehnt `createAgent` ab (`bindTools` akzeptiert sie). Einfache `{ role, content }`-Objekte
 * funktionieren mit jeder Version. Die Rollen heißen dort `system`, `user` und `assistant`.
 * Ein unbekannter Nachrichtentyp wirft einen Fehler. Er würde sonst still zur Rolle `system`, und
 * die hat im Gespräch das meiste Gewicht: Ein Fremdtext bekäme so ungewollt die Rechte einer
 * Anweisung (Sicherheit).
 */
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

export const isOpenWebUITask = (question: string): boolean => /^\s*###\s*Task\s*:/i.test(question);

export function withLastUserContext(messages: PlainMessage[], context: string): PlainMessage[] {
  const lastUser = messages.findLastIndex(({ role }) => role === 'user');
  return messages.map((message, index) => index === lastUser
    ? { ...message, content: `${context}\n\n${message.content}` }
    : message);
}
