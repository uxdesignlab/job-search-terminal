import { describe, expect, it } from "vitest";
import { resolveEffectiveKeywordSignals, toKeywordPhrases } from "@/lib/evaluation/effective-keywords";
import type { JobKeywordSignal } from "@/lib/db/types";

const job = {
  title: "Director of Product Design",
  rawDescription: "We need design systems leadership and accessibility expertise across our platform.",
  parsedDescription: "",
};

function signal(keyword: string): JobKeywordSignal {
  return { keyword, priority: "required", category: "technical", source: "description", rationale: "" };
}

describe("effective keyword resolution (§25.1)", () => {
  it("prefers Application Preparation over both legacy tiers", () => {
    const resolved = resolveEffectiveKeywordSignals({
      preparation: { keywordSignals: [signal("design systems")] },
      evaluation: { keywordSignals: [signal("stale signal")], keywords: ["stale keyword"] },
      job,
    });
    expect(toKeywordPhrases(resolved)).toEqual(["design systems"]);
  });

  it("falls back to legacy evaluation signals when preparation is absent", () => {
    const resolved = resolveEffectiveKeywordSignals({
      preparation: null,
      evaluation: { keywordSignals: [signal("accessibility")], keywords: ["ignored"] },
      job,
    });
    expect(toKeywordPhrases(resolved)).toEqual(["accessibility"]);
  });

  it("falls back to legacy plain keywords, normalized against the posting", () => {
    const resolved = resolveEffectiveKeywordSignals({
      preparation: null,
      evaluation: { keywordSignals: [], keywords: ["design systems", "accessibility"] },
      job,
    });
    expect(toKeywordPhrases(resolved)).toContain("design systems");
  });

  it("drops legacy keywords the posting never mentions rather than passing them through", () => {
    const resolved = resolveEffectiveKeywordSignals({
      preparation: null,
      evaluation: { keywordSignals: [], keywords: ["kubernetes"] },
      job,
    });
    expect(toKeywordPhrases(resolved)).not.toContain("kubernetes");
  });

  it("treats empty preparation signals as absent, not as an answer", () => {
    const resolved = resolveEffectiveKeywordSignals({
      preparation: { keywordSignals: [] },
      evaluation: { keywordSignals: [signal("accessibility")], keywords: [] },
      job,
    });
    expect(toKeywordPhrases(resolved)).toEqual(["accessibility"]);
  });

  it("returns nothing for a fast-v2 job with no preparation yet", () => {
    // Evaluation deliberately extracts no keywords; inventing some would be worse
    // than having none until Application Preparation runs.
    const resolved = resolveEffectiveKeywordSignals({
      preparation: null,
      evaluation: { keywordSignals: [], keywords: [] },
      job,
    });
    expect(resolved).toEqual([]);
  });

  it("returns nothing when the job has never been evaluated", () => {
    expect(resolveEffectiveKeywordSignals({ preparation: null, evaluation: null, job })).toEqual([]);
  });
});
