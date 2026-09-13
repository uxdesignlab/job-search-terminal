import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  researchStartedBeforeModelAnswered: null as boolean | null,
  researchStarted: false,
  saved: 0,
  requestConfig: null as Record<string, unknown> | null,
  researchDelayMs: 0,
  lastSaved: null as Record<string, unknown> | null,
  compensationUpdates: 0,
}));

vi.mock("@/lib/db/queries", () => ({
  getJobById: () => ({ id: "job-a", title: "Design Manager", company: "Acme", location: "Remote", salaryNotes: "", rawDescription: "Agile and design systems.", parsedDescription: "" }),
  getEvaluationByJobId: () => ({ id: "evaluation-a" }),
  getUserProfile: () => ({ compensationNeeds: "" }),
  getSkills: () => [],
  getRoleDirections: () => [],
  getResumes: () => [],
  getProfileSupplements: () => [],
  getApplicationPreparation: () => (state.lastSaved ? { ...state.lastSaved, id: "preparation-job-a" } : undefined),
  saveApplicationPreparation: (input: Record<string, unknown>) => {
    state.saved += 1;
    state.lastSaved = input;
  },
  updateApplicationPreparationCompensation: (_jobId: string, _expected: unknown, fields: Record<string, unknown>) => {
    state.compensationUpdates += 1;
    state.lastSaved = { ...state.lastSaved, ...fields };
    return true;
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
    if (state.researchDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, state.researchDelayMs));
    return state.researchDelayMs > 0
      ? { market: { summary: "Senior range from live research." }, sources: [], status: "completed", provider: "brave", query: "q" }
      : { market: null, sources: [], status: "unavailable", provider: "", query: "" };
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
  state.researchDelayMs = 0;
  state.lastSaved = null;
  state.compensationUpdates = 0;
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

describe("a compensation lookup slower than the model", () => {
  it("does not hold the resume up, and fills the answer in when it lands", async () => {
    // The search behind it has no timeout, so waiting on it made the resume wait too.
    state.researchDelayMs = 60;
    const started = Date.now();
    const result = await prepareApplication("job-a", { compensationWaitMs: 5 });

    expect(Date.now() - started).toBeLessThan(60);
    expect(result.preparation).toMatchObject({ compensationResearchStatus: "not_run" });
    expect(state.saved).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 90));
    // The late result updates the compensation fields only — never a whole re-save.
    expect(state.saved).toBe(1);
    expect(state.compensationUpdates).toBe(1);
    expect(state.lastSaved).toMatchObject({ compensationResearchStatus: "completed", researchProvider: "brave" });
  });
});
