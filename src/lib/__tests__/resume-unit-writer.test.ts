import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ answers: [] as unknown[], prompts: [] as string[] }));

vi.mock("@/lib/db/queries", () => ({
  getWritingStyle: () => ({ toneProfile: null }),
  getAIPromptOverride: () => undefined,
}));

vi.mock("@/lib/ai/factory", () => ({
  getWritingProvider: () => ({
    name: "openai",
    defaultModel: "gpt-5.6",
    effectiveModel: "gpt-5.6",
    generateJSON: async (messages: Array<{ content: string }>) => {
      calls.prompts.push(messages.map((message) => message.content).join("\n"));
      const next = calls.answers.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  }),
}));

import {
  applyUnitResults,
  buildUnitSharedContext,
  buildUnitSystemPrompt,
  buildUnitTask,
  closestHeldTitle,
  evidenceForLines,
  parseUnitKey,
  planKeywordPlacements,
  runUnits,
  sentenceCase,
  summaryContextFor,
  unitKey,
  unitsForDraft,
  validateUnitOutput,
  writeUnit,
  type UnitInput,
  type UnitWriterContext,
} from "@/lib/documents/resume-unit-writer";
import { injectMissingConfirmedKeywordsIntoSkills } from "@/lib/documents/resume-generator";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";
import type { EvaluationRecord, JobRecord, UserProfileRecord } from "@/lib/db/types";

const draft: ResumeTemplateInput = {
  name: "Sam Lee",
  headline: "Product Design Leader",
  contactItems: [],
  title: "Design Manager",
  summary: "Leads design for data-heavy platforms.",
  impactHeading: "Key Achievements",
  impactItems: ["Built a design system used by 12 product teams."],
  experienceHeading: "Experience",
  experience: [
    { title: "Design Lead", organization: "Northwind", dateRange: "2021 – Present", bullets: ["Led a team of 6 designers.", "Ran accessibility audits for 30 releases."] },
    { title: "Designer", organization: "Contoso", dateRange: "2017 – 2020", bullets: ["Designed onboarding flows."] },
  ],
  skills: ["Tools: Figma, Storybook", "Methods: Usability testing, Journey mapping"],
  recognition: [],
  extraSections: [{ id: "custom-1", title: "Teaching", items: ["Adjunct lecturer, interaction design"] }],
  education: [],
};

const context: UnitWriterContext = {
  job: { id: "job-a", title: "Design Manager", company: "Acme", rawDescription: "Lead accessibility work.", parsedDescription: "" } as JobRecord,
  evaluation: { roleArchetype: "Design Leadership", strengths: [], gaps: [], redFlags: [] } as unknown as EvaluationRecord,
  profile: { name: "Sam Lee" } as UserProfileRecord,
  skills: [],
  evidenceDraft: draft,
  gapResponses: [],
  supplements: [],
  keywordSignals: [{ keyword: "accessibility", priority: "critical", category: "domain", source: "description", rationale: "" }],
  confirmedKeywords: ["accessibility"],
  missingKeywords: [],
  requirements: [],
  evidenceMap: [{ requirement: "Accessibility leadership", evidence: "Ran accessibility audits for 30 releases.", evidenceId: "resume-1", source: "lane", suggestedPlacement: "Experience" }],
};

const roleInput: UnitInput = { unit: { kind: "role", index: 0 }, label: "Design Lead, Northwind", lines: draft.experience[0].bullets, mode: "tailor" };

beforeEach(() => {
  calls.answers = [];
  calls.prompts = [];
});

describe("reading the model's answer for one part", () => {
  it("accepts a reordering that accounts for every line once", () => {
    expect(validateUnitOutput(roleInput, { lines: [{ source: 1, text: "Ran accessibility audits for 30 releases." }, { source: 0, text: "Led 6 designers." }] }))
      .toEqual({ order: [1, 0], lines: ["Ran accessibility audits for 30 releases.", "Led 6 designers."] });
  });

  it("rejects a dropped, duplicated, or invented line rather than guessing", () => {
    expect(validateUnitOutput(roleInput, { lines: [{ source: 0, text: "Led 6 designers." }] })).toBeNull();
    expect(validateUnitOutput(roleInput, { lines: [{ source: 0, text: "a" }, { source: 0, text: "b" }] })).toBeNull();
    expect(validateUnitOutput(roleInput, { lines: [{ source: 0, text: "a" }, { source: 2, text: "b" }] })).toBeNull();
  });

  it("accepts plain strings in source order", () => {
    expect(validateUnitOutput(roleInput, { lines: ["a", "b"] })).toEqual({ order: [0, 1], lines: ["a", "b"] });
  });

  it("round-trips part names", () => {
    for (const key of ["role:3", "impact", "summary", "skills", "extra:custom-1"]) {
      expect(unitKey(parseUnitKey(key)!)).toBe(key);
    }
    expect(parseUnitKey("headline")).toBeNull();
  });
});

describe("prompts for each part", () => {
  it("share a byte-identical prefix, so the cache pays for it once", () => {
    const system = buildUnitSystemPrompt(context);
    const shared = buildUnitSharedContext(context);
    expect(buildUnitSystemPrompt(context)).toBe(system);
    expect(buildUnitSharedContext(context)).toBe(shared);
    // The part being written appears only in the task, never in the shared prefix.
    expect(shared).not.toContain("The Part To Write Now");
    expect(buildUnitTask(context, roleInput)).toContain("[1] Ran accessibility audits for 30 releases.");
  });

  it("tells the writer what this part proves for the posting", () => {
    expect(evidenceForLines(context.evidenceMap, roleInput.lines)).toHaveLength(1);
    expect(buildUnitTask(context, roleInput)).toContain('Accessibility leadership ← "Ran accessibility audits for 30 releases."');
    expect(evidenceForLines(context.evidenceMap, draft.experience[1].bullets)).toHaveLength(0);
  });

  it("passes the user's instruction under the truth rules", () => {
    const task = buildUnitTask(context, { ...roleInput, note: "shorter" });
    expect(task).toContain("The candidate's note about this part (follow it within the truth rules):\nshorter");
  });
});

describe("writing a part", () => {
  it("sends a part back once when it breaks a writing rule, and keeps the better answer", async () => {
    calls.answers.push(
      { lines: [{ source: 0, text: "Led a team of 6 designers." }, { source: 1, text: "Led accessibility audits for 30 releases." }] },
      { lines: [{ source: 1, text: "Ran accessibility audits for 30 releases." }, { source: 0, text: "Led a team of 6 designers." }] },
    );
    const result = await writeUnit(context, roleInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.repaired).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.order).toEqual([1, 0]);
    expect(calls.prompts[1]).toContain("It broke these rules:");
  });

  it("never makes more than one repair call", async () => {
    const repeated = { lines: [{ source: 0, text: "Led a team of 6 designers." }, { source: 1, text: "Led audits for 30 releases." }] };
    calls.answers.push(repeated, repeated, repeated);
    const result = await writeUnit(context, roleInput);
    expect(calls.prompts).toHaveLength(2);
    expect(result.ok && result.repaired).toBe(false);
    expect(result.ok && result.issues.map((issue) => issue.rule)).toEqual(["repeated-opener"]);
  });

  it("reports a failed part instead of failing the resume", async () => {
    calls.answers.push({ lines: [{ source: 0, text: "only one" }] });
    const result = await writeUnit(context, roleInput);
    expect(result).toMatchObject({ ok: false, label: "Design Lead, Northwind" });
  });
});

