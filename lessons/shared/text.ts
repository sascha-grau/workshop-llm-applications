// Modell-Antworten aufbereiten: Antwort und Denkschritte trennen, JSON-Zaun entfernen, Quellenliste bauen und
// wieder entfernen. Übersicht: lessons/shared/README.de.md
import { settings } from './config.ts';

type ReasoningFields = { reasoning?: unknown; reasoning_content?: unknown };
export type ModelOutput = {
  text: string;
  additional_kwargs?: Record<string, unknown>;
};

// UMGEHUNG (@langchain/openai): LangChain verwirft das Feld `reasoning` (manche Server: `reasoning_content`). Die
// Chat-Clients setzen deshalb `__includeRawResponse: true`, und hier wird die Rohantwort gelesen. Ohne Denkschritte: "".
export function modelReasoning(output: ModelOutput): string {
  const extra = output.additional_kwargs;
  const raw = extra?.__raw_response as { choices?: { delta?: ReasoningFields; message?: ReasoningFields }[] } | undefined;
  const choice = raw?.choices?.[0];
  for (const fields of [extra, choice?.delta, choice?.message]) {
    for (const value of [fields?.reasoning_content, fields?.reasoning]) {
      if (typeof value === 'string' && value) return value;
    }
  }
  return '';
}

// Antwort ohne Denkschritte (Feld oder `<think>`-Block). Mit SHOW_THINKING stehen sie als `<think>…</think>` davor,
// auch vor JSON-Antworten, die dann gewollt scheitern: docs/decisions.de.md#show-thinking
export function modelText(output: ModelOutput): string {
  const text = stripThinking(output.text);
  if (!settings.showThinking) return text;
  const reasoning = modelReasoning(output);
  return reasoning ? `<think>${reasoning}</think>${text}` : text;
}

// Entfernt Denkschritte aus fertigem Text (mit SHOW_THINKING unverändert): ganze Blöcke, einen Block ohne Ende
// (abgebrochen beim Denken) und alles vor einem `</think>` ohne Anfang (die Chat-Vorlage setzt `<think>` in den Prompt).
// Sicherheit: dort nur bis zum ERSTEN `</think>` (`*?`), damit ein eingeschleustes spätes `</think>` die Antwort nicht löscht.
export function stripThinking(text: string): string {
  if (settings.showThinking) return text;
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
    .trim();
}

// Kleine Modelle verpacken JSON gern in ```json … ```; das nimmt den Rahmen ab, damit `JSON.parse` den Inhalt liest.
// Denkschritte entfernt es vorher (mit SHOW_THINKING nicht: Dann scheitert `JSON.parse`, gewollt).
export function stripJsonFence(text: string): string {
  const trimmed = stripThinking(text);
  return /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)?.[1] ?? trimmed;
}

// SYNC (→ lessons/08-evaluations/06-promptfoo-black-box.yaml#defaultTest.assert[metric=source-hit].value): sucht
// `SOURCE_LIST_PREFIX` als Text; ändere beide zusammen. `formatSourceList` baut das Format, `stripSourceList` sucht es.
const SOURCE_LIST_PREFIX = '\n\n---\n**Quellen';
const SOURCE_LIST_HEADING = `${SOURCE_LIST_PREFIX}**\n`;
const EMPTY_SOURCE_LIST = `${SOURCE_LIST_PREFIX}:** keine passenden Treffer gefunden`;

// Die Quellenliste hängt der Code an, nicht das Modell (kleine Modelle erfinden Quellen); "[n] " bringt der Aufrufer mit.
// Sicherheit (OWASP LLM05): Überschriften sind fremde Daten. Ein Inline-Code-Span je Eintrag zeigt Open WebUI wörtlich,
// ohne Link, Bild, HTML oder LaTeX; Escaping mit Backslash machte aus `\(…\)` eine Formel und aus `[n]` einen Link.
export function formatSourceList(labels: string[]): string {
  if (labels.length === 0) return EMPTY_SOURCE_LIST;
  const items = labels.map((label) => `- \`${label
    .replace(/\s+/g, ' ') // Zeilenumbrüche und Mehrfach-Leerzeichen würden Listeneinträge zerreißen
    .replace(/`/g, "'") // ein Backtick würde den Code-Span vorzeitig beenden
    .trim()}\``);
  return `${SOURCE_LIST_HEADING}${items.join('\n')}`;
}

// Open WebUI schickt alte Antworten samt Liste zurück; ohne Entfernen kopiert ein kleines Modell sie oder zitiert veraltete [n].
export function stripSourceList(text: string): string {
  const start = Math.max(text.lastIndexOf(SOURCE_LIST_HEADING), text.lastIndexOf(EMPTY_SOURCE_LIST));
  return start < 0 ? text : text.slice(0, start);
}

export function withoutSourceLists<T extends { role: string; content: string }>(messages: T[]): T[] {
  return messages.map((message) => message.role === 'assistant'
    ? { ...message, content: stripSourceList(message.content) } : message);
}
