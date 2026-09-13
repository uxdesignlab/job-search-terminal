import type { AIMessage, AIProvider, AIProviderConfig, ConnectionTestResult, StreamChunk } from "./provider";
import { summarizeProviderError } from "./provider-error-summary";
import { AllProvidersFailedError, type ProviderAttempt } from "./chain-failure";
import { generationDeadlineMs } from "./deadlines";
import { GenerationCancelledError, GenerationTimeoutError, isMalformedJsonResponse, withDeadline } from "./retry";
import { creditFallbackNotice, isCreditsExhaustedError } from "./credit-status";

export { AllProvidersFailedError, findChainFailure, type ProviderAttempt } from "./chain-failure";

/**
 * Errors that are specific to one provider's availability or configuration, so
 * failing over to a different provider is worth attempting. A generic 400 (bad
 * request) would fail identically on every provider, so it is NOT included —
 * failing over on it just burns extra API calls.
 */
export function shouldFailover(error: unknown): boolean {
  if (error && typeof error === "object" && "retryAfterMs" in error) return true;
  // The clearest case of all: this provider cannot answer until the user pays it, and
  // the next one in the chain — often a free local model — can.
  if (isCreditsExhaustedError(error)) return true;
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
    // Ollama-specific: invalid JSON output, empty/truncated text, timeout, or
    // connection failure — try next provider
    msg.includes("invalid json") ||
    msg.includes("no usable text") ||
    msg.includes("timed out") ||
    // A provider that ran out of its own time budget is the clearest case for
    // trying the next one: the local model the user put first is slow, and the
    // cloud fallback they configured behind it exists for exactly this.
    msg.includes("was abandoned") ||
    msg.includes("connect to ollama") ||
    // Ollama answers a request that waited out its own five-minute queue with a bare
    // 500. The adapter reports it as a server error, which matched nothing above, so
    // the chain stopped on a local model that was merely busy and the cloud fallback
    // behind it never ran.
    msg.includes("ollama server error")
  );
}

export class FallbackProvider implements AIProvider {
  /** The provider that served the most recent successful call. Drives the
   *  reported name/model so persisted provenance reflects what actually ran. */
  private active: AIProvider;

  /** `deadlineFor` is injectable so a test can bound an attempt without waiting
   *  out a real generation budget; production always uses the per-provider policy. */
  constructor(
    private readonly providers: AIProvider[],
    private readonly deadlineFor: (providerName: string) => number = generationDeadlineMs
  ) {
    this.active = providers[0];
  }

  /**
   * Told when a provider is about to be tried, and why the previous one stopped.
   *
   * Without this a caller can only report the chain's first provider, because that
   * is what `name` answers until something succeeds — so a run that fell through to
   * the cloud after 20s spent two minutes telling the user a local model was
   * working on it, then reported a different one at the end.
   */
  private listener: ((attempt: { provider: string; model: string; after: ProviderAttempt | null }) => void) | null = null;

  observe(listener: (attempt: { provider: string; model: string; after: ProviderAttempt | null }) => void) {
    this.listener = listener;
  }

  /** Resolve before announcing, so the name reported is the model that will run. */
  private async announceReady(provider: AIProvider) {
    try {
      await provider.prepare?.();
    } catch {
      // Resolution failing is the call's problem to report, not the announcement's.
    }
    this.announce(provider);
  }

  private announce(provider: AIProvider) {
    this.listener?.({
      provider: provider.name,
      model: provider.effectiveModel,
      after: this.attempts[this.attempts.length - 1] ?? null,
    });
  }

  /** Every provider in the chain, in order — the caller sizes the run from these. */
  get providerNames(): string[] { return this.providers.map((p) => p.name); }

  get name(): string { return this.active.name; }
  get defaultModel(): string { return this.active.defaultModel; }
  get effectiveModel(): string { return this.active.effectiveModel; }

  /** One line per provider tried, in the order they were tried. */
  private attempts: ProviderAttempt[] = [];
  /** Providers passed over on the most recent call because they were out of credits. */
  private skippedForCredits: string[] = [];

  /**
   * What the user should be told about how the last call was served — today, only that
   * it ran somewhere other than the head of the chain because the head was out of
   * credits. Empty when there is nothing to say.
   */
  get notice(): string {
    return creditFallbackNotice(this.skippedForCredits, this.active);
  }
  private cancellation?: AbortSignal;

  /**
   * Stop moving down the chain once the user has cancelled.
   *
   * The run's deadline owns the signal and rejects on abort, but the chain it
   * wrapped keeps running detached: a slow first provider would fail, and the
   * chain would then call the paid provider behind it on behalf of a user who had
   * already stopped waiting. Checked before each provider rather than passed into
   * them, because an in-flight request cannot be recalled anyway — what must not
   * happen is starting the next one.
   */
  abortOn(signal: AbortSignal) {
    this.cancellation = signal;
  }

  private ensureNotCancelled() {
    if (this.cancellation?.aborted) throw new GenerationCancelledError();
  }

