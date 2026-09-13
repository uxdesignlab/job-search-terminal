import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  researchStartedBeforeModelAnswered: null as boolean | null,
  researchStarted: false,
  saved: 0,
  requestConfig: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/db/queries", () => ({
  getJobById: () => ({ id: "job-a", title: "Design Manager", company: "Acme", location: "Remote", salaryNotes: "", rawDescription: "Agile and design systems.", parsedDescription: "" }),
  getEvaluationByJobId: () => ({ id: "evaluation-a" }),
  getUserProfile: () => ({ compensationNeeds: "" }),
  getSkills: () => [],
  getRoleDirections: () => [],
  getResumes: () => [],
  getProfileSupplements: () => [],
  getApplicationPreparation: () => (state.saved > 0 ? { id: "preparation-job-a", providerUsed: "openai", modelUsed: "gpt-5.6" } : undefined),
  saveApplicationPreparation: () => {
    state.saved += 1;
  },
}));

vi.mock("@/lib/evaluation/prompts", () => ({
  buildSystemPrompt: () => "system",
  buildJobContext: () => "job context",
}));

vi.mock("@/lib/application-preparation/compensation", () => ({
  parsePostedCompensation: () => null,
  researchMarketCompensation: async () => {
    state.researchStarted = true;
    return { market: null, sources: [], status: "unavailable", provider: "", query: "" };
  },
  suggestCompensationResponse: () => "",
}));

vi.mock("@/lib/ai/factory", () => ({
  getWritingProvider: () => ({
    name: "openai",
    defaultModel: "gpt-5.6",
    effectiveModel: "gpt-5.6",
    generateJSON: async (_messages: unknown, _hint: string, config: Record<string, unknown>) => {
      state.researchStartedBeforeModelAnswered = state.researchStarted;
      state.requestConfig = config;
      return { requirements: [], keywordSignals: [], evidenceMap: [] };
    },
  }),
}));

import { prepareApplication } from "@/lib/application-preparation";
import { GenerationCancelledError } from "@/lib/ai/retry";

beforeEach(() => {
  state.researchStartedBeforeModelAnswered = null;
  state.researchStarted = false;
  state.saved = 0;
  state.requestConfig = null;
});

describe("an application preparation run", () => {
  it("starts the compensation lookup alongside the model call instead of after it", async () => {
    // The resume never reads compensation, and used to wait for the search anyway.
    await prepareApplication("job-a");
    expect(state.researchStartedBeforeModelAnswered).toBe(true);
    expect(state.saved).toBe(1);
  });

  it("asks for as little reasoning as the provider allows", async () => {
    await prepareApplication("job-a");
    expect(state.requestConfig).toMatchObject({ reasoning: "low" });
  });

  it("saves nothing when the user has already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(prepareApplication("job-a", { signal: controller.signal })).rejects.toBeInstanceOf(GenerationCancelledError);
    expect(state.saved).toBe(0);
  });
});
