import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "@/lib/ai/ollama";

/** Answers the OpenAI-compatible `/v1/models` call the provider makes. */
function stubInstalledModels(models: string[]) {
  vi.stubGlobal("fetch", async () =>
    new Response(
      JSON.stringify({ object: "list", data: models.map((id) => ({ id, object: "model" })) }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Ollama connection test", () => {
  /**
   * The bug this covers: the test reported `ok: true` whenever the server answered,
   * displaying the server's *first* model when the configured one was absent. So
   * onboarding showed "Verified" against a model the app would never use, the step went
   * green, and the first real request failed with a bare 404 during profile extraction —
   * two steps away from the screen that could fix it.
   */
  it("fails when the configured model is not installed", async () => {
    stubInstalledModels(["llama3.2:latest", "gemma4:12b-mlx"]);
    const provider = new OllamaProvider({ apiKey: "ollama", model: "llama3.1:8b" });

    const result = await provider.testConnection();

    expect(result.ok).toBe(false);
    // Names the model that is missing and what to run, not a placeholder.
    expect(result.error).toContain("llama3.1:8b");
    expect(result.error).toContain("ollama pull llama3.1:8b");
    // And says what is actually there, so the fix is one glance away.
    expect(result.error).toContain("llama3.2:latest");
  });

  it("reports the configured model on success, not the server's first one", async () => {
    stubInstalledModels(["llama3.2:latest", "gemma4:12b-mlx"]);
    const provider = new OllamaProvider({ apiKey: "ollama", model: "gemma4:12b-mlx" });

    const result = await provider.testConnection();

    expect(result.ok).toBe(true);
    expect(result.model).toBe("gemma4:12b-mlx");
  });

  it("says so when no models are installed at all", async () => {
    stubInstalledModels([]);
    const provider = new OllamaProvider({ apiKey: "ollama", model: "llama3.1:8b" });

    const result = await provider.testConnection();

    expect(result.ok).toBe(false);
    expect(result.error).toContain("No models are installed");
  });
});