  /**
   * Each provider is bounded on its own, so one slow model cannot spend the budget
   * the providers behind it were configured to cover.
   *
   * A local provider gets a second try when the failure was unusable JSON, out of
   * what remains of its budget. Output quality is non-deterministic — the same model
   * that fenced or mangled one answer usually produces a clean one next time — and
   * the economics are lopsided: a local retry costs time the user has already
   * committed, while moving on spends a paid call. Sharing one budget across both
   * tries keeps that trade honest: a mangled answer that came back fast leaves room
   * for another go, while one that took the whole budget has already spent the
   * provider's turn, and the chain behind it is the better use of what is left.
   * Cloud providers are not retried here; `withRetry` already covers the whole
   * chain, and retrying a paid call twice in a row is how a rate limit becomes two.
   */
  private async attempt<T>(
    provider: AIProvider,
    run: (signal: AbortSignal) => Promise<T>,
    outer?: AbortSignal
  ): Promise<T> {
    const budget = this.deadlineFor(provider.name);
    const tries = provider.name === "ollama" ? 2 : 1;
    const startedAt = Date.now();

    let lastError: unknown;
    for (let attempt = 1; attempt <= tries; attempt += 1) {
      // The budget belongs to the provider, not to each attempt: a retry gets what
      // is left of it. Handing every attempt a fresh full budget let one provider
      // outlast the whole run's bound — that bound is the sum of the chain's
      // per-provider budgets, so a local model that failed on malformed JSON near
      // its own limit could spend a second full budget while the run's deadline
      // expired mid-retry, and the providers behind it never ran. That is the
      // exact failure the sum was introduced to prevent.
      const remaining = budget - (Date.now() - startedAt);
      if (remaining <= 0) break;
      // Scoped to this one try. When the provider's deadline passes and the chain
      // moves on, `withDeadline` stops waiting but the request keeps running — on a
      // local model that held the machine, and every queued request behind it, until
      // the whole run ended. Aborting here tells an adapter that can stop (Ollama) to
      // stop now. The run's own signal and the user's cancellation still reach it too.
      const tryAbort = new AbortController();
      const forward = () => tryAbort.abort();
      for (const signal of [outer, this.cancellation]) {
        if (signal?.aborted) tryAbort.abort();
        else signal?.addEventListener("abort", forward, { once: true });
      }
      try {
        return await withDeadline(() => run(tryAbort.signal), remaining);
      } catch (error) {
        tryAbort.abort();
        lastError = error;
        if (attempt === tries || !isMalformedJsonResponse(error)) throw error;
      } finally {
        outer?.removeEventListener("abort", forward);
        this.cancellation?.removeEventListener("abort", forward);
      }
    }
    throw lastError;
  }

  private record(provider: AIProvider, error: unknown) {
    if (isCreditsExhaustedError(error)) this.skippedForCredits.push(provider.name);
    this.attempts.push({
      provider: provider.name,
      model: provider.effectiveModel,
      // Providers return whole HTTP bodies; the chain message has to stay readable.
      error: this.describe(provider, error),
    });
  }

  /** "Generation exceeded 300s and was abandoned" describes the mechanism. The
   *  reader needs what to do about it, and for a local model that is a smaller one. */
  private describe(provider: AIProvider, error: unknown): string {
    if (error instanceof GenerationTimeoutError) {
      const seconds = Math.round(error.timeoutMs / 1000);
      return provider.name === "ollama"
        ? `did not finish within ${seconds}s — a smaller or faster local model would fit the budget`
        : `did not finish within ${seconds}s`;
    }
    return summarizeProviderError(error instanceof Error ? error.message : String(error)).summary;
  }

  async generateText(messages: AIMessage[], config?: Partial<AIProviderConfig>): Promise<string> {
    this.attempts = [];
    this.skippedForCredits = [];
    let lastError: unknown;
    for (const provider of this.providers) {
      this.ensureNotCancelled();
      try {
        // Resolving a model is itself a network call, so the user can cancel
        // during it. Without a second check the paid generation starts anyway,
        // which is the exact call this guard exists to prevent.
        await this.announceReady(provider);
        this.ensureNotCancelled();
        const result = await this.attempt(provider, (signal) => provider.generateText(messages, { ...config, signal }), config?.signal);
        this.active = provider;
        return result;
      } catch (error) {
        // A cancelled run does not fail over: moving on is the spending this
        // guard is here to stop.
        if (error instanceof GenerationCancelledError) throw error;
        lastError = error;
        this.record(provider, error);
        if (!shouldFailover(error)) throw error;
      }
    }
    throw new AllProvidersFailedError(this.attempts, lastError);
  }

  async generateJSON<T>(messages: AIMessage[], hint: string, config?: Partial<AIProviderConfig>): Promise<T> {
    this.attempts = [];
    this.skippedForCredits = [];
    let lastError: unknown;
    for (const provider of this.providers) {
      this.ensureNotCancelled();
      try {
        // Resolving a model is itself a network call, so the user can cancel
        // during it. Without a second check the paid generation starts anyway,
        // which is the exact call this guard exists to prevent.
        await this.announceReady(provider);
        this.ensureNotCancelled();
        const result = await this.attempt(provider, (signal) => provider.generateJSON<T>(messages, hint, { ...config, signal }), config?.signal);
        this.active = provider;
        return result;
      } catch (error) {
        // A cancelled run does not fail over: moving on is the spending this
        // guard is here to stop.
        if (error instanceof GenerationCancelledError) throw error;
        lastError = error;
        this.record(provider, error);
        if (!shouldFailover(error)) throw error;
      }
    }
    throw new AllProvidersFailedError(this.attempts, lastError);
  }

  async *stream(messages: AIMessage[], config?: Partial<AIProviderConfig>): AsyncIterable<StreamChunk> {
    this.attempts = [];
    this.skippedForCredits = [];
    let lastError: unknown;
    for (const provider of this.providers) {
      this.ensureNotCancelled();
      try {
        // Resolving a model is itself a network call, so the user can cancel
        // during it. Without a second check the paid generation starts anyway,
        // which is the exact call this guard exists to prevent.
        await this.announceReady(provider);
        this.ensureNotCancelled();
        yield* provider.stream(messages, config);
        this.active = provider;
        return;
      } catch (error) {
        // A cancelled run does not fail over: moving on is the spending this
        // guard is here to stop.
        if (error instanceof GenerationCancelledError) throw error;
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
