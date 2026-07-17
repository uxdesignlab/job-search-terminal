import { describe, expect, it } from "vitest";
import { keywordCoverageFor, keywordStrengthDetailsForText } from "../documents/keyword-coverage";
import { legacyKeywordSignals, normalizeKeywordSignals } from "../evaluation/keyword-signals";

const workAndCoPosting = `
What You Will Do
Work iteratively and collaborate with the team on initial concepts, user flows, visual design, and prototypes.

Basic Qualifications:
Portfolio or samples of work demonstrating digital product design.

Preferred Qualifications:
Ability to solve complex product design problems and deliver best-in-class solutions.
Familiarity with prototyping tools.
`;

describe("job keyword signals", () => {
  it("keeps posting-grounded phrases, rejects invented variants, and removes low-signal language", () => {
    const signals = normalizeKeywordSignals([
      { keyword: "Senior Design Lead", priority: "critical", category: "title", source: "job_title" },
      { keyword: "Product Design Lead", priority: "critical", category: "title", source: "job_title" },
      { keyword: "digital product design", priority: "required", category: "technical", source: "basic_qualification" },
      { keyword: "user flows", priority: "required", category: "technical", source: "responsibility" },
      { keyword: "best-in-class solutions", priority: "preferred", category: "soft", source: "preferred_qualification" },
      { keyword: "prototyping tools", priority: "preferred", category: "tool", source: "preferred_qualification" },
    ], { title: "Senior Design Lead", description: workAndCoPosting });

    expect(signals.map((signal) => signal.keyword)).toEqual([
      "Senior Design Lead",
      "digital product design",
      "user flows",
      "prototyping tools",
    ]);
    expect(signals.find((signal) => signal.keyword === "digital product design")?.priority).toBe("critical");
    expect(signals.find((signal) => signal.keyword === "prototyping tools")?.priority).toBe("preferred");
  });

  it("infers legacy qualification priority from the job section", () => {
    const signals = legacyKeywordSignals(
      ["Senior Design Lead", "Design Lead", "digital product design", "prototyping tools"],
      { title: "Senior Design Lead", description: workAndCoPosting },
    );

    expect(signals.map(({ keyword, priority }) => [keyword, priority])).toEqual([
      ["Senior Design Lead", "critical"],
      ["digital product design", "critical"],
      ["prototyping tools", "preferred"],
    ]);
  });

  it("weights must-have phrases above preferred wording and gives related wording partial credit", () => {
    const signals = normalizeKeywordSignals([
      { keyword: "Senior Design Lead", priority: "critical", category: "title", source: "job_title" },
      { keyword: "digital product design", priority: "critical", category: "technical", source: "basic_qualification" },
      { keyword: "prototyping tools", priority: "preferred", category: "tool", source: "preferred_qualification" },
    ], { title: "Senior Design Lead", description: workAndCoPosting });

    const details = keywordStrengthDetailsForText(
      "Senior product design leader with deep experience designing digital products and using prototyping platforms.",
      signals,
    );

    expect(details.exact).toEqual([]);
    expect(details.partial).toContain("digital product design");
    expect(details.alignmentScore).toBe(23);
    expect(details.totalWeight).toBe(11);
  });

  it("does not count the hidden target-role metadata as visible resume text", () => {
    const score = keywordCoverageFor({
      name: "Candidate",
      headline: "Principal Product Designer",
      contactItems: [],
      title: "Senior Design Lead",
      summary: "Hands-on product design leader.",
      impactHeading: "Impact",
      impactItems: [],
      experienceHeading: "Experience",
      experience: [],
      skills: [],
      recognition: [],
      education: [],
    }, [{
      keyword: "Senior Design Lead",
      priority: "critical",
      category: "title",
      source: "job_title",
      rationale: "Target title.",
    }]);

    expect(score).toBe(0);
  });
});
