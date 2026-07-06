// Rate limit errors (429, "rate limit", "too many requests") are excluded — they need
// 20-60s to clear and short retries just waste time. If the provider attaches a
// retryAfterMs property (from the Retry-After header), withRetry will honor it instead.
// "timed out" and "connect to ollama" handle humanized Ollama errors from humanizeOllamaError().
const RETRYABLE = ["503", "overloaded", "unavailable", "econnreset", "etimedout", "timed out", "connect to ollama"];

// Malformed or truncated LLM JSON. Output quality is non-deterministic, so a fresh
// generation usually parses cleanly — worth an automatic retry. These patterns cover
// raw JSON.parse SyntaxErrors surfaced by every provider (Anthropic rethrows them
// verbatim, OpenAI passes them through), the humanized "invalid JSON" strings from
// Gemini/Ollama, and Gemini's MAX_TOKENS / "cut off" truncation signal.
const MALFORMED_JSON_PATTERNS = [
  "invalid json",
  "unexpected token",
  "unexpected end of json",
  "is not valid json",
  "max_tokens",
  "cut off",
];

const MAX_AUTO_RETRY_AFTER_MS = 30_000;

/**
 * True when the error is a malformed/truncated JSON response from an LLM (as opposed
 * to an auth/quota/network failure). Callers can use this to degrade a non-critical
 * block gracefully after retries, while still surfacing actionable provider errors.
 */
export function isMalformedJsonResponse(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return MALFORMED_JSON_PATTERNS.some((pattern) => msg.includes(pattern));
}

function isRetryable(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return RETRYABLE.some((pattern) => msg.includes(pattern)) || isMalformedJsonResponse(error);
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
