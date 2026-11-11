// Hilfsfunktion für Modell-Antworten, die JSON liefern sollen (Lektion 04 Teil 4, Lektion 06 und 07).
// Kleine Modelle verpacken JSON gern in einen Markdown-Codeblock (```json … ```). `stripJsonFence` entfernt
// diesen Rahmen, damit `JSON.parse` den Inhalt lesen kann. Ohne Rahmen kommt der getrimmte Text unverändert zurück.
export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  return /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)?.[1] ?? trimmed;
}

// TODO(doc): Quellenliste mit vorhandenen Nummern formatieren; Metadaten gegen Markdown und Zeilenumbrüche absichern.
export function formatSourceList(labels: string[]): string {
  if (labels.length === 0) return '\n\n---\n**Quellen:** keine passenden Treffer gefunden';
  const items = labels.map((label) => {
    const prefix = /^\[\d+\] /.exec(label)?.[0] ?? '';
    const text = label.slice(prefix.length)
      .replace(/[\r\n]+/g, ' ')
      .replace(/[\\`*_{}[\]()#+\-.!<>|~&:@]/g, '\\$&');
    return `- ${prefix}${text}`;
  });
  return `\n\n---\n**Quellen**\n${items.join('\n')}`;
}
