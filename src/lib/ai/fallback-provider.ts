import type { AIMessage, AIProvider, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";
import { summarizeProviderError } from "./provider-error-summary";

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
    msg.includes("503") ||
    // Ollama-specific: invalid JSON output, timeout, or connection failure — try next provider
    msg.includes("invalid json") ||
    msg.includes("timed out") ||
    msg.includes("connect to ollama")
  );
}

export type ProviderAttempt = { provider: string; model: string; error: string };

/**
 * Every provider in the chain failed.
 *
 * Reporting only the last failure made the chain lie about itself: a user whose
 * first provider is a local Ollama saw "AI quota exceeded — you've hit the
 * free-tier limit", because that was Gemini's answer at the end of a chain that
 * started three providers earlier. Each attempt is kept, in order, so the message
 * says which provider failed and why.
 */
export class AllProvidersFailedError extends Error {
  constructor(readonly attempts: ProviderAttempt[], readonly lastError: unknown) {
    super(
      [
        `All ${attempts.length} AI providers failed:`,
        ...attempts.map((a) => `${a.provider} (${a.model}) — ${a.error}`),
      ].join("\n")
    );
    this.name = "AllProvidersFailedError";
  }
}

/** True when this error, or anything it wraps, is a whole-chain failure. */
export function findChainFailure(error: unknown): AllProvidersFailedError | null {
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current instanceof AllProvidersFailedError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
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

  /** One line per provider tried, in the order they were tried. */
  private attempts: ProviderAttempt[] = [];

  private record(provider: AIProvider, error: unknown) {
    this.attempts.push({
      provider: provider.name,
      model: provider.effectiveModel,
      // Providers return whole HTTP bodies; the chain message has to stay readable.
      error: summarizeProviderError(error instanceof Error ? error.message : String(error)).summary,
    });
  }

  async generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string> {
    this.attempts = [];
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        const result = await provider.generateText(messages, config);
        this.active = provider;
        return result;
      } catch (error) {
        lastError = error;
        this.record(provider, error);
        if (!shouldFailover(error)) throw error;
      }
    }
    throw new AllProvidersFailedError(this.attempts, lastError);
  }

  async generateJSON<T>(messages: AIMessage[], hint: string, config?: Partial<AIProviderConfig>): Promise<T> {
    this.attempts = [];
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        const result = await provider.generateJSON<T>(messages, hint, config);
        this.active = provider;
        return result;
      } catch (error) {
        lastError = error;
        this.record(provider, error);
        if (!shouldFailover(error)) throw error;
      }
    }
    throw new AllProvidersFailedError(this.attempts, lastError);
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk> {
    this.attempts = [];
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        yield* provider.stream(messages, config);
        this.active = provider;
        return;
      } catch (error) {
        lastError = error;
        this.record(provider, error);
        if (!shouldFailover(error)) throw error;
      }
    }
    throw new AllProvidersFailedError(this.attempts, lastError);
  }

  webSearch?(query: string): Promise<string | null> {
    const capable = this.providers.find((p) => p.webSearch);
    return capable?.webSearch?.(query) ?? Promise.resolve(null);
  }

  testConnection(): Promise<ConnectionTestResult> {
    return this.providers[0].testConnection();
  }
}
