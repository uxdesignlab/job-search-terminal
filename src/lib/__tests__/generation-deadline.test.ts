import { describe, expect, it } from "vitest";
import { GenerationTimeoutError, withDeadline } from "@/lib/ai/retry";

const never = () => new Promise<string>(() => {});

describe("withDeadline", () => {
  it("resolves a call that finishes in time", async () => {
    await expect(withDeadline(async () => "done", 1000)).resolves.toBe("done");
  });

  it("rejects with GenerationTimeoutError when the provider never returns", async () => {
    await expect(withDeadline(never, 20)).rejects.toBeInstanceOf(GenerationTimeoutError);
  });

  it("names the budget it exceeded", () => {
    // Constructed directly — waiting out a real 90s budget would just be a slow test.
    expect(new GenerationTimeoutError(90_000).message).toMatch(/90s/);
    expect(new GenerationTimeoutError(150_000).message).toMatch(/150s/);
  });

  it("passes a provider error through unchanged, so auth and quota still surface", async () => {
    const boom = new Error("401 invalid api key");
    await expect(withDeadline(() => Promise.reject(boom), 1000)).rejects.toBe(boom);
  });

  it("does not fire the timer after the call settles", async () => {
    // A leaked timer would keep the process alive and could reject a settled promise.
    await expect(withDeadline(async () => "quick", 30)).resolves.toBe("quick");
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
});
