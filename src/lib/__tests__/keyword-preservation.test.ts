import { describe, expect, it } from "vitest";
import { describeRestores, restoreLostKeywords } from "../documents/keyword-preservation";
import type { ResumeTemplateInput } from "../documents/resume-template";
import type { JobKeywordSignal } from "../db/types";

const signal = (keyword: string, priority: JobKeywordSignal["priority"] = "required"): JobKeywordSignal => ({
  keyword,
  priority,
  category: "methodology",
  source: "responsibility",
  rationale: "",
});

const source: ResumeTemplateInput = {
  name: "Test Candidate",
  headline: "Principal Product Designer",
  contactItems: [],
  title: "UX Designer, Workflow Systems",
  summary: "Principal Product Designer with 15 years across healthcare, fintech, SaaS, and consulting environments.",
  impactHeading: "Impact",
  impactItems: ["Improved product adoption by 30% through workflow simplification."],
  experienceHeading: "Experience",
  experience: [{
    title: "Director of User Experience",
    organization: "DePalma Studios",
    dateRange: "2017 - 2020",
    bullets: [
      "Served as lead product designer across healthcare, logistics, and enterprise programs using service design.",
      "Used journey maps and prototypes to resolve fragmented experiences.",
    ],
  }],
  skillsHeading: "Skills",
  skills: ["Accessibility"],
  recognitionHeading: "Recognition",
  recognition: [],
  extraSections: [],
  education: [],
};

describe("keyword preservation", () => {
  it("restores the line that carried a keyword the rewrite paraphrased away", () => {
    // The Seeq regression: "service design" became "service maps" and the
    // tailored resume matched fewer phrases than the untouched one.
    const tailored: ResumeTemplateInput = {
      ...source,
      experience: [{
        ...source.experience[0],
        bullets: [
          "Served as lead product designer for complex, data-heavy programs using service maps.",
          source.experience[0].bullets[1],
        ],
      }],
    };

    const result = restoreLostKeywords(source, tailored, [signal("service design"), signal("journey maps")]);

    expect(result.draft.experience[0].bullets[0]).toBe(source.experience[0].bullets[0]);
    expect(result.restored).toEqual([
      { path: "experience[0].bullets[0]", keywords: ["service design"] },
    ]);
  });

  it("leaves a rewrite alone when it keeps every phrase the source matched", () => {
    const tailored: ResumeTemplateInput = {
      ...source,
      experience: [{
        ...source.experience[0],
        bullets: [
          "Led service design for complex, data-heavy multi-role programs.",
          source.experience[0].bullets[1],
        ],
      }],
    };

    const result = restoreLostKeywords(source, tailored, [signal("service design"), signal("journey maps")]);

    expect(result.draft).toBe(tailored);
    expect(result.restored).toEqual([]);
  });

  it("does not restore a line over a keyword the source never matched", () => {
    const tailored: ResumeTemplateInput = { ...source, summary: "Principal Product Designer for data-heavy platforms." };

    const result = restoreLostKeywords(source, tailored, [signal("contextual inquiry")]);

    expect(result.draft.summary).toBe(tailored.summary);
    expect(result.restored).toEqual([]);
  });

  it("restores the summary when tailoring drops a domain the source stated", () => {
    const tailored: ResumeTemplateInput = {
      ...source,
      summary: "Principal Product Designer with 15 years across data-heavy enterprise environments.",
    };

    const result = restoreLostKeywords(source, tailored, [signal("b2b saas", "critical")]);
    expect(result.draft.summary).toBe(tailored.summary);

    const withMatch = restoreLostKeywords(source, tailored, [signal("saas", "critical")]);
    expect(withMatch.draft.summary).toBe(source.summary);
    expect(describeRestores(withMatch.restored)).toContain("\"saas\"");
  });

  it("keeps repairing after a loss that no single line can fix", () => {
    // A document-spanning phrase has no carrier line. Skipping it must not
    // abandon the losses that are still repairable — the first version of this
    // pass stopped on the first unrepairable keyword and restored nothing.
    const tailored: ResumeTemplateInput = {
      ...source,
      summary: "Product design leader for data-heavy platforms.",
      experience: [{
        ...source.experience[0],
        bullets: [
          "Served as lead product designer for complex programs using service maps.",
          source.experience[0].bullets[1],
        ],
      }],
    };

    const result = restoreLostKeywords(source, tailored, [
      signal("healthcare fintech consulting", "critical"),
      signal("service design"),
    ]);

    expect(result.draft.experience[0].bullets[0]).toBe(source.experience[0].bullets[0]);
    expect(result.restored.map((entry) => entry.path)).toEqual(["experience[0].bullets[0]"]);
    expect(result.draft.summary).toBe(tailored.summary);
  });

  it("ignores a related-wording match that was never exact", () => {
    // Only exact matches are defended; a fuzzy match belongs to no single line.
    const tailored: ResumeTemplateInput = {
      ...source,
      summary: "Product design leader for data-heavy platforms.",
    };

    const result = restoreLostKeywords(source, tailored, [signal("healthcare fintech consulting", "critical")]);

    expect(result.draft.summary).toBe(tailored.summary);
    expect(result.restored).toEqual([]);
  });

  it("repairs several phrases from a single restored line", () => {
    const tailored: ResumeTemplateInput = {
      ...source,
      experience: [{
        ...source.experience[0],
        bullets: [source.experience[0].bullets[0], "Resolved fragmented experiences with research."],
      }],
    };

    const result = restoreLostKeywords(source, tailored, [signal("journey maps"), signal("prototypes")]);

    expect(result.restored).toHaveLength(1);
    expect(result.restored[0].keywords.sort()).toEqual(["journey maps", "prototypes"]);
  });
});
