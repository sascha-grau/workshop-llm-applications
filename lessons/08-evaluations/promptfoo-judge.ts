// Lektion 08 – Evaluierung: der Judge für Teil 5 und 6 als promptfoo-Provider, kein eigener Teil.
//
// Der Provider verpackt `openai:chat:<Modell>` (das Modell steht in `config.model` der YAML-Datei) und dient
// in Teil 5 beiden Judge-Prüfungen, `correct` und `faithful`, in Teil 6 der Prüfung `correct`. Für
// `faithful` baut er außerdem das LangChain-Modell aus denselben Einstellungen des YAML-Blocks (Modell,
// Adresse, Schlüssel-Variable, `max_tokens`, `temperature`). Er setzt zwei Dinge selbst, abhängig von
// `SHOW_THINKING` aus `.env` (siehe `settings.showThinking`):
// - `showThinking`: promptfoo setzt `{{ env.X }}` als TEXT ein, und sein OpenAI-Adapter liest
//   `config.showThinking ?? true`. Der Text "false" wäre also wahr. Hier steht ein echter Boolean. Bleibt das
//   Denken sichtbar, stellt promptfoo es als "Thinking: …" vor jede Ausgabe von `llm-rubric` (`correct`) und
//   verfälscht so das Urteil.
// - `reasoning_effort: 'none'`, nur wenn das Denken verborgen ist: Ein Judge braucht es nicht. Das steht hier
//   und nicht in der YAML-Datei; ein `passthrough.reasoning_effort` dort hat Vorrang. Ein Server darf den Wert
//   ignorieren (manche tun das): Entscheidend ist das Verbergen, und `max_tokens` (8192 in der
//   YAML-Datei) muss dann auch das Denken abdecken, siehe README.
// Mit SHOW_THINKING=true bleibt beides aus: Der Judge zeigt sein Denken, die Auswertung wird unzuverlässig.
// Fehlen Modell, Adresse oder der Name der Schlüssel-Variable, bricht der Provider mit einer Meldung ab.
// Zum Verstehen der Lektion nicht nötig.

import { loadApiProvider } from 'promptfoo';
import type { ApiProvider, ProviderOptions, ProviderResponse } from 'promptfoo';
import { settings } from '../shared/config.ts';
import { createChatModel } from './evaluation.ts';

export default class JudgeProvider implements ApiProvider {
  private readonly options: ProviderOptions;
  private readonly model: string;
  private provider: Promise<ApiProvider> | undefined;
  private chatModel: ReturnType<typeof createChatModel> | undefined;

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

  createJudgeModel(): ReturnType<typeof createChatModel> {
    if (!this.chatModel) {
      const config = this.buildConfig();
      const apiKey = config.apiKey ?? this.options.env?.[config.apiKeyEnvar] ?? process.env[config.apiKeyEnvar];
      if (!apiKey && config.apiKeyRequired !== false) {
        throw new Error('The judge API key is missing. Set the variable named by apiKeyEnvar, or apiKeyRequired: false for LM Studio.');
      }
      this.chatModel = createChatModel({
        model: this.model,
        apiKey: apiKey || 'not-required',
        baseURL: config.apiBaseUrl,
        maxTokens: config.max_tokens,
        temperature: config.temperature,
        modelKwargs: config.passthrough,
      });
    }
    return this.chatModel;
  }

  async callApi(...args: Parameters<ApiProvider['callApi']>): Promise<ProviderResponse> {
    const provider = await this.getProvider();
    return provider.callApi(...args);
  }
}