describe("assembling parts into a draft", () => {
  it("reorders the source to match, so line-by-line checks compare each line with its own source", () => {
    const { source, applied } = applyUnitResults(draft, [{
      ok: true, unit: { kind: "role", index: 0 }, label: "", order: [1, 0],
      lines: ["Ran accessibility audits for 30 releases.", "Led six designers."],
      repaired: false, issues: [], providerUsed: "openai", modelUsed: "gpt-5.6", notice: "", ms: 1,
    }]);
    expect(source.experience[0].bullets).toEqual(["Ran accessibility audits for 30 releases.", "Led a team of 6 designers."]);
    expect(applied.experience[0].bullets).toEqual(["Ran accessibility audits for 30 releases.", "Led six designers."]);
    expect(draft.experience[0].bullets[0]).toBe("Led a team of 6 designers.");
  });

  it("writes only the parts set to update", () => {
    const units = unitsForDraft(draft, (unit) => unit.kind === "role" || unit.kind === "extra");
    expect(units.map((unit) => unitKey(unit.unit))).toEqual(["role:0", "role:1", "extra:custom-1"]);
  });

  it("never runs more parts at once than it is allowed", async () => {
    let inFlight = 0;
    let peak = 0;
    await runUnits([1, 2, 3, 4, 5], 2, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });
    expect(peak).toBe(2);
  });
});

