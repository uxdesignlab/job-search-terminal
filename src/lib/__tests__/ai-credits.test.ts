import { describe, expect, it } from "vitest";
import {
  ProviderCreditsExhaustedError,
  creditFallbackNotice,
  isAnthropicCreditsError,
  isCreditsExhaustedError,
  isGeminiCreditsError,
  isOpenAICreditsError,
  trackCredits,
  type CreditStatusStore,
} from "@/lib/ai/credit-status";
import { AI_CREDITS_EXHAUSTED_CODE, aiErrorMessage, aiErrorResponse, isAICreditsExhausted } from "@/lib/ai/error-response";
import { FallbackProvider, shouldFailover } from "@/lib/ai/fallback-provider";
import { orderForCredits } from "@/lib/ai/factory";
import { withRetry } from "@/lib/ai/retry";
import type { AIProvider } from "@/lib/ai/provider";
import type { AIProviderName } from "@/lib/db/types";

function stubProvider(name: string, model: string, error?: unknown): AIProvider {
  return {
    name,
    defaultModel: model,
    effectiveModel: model,
    generateText: async () => {
      if (error) throw error;
      return `${name} answered`;
    },
    generateJSON: async () => {
      if (error) throw error;
      return { from: name } as never;
    },
    stream: async function* () {
      if (error) throw error;
      yield { text: `${name} answered`, done: true };
    },
    testConnection: async () => ({ ok: !error, latencyMs: 1, model }),
  } as unknown as AIProvider;
}

function memoryStore(initial: AIProviderName[] = []) {
  const flagged = new Set<string>(initial);
  const marks: string[] = [];
  const clears: string[] = [];
  const store: CreditStatusStore = {
    exhausted: () => new Set(flagged),
    mark: (provider) => {
      flagged.add(provider);
      marks.push(provider);
    },
    clear: (provider) => {
      flagged.delete(provider);
      clears.push(provider);
    },
  };
  return { store, flagged, marks, clears };
}

describe("telling an empty account apart from a busy one", () => {
  it("reads OpenAI's insufficient_quota 429 as credits, and a request-rate 429 as not", () => {
    // The bug: both arrived as RateLimitError and both were reported as "wait a moment".
    expect(isOpenAICreditsError(Object.assign(new Error("429 You exceeded your current quota, please check your plan and billing details."), { status: 429, code: "insufficient_quota" }))).toBe(true);
    expect(isOpenAICreditsError(Object.assign(new Error("429 Rate limit reached for gpt-5.6 in organization on requests per min (RPM)"), { status: 429, code: "rate_limit_exceeded" }))).toBe(false);
  });

  it("reads Anthropic's 400 credit-balance error as credits", () => {
    const error = Object.assign(
      new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'),
      { status: 400 }
    );
    expect(isAnthropicCreditsError(error)).toBe(true);
    expect(isAnthropicCreditsError(Object.assign(new Error("400 messages: text content blocks must be non-empty"), { status: 400 }))).toBe(false);
  });

  it("reads Gemini's daily quota as credits but leaves a per-minute limit to the retry policy", () => {
    expect(isGeminiCreditsError(new Error(
      "[429 Too Many Requests] You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 50, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier"
    ))).toBe(true);
    expect(isGeminiCreditsError(new Error(
      "[429 Too Many Requests] You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, quotaId: GenerateRequestsPerMinutePerProjectPerModel-FreeTier"
    ))).toBe(false);
    expect(isGeminiCreditsError(new Error("[429 Too Many Requests] Your prepayment credits are depleted."))).toBe(true);
  });

  it("recognises the error by its message too, since chain summaries carry only text", () => {
    const error = new ProviderCreditsExhaustedError("openai", "raw");
    expect(isCreditsExhaustedError(error)).toBe(true);
    expect(isCreditsExhaustedError(error.message)).toBe(true);
    expect(error.message).toContain("OpenAI is out of credits");
  });
});

