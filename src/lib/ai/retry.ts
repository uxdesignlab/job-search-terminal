import { findChainFailure } from "./chain-failure";

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

function matchesAny(text: string, patterns: readonly string[]): boolean {
  const msg = text.toLowerCase();
  return patterns.some((pattern) => msg.includes(pattern));
}

/**
 * A whole-chain failure carries one message per provider, so a substring test on
 * the combined text answers "did ANY provider say this?" when the question is
 * "would EVERY provider say this?". One provider's malformed JSON must not make a
 * chain that also hit a quota wall look retryable, or degradable.
 */
function everyAttempt(error: unknown, patterns: readonly string[]): boolean | null {
  const chain = findChainFailure(error);
  if (!chain) return null;
  return chain.attempts.length > 0 && chain.attempts.every((attempt) => matchesAny(attempt.error, patterns));
}

/**
 * True when the error is a malformed/truncated JSON response from an LLM (as opposed
 * to an auth/quota/network failure). Callers can use this to degrade a non-critical
 * block gracefully after retries, while still surfacing actionable provider errors.
 */
export function isMalformedJsonResponse(error: unknown): boolean {
  return (
    everyAttempt(error, MALFORMED_JSON_PATTERNS) ??
    matchesAny(error instanceof Error ? error.message : String(error), MALFORMED_JSON_PATTERNS)
  );
}

function isRetryable(error: unknown): boolean {
  const chained = everyAttempt(error, [...RETRYABLE, ...MALFORMED_JSON_PATTERNS]);
  if (chained !== null) return chained;
  const msg = error instanceof Error ? error.message : String(error);
  return matchesAny(msg, RETRYABLE) || isMalformedJsonResponse(error);
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

/**
 * `signal` stops work that has not started yet.
 *
 * withDeadline rejects its own promise when the user cancels, but the function
 * it wrapped keeps running detached — so this loop would sleep, wake, and start
 * another attempt against a paid provider after the UI had already reported the
 * run cancelled. Cancelling cannot recall a request that is already in flight;
 * it can and must stop the next one.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1500,
  signal?: AbortSignal
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new GenerationCancelledError();
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

/** Thrown when a generation exceeds its deadline. Distinct so callers can degrade rather than fail. */
export class GenerationTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Generation exceeded ${Math.round(timeoutMs / 1000)}s and was abandoned.`);
    this.name = "GenerationTimeoutError";
  }
}

/** The user stopped waiting. Distinct from a timeout: nothing went wrong. */
export class GenerationCancelledError extends Error {
  constructor() {
    super("Evaluation cancelled.");
    this.name = "GenerationCancelledError";
  }
}

/**
 * Put an upper bound on a generation.
 *
 * Providers do not all bound themselves — the OpenAI client carries its own
 * timeout, but a local Ollama model chewing on a long prompt can run for many
 * minutes. That was survivable when evaluation was seven small calls; with one
 * large call it means the retry-then-fall-back chain never gets to run and the
 * user watches a spinner indefinitely.
 *
 * The losing request is not cancelled — that needs AbortSignal plumbing through
 * every adapter. It is abandoned: it finishes in the background and its result
 * is discarded.
 */
export function withDeadline<T>(fn: () => Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GenerationCancelledError());
      return;
    }

    const timer = setTimeout(() => reject(new GenerationTimeoutError(timeoutMs)), timeoutMs);
    // Cancelling stops the waiting, not the model: an HTTP request already in
    // flight runs to completion wherever it is running. What matters is that
    // nothing downstream of this point happens, above all the save.
    const onAbort = () => {
      clearTimeout(timer);
      reject(new GenerationCancelledError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const settle = (run: () => void) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      run();
    };

    fn().then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error))
    );
  });
}

/**
 * Bound a run, and stop the provider chain when it ends.
 *
 * `withDeadline` rejects its own promise, but the chain it wrapped keeps running
 * detached — so a run that timed out carried on walking down to the paid providers
 * behind the one still going, spending a cloud call on behalf of a user who had
 * already been told the run failed. The chain is told to stop however the run
 * ended; a request already in flight cannot be recalled, but the next provider
 * never starts, which is the part that costs money.
 *
 * Aborting on the success path is deliberate and harmless: the chain is built per
 * call (`getActiveProvider` returns a fresh one), so nothing later reuses it.
 *
 * `signal` is the caller's own cancellation, when it has one. The chain has to stop
 * for either reason — the user stopped waiting, or the run is over — so the two are
 * forwarded into one signal rather than the chain being told about only one of them.
 * The caller's signal is still what bounds `withDeadline`, so cancelling continues to
 * raise `GenerationCancelledError` and a lapsed deadline `GenerationTimeoutError`:
 * callers distinguish those, and one is not a failure.
 *
 * `fn` receives that combined signal, and must pass it to any retry loop it runs.
 * Telling the chain alone is not enough for two reasons. A single configured provider
 * is not a chain at all — `buildProvider` returns the raw adapter, which has no
 * `abortOn` — and even with a chain, `withRetry` sits *outside* it: a request that
 * outlives the deadline and then rejects with a retryable error would wake the loop
 * and start another one, after the run had already been reported as failed. That is
 * the same paid-work-after-failure this wrapper exists to stop.
 */
export async function withChainDeadline<T>(
  chain: { abortOn?: (signal: AbortSignal) => void },
  fn: (runSignal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  const runAbort = new AbortController();
  const forward = () => runAbort.abort();
  if (signal?.aborted) runAbort.abort();
  else signal?.addEventListener("abort", forward, { once: true });

  chain.abortOn?.(runAbort.signal);
  try {
    return await withDeadline(() => fn(runAbort.signal), timeoutMs, signal);
  } finally {
    signal?.removeEventListener("abort", forward);
    runAbort.abort();
  }
}
