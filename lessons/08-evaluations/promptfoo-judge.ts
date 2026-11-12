// Lektion 08 – Evaluierung: der Judge für Teil 5 und 6 als promptfoo-Provider, kein eigener Teil.
//
// Das Programm verpackt `openai:chat:<Modell>` (`config.model` in der YAML-Datei) und setzt zwei Dinge selbst, nach
// `SHOW_THINKING` aus `.env` (siehe `settings.showThinking`):
// - `showThinking`: promptfoo stellt `{{ env.X }}` als TEXT ein, und sein OpenAI-Adapter liest `config.showThinking ?? true`.
//   "false" wäre also wahr. Hier steht ein echter Boolean. Ohne das hängt promptfoo die Denkschritte des Judge als
//   "Thinking: …" an jede Ausgabe, und die Prüfung der Quellentreue zählt jede dieser Zeilen als Aussage: drei echte
//   Aussagen, alle "Yes", ergaben so 3 von 9. Darum zeigte Teil 5 früher fast nur Fehlschläge.
// - `reasoning_effort: 'none'`, nur wenn die Denkschritte aus sind: Ein Judge braucht sie nicht. qwen3.5 in LM Studio hält
//   sich daran (gemessen: 57 statt rund 2500 Tokens). Ein Modell, das den Wert nicht kennt, ignoriert ihn; dann reicht
//   `max_tokens` (2048 in der YAML-Datei) vielleicht nicht, siehe README.
// Mit SHOW_THINKING=true bleibt beides aus: Der Judge denkt und zeigt es, die Auswertung wird unzuverlässig.

import { loadApiProvider } from 'promptfoo';
import type { ApiProvider, ProviderOptions, ProviderResponse } from 'promptfoo';
import { settings } from '../shared/config.ts';

export default class JudgeProvider implements ApiProvider {
  private readonly options: ProviderOptions;

  constructor(options: ProviderOptions) {
    this.options = options;
  }

  id(): string {
    return `openai:chat:${this.options.config?.model}`;
  }

  get config() {
    const { model: _model, ...config } = this.options.config ?? {};
    const { reasoning_effort: _effort, ...passthrough } = config.passthrough ?? {};
    const showThinking = settings.showThinking;
    return {
      ...config,
      showThinking,
      passthrough: { ...passthrough, ...(!showThinking && { reasoning_effort: 'none' }) },
    };
  }

  async callApi(...args: Parameters<ApiProvider['callApi']>): Promise<ProviderResponse> {
    const provider = await loadApiProvider(this.id(), { options: { config: this.config }, env: this.options.env });
    return provider.callApi(...args);
  }
}