describe("adding a confirmed keyword to a categorised skills list", () => {
  const modes = [{ sectionId: "skills", mode: "update" as const }];

  it("joins the matching category line instead of adding a lone word", () => {
    const result = injectMissingConfirmedKeywordsIntoSkills(
      { ...draft, experience: [] },
      ["Agile"],
      modes,
      [{ keyword: "Agile", priority: "critical", category: "methodology", source: "description", rationale: "" }]
    );
    expect(result.skills).toEqual(["Tools: Figma, Storybook", "Methods: Usability testing, Journey mapping, Agile"]);
  });

  it("still appends to a plain list", () => {
    const result = injectMissingConfirmedKeywordsIntoSkills({ ...draft, experience: [], skills: ["Figma", "Storybook"] }, ["Agile"], modes);
    expect(result.skills).toEqual(["Figma", "Storybook", "Agile"]);
  });
});

describe("placing missing job language", () => {
  const signals = [
    { keyword: "accessibility audits", priority: "critical" as const, category: "methodology" as const, source: "description" as const, rationale: "" },
    { keyword: "cross-functional collaboration", priority: "required" as const, category: "soft" as const, source: "description" as const, rationale: "" },
    { keyword: "Storybook", priority: "required" as const, category: "tool" as const, source: "description" as const, rationale: "" },
    { keyword: "design leadership", priority: "preferred" as const, category: "soft" as const, source: "description" as const, rationale: "" },
  ];
  const inputs = [
    { unit: { kind: "role" as const, index: 0 }, lines: ["Led a team of 6 designers.", "Ran audits for accessibility on 30 releases."] },
    { unit: { kind: "role" as const, index: 1 }, lines: ["Designed onboarding flows."] },
    { unit: { kind: "skills" as const }, lines: ["Tools: Figma, Storybook"] },
    { unit: { kind: "summary" as const }, lines: ["Leads design for data-heavy platforms."] },
  ];

  it("gives each missing phrase to one part only, so the resume does not repeat it in every job", () => {
    // The bug: every part was told to work every missing must-have in, and did.
    const placements = planKeywordPlacements(inputs, {
      keywordSignals: signals,
      confirmedKeywords: signals.map((signal) => signal.keyword),
      missingKeywords: ["accessibility audits", "cross-functional collaboration", "Storybook", "design leadership"],
      evidenceMap: [],
    });
    const placed = [...placements.values()].flat();
    expect(placed).toEqual(expect.arrayContaining(["accessibility audits", "cross-functional collaboration", "Storybook"]));
    expect(new Set(placed).size).toBe(placed.length);
    expect(placements.get("role:0")).toContain("accessibility audits");
    expect(placements.get("skills")).toContain("Storybook");
    expect(placements.get("summary")).toContain("cross-functional collaboration");
    // Preferred language is never pushed in.
    expect(placed).not.toContain("design leadership");
  });

  it("places nothing the evidence does not support, or that is already present", () => {
    const placements = planKeywordPlacements(inputs, {
      keywordSignals: signals,
      confirmedKeywords: ["Storybook"],
      missingKeywords: ["accessibility audits"],
      evidenceMap: [],
    });
    expect([...placements.values()].flat()).toEqual([]);
  });
});

