// Hilfsfunktionen für Modell-Antworten:
// - `modelText`/`modelReasoning` holen Antwort und Denkschritte aus einer Modell-Antwort (alle Lektionen mit Chat),
// - `stripThinking` entfernt `<think>…</think>` aus fertigem Text (über `sendChatStream` auch bei allem, was
//   Open WebUI anzeigt),
// - `stripJsonFence` für Antworten, die JSON liefern sollen (Lektion 04 Teil 4, Lektion 06 und 07, Lektion 08
//   Teil 2 und 3),
// - `formatSourceList` samt `stripSourceList`/`withoutSourceLists` für die Quellenliste unter den Antworten
//   (Lektion 02 Teil 1 und 2, Lektion 07).
import { settings } from './config.ts';

type ReasoningFields = { reasoning?: unknown; reasoning_content?: unknown };
export type ModelOutput = {
  text: string;
  additional_kwargs?: Record<string, unknown>;
};

// Die Denkschritte einer Modell-Antwort. Der Server schickt sie in einem eigenen Feld (`reasoning`, manche
// Server: `reasoning_content`), nicht als `<think>` im Text; LangChain verwirft das Feld, deshalb setzen die
// Rohantwort behalten: enthält die Denkschritte (siehe shared/text.ts)
// Chat-Clients `__includeRawResponse: true`, damit die Rohantwort erhalten bleibt. Ohne Denkschritte: "".
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

// Die Antwort ohne Denkschritte (ein `<think>`-Block im Text fällt auch weg). Mit SHOW_THINKING=true stehen die
// Denkschritte stattdessen als `<think>…</think>` vor der Antwort; als JSON gelesene Antworten scheitern dann.
export function modelText(output: ModelOutput): string {
  const text = stripThinking(output.text);
  if (!settings.showThinking) return text;
  const reasoning = modelReasoning(output);
  return reasoning ? `<think>${reasoning}</think>${text}` : text;
}

// Reasoning-Modelle (z. B. qwen3 in LM Studio) schreiben vor die Antwort ihre Denkschritte in einen Block
// `<think>…</think>`. Die Antwort selbst steht dahinter. Im Workshop zeigen wir nur die Antwort: Die Denkschritte sind
// lang, oft englisch, würden JSON-Antworten unlesbar machen und gehören nicht in den Chatverlauf. Mit
// SHOW_THINKING=true gibt `stripThinking` den Text unverändert zurück.
// Drei Fälle: vollständige Blöcke (überall im Text), ein Block ohne Ende (Antwort abgebrochen, während das Modell
// noch dachte: Dann bleibt nichts übrig) und ein schließendes `</think>` ohne öffnendes (manche Chat-Vorlagen
// setzen `<think>` schon in den Prompt; dann ist alles davor Denken). Im dritten Fall endet das Denken am ERSTEN
// `</think>` (`*?`): Bringt ein eingeschleuster Text das Modell dazu, später noch ein `</think>` zu schreiben,
// verschwindet so nicht die ganze Antwort davor.
export function stripThinking(text: string): string {
  if (settings.showThinking) return text;
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
    .trim();
}

// Kleine Modelle verpacken JSON gern in einen Markdown-Codeblock (```json … ```). `stripJsonFence` entfernt
// diesen Rahmen, damit `JSON.parse` den Inhalt lesen kann. Ohne Rahmen kommt der getrimmte Text unverändert zurück.
// Denkschritte (`<think>…</think>`, siehe `stripThinking`) entfernt sie vorher.
export function stripJsonFence(text: string): string {
  const trimmed = stripThinking(text);
  return /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)?.[1] ?? trimmed;
}

// Diese drei Konstanten legen das Format der Quellenliste fest. `formatSourceList` baut sie, `stripSourceList` sucht sie
// wieder; so können Format und Entfernen nicht auseinanderlaufen. Lektion 08, Teil 6 (06-promptfoo-black-box.yaml)
// sucht `SOURCE_LIST_PREFIX` als Text; änderst du das Format, ändere es dort mit.
const SOURCE_LIST_PREFIX = '\n\n---\n**Quellen';
const SOURCE_LIST_HEADING = `${SOURCE_LIST_PREFIX}**\n`;
const EMPTY_SOURCE_LIST = `${SOURCE_LIST_PREFIX}:** keine passenden Treffer gefunden`;

// Formatiert die Quellenliste, die der Code (nicht das Modell) an die Antwort hängt: Kleine Modelle zitieren unzuverlässig
// und erfinden Quellen. Die Nummern "[n] " kommen fertig vom Aufrufer (Lektion 07: aus `sourceLabelFor`, Lektion 02: als
// Text "[1] …" geschrieben). Jeder Eintrag ist ein einziger Inline-Code-Span: Open WebUI zeigt ihn wörtlich an, ohne Link,
// Bild, HTML, Hervorhebung oder LaTeX-Formel. Überschriften sind fremde Daten (OWASP LLM05); das frühere Escaping mit
// Backslash machte aus `\(…\)` eine Formel und ließ `[n]` als Referenz-Link zu.
// Die Liste zeigt, was dem Modell geliefert wurde, nicht, was es verwendet hat.
export function formatSourceList(labels: string[]): string {
  if (labels.length === 0) return EMPTY_SOURCE_LIST;
  const items = labels.map((label) => `- \`${label
    .replace(/\s+/g, ' ') // Zeilenumbrüche und Mehrfach-Leerzeichen würden Listeneinträge zerreißen
    .replace(/`/g, "'") // ein Backtick würde den Code-Span vorzeitig beenden
    .trim()}\``);
  return `${SOURCE_LIST_HEADING}${items.join('\n')}`;
}

// Entfernt die angehängte Quellenliste aus früheren Assistenten-Nachrichten. Open WebUI schickt alte Antworten mit der Liste
// zurück; ohne diesen Schritt könnte ein kleines Modell die alte Liste kopieren oder veraltete [n] zitieren.
export function stripSourceList(text: string): string {
  const start = Math.max(text.lastIndexOf(SOURCE_LIST_HEADING), text.lastIndexOf(EMPTY_SOURCE_LIST));
  return start < 0 ? text : text.slice(0, start);
}

// Dasselbe für einen ganzen Chatverlauf: `stripSourceList` auf jede Assistenten-Nachricht, alle anderen bleiben unverändert.
export function withoutSourceLists<T extends { role: string; content: string }>(messages: T[]): T[] {
  return messages.map((message) => message.role === 'assistant'
    ? { ...message, content: stripSourceList(message.content) } : message);
}
