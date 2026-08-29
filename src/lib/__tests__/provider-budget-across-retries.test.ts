import { describe, expect, it, vi } from "vitest";
import { GenerationTimeoutError, withChainDeadline } from "@/lib/ai/retry";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MALFORMED = () => new Error("invalid json: Unexpected end of JSON input");

/** Minimal provider shape the chain needs; only generateJSON is exercised here. */
function fakeProvider(name: string, generateJSON: () => Promise<unknown>) {
  return {
    name,
    effectiveModel: `${name}-model`,
    defaultModel: `${name}-model`,
    model: `${name}-model`,
    prepare: vi.fn(),
    generateJSON: vi.fn(generateJSON),
    generateText: vi.fn(),
    stream: vi.fn(),
    testConnection: vi.fn(),
  };
}

describe("a provider's budget covers its retries, not each attempt", () => {
  /**
   * The regression: `attempt()` handed every try a fresh full budget, so a local
   * model could spend twice its own budget. The run's outer bound is the sum of the
   * chain's per-provider budgets, so it expired mid-retry and the cloud provider
   * behind the local one never ran — the exact failure the sum exists to prevent.
   */
  it("gives the retry only what is left of the budget", async () => {
    const { FallbackProvider } = await import("@/lib/ai/fallback-provider");

    let calls = 0;
    const local = fakeProvider("ollama", async () => {
      calls += 1;
      if (calls === 1) {
        await sleep(60);
        throw MALFORMED();
      }
      // Second attempt hangs, so what bounds it is the budget it was given.
      return new Promise(() => {});
    });

    const chain = new FallbackProvider([local] as never, () => 200);
    const error = await chain.generateJSON([], "{}").catch((e: unknown) => e);

    expect(calls).toBe(2); // the retry still happens
    // The chain wraps what finally failed; the retry's own bound is inside it.
    const cause = (error as { lastError?: unknown }).lastError;
    expect(cause).toBeInstanceOf(GenerationTimeoutError);
    // Under the old behaviour this was the full 200ms budget handed out a second time.
    expect((cause as GenerationTimeoutError).timeoutMs).toBeLessThan(200);
    expect((cause as GenerationTimeoutError).timeoutMs).toBeGreaterThan(0);
  });

  it("bounds both attempts together by the provider's budget", async () => {
    const { FallbackProvider } = await import("@/lib/ai/fallback-provider");

    let calls = 0;
    const local = fakeProvider("ollama", async () => {
      calls += 1;
      if (calls === 1) {
        await sleep(60);
        throw MALFORMED();
      }
      return new Promise(() => {});
    });

    const chain = new FallbackProvider([local] as never, () => 200);
    const startedAt = Date.now();
    await expect(chain.generateJSON([], "{}")).rejects.toBeTruthy();
    const elapsed = Date.now() - startedAt;

    // The invariant: one provider cannot outlast its own budget, whatever it
    // spends inside it. The old behaviour ran ~260ms here (60 + a fresh 200).
    expect(elapsed).toBeLessThan(200 + 40);
  });
});

describe("a run that ends stops the chain behind it", () => {
  /**
   * withDeadline rejects its own promise but the chain keeps walking, so a run that
   * timed out still reached the paid provider — spending a cloud call on behalf of a
   * user who had already been told the run failed.
   */
  it("does not call the next provider after the run's deadline fires", async () => {
    const { FallbackProvider } = await import("@/lib/ai/fallback-provider");

    const local = fakeProvider("ollama", () => new Promise(() => {}));
    const paid = fakeProvider("openai", async () => ({ ok: true }));

    // Per-provider budget outlives the run's own bound, so the run gives up first.
    const chain = new FallbackProvider([local, paid] as never, () => 40);

    await expect(
      withChainDeadline(chain, () => chain.generateJSON([], "{}"), 20)
    ).rejects.toBeInstanceOf(GenerationTimeoutError);

    // Let the detached chain get as far as it is going to get.
    await sleep(80);
    expect(paid.generateJSON).not.toHaveBeenCalled();
  });

  /**
   * The chain has to stop for either reason — the user stopped waiting, or the run
   * is over. Evaluation used to tell it about only the first, so a lapsed deadline
   * still walked on to the paid provider behind the one that had stalled.
   */
  it("still forwards the caller's own cancellation to the chain", async () => {
    const { FallbackProvider } = await import("@/lib/ai/fallback-provider");
    const { GenerationCancelledError } = await import("@/lib/ai/retry");

    const controller = new AbortController();
    const local = fakeProvider("ollama", async () => {
      controller.abort();
      throw new Error("503 service unavailable");
    });
    const paid = fakeProvider("openai", async () => ({ ok: true }));
    const chain = new FallbackProvider([local, paid] as never, () => 200);

    await expect(
      withChainDeadline(chain, () => chain.generateJSON([], "{}"), 200, controller.signal)
    ).rejects.toBeInstanceOf(GenerationCancelledError);

    await sleep(40);
    expect(paid.generateJSON).not.toHaveBeenCalled();
  });

  it("does not start a provider when the caller's signal is already aborted", async () => {
    const { FallbackProvider } = await import("@/lib/ai/fallback-provider");

    const controller = new AbortController();
    controller.abort();
    const local = fakeProvider("ollama", async () => ({ ok: true }));
    const chain = new FallbackProvider([local] as never, () => 200);

    await expect(
      withChainDeadline(chain, () => chain.generateJSON([], "{}"), 200, controller.signal)
    ).rejects.toBeTruthy();
    expect(local.generateJSON).not.toHaveBeenCalled();
  });

  /**
   * The chain is not the only thing that can start work after the run is over, and
   * on the commonest setup there is no chain at all: with exactly one provider
   * configured, `buildProvider` returns the raw adapter, which has no `abortOn`.
   * `withRetry` also sits outside the chain, so a request that outlived the deadline
   * and then failed retryably would wake the loop and start another one — paid or
   * local work begun after the user was already shown the failure.
   */
  it("stops a detached retry loop when there is no chain to abort", async () => {
    const { withRetry } = await import("@/lib/ai/retry");

    let calls = 0;
    const flaky = async () => {
      calls += 1;
      await sleep(30);
      throw new Error("503 service unavailable"); // retryable — the loop would go again
    };

    await expect(
      // `{}` stands in for a lone provider: no abortOn, nothing to tell.
      withChainDeadline({}, (runSignal) => withRetry(flaky, 3, 5, runSignal), 20)
    ).rejects.toBeInstanceOf(GenerationTimeoutError);

    const whenTheRunGaveUp = calls;
    await sleep(150);
    expect(calls).toBe(whenTheRunGaveUp);
    expect(calls).toBe(1);
  });

  it("leaves a successful run's result alone", async () => {
    const { FallbackProvider } = await import("@/lib/ai/fallback-provider");

    const local = fakeProvider("ollama", async () => ({ ok: true }));
    const chain = new FallbackProvider([local] as never, () => 200);

    await expect(
      withChainDeadline(chain, () => chain.generateJSON([], "{}"), 200)
    ).resolves.toEqual({ ok: true });
  });
});
