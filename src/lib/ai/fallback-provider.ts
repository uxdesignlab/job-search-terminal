import type { AIMessage, AIProvider, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";

function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === "object" && "retryAfterMs" in error) return true;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes("rate limit") || msg.includes("quota exceeded") || msg.includes("too many requests");
}

export class FallbackProvider implements AIProvider {
  constructor(private readonly providers: AIProvider[]) {}

  get name(): string { return this.providers[0].name; }
  get defaultModel(): string { return this.providers[0].defaultModel; }
  get effectiveModel(): string { return this.providers[0].effectiveModel; }

  async generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.generateText(messages, config);
      } catch (error) {
        lastError = error;
        if (!isRateLimitError(error)) throw error;
      }
    }
    throw lastError;
  }

  async generateJSON<T>(messages: AIMessage[], hint: string, config?: Partial<AIProviderConfig>): Promise<T> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.generateJSON<T>(messages, hint, config);
      } catch (error) {
        lastError = error;
        if (!isRateLimitError(error)) throw error;
      }
    }
    throw lastError;
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        yield* provider.stream(messages, config);
        return;
      } catch (error) {
        lastError = error;
        if (!isRateLimitError(error)) throw error;
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
