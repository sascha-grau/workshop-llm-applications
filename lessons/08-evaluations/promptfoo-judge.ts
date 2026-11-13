// Lektion 08 – Evaluierung: der Judge für Teil 5 und 6 als promptfoo-Provider, kein eigener Teil.
// Eine Hülle um `openai:chat:<Modell>`, die `showThinking`, `reasoning_effort` und ein Zeitlimit je
// Urteil richtig setzt, und die `faithful` dasselbe Modell als LangChain-Modell gibt.
// Warum es die Hülle gibt: docs/decisions.de.md#judge-huelle und GUIDE.de.md → „Teil 5“.
import { loadApiProvider, loadApiProviders } from 'promptfoo';
import type { ApiProvider, ProviderOptions, ProviderResponse } from 'promptfoo';
import { settings } from '../shared/config.ts';
import { withModelFetchTimeout } from '../shared/model-fetch.ts';
import { createChatModel, isJudgeTimeout } from './evaluation.ts';

export default class JudgeProvider implements ApiProvider {
  readonly timeout: number;
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
    // Standard: 600_000 ms, falls die YAML-Datei nichts setzt. Größer = geduldiger mit langsamen Judges.
    this.timeout = config.timeout ?? 600_000;
    if (!Number.isInteger(this.timeout) || this.timeout <= 0 || this.timeout > 2_147_483_647) {
      throw new Error('The judge setting timeout in the YAML must be a positive integer in milliseconds, no greater than 2147483647.');
    }
    this.model = config.model.trim();
  }

  id(): string {
    return `openai:chat:${this.model}`;
  }

  private buildConfig() {
    const config = { ...this.options.config };
    // Das Modell steckt in der Provider-ID; das Zeitlimit setzt die Hülle selbst (siehe unten).
    delete config.model;
    delete config.timeout;
    // Echter Boolean: promptfoo setzt `{{ env.X }}` als Text ein, und der Text "false" wäre wahr.
    // Sichtbares Denken stünde als "Thinking: …" vor der Ausgabe und verfälschte `llm-rubric`.
    config.showThinking = settings.showThinking;
    config.passthrough = { ...config.passthrough };
    // Ein `passthrough.reasoning_effort` aus der YAML-Datei hat Vorrang. Der Server darf die Bitte
    // ignorieren; dann muss `max_tokens` Denken und JSON abdecken.
    if (!config.showThinking && config.passthrough.reasoning_effort === undefined) {
      config.passthrough.reasoning_effort = 'none';
    }
    if (Object.keys(config.passthrough).length === 0) delete config.passthrough;
    return config;
  }

  private getProvider(): Promise<ApiProvider> {
    if (!this.provider) {
      this.provider = this.loadProvider();
    }
    return this.provider;
  }

  private async loadProvider(): Promise<ApiProvider> {
    const config = this.buildConfig();
    // promptfoo liest REQUEST_TIMEOUT_MS erst beim Aufruf aus der Umgebung. `loadApiProviders` mit einer
    // Funktion führt jeden Aufruf in `env` aus: So gilt das Zeitlimit nur für den Judge, nicht für
    // den Assistenten oder andere Provider desselben Laufs.
    const env = { ...this.options.env, REQUEST_TIMEOUT_MS: String(this.timeout) };
    const provider = await loadApiProvider(this.id(), { options: { config }, env });
    const [scopedProvider] = await loadApiProviders(provider.callApi.bind(provider), { env });
    return scopedProvider;
  }

  // promptfoos OpenAI-Adapter wirft nicht, sondern liefert Text in `response.error`, etwa
  // "API call error: Error: Request timed out after … ms". Nur genau dieser Wortlaut (verankert)
  // wird zur klaren Meldung; jeder andere Fehler bleibt unverändert, auch wenn er "timed out" enthält.
  // "did not answer within" nur, wenn unser eigener Zeitgeber ablief (`localDeadlineExpired`); andere Zeitlimits
  // melden wir ehrlich als unbekannte Quelle.
  throwIfTimedOut(error: unknown, localDeadlineExpired = false): void {
    if (localDeadlineExpired || isJudgeTimeout(error, this.timeout)) {
      throw new Error(`The judge did not answer within ${this.timeout / 1000} s (timeout in the judge block of the YAML).`);
    }
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    if (name === 'TimeoutError' || name === 'APIConnectionTimeoutError'
      || /^(?:API call error: (?:Error: )?)?Request timed out(?: after \d+ ms)?\.?$/.test(message)) {
      throw new Error(`The judge request timed out (local limit: ${this.timeout / 1000} s; actual timeout source unknown).`);
    }
  }

  // Für `faithful` (promptfoo-faithfulness.ts): dasselbe Modell mit denselben Einstellungen, aber als
  // LangChain-Modell, weil diese Prüfung zwei eigene JSON-Aufrufe macht.
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
        timeout: this.timeout,
      });
    }
    return this.chatModel;
  }

  async callApi(...args: Parameters<ApiProvider['callApi']>): Promise<ProviderResponse> {
    const provider = await this.getProvider();
    // Eigene Frist für den ganzen Aufruf, zusätzlich zu REQUEST_TIMEOUT_MS, falls der Adapter das Limit
    // nicht überall anwendet. Bricht promptfoo selbst ab (Strg+C, `callerSignal`), ist das kein Timeout.
    const deadline = AbortSignal.timeout(this.timeout);
    const callerSignal = args[2]?.abortSignal;
    const abortSignal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
    try {
      const response = await withModelFetchTimeout(this.timeout, () =>
        provider.callApi(args[0], args[1], { ...args[2], abortSignal }));
      if (deadline.aborted && !callerSignal?.aborted) this.throwIfTimedOut(deadline.reason, true);
      this.throwIfTimedOut(response.error);
      return response;
    } catch (error) {
      if (!callerSignal?.aborted) {
        if (deadline.aborted) this.throwIfTimedOut(deadline.reason, true);
        this.throwIfTimedOut(error);
      }
      throw error;
    }
  }
}
