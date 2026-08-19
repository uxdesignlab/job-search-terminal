import { describe, expect, it } from "vitest";
import { extractPostingRequirements, looksScored, splitRequirementLine } from "@/lib/jobs/posting-requirements";

describe("splitRequirementLine", () => {
  it("keeps the requirement and drops the evidence half", () => {
    const line =
      "Lead end-to-end experience design briefs across all surfaces. — supported (Pavel's 'Principal Product Designer' with 15+ years…)";
    expect(splitRequirementLine(line)).toEqual({
      text: "Lead end-to-end experience design briefs across all surfaces.",
      status: "supported",
    });
  });

  it("reads every status word", () => {
    expect(splitRequirementLine("Drive consumer launches — partial (…)").status).toBe("partial");
    expect(splitRequirementLine("Ship a marketplace — unknown").status).toBe("unknown");
  });

  it("passes a plain requirement through with no status", () => {
    expect(splitRequirementLine("8+ years of product design experience")).toEqual({
      text: "8+ years of product design experience",
    });
  });
});

describe("extractPostingRequirements", () => {
  it("prefers bullets inside a requirements section over the whole posting", () => {
    const jd = [
      "About Instacart",
      "- We are a marketplace company changing how people shop",
      "What you'll bring:",
      "- 8+ years of product design experience",
      "- Deep experience with design systems at scale",
      "Benefits:",
      "- Unlimited PTO and a wellness stipend",
    ].join("\n");

    expect(extractPostingRequirements(jd)).toEqual([
      "8+ years of product design experience",
      "Deep experience with design systems at scale",
    ]);
  });

  it("keeps collecting through a Preferred heading but stops at Benefits", () => {
    const jd = [
      "Minimum qualifications",
      "* 8+ years designing consumer products",
      "Preferred qualifications",
      "* Experience in grocery or food delivery",
      "Compensation",
      "* $200,000 - $250,000 base salary",
    ].join("\n");

    expect(extractPostingRequirements(jd)).toEqual([
      "8+ years designing consumer products",
      "Experience in grocery or food delivery",
    ]);
  });

  it("falls back to every bullet when the posting has no requirements heading", () => {
    // A flat list is common, and dropping it would empty the panel on exactly the
    // postings that most need reading.
    const jd = ["• Own the end-to-end design process", "• Partner with research and engineering"].join("\n");
    expect(extractPostingRequirements(jd)).toEqual([
      "Own the end-to-end design process",
      "Partner with research and engineering",
    ]);
  });

  it("drops fragments, boilerplate-length paragraphs and duplicates", () => {
    const jd = [
      "- ok",
      `- ${"x".repeat(400)}`,
      "- Own the end-to-end design process",
      "- Own the end-to-end design process",
    ].join("\n");
    expect(extractPostingRequirements(jd)).toEqual(["Own the end-to-end design process"]);
  });

  it("returns nothing for prose with no bullets, and for a missing description", () => {
    expect(extractPostingRequirements("We are looking for a designer to join our team.")).toEqual([]);
    expect(extractPostingRequirements("")).toEqual([]);
    expect(extractPostingRequirements(null)).toEqual([]);
  });
});

describe("looksScored", () => {
  it("accepts a list where the statuses are actually there", () => {
    expect(looksScored([
      { text: "a", status: "supported" },
      { text: "b", status: "partial" },
      { text: "c" },
    ])).toBe(true);
  });

  it("rejects the free-form notes older evaluations put in the same field", () => {
    // "Senior-lead scope aligns with the candidate's experience" is a note about the
    // fit, not a requirement the posting stated.
    expect(looksScored([
      { text: "Senior-lead product design scope aligns with the candidate's experience" },
      { text: "Cross-functional leadership aligns with collaborating across teams" },
      { text: "Design systems ownership aligns with scalable experiences" },
    ])).toBe(false);
    expect(looksScored([])).toBe(false);
  });
});
