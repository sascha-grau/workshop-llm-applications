// Gemeinsamer Chat-Client für Aufrufe, deren Antwort als JSON gelesen wird (Reranking, Judge).
// Ohne Denkschritte: `reasoning_effort: none`, außer bei `thinking: true` oder SHOW_THINKING=true.
// Setzt außerdem `__includeRawResponse`, damit `modelText` die Denkschritte aus der Rohantwort lesen kann.
// Ein Server darf `reasoning_effort` ignorieren; entscheidend ist, dass `modelText` sie weglässt.
// Entscheidung: docs/decisions.de.md#rerank-denken
import { ChatOpenAI, type ChatOpenAIFields } from '@langchain/openai';
import { remoteModel, settings } from './config.ts';
import { modelFetch } from './model-fetch.ts';

export function createJsonChatModel({
  model = remoteModel.name, apiKey = remoteModel.apiKey, temperature = 0,
  modelKwargs = {}, configuration, thinking = false, ...options
}: ChatOpenAIFields & { thinking?: boolean } = {}): ChatOpenAI {
  return new ChatOpenAI({
    model,
    apiKey,
    temperature,
    maxRetries: 0,
    disableStreaming: true,
    __includeRawResponse: true,
    ...options,
    modelKwargs: { ...(thinking || settings.showThinking ? {} : { reasoning_effort: 'none' }), ...modelKwargs },
    configuration: {
      baseURL: configuration?.baseURL ?? remoteModel.baseURL,
      ...configuration,
      fetch: modelFetch(Math.max(options.timeout ?? 600_000, configuration?.timeout ?? 0), configuration?.fetch),
    },
  });
}
