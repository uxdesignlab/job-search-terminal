// Rate limit errors (429, "rate limit", "too many requests") are excluded — they need
// 20-60s to clear and short retries just waste time. If the provider attaches a
// retryAfterMs property (from the Retry-After header), withRetry will honor it instead.
// "timed out", "connect to ollama", and "invalid json" handle humanized Ollama errors from humanizeOllamaError().
// "invalid json" is worth retrying because LLM output quality is non-deterministic.
const RETRYABLE = ["503", "overloaded", "unavailable", "econnreset", "etimedout", "timed out", "connect to ollama", "invalid json"];

const MAX_AUTO_RETRY_AFTER_MS = 30_000;

function isRetryable(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return RETRYABLE.some((pattern) => msg.includes(pattern));
}

function getRetryAfterMs(error: unknown): number | null {
  if (error && typeof error === "object" && "retryAfterMs" in error) {
    const ms = (error as { retryAfterMs: unknown }).retryAfterMs;
    if (typeof ms === "number" && ms <= MAX_AUTO_RETRY_AFTER_MS) return ms;
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 1500): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const retryAfterMs = getRetryAfterMs(error);
        if (retryAfterMs !== null) {
          await sleep(retryAfterMs);
          continue;
        }
        if (isRetryable(error)) {
          await sleep(baseDelayMs * 2 ** (attempt - 1));
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError;
}
