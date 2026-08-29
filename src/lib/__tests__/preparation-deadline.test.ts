import { describe, expect, it } from "vitest";
import { runDeadlineMs } from "@/lib/application-preparation";
import { CLOUD_GENERATION_TIMEOUT_MS, LOCAL_GENERATION_TIMEOUT_MS } from "@/lib/ai/deadlines";

/**
 * Application preparation is the only source of keyword signals, so a run that
 * dies before the chain is exhausted costs the user a resume tailored against
 * nothing — 0% coverage and the base lane reordered. A flat cloud-sized bound
 * here used to cut the chain off at its first provider: a local model placed
 * first burned the whole budget and the cloud fallback behind it never ran.
 */
describe("application preparation run budget", () => {
  it("gives a lone cloud provider the cloud budget", () => {
    expect(runDeadlineMs({ name: "openai" })).toBeGreaterThanOrEqual(CLOUD_GENERATION_TIMEOUT_MS);
  });

  it("gives a lone local provider the local budget, not the cloud one", () => {
    expect(runDeadlineMs({ name: "ollama" })).toBeGreaterThanOrEqual(LOCAL_GENERATION_TIMEOUT_MS);
  });

  it("covers the sum of the chain so a slow local first provider cannot starve the fallback", () => {
    const chain = runDeadlineMs({ name: "ollama", providerNames: ["ollama", "openai", "gemini"] });
    expect(chain).toBeGreaterThan(LOCAL_GENERATION_TIMEOUT_MS + CLOUD_GENERATION_TIMEOUT_MS);
    // The regression: the old flat bound fired at the cloud budget and killed the chain.
    expect(chain).toBeGreaterThan(CLOUD_GENERATION_TIMEOUT_MS);
  });
});
