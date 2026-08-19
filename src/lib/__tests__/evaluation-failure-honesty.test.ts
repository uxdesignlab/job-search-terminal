import { describe, expect, it } from "vitest";
import {
  CLOUD_GENERATION_TIMEOUT_MS,
  LOCAL_GENERATION_TIMEOUT_MS,
  generationDeadlineMs,
  totalGenerationDeadlineMs,
} from "@/lib/ai/deadlines";
import { GenerationCancelledError, GenerationTimeoutError, withDeadline } from "@/lib/ai/retry";

describe("generation deadlines", () => {
  it("gives a local model longer than a paid one", () => {
    // The cloud deadline caps what a stalled paid call can cost. A local run
    // costs nothing but time, so cutting it at the same point throws away work
    // instead of saving anything.
    expect(generationDeadlineMs("ollama")).toBe(LOCAL_GENERATION_TIMEOUT_MS);
    expect(LOCAL_GENERATION_TIMEOUT_MS).toBeGreaterThan(CLOUD_GENERATION_TIMEOUT_MS);
  });

  it("keeps every cloud provider on the paid-call deadline", () => {
    for (const name of ["openai", "anthropic", "gemini", ""]) {
      expect(generationDeadlineMs(name)).toBe(CLOUD_GENERATION_TIMEOUT_MS);
    }
  });

  it("budgets a chain for every provider in it, not just the first", () => {
    // A local model running out of time is precisely when the cloud fallback
    // behind it should get its turn — an outer bound sized to the first provider
    // would cut the run off before that could happen.
    const chain = totalGenerationDeadlineMs(["ollama", "openai", "gemini"]);
    expect(chain).toBeGreaterThan(LOCAL_GENERATION_TIMEOUT_MS + CLOUD_GENERATION_TIMEOUT_MS * 2 - 1);
    expect(totalGenerationDeadlineMs(["openai"])).toBeLessThan(chain);
    expect(totalGenerationDeadlineMs([])).toBe(CLOUD_GENERATION_TIMEOUT_MS);
  });
});

describe("cancellation", () => {
  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let ran = false;

    await expect(
      withDeadline(
        async () => {
          ran = true;
          return "answer";
        },
        1000,
        controller.signal
      )
    ).rejects.toBeInstanceOf(GenerationCancelledError);
    // Nothing is started for a run the user has already walked away from.
    expect(ran).toBe(false);
  });

  it("stops waiting when the signal aborts mid-run", async () => {
    const controller = new AbortController();
    const pending = withDeadline(() => new Promise<string>(() => {}), 60_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(GenerationCancelledError);
  });

  it("is not a timeout — the two mean different things to the user", async () => {
    const timedOut = await withDeadline(() => new Promise<string>(() => {}), 10).catch((e: unknown) => e);
    expect(timedOut).toBeInstanceOf(GenerationTimeoutError);
    expect(timedOut).not.toBeInstanceOf(GenerationCancelledError);
  });

  it("lets a run that finishes first settle normally", async () => {
    const controller = new AbortController();
    await expect(withDeadline(async () => "answer", 1000, controller.signal)).resolves.toBe("answer");
    // A late abort on a settled run must not resurface as an unhandled rejection.
    controller.abort();
  });
});
