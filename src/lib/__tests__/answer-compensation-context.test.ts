import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  prompts: [] as string[],
  preparation: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@/lib/db/queries", () => ({
  getJobById: () => ({ id: "job-a", title: "Design Director", company: "Acme", location: "Remote", remoteType: "remote", salaryNotes: "Not captured" }),
  getEvaluationByJobId: () => ({ summary: "Strong fit.", strengths: ["Design systems"], resumeEvidence: ["Led a design system"] }),
  getUserProfile: () => ({ name: "Sam Lee", currentSearchGoal: "Design leadership", strongestSkills: ["Design systems"], compensationNeeds: "$180k–$210k", workPreferences: ["Remote"] }),
  getStories: () => [],
  getWritingStyle: () => ({ toneProfile: null }),
  getJobGapResponses: () => [],
  getApplicationPreparation: () => state.preparation,
  getAIPromptOverride: () => undefined,
  saveApplicationAnswerDrafts: () => undefined,
  getApplicationAnswerDrafts: () => [],
}));

vi.mock("@/lib/ai/factory", () => ({
  getActiveProvider: () => ({
    name: "openai",
    effectiveModel: "gpt-5.6",
    generateJSON: async (messages: Array<{ content: string }>) => {
      state.prompts.push(messages.map((message) => message.content).join("\n"));
      return { answers: [] };
    },
  }),
}));

vi.mock("@/lib/evaluation/job-evaluator", () => ({ evaluateJob: () => undefined }));

import { prepareApplicationAnswersWithAI } from "@/lib/applications/llm-answer-generator";

beforeEach(() => {
  state.prompts = [];
  state.preparation = undefined;
});

describe("AI application answers and compensation research", () => {
  it("include market research once it has finished", async () => {
    state.preparation = { compensationResearchStatus: "completed", marketCompensation: { summary: "Directors of design in the US typically earn $190k–$240k." } };
    await prepareApplicationAnswersWithAI("job-a");
    expect(state.prompts[0]).toContain("Market compensation context from live research");
    expect(state.prompts[0]).toContain("$190k–$240k");
    expect(state.prompts[0]).toContain("never state a number that is not in the target, the posting, or the provided research");
  });

  it("leave it out while research is still running", async () => {
    state.preparation = { compensationResearchStatus: "not_run", marketCompensation: null };
    await prepareApplicationAnswersWithAI("job-a");
    expect(state.prompts[0]).not.toContain("Market compensation context");
    expect(state.prompts[0]).toContain("Compensation target: $180k–$210k");
  });
});