describe("a chain with a provider out of credits", () => {
  it("fails over to the local model and says so", async () => {
    // The bug: Anthropic's 400 did not fail over, so the local model behind it never ran.
    const chain = new FallbackProvider([
      stubProvider("anthropic", "claude-sonnet-5", new ProviderCreditsExhaustedError("anthropic", "credit balance is too low")),
      stubProvider("ollama", "gemma4:12b-mlx"),
    ]);

    await expect(chain.generateJSON([], "{}")).resolves.toEqual({ from: "ollama" });
    expect(chain.name).toBe("ollama");
    expect(chain.notice).toBe("Anthropic is out of credits — this used your local model (gemma4:12b-mlx) instead.");
  });

  it("has nothing to say when the head of the chain answered", async () => {
    const chain = new FallbackProvider([stubProvider("openai", "gpt-5.6"), stubProvider("ollama", "gemma4:12b-mlx")]);
    await chain.generateText([]);
    expect(chain.notice).toBe("");
  });

  it("does not retry a credits failure, because waiting cannot fix it", async () => {
    let calls = 0;
    await expect(withRetry(async () => {
      calls += 1;
      throw new ProviderCreditsExhaustedError("openai", "insufficient_quota");
    }, 3, 1)).rejects.toBeInstanceOf(ProviderCreditsExhaustedError);
    expect(calls).toBe(1);
  });

  it("fails over when Ollama answers a request that waited out its queue with a bare 500", () => {
    expect(shouldFailover(new Error("Ollama server error (500). Check that the model is fully downloaded."))).toBe(true);
  });

  it("moves exhausted providers to the back of the chain rather than dropping them", () => {
    expect(orderForCredits(["openai", "ollama", "gemini"], new Set(["openai"]))).toEqual(["ollama", "gemini", "openai"]);
    expect(orderForCredits(["openai"], new Set(["openai"]))).toEqual(["openai"]);
  });
});

describe("remembering credit state", () => {
  it("marks a provider when it runs dry and clears it when it next answers", async () => {
    const { store, flagged, marks, clears } = memoryStore();
    let dry = true;
    const tracked = trackCredits({
      ...stubProvider("openai", "gpt-5.6"),
      generateText: async () => {
        if (dry) throw new ProviderCreditsExhaustedError("openai", "insufficient_quota");
        return "ok";
      },
    } as AIProvider, store);

    await expect(tracked.generateText([])).rejects.toBeInstanceOf(ProviderCreditsExhaustedError);
    expect(marks).toEqual(["openai"]);
    expect(flagged.has("openai")).toBe(true);

    dry = false;
    await expect(tracked.generateText([])).resolves.toBe("ok");
    expect(clears).toEqual(["openai"]);
    expect(flagged.has("openai")).toBe(false);
  });

  it("does not write to the store on every successful call", async () => {
    const { store, clears } = memoryStore();
    const tracked = trackCredits(stubProvider("openai", "gpt-5.6"), store);
    await tracked.generateText([]);
    await tracked.generateText([]);
    expect(clears).toEqual([]);
  });

  it("keeps the name and model the chain's policy reads", () => {
    const tracked = trackCredits(stubProvider("ollama", "gemma4:12b-mlx"), memoryStore().store);
    expect(tracked.name).toBe("ollama");
    expect(tracked.effectiveModel).toBe("gemma4:12b-mlx");
  });

  it("names every provider it passed over", () => {
    expect(creditFallbackNotice(["openai", "anthropic"], { name: "gemini", effectiveModel: "gemini-3.7-flash" }))
      .toBe("OpenAI and Anthropic are out of credits — this used Google Gemini (gemini-3.7-flash) instead.");
  });
});

describe("what an AI action tells the user", () => {
  it("gives one actionable sentence when nothing in the chain has credits", async () => {
    const chain = new FallbackProvider([
      stubProvider("openai", "gpt-5.6", new ProviderCreditsExhaustedError("openai", "x")),
      stubProvider("gemini", "gemini-3.7-flash", new ProviderCreditsExhaustedError("gemini", "x")),
    ]);
    const error = await chain.generateText([]).catch((e: unknown) => e);

    expect(isAICreditsExhausted(error)).toBe(true);
    expect(aiErrorMessage(error)).toBe(
      "OpenAI and Google Gemini are out of credits and no other AI provider is available. Add credits with your provider, or turn on a local model in Settings → AI Provider."
    );
    const response = aiErrorResponse(error);
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: AI_CREDITS_EXHAUSTED_CODE });
  });

  it("reports a mixed failure as the chain, not as a credits problem", async () => {
    const chain = new FallbackProvider([
      stubProvider("openai", "gpt-5.6", new ProviderCreditsExhaustedError("openai", "x")),
      stubProvider("ollama", "gemma4:12b-mlx", new Error("Could not connect to Ollama. Make sure it is running: `ollama serve`")),
    ]);
    const error = await chain.generateText([]).catch((e: unknown) => e);

    expect(isAICreditsExhausted(error)).toBe(false);
    expect(aiErrorMessage(error)).toContain("All 2 AI providers failed:");
    expect(aiErrorResponse(error).status).toBe(500);
  });
});