describe("aligning the summary with the posting's title", () => {
  it("names the closest title the candidate has held, needing two shared words", () => {
    expect(closestHeldTitle(draft, "Senior Design Lead")).toEqual({ title: "Design Lead", organization: "Northwind" });
    expect(closestHeldTitle(draft, "Design Operations Manager")).toBeNull();
    expect(closestHeldTitle({ ...draft, experience: [...draft.experience, { title: "Director of User Experience", organization: "Fabrikam", dateRange: "", bullets: ["x"] }] }, "Director, User Experience Design"))
      .toEqual({ title: "Director of User Experience", organization: "Fabrikam" });
  });

  it("tells the summary writer, without licensing the posting's title", () => {
    const withTitle = { ...context, job: { ...context.job, title: "Director, User Experience Design" } as JobRecord, evidenceDraft: { ...draft, experience: [{ title: "Director of User Experience", organization: "Fabrikam", dateRange: "", bullets: ["x"] }] } };
    const task = buildUnitTask(withTitle, { unit: { kind: "summary" }, label: "Professional summary", lines: [draft.summary], mode: "tailor" });
    expect(task).toContain('closest title the candidate has actually held is "Director of User Experience" at Fabrikam');
    expect(task).toContain("never claim the posting's title itself");
  });
});

describe("tailoring an approved summary", () => {
  it("tailors from the approved summary as its foundation instead of rebuilding it from the resume", () => {
    // The bug: told to "write the summary from" the rest of the resume, the writer
    // discarded the approved summary and wrote a different one from the bullets.
    const task = buildUnitTask(context, {
      unit: { kind: "summary" },
      label: "Professional summary",
      lines: [draft.summary],
      context: summaryContextFor(draft),
      mode: "tailor",
    });
    expect(task).toContain("Current summary — the foundation. Tailor it for this posting; do not replace it");
    expect(task).toContain("not to rebuild the summary from");
    expect(task).not.toContain("write the summary from this");
    const rubric = buildUnitSystemPrompt(context);
    expect(rubric).toContain("it is the foundation. Build on it; do not replace it");
    expect(rubric).toContain("bring the posting's supported language and must-haves forward");
    // The per-line number rule has no "line" to mean for a summary; without this the
    // foundation rubric and a mandatory truth rule contradicted each other.
    expect(rubric).toContain("A summary has no single source line: a number in it must be stated in the approved resume or a confirmed gap answer for the same work it describes");
  });

  it("still writes a missing summary from the rest of the resume", () => {
    const blank = { ...draft, summary: "" };
    const task = buildUnitTask(context, {
      unit: { kind: "summary" },
      label: "Professional summary",
      lines: [""],
      context: summaryContextFor(blank),
      mode: "tailor",
    });
    expect(task).toContain("write the summary from this");
    expect(task).toContain("There is no summary yet");
  });
});

describe("job phrases in a sentence's own case", () => {
  it("lowers a heading-style phrase and leaves names and acronyms alone", () => {
    expect(sentenceCase("Cross-Functional Collaboration")).toBe("cross-functional collaboration");
    expect(sentenceCase("User-Centered Design")).toBe("user-centered design");
    expect(sentenceCase("Figma")).toBe("Figma");
    expect(sentenceCase("WCAG 2.2 Compliance")).toBe("WCAG 2.2 Compliance");
    expect(sentenceCase("design systems")).toBe("design systems");
    expect(sentenceCase("Design systems")).toBe("Design systems");
  });
});
