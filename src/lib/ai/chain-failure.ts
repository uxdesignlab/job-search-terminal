/**
 * The failure shape a provider chain produces, in its own module so both the
 * chain and the retry policy can read it without importing each other.
 */

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

/** This error, or anything it wraps, as a whole-chain failure. */
export function findChainFailure(error: unknown): AllProvidersFailedError | null {
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current instanceof AllProvidersFailedError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}
