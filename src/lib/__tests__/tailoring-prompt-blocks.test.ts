import { describe, expect, it } from "vitest";
import { buildBackgroundBlock, buildRequirementsBlock } from "@/lib/documents/llm-tailorer";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";

const draft: ResumeTemplateInput = {
  name: "Sam Lee",
  headline: "Product Design Leader",
  contactItems: [],
  title: "Design Manager",
  summary: "Leads design for data-heavy platforms.",
  impactHeading: "Key Achievements",
  impactItems: ["Built a design system used by 12 product teams."],
  experienceHeading: "Experience",
  experience: [{ title: "Design Lead", organization: "Northwind", dateRange: "2021 – Present", bullets: ["Led a team of 6 designers."] }],
  skills: ["Figma", "Design systems"],
  recognition: ["Speaker, Config 2025"],
  extraSections: [{ id: "custom-1", title: "Teaching", items: ["Adjunct lecturer, interaction design"] }],
  education: [{ degree: "BFA, Graphic Design", school: "State University" }],
};

describe("the candidate background sent with a rewrite", () => {
  it("carries the sections not being rewritten, and only those", () => {
    // This replaced a character-truncated PDF excerpt that repeated the selected
    // sections and cut off the later ones — skills and education — first.
    const block = buildBackgroundBlock(draft, {
      summary: draft.summary,
      impactItems: undefined,
      experience: draft.experience,
      extraSections: [],
    });

    expect(block).toContain("Headline: Product Design Leader");
    expect(block).toContain("Built a design system used by 12 product teams.");
    expect(block).toContain("- Figma");
    expect(block).toContain("Adjunct lecturer, interaction design");
    expect(block).toContain("BFA, Graphic Design, State University");
    expect(block).not.toContain("Leads design for data-heavy platforms.");
    expect(block).not.toContain("Led a team of 6 designers.");
  });

  it("leaves out a custom section that is itself being rewritten", () => {
    const block = buildBackgroundBlock(draft, { extraSections: [{ title: "Teaching" }] });
    expect(block).not.toContain("Adjunct lecturer");
  });

  it("lists the posting's requirements compactly, with what the evidence says about each", () => {
    const block = buildRequirementsBlock([
      { text: "Experience leading design teams", type: "must_have", evidenceStatus: "supported", evidenceIds: [] },
      { text: "Figma", type: "tool", evidenceStatus: "unknown", evidenceIds: [] },
    ]);
    expect(block).toContain("## What This Posting Requires");
    expect(block).toContain("- Experience leading design teams [must have; evidence: supported]");
    expect(block).toContain("- Figma [tool; evidence: unknown]");
    expect(buildRequirementsBlock([])).toBe("");
  });
});
