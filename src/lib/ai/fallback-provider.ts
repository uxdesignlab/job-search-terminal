import type { AIMessage, AIProvider, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";

/**
 * Errors that are specific to one provider's availability or configuration, so
 * failing over to a different provider is worth attempting. A generic 400 (bad
 * request) would fail identically on every provider, so it is NOT included —
 * failing over on it just burns extra API calls.
 */
function shouldFailover(error: unknown): boolean {
  if (error && typeof error === "object" && "retryAfterMs" in error) return true;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("quota exceeded") ||
    msg.includes("too many requests") ||
    msg.includes("invalid or expired") ||
    msg.includes("authentication") ||
    msg.includes("unauthorized") ||
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable") ||
    msg.includes("503")
  );
}

export class FallbackProvider implements AIProvider {
  /** The provider that served the most recent successful call. Drives the
   *  reported name/model so persisted provenance reflects what actually ran. */
  private active: AIProvider;

  constructor(private readonly providers: AIProvider[]) {
    this.active = providers[0];
  }

  get name(): string { return this.active.name; }
  get defaultModel(): string { return this.active.defaultModel; }
  get effectiveModel(): string { return this.active.effectiveModel; }

  async generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        const result = await provider.generateText(messages, config);
        this.active = provider;
        return result;
      } catch (error) {
        lastError = error;
        if (!shouldFailover(error)) throw error;
      }
    }
    throw lastError;
  }

  async generateJSON<T>(messages: AIMessage[], hint: string, config?: Partial<AIProviderConfig>): Promise<T> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        const result = await provider.generateJSON<T>(messages, hint, config);
        this.active = provider;
        return result;
      } catch (error) {
        lastError = error;
        if (!shouldFailover(error)) throw error;
      }
    }
    throw lastError;
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        yield* provider.stream(messages, config);
        this.active = provider;
        return;
      } catch (error) {
        lastError = error;
        if (!shouldFailover(error)) throw error;
      }
    }
    throw lastError as Error;
  }

  webSearch?(query: string): Promise<string | null> {
    const capable = this.providers.find((p) => p.webSearch);
    return capable?.webSearch?.(query) ?? Promise.resolve(null);
  }

  testConnection(): Promise<ConnectionTestResult> {
    return this.providers[0].testConnection();
  }
}
