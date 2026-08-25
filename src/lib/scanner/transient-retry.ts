/**
 * Shared transient-failure retry for scanner fetches.
 *
 * Extracted from the Common Crawl pipeline in `source-discovery.ts`, which was
 * the only lane that retried gateway blips. Adzuna threw on the first non-ok
 * status, so a single 502 dropped a whole title/location query and surfaced as
 * a scan error the user could do nothing about.
 *
 * Two properties matter and are easy to lose:
 *
 *  1. The body read happens *inside* the retry loop. A truncated or terminated
 *     body on a large response is a transient failure like any other, and
 *     hoisting the read out of the loop would silently stop retrying it.
 *  2. Every attempt carries its own deadline. `safeFetch` imposes no timeout of
 *     its own, so a caller that passes no signal can hang indefinitely — which
 *     is exactly what Adzuna did while running under `Promise.all` with the
 *     other discovery sources.
 */

import { safeFetch } from "@/lib/safe-fetch";

/** Gateway and rate-limit statuses worth a second attempt. */
export const TRANSIENT_RETRY_STATUS = new Set([429, 502, 503, 504]);

export type BackoffConfig = {
  baseMs: number;
  factor: number;
  jitterMs: number;
};

export type FetchWithRetryOptions = {
  attempts: number;
  /** Per-attempt deadline covering both the request and the body read. */
  timeoutMs: number;
  backoff: BackoffConfig;
  init?: RequestInit;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type FetchWithRetryResult<T> =
  /** The request succeeded and the body was read. */
  | { kind: "value"; value: T }
  /** A non-retryable HTTP status. The body has not been read. */
  | { kind: "status"; status: number; response: Response }
  /** Every attempt failed. `lastStatus` is the last retryable status seen, if any. */
  | { kind: "exhausted"; lastStatus: number | null; timedOut: boolean };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Honours `Retry-After` (seconds or HTTP-date) when the server tells us how long to wait. */
export function retryAfterMs(res: { headers: { get(name: string): string | null } }): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

/**
 * Backoff for retry attempt `attempt` (0-based).
 *
 * A server-supplied `Retry-After` always wins; otherwise exponential with jitter.
 * Jitter avoids synchronising retries when several queries back off together.
 */
export function computeBackoffMs(
  attempt: number,
  serverDelayMs: number | null,
  backoff: BackoffConfig,
  random: () => number = Math.random,
): number {
  if (serverDelayMs !== null) return serverDelayMs;
  return backoff.baseMs * backoff.factor ** attempt + Math.floor(random() * backoff.jitterMs);
}

/** An aborted request looks different across runtimes; match the name first, then the message. */
function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  return error.message.toLowerCase().includes("abort");
}

/**
 * Fetches `url`, retrying transient gateway failures and transport errors with
 * exponential backoff, and reading the body with `read` on success.
 *
 * Non-retryable statuses return immediately as `status` so the caller can
 * distinguish "this resource is gone" from "we never got an answer" — the two
 * need very different messages in front of a user.
 */
export async function fetchWithRetry<T>(
  url: string,
  read: (res: Response) => Promise<T>,
  options: FetchWithRetryOptions,
): Promise<FetchWithRetryResult<T>> {
  const { attempts, timeoutMs, backoff, init, random = Math.random, sleep = defaultSleep } = options;

  let lastStatus: number | null = null;
  let timedOut = false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let serverDelayMs: number | null = null;
    timedOut = false;

    try {
      const res = await safeFetch(url, { ...init, signal: controller.signal });
      if (res.ok) return { kind: "value", value: await read(res) };
      if (!TRANSIENT_RETRY_STATUS.has(res.status)) return { kind: "status", status: res.status, response: res };
      lastStatus = res.status;
      serverDelayMs = retryAfterMs(res);
    } catch (error) {
      // Timeout, connection refused, transport error, or a body that terminated
      // mid-read — all worth another attempt.
      timedOut = isAbortError(error);
    } finally {
      clearTimeout(timer);
    }

    if (attempt < attempts - 1) {
      await sleep(computeBackoffMs(attempt, serverDelayMs, backoff, random));
    }
  }

  return { kind: "exhausted", lastStatus, timedOut };
}
