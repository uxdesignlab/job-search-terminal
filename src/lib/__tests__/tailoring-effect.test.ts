import { describe, expect, it } from "vitest";
import { analyzeTailoringEffect, describeUnchanged } from "../documents/tailoring-effect";
import type { ResumeTemplateInput } from "../documents/resume-template";
import type { ResumeSectionModeInput } from "../db/types";

const modes: ResumeSectionModeInput[] = [
  { sectionId: "summary", mode: "update" },
  { sectionId: "impact", mode: "update" },
  { sectionId: "experience", mode: "update" },
  { sectionId: "skills", mode: "keep" },
];

const source: ResumeTemplateInput = {
  name: "Test Candidate",
  headline: "Principal Product Designer",
  contactItems: [],
  title: "UX Designer, Workflow Systems",
  summary: "Principal Product Designer with 15 years across enterprise platforms.",
  impactHeading: "Impact",
  impactItems: ["Reduced support tickets by 20%.", "Shipped a design system."],
  experienceHeading: "Experience",
  experience: [{
    title: "Director of User Experience",
    organization: "DePalma Studios",
    dateRange: "2017 - 2020",
    bullets: ["Led discovery for logistics platforms.", "Built prototypes.", "Ran usability testing."],
  }],
  skillsHeading: "Skills",
  skills: ["Accessibility"],
  recognitionHeading: "Recognition",
  recognition: [],
  extraSections: [],
  education: [],
};

describe("tailoring effect", () => {
  it("reports a run that returned every selected section as written", () => {
    const effect = analyzeTailoringEffect(source, source, modes);

    expect(effect.noOp).toBe(true);
    expect(effect.notable.map((section) => section.label)).toEqual([
      "Summary",
      "Key achievements",
      "Experience bullets",
    ]);
    expect(describeUnchanged(effect.measured)).toBe(
      "AI tailoring ran but returned summary, 2 of 2 key achievements, 3 of 3 experience bullets exactly as written in your approved resume."
    );
  });

  it("flags a section left mostly untouched without calling the whole run a no-op", () => {
    // The observed failure: the summary was rewritten while 24 of 25 experience
    // bullets came back verbatim.
    const applied: ResumeTemplateInput = {
      ...source,
      summary: "Product design leader for data-heavy workflow systems.",
      impactItems: ["Cut support tickets by 20% through workflow simplification.", "Shipped a design system."],
      experience: [{
        ...source.experience[0],
        bullets: [source.experience[0].bullets[0], source.experience[0].bullets[1], "Ran contextual research sessions."],
      }],
    };

    const effect = analyzeTailoringEffect(source, applied, modes);

    expect(effect.noOp).toBe(false);
    expect(effect.notable.map((section) => section.label)).toEqual(["Key achievements", "Experience bullets"]);
    expect(describeUnchanged(effect.notable)).toContain("2 of 3 experience bullets");
  });

  it("stays quiet when the rewrite actually rewrote", () => {
    const applied: ResumeTemplateInput = {
      ...source,
      summary: "Product design leader for data-heavy workflow systems.",
      impactItems: ["Cut support tickets by 20%.", "Shipped a workflow design system."],
      experience: [{
        ...source.experience[0],
        bullets: ["Led workflow discovery for logistics platforms.", "Built high-fidelity prototypes.", "Ran contextual inquiry."],
      }],
    };

    const effect = analyzeTailoringEffect(source, applied, modes);

    expect(effect.notable).toEqual([]);
    expect(effect.noOp).toBe(false);
    expect(describeUnchanged(effect.notable)).toBe("");
  });

  it("ignores sections the user did not select for update", () => {
    const keepOnly: ResumeSectionModeInput[] = [
      { sectionId: "summary", mode: "keep" },
      { sectionId: "impact", mode: "keep" },
      { sectionId: "experience", mode: "keep" },
    ];

    const effect = analyzeTailoringEffect(source, source, keepOnly);

    expect(effect.measured).toEqual([]);
    expect(effect.noOp).toBe(false);
  });
});
