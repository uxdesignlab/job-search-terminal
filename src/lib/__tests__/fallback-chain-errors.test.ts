import { describe, expect, it } from "vitest";
import { AllProvidersFailedError, FallbackProvider, findChainFailure } from "@/lib/ai/fallback-provider";
import type { AIProvider } from "@/lib/ai/provider";
import { isMalformedJsonResponse, withRetry } from "@/lib/ai/retry";

function stubProvider(name: string, model: string, error?: unknown): AIProvider {
  const fail = async () => {
    if (error) throw error;
    return `${name} answered`;
  };
  return {
    name,
    defaultModel: model,
    effectiveModel: model,
    generateText: fail,
    generateJSON: async () => {
      if (error) throw error;
      return { from: name } as never;
    },
    stream: async function* () {
      if (error) throw error;
      yield { text: `${name} answered`, done: true };
    },
  } as unknown as AIProvider;
}

describe("chain failure reporting", () => {
  it("names every provider it tried, not just the last one", async () => {
    // The bug this covers: a local-first chain reported Gemini's quota error, so
    // the user was told they had hit a free-tier limit on a local model.
    const chain = new FallbackProvider([
      stubProvider("ollama", "gemma4:12b-mlx", new Error("Ollama request timed out. The model may still be loading — retry in a moment.")),
      stubProvider("openai", "gpt-5.6-sol", new Error("OpenAI quota exceeded. Check your usage at platform.openai.com/usage.")),
      stubProvider("gemini", "gemini-3.7-flash", new Error("[429 Too Many Requests] You exceeded your current quota.")),
    ]);

    const error = await chain.generateJSON([], "{}").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AllProvidersFailedError);
    const message = (error as Error).message;
    expect(message).toContain("All 3 AI providers failed:");
    expect(message).toContain("ollama (gemma4:12b-mlx) — Ollama request timed out.");
    expect(message).toContain("openai (gpt-5.6-sol) — OpenAI quota exceeded.");
    expect(message).toContain("gemini (gemini-3.7-flash) — [429 Too Many Requests] You exceeded your current quota.");
  });

  it("stops at a provider whose failure would repeat everywhere", async () => {
    // A malformed request fails identically on every provider, so failing over
    // just burns calls — that error is still thrown as itself.
    const badRequest = new Error("400 invalid request: messages must not be empty");
    const chain = new FallbackProvider([
      stubProvider("ollama", "gemma4:12b-mlx", badRequest),
      stubProvider("openai", "gpt-5.6-sol"),
    ]);

    await expect(chain.generateText([])).rejects.toBe(badRequest);
  });

  it("does not report a failure when a later provider answers", async () => {
    const chain = new FallbackProvider([
      stubProvider("ollama", "gemma4:12b-mlx", new Error("Could not connect to Ollama. Make sure it is running: `ollama serve`")),
      stubProvider("openai", "gpt-5.6-sol"),
    ]);

    await expect(chain.generateText([])).resolves.toBe("openai answered");
    expect(chain.name).toBe("openai");
  });

  it("reports the chain failure from inside a wrapper error", async () => {
    // The evaluator wraps provider errors in EvaluationPhaseError before the route
    // sees them, so the lookup has to walk the cause chain.
    const chainFailure = new AllProvidersFailedError(
      [{ provider: "ollama", model: "gemma4:12b-mlx", error: "timed out" }],
      new Error("timed out")
    );
    const wrapped = new Error("wrapped", { cause: new Error("deeper", { cause: chainFailure }) });

    expect(findChainFailure(wrapped)).toBe(chainFailure);
    expect(findChainFailure(new Error("unrelated"))).toBeNull();
  });
});

describe("how a chain failure is classified", () => {
  const chain = (...messages: string[]) =>
    new AllProvidersFailedError(
      messages.map((error, i) => ({ provider: `p${i}`, model: "m", error })),
      new Error(messages[messages.length - 1])
    );

  it("degrades to the local evaluator only when every provider produced bad JSON", () => {
    expect(isMalformedJsonResponse(chain("Ollama returned invalid JSON.", "Gemini returned invalid JSON."))).toBe(true);
    // One bad-JSON answer beside a quota wall is not a JSON problem — the quota is
    // the user's to act on and must surface instead of hiding behind a local score.
    expect(isMalformedJsonResponse(chain("Ollama returned invalid JSON.", "[429] quota exceeded"))).toBe(false);
  });

  it("retries the whole chain only when every provider failed for a retryable reason", () => {
    // Retrying re-runs every provider, so one retryable failure beside a hard one
    // would spend cloud calls that are already known to fail.
    return Promise.all([
      expect(isRetryableForTest(chain("Ollama request timed out.", "503 service unavailable"))).resolves.toBe(true),
      expect(isRetryableForTest(chain("Ollama request timed out.", "[429] quota exceeded"))).resolves.toBe(false),
    ]);
  });
});

/** withRetry keeps its predicate private; this exercises it through the public call. */
async function isRetryableForTest(error: unknown): Promise<boolean> {
  let calls = 0;
  await withRetry(
    async () => {
      calls += 1;
      throw error;
    },
    2,
    1
  ).catch(() => undefined);
  return calls > 1;
}
