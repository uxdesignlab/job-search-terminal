const RETRYABLE = ["503", "429", "overloaded", "unavailable", "rate limit", "too many requests", "econnreset", "etimedout"];

function isRetryable(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return RETRYABLE.some((pattern) => msg.includes(pattern));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 1500): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts && isRetryable(error)) {
        await delay(baseDelayMs * 2 ** (attempt - 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
