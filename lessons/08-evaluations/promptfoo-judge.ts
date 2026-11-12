// Lektion 08 – Evaluierung: der Judge für Teil 5 und 6 als promptfoo-Provider, kein eigener Teil.
//
// Der Provider verpackt `openai:chat:<Modell>` (das Modell steht in `config.model` der YAML-Datei) und setzt
// zwei Dinge selbst, abhängig von `SHOW_THINKING` aus `.env` (siehe `settings.showThinking`):
// - `showThinking`: promptfoo setzt `{{ env.X }}` als TEXT ein, und sein OpenAI-Adapter liest
//   `config.showThinking ?? true`. Der Text "false" wäre also wahr. Hier steht ein echter Boolean. Bleibt das
//   Denken sichtbar, stellt promptfoo es als "Thinking: …" vor jede Ausgabe, und die Prüfung der Quellentreue
//   zählt jede dieser Zeilen als Aussage: drei echte Aussagen, alle "Yes", ergäben 3 von 9.
// - `reasoning_effort: 'none'`, nur wenn das Denken verborgen ist: Ein Judge braucht es nicht. Das steht hier
//   und nicht in der YAML-Datei; ein `passthrough.reasoning_effort` dort hat Vorrang. Ein Server darf den Wert
//   ignorieren (der Workshop-Server tut das): Entscheidend ist das Verbergen, und `max_tokens` (2048 in der
//   YAML-Datei) muss dann auch das Denken abdecken, siehe README.
// Mit SHOW_THINKING=true bleibt beides aus: Der Judge zeigt sein Denken, die Auswertung wird unzuverlässig.
// Fehlen Modell, Adresse oder der Name der Schlüssel-Variable, bricht der Provider mit einer Meldung ab.
// Zum Verstehen der Lektion nicht nötig.

import { loadApiProvider } from 'promptfoo';
import type { ApiProvider, ProviderOptions, ProviderResponse } from 'promptfoo';
import { settings } from '../shared/config.ts';

export default class JudgeProvider implements ApiProvider {
  private readonly options: ProviderOptions;
  private readonly model: string;
  private provider: Promise<ApiProvider> | undefined;

  constructor(options: ProviderOptions) {
    this.options = options;
    const config = options.config ?? {};
    if (typeof config.model !== 'string' || !config.model.trim()) {
      throw new Error('The setting REMOTE_MODEL_NAME is missing from .env (template: .env.example).');
    }
    if (typeof config.apiBaseUrl !== 'string' || !config.apiBaseUrl.trim()) {
      throw new Error('The judge provider setting apiBaseUrl is missing. Set REMOTE_MODEL_BASE_URL in .env or apiBaseUrl in the YAML configuration.');
    }
    if (typeof config.apiKeyEnvar !== 'string' || !config.apiKeyEnvar.trim()) {
      throw new Error('The judge provider setting apiKeyEnvar is missing. Set it to REMOTE_MODEL_API_KEY in the YAML configuration.');
    }
    this.model = config.model.trim();
  }

  id(): string {
    return `openai:chat:${this.model}`;
  }

  private buildConfig() {
    const config = { ...this.options.config };
    delete config.model;
    config.showThinking = settings.showThinking;
    config.passthrough = { ...config.passthrough };
    if (!config.showThinking && config.passthrough.reasoning_effort === undefined) {
      config.passthrough.reasoning_effort = 'none';
    }
    if (Object.keys(config.passthrough).length === 0) delete config.passthrough;
    return config;
  }

  private getProvider(): Promise<ApiProvider> {
    if (!this.provider) {
      const config = this.buildConfig();
      this.provider = loadApiProvider(this.id(), { options: { config }, env: this.options.env });
    }
    return this.provider;
  }

  async callApi(...args: Parameters<ApiProvider['callApi']>): Promise<ProviderResponse> {
    const provider = await this.getProvider();
    return provider.callApi(...args);
  }
}
