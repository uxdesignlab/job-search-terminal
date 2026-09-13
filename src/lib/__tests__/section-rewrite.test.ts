import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ answers: [] as unknown[], prompts: [] as string[] }));

vi.mock("@/lib/db/queries", () => ({
  getGeneratedDocumentById: () => ({ id: "document-job-a", jobId: "job-a", baseResume: "Leadership", baseResumeId: "lane-1" }),
  getJobById: () => ({ id: "job-a", title: "Design Manager", company: "Acme", location: "Remote", rawDescription: "Lead accessibility work.", parsedDescription: "" }),
  getEvaluationByJobId: () => ({ id: "evaluation-a", roleArchetype: "Design Leadership", strengths: [], gaps: [], redFlags: [] }),
  getResumes: () => [{ id: "lane-1", name: "Leadership", sourceFile: "does-not-exist.pdf", activeStatus: true, extractedText: "" }],
  getResumeBuilderVersion: () => ({
    status: "approved",
    sections: [
      { id: "summary", type: "summary", title: "Summary", text: "Design lead for accessible platforms." },
      {
        id: "experience",
        type: "experience",
        title: "Experience",
        experience: [{ title: "Design Lead", organization: "Northwind", dateRange: "2021 – Present", bullets: ["Led a team of 6 designers.", "Ran accessibility audits for 30 releases."] }],
      },
    ],
  }),
  getUserProfile: () => ({ name: "Sam Lee", location: "", portfolio: "" }),
  getSkills: () => [],
  getEffectiveKeywordSignals: () => [],
  getApplicationPreparation: () => undefined,
  getJobGapResponses: () => [],
  getProfileSupplements: () => [],
  getWritingStyle: () => ({ toneProfile: null }),
  getAIPromptOverride: () => undefined,
}));

vi.mock("@/lib/ai/factory", () => ({
  getWritingProvider: () => ({
    name: "openai",
    defaultModel: "gpt-5.6",
    effectiveModel: "gpt-5.6",
    generateJSON: async (messages: Array<{ content: string }>) => {
      state.prompts.push(messages.map((message) => message.content).join("\n"));
      return state.answers.shift();
    },
  }),
  resolveWritingCandidates: () => ["openai"],
  exhaustedProviders: () => new Set(),
  orderForCredits: (candidates: string[]) => candidates,
}));

import { rewriteSection } from "@/lib/documents/section-rewrite";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";

const editorDraft: ResumeTemplateInput = {
  name: "Sam Lee",
  headline: "",
  contactItems: [],
  title: "Design Manager",
  summary: "Design lead for accessible platforms.",
  impactHeading: "Key Achievements",
  impactItems: [],
  experienceHeading: "Experience",
  experience: [
    {
      title: "Design Lead",
      organization: "Northwind",
      dateRange: "2021 – Present",
      // The user edited the first bullet by hand; the number is theirs.
      bullets: ["Led and mentored a team of 8 designers.", "Ran accessibility audits for 30 releases."],
    },
  ],
  skills: [],
  recognition: [],
  education: [],
};

beforeEach(() => {
  state.answers = [];
  state.prompts = [];
});

describe("✨ Improve on one role", () => {
  it("starts from the editor's text and keeps the user's own figures", async () => {
    state.answers.push({ lines: [
      { source: 0, text: "Mentored and led a team of 8 designers." },
      { source: 1, text: "Ran accessibility audits across 30 releases." },
    ] });
    const result = await rewriteSection({ documentId: "document-job-a", action: "improve", unit: "role:0", draft: editorDraft });

    expect(state.prompts[0]).toContain("[0] Led and mentored a team of 8 designers.");
    expect(state.prompts[0]).toContain("Improve these lines");
    expect(result.lines).toEqual(["Mentored and led a team of 8 designers.", "Ran accessibility audits across 30 releases."]);
    expect(result.reverted).toEqual([]);
  });

  it("puts back the user's line when the rewrite invents a number", async () => {
    state.answers.push({ lines: [
      { source: 0, text: "Led and mentored a team of 8 designers, cutting delivery time 50%." },
      { source: 1, text: "Ran accessibility audits for 30 releases." },
    ] });
    const result = await rewriteSection({ documentId: "document-job-a", action: "improve", unit: "role:0", draft: editorDraft });

    expect(result.lines[0]).toBe("Led and mentored a team of 8 designers.");
    expect(result.reverted.flatMap((revert) => revert.claims)).toContain("50%");
  });
});

describe("↻ Regenerate on one role", () => {
  it("starts from the approved resume, not the edited text, and reverts to it", async () => {
    state.answers.push({ lines: [
      { source: 1, text: "Ran accessibility audits for 30 releases, raising scores 40%." },
      { source: 0, text: "Led a team of 6 designers." },
    ] });
    const result = await rewriteSection({ documentId: "document-job-a", action: "regenerate", unit: "role:0", note: "lead with accessibility", draft: editorDraft });

    expect(state.prompts[0]).toContain("[0] Led a team of 6 designers.");
    expect(state.prompts[0]).toContain("lead with accessibility");
    // Reordered as the writer chose; the invented 40% line reverts to its own approved source line.
    expect(result.lines).toEqual(["Ran accessibility audits for 30 releases.", "Led a team of 6 designers."]);
  });

  it("does not let the user's hand-typed figure count as evidence", async () => {
    state.answers.push({ lines: [
      { source: 0, text: "Led a team of 8 designers." },
      { source: 1, text: "Ran accessibility audits for 30 releases." },
    ] });
    const result = await rewriteSection({ documentId: "document-job-a", action: "regenerate", unit: "role:0", draft: editorDraft });
    expect(result.lines[0]).toBe("Led a team of 6 designers.");
  });
});
