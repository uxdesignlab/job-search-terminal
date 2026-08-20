import { describe, expect, it, vi } from "vitest";
import { GenerationCancelledError, withRetry } from "@/lib/ai/retry";

describe("cancellation stops work that has not started", () => {
  it("does not retry after the user cancels", async () => {
    // withDeadline rejects its own promise on abort, but the function it wrapped
    // keeps running detached — so the retry loop would wake and spend another
    // paid call after the UI had already reported the run cancelled.
    const controller = new AbortController();
    const attempts: number[] = [];
    const failing = vi.fn(async () => {
      attempts.push(attempts.length + 1);
      controller.abort();
      throw Object.assign(new Error("503 service unavailable"), { status: 503 });
    });

    await expect(withRetry(failing, 3, 1, controller.signal)).rejects.toBeInstanceOf(GenerationCancelledError);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("does not start the first attempt when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn(async () => "unused");

    await expect(withRetry(fn, 3, 1, controller.signal)).rejects.toBeInstanceOf(GenerationCancelledError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("still retries a retryable failure when nothing cancelled", async () => {
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls < 2) throw Object.assign(new Error("503 service unavailable"), { status: 503 });
      return "ok";
    };

    await expect(withRetry(flaky, 3, 1)).resolves.toBe("ok");
    expect(calls).toBe(2);
  });
});

describe("the provider chain stops when the run is cancelled", () => {
  it("does not call a provider after cancellation lands during model resolution", async () => {
    const { FallbackProvider } = await import("@/lib/ai/fallback-provider");
    const controller = new AbortController();
    const generateJSON = vi.fn(async () => ({ ok: true }));

    // Resolving a model is a network call of its own; cancelling during it used
    // to fall through to the paid generation immediately after.
    const slowToPrepare = {
      name: "ollama", effectiveModel: "gemma", model: "gemma",
      prepare: async () => { controller.abort(); },
      generateJSON,
      generateText: vi.fn(),
      stream: vi.fn(),
      testConnection: vi.fn(),
    };
    const paid = { ...slowToPrepare, name: "openai", prepare: vi.fn(), generateJSON: vi.fn() };

    const chain = new FallbackProvider([slowToPrepare, paid] as never);
    chain.abortOn(controller.signal);

    await expect(chain.generateJSON([], "{}")).rejects.toBeInstanceOf(GenerationCancelledError);
    expect(generateJSON).not.toHaveBeenCalled();
    expect(paid.generateJSON).not.toHaveBeenCalled();
  });
});
