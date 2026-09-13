import { describe, expect, it } from "vitest";
import { checkResume, lintPart } from "@/lib/documents/resume-lint";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";
import type { JobKeywordSignal } from "@/lib/db/types";

function rules(kind: Parameters<typeof lintPart>[0], lines: string[]) {
  return lintPart(kind, lines).map((issue) => issue.rule);
}

describe("writing rules for one part", () => {
  it("flags hype, self-rating openers, and first person", () => {
    expect(rules("role", ["Visionary leader who redesigned onboarding."])).toContain("hype");
    expect(rules("summary", ["Proven track record of shipping design systems."])).toContain("self-assessment");
    expect(rules("summary", ["Design leader. Passionate about accessible products."])).toContain("self-assessment");
    expect(rules("role", ["I led the redesign of the checkout flow."])).toContain("first-person");
    expect(rules("role", ["Led our team through a platform migration."])).toContain("first-person");
  });

  it("does not mistake a country, a state, or i.e. for first person", () => {
    expect(rules("role", ["Grew the US market and opened offices in Portland, ME, i.e. two new regions."])).not.toContain("first-person");
  });

  it("flags a bullet that runs past two printed lines", () => {
    expect(rules("role", ["Led ".padEnd(260, "x")])).toContain("too-long");
    expect(rules("role", ["Led a team of six designers across two product lines."])).not.toContain("too-long");
  });

  it("flags a summary longer than a recruiter reads in full", () => {
    const long = Array.from({ length: 5 }, () => "Led design for platform teams.").join(" ");
    expect(rules("summary", [long])).toContain("summary-length");
  });

  it("flags two bullets in one job that open with the same verb", () => {
    expect(rules("role", ["Led the design system.", "Led hiring for four roles."])).toEqual(["repeated-opener"]);
  });

  it("flags a placed job phrase tacked onto the end of a sentence", () => {
    expect(lintPart("summary", ["Supports accessible products with engineering teams using user-centered design."], ["user-centered design"]).map((issue) => issue.rule))
      .toEqual(["tacked-keyword"]);
    expect(lintPart("summary", ["Applies user-centered design to accessible products."], ["user-centered design"])).toEqual([]);
  });

  it("applies only list rules to skills", () => {
    expect(rules("skills", ["Figma, Storybook, world-class prototyping"])).toEqual([]);
  });

  it("passes a clean part", () => {
    expect(lintPart("role", [
      "Led a 12-person design team through a platform migration for 40 enterprise clients.",
      "Built an accessible component library adopted by six product squads.",
    ])).toEqual([]);
  });
});

const signal = (keyword: string, priority: JobKeywordSignal["priority"] = "required", category: JobKeywordSignal["category"] = "technical"): JobKeywordSignal =>
  ({ keyword, priority, category, source: "description", rationale: "" });

const draft: ResumeTemplateInput = {
  name: "Sam Lee",
  headline: "Product Design Leader",
  contactItems: ["sam@example.com", "+1 555 010 2030", "Nashville, TN"],
  title: "Design Manager",
  summary: "Product design manager leading teams that build accessible platforms.",
  impactHeading: "Key Achievements",
  impactItems: ["Built a design system used by 12 product teams."],
  experienceHeading: "Professional Experience",
  experience: [
    { title: "Design Lead", organization: "Northwind", dateRange: "Jan 2021 – Present", bullets: ["Led accessibility reviews for 30 releases."] },
    { title: "Designer", organization: "Contoso", dateRange: "Mar 2017 – Dec 2020", bullets: ["Designed onboarding flows."] },
  ],
  skills: ["Figma", "Design systems", "Agile"],
  recognition: [],
  education: [],
};

function statusOf(checks: ReturnType<typeof checkResume>, id: string) {
  return checks.find((check) => check.id === id)?.status;
}

describe("the ATS and recruiter report", () => {
  it("passes a resume that names the role, shows key language in context, and has full contact details", () => {
    const checks = checkResume(draft, [signal("accessibility"), signal("design system")], ["accessibility", "design system"], "Design Manager");
    expect(checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("flags a supported must-have phrase that appears only in Skills", () => {
    const checks = checkResume(draft, [signal("Agile", "critical", "methodology")], ["Agile"], "Design Manager");
    expect(statusOf(checks, "keywords-in-body")).toBe("flag");
    expect(checks.find((check) => check.id === "keywords-in-body")?.detail).toContain('Only in Skills: "Agile"');
  });

  it("does not ask for a phrase the evidence does not support", () => {
    const checks = checkResume(draft, [signal("Kubernetes", "critical", "tool")], [], "Design Manager");
    expect(statusOf(checks, "keywords-in-body")).toBe("pass");
  });

  it("flags missing contact details, an unusual heading, and mixed date formats", () => {
    const checks = checkResume({
      ...draft,
      contactItems: ["Nashville, TN"],
      experienceHeading: "Where I've Been",
      experience: [
        { ...draft.experience[0], dateRange: "2021 – Present" },
        { ...draft.experience[1], dateRange: "Mar 2017 – Dec 2020" },
      ],
    }, [], [], "Design Manager");
    expect(statusOf(checks, "contact-email")).toBe("flag");
    expect(statusOf(checks, "contact-phone")).toBe("flag");
    expect(statusOf(checks, "standard-headings")).toBe("flag");
    expect(statusOf(checks, "date-format")).toBe("flag");
  });

  it("does not call a core subject stuffing when it is spread across a full resume", () => {
    const longDraft = {
      ...draft,
      experience: Array.from({ length: 5 }, (_, index) => ({
        title: "Design Lead",
        organization: `Company ${index}`,
        dateRange: "Jan 2020 – Dec 2021",
        bullets: [
          "Led accessibility reviews for enterprise releases with product and engineering partners across three regions.",
          "Built reusable components, documentation, and contribution models that product squads adopted for new work.",
          "Mentored designers through critique, pairing, and structured feedback on research, interaction, and visual craft.",
        ],
      })),
    };
    const checks = checkResume(longDraft, [signal("accessibility")], ["accessibility"], "Design Manager");
    expect(statusOf(checks, "keyword-repetition")).toBe("pass");
  });

  it("flags keyword stuffing and a summary that never names the role", () => {
    const stuffed = { ...draft, summary: "Accessibility accessibility specialist focused on accessibility.", headline: "Accessibility" };
    const checks = checkResume(stuffed, [signal("accessibility")], ["accessibility"], "Design Manager");
    expect(statusOf(checks, "keyword-repetition")).toBe("flag");
    expect(statusOf(checks, "title-in-summary")).toBe("flag");
  });
});
