// Lektion 08 – Evaluierung: der RAG-Assistent aus Lektion 07 als promptfoo-Provider für Teil 5,
// kein eigener Teil. Nur der Index wechselt (`config.strategy` in der YAML-Datei). Anders als die
// Fassade liefert er Treffer (`sources`) und Kontext (`context`) als Metadaten für die Prüfungen.
// Erklärt: GUIDE.de.md → „Teil 5“.
import type { ApiProvider, ProviderOptions, ProviderResponse } from 'promptfoo';
import { useBurpIfConfigured } from '../shared/proxy.ts';
import { embeddingQuery } from '../shared/embeddings.ts';
import { indexCommands, rankEntries, type Strategy } from '../shared/index.ts';
import { contextFor, embedRagQuestion, loadRagIndex, promptFor, retrieveQuestionChunks, type RagEntry } from '../07-rag-open-webui/rag.ts';
import { modelText } from '../shared/text.ts';
import { createChatModel } from './evaluation.ts';

// Standard: 5, wie Teil 2 und 3; in der YAML-Datei je Provider als `topK` änderbar. Der MRR zählt
// Ränge bis hierhin.
const DEFAULT_TOP_K = 5;
const STRATEGIES = Object.keys(indexCommands) as Strategy[];

// Was in der YAML-Datei unter `config` stehen darf.
type AssistantConfig = { strategy?: Strategy; topK?: number };

export default class RagAssistantProvider implements ApiProvider {
  private readonly providerId: string;
  private readonly strategy: Strategy;
  private readonly topK: number;
  private readonly model = createChatModel();
  // Der Index wird beim ersten Testfall geladen und dann behalten: Er ist für alle Fragen derselbe.
  private index: RagEntry[] | undefined;

  constructor(options: ProviderOptions & { config?: AssistantConfig }) {
    const { strategy = 'headings', topK = DEFAULT_TOP_K } = options.config ?? {};
    // Ein Tippfehler in der YAML-Datei soll sofort auffallen, nicht erst als fehlende Indexdatei.
    if (!STRATEGIES.includes(strategy)) throw new Error(`Unknown strategy "${strategy}". Use one of: ${STRATEGIES.join(', ')}.`);
    this.strategy = strategy;
    this.topK = topK;
    this.providerId = options.id ?? `rag-assistant:${strategy}`;
    useBurpIfConfigured();
  }

  id(): string {
    return this.providerId;
  }

  // Ein Testfall: `prompt` ist die Frage (der Prompt in der YAML-Datei ist nur `{{query}}`).
  async callApi(prompt: string): Promise<ProviderResponse> {
    try {
      this.index ??= loadRagIndex(this.strategy);
      // Wie in Lektion 07: E5-Präfix "query: " davor, auf das Token-Limit gekürzt.
      const queryVector = await embedRagQuestion(embeddingQuery(prompt), AbortSignal.timeout(60_000));
      // Der Fragen-Index (Lektion 04, Teil 4) enthält Fragen statt Chunks; `retrieveQuestionChunks`
      // macht daraus wieder Chunks, wie in Lektion 07, Teil 3. Alle anderen Indizes: einfaches Top-k.
      const hits = this.strategy === 'questions'
        ? retrieveQuestionChunks(this.index, queryVector, this.topK)
        : rankEntries(this.index, queryVector, this.topK);
      const context = contextFor(hits);
      const response = await this.model.invoke(promptFor(prompt, [{ role: 'user', content: prompt }], [], context, hits.length));
      return {
        // Ohne Denkschritte (mit SHOW_THINKING=true stehen sie davor): promptfoo prüft die Antwort, wie
        // Open WebUI sie zeigt.
        output: modelText(response),
        metadata: { sources: hits.map(({ metadata }) => metadata.source), context },
      };
    } catch (error) {
      // promptfoo zeigt den Fehler beim Testfall an, statt den ganzen Lauf abzubrechen. Die Meldung
      // nennt Ursache und Abhilfe (z. B. "Generate it with npm run l04:1"), nie Frage oder Antwort.
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}
