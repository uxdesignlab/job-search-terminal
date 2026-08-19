import { describe, expect, it } from "vitest";
import {
  CLOUD_GENERATION_TIMEOUT_MS,
  LOCAL_GENERATION_TIMEOUT_MS,
  generationDeadlineMs,
  totalGenerationDeadlineMs,
} from "@/lib/ai/deadlines";

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
