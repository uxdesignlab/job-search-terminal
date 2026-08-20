import { describe, expect, it } from "vitest";
import { describeReverts, evidenceTextForDraft, revertUnsupportedMetrics } from "../documents/evidence-audit";
import type { ResumeTemplateInput } from "../documents/resume-template";

const source: ResumeTemplateInput = {
  name: "Test Candidate",
  headline: "Principal Product Designer",
  contactItems: [],
  title: "Principal Product Designer",
  summary:
    "Principal Product Designer with 15 years across enterprise platforms, design systems, and accessibility. Translated ambiguous requirements into interaction models, user flows, and reusable patterns.",
  impactHeading: "Impact",
  impactItems: ["Reduced support tickets by 20% for onboarding workflows."],
  experienceHeading: "Experience",
  experience: [{
    title: "Principal Product Designer",
    organization: "Example Health",
    dateRange: "2020 - 2024",
    bullets: ["Reduced support tickets by 20% for onboarding workflows using wireframe reviews."],
  }],
  skillsHeading: "Skills",
  skills: ["Accessibility", "Design systems"],
  recognitionHeading: "Recognition",
  recognition: [],
  extraSections: [],
  education: [],
};

const evidence = evidenceTextForDraft(source);

describe("evidence guard on the summary", () => {
  it("keeps a tailored summary whose new words are framing, not claims", () => {
    // Every rewrite reaches for connective vocabulary the source happened not to
    // use. Reverting on those words made the summary — the one section carrying
    // the target title and domain language for ATS — effectively unrewritable.
    const tailored = {
      ...source,
      summary:
        "Principal Product Designer who brings strong product sense and a clear vision to enterprise platforms, design systems, and accessibility. Translates ambiguous requirements into interaction models, user flows, wireframes, and reusable patterns.",
    };

    const result = revertUnsupportedMetrics(source, tailored, evidence);

    expect(result.draft.summary).toBe(tailored.summary);
    expect(result.reverted).toEqual([]);
  });

  it("still reverts a summary that invents a tool, a credential, or a metric", () => {
    const cases: Array<[string, string]> = [
      ["tool", "Principal Product Designer who ships enterprise platforms on Kubernetes."],
      ["credential", "Certified Principal Product Designer across enterprise platforms."],
      ["metric", "Principal Product Designer who cut enterprise platform costs by 60%."],
    ];

    for (const [label, summary] of cases) {
      const result = revertUnsupportedMetrics(source, { ...source, summary }, evidence);
      expect(result.draft.summary, label).toBe(source.summary);
      expect(result.reverted.map((revert) => revert.path), label).toContain("summary");
    }
  });

  it("reports the revert instead of leaving a supported audit over untailored text", () => {
    const result = revertUnsupportedMetrics(
      source,
      { ...source, summary: "Principal Product Designer fluent in Kubernetes." },
      evidence
    );

    expect(result.audit.status).toBe("supported");
    expect(result.audit.reverted).toHaveLength(1);
    const notice = describeReverts(result.reverted);
    expect(notice).toContain("summary");
    expect(notice).toContain("kubernetes");
  });

  it("accepts a summary figure the resume states elsewhere, and one it entails", () => {
    // The summary condenses the whole resume, so "20%" belongs to no single line
    // of it — and "10+" is entailed by an approved "15 years". Neither is invented.
    const stated = revertUnsupportedMetrics(
      source,
      { ...source, summary: "Principal Product Designer who cut support tickets by 20% across enterprise platforms." },
      evidence
    );
    expect(stated.reverted).toEqual([]);

    const entailed = revertUnsupportedMetrics(
      source,
      { ...source, summary: "Principal Product Designer with 10+ years across enterprise platforms." },
      `${evidence}\n15+ years of product design.`
    );
    expect(entailed.reverted).toEqual([]);
  });

  it("keeps the stricter per-line metric test on experience bullets", () => {
    // A number may not move between roles, so bullets still need a related line.
    const result = revertUnsupportedMetrics(
      source,
      {
        ...source,
        experience: [{
          ...source.experience[0],
          bullets: ["Grew design system adoption by 20% across enterprise platforms."],
        }],
      },
      evidence
    );

    expect(result.draft.experience[0].bullets[0]).toBe(source.experience[0].bullets[0]);
  });

  it("does not revert over ordinary resume vocabulary the source never used", () => {
    // Three rounds of leaks — "strong"/"vision", then "consulting"/"expertise",
    // then "stakes"/"cycle" — showed that listing rhetoric cannot work. A word
    // is a claim because of what it is, not because a list forgot it.
    const summary =
      "Principal Product Designer for high-stakes enterprise platforms, shortening the release cycle through measurable workflow simplification, deep craft, and a clear product vision.";

    const result = revertUnsupportedMetrics(source, { ...source, summary }, evidence);

    expect(result.draft.summary).toBe(summary);
    expect(result.reverted).toEqual([]);
  });

  it("reverts an invented tech stack and an invented standard", () => {
    for (const summary of [
      "Principal Product Designer who ships enterprise platforms in React and Svelte.",
      "Principal Product Designer delivering HIPAA-compliant enterprise workflows.",
    ]) {
      const result = revertUnsupportedMetrics(source, { ...source, summary }, evidence);
      expect(result.draft.summary, summary).toBe(source.summary);
    }
  });

  it("does not revert over grammar alone", () => {
    // "wireframes" against evidence that says "wireframe" is the same claim.
    const result = revertUnsupportedMetrics(
      source,
      { ...source, summary: "Principal Product Designer who translates requirements into wireframes." },
      evidence
    );

    expect(result.reverted).toEqual([]);
  });
});
