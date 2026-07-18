import { describe, expect, it } from "vitest";
import { hasConfiguredAIProvider } from "@/lib/ai/factory";
import type { AISettingsRecord } from "@/lib/db/types";

const BASE_SETTINGS: AISettingsRecord = {
  id: "singleton",
  activeProvider: "openai",
  anthropicApiKey: "",
  geminiApiKey: "",
  openaiApiKey: "",
  anthropicModel: "claude-sonnet-4-6",
  geminiModel: "gemini-2.5-flash",
  openaiModel: "gpt-5.4-mini",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
  fallbackProvider: "",
  providerOrderJson: ["openai", "anthropic", "gemini"],
  onboardingDismissed: false,
  onboardingPreferencesConfirmed: false,
  braveSearchApiKey: "",
  adzunaAppId: "",
  adzunaApiKey: "",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

describe("hasConfiguredAIProvider", () => {
  it("accepts a credential in the enabled provider chain", () => {
    expect(hasConfiguredAIProvider({ ...BASE_SETTINGS, openaiApiKey: "configured" })).toBe(true);
  });

  it("does not report readiness for a credential outside the enabled chain", () => {
    expect(hasConfiguredAIProvider({ ...BASE_SETTINGS, anthropicApiKey: "configured", providerOrderJson: ["openai"] })).toBe(false);
  });

  it("accepts Ollama when it is enabled in the provider chain", () => {
    expect(hasConfiguredAIProvider({ ...BASE_SETTINGS, providerOrderJson: ["ollama"] })).toBe(true);
  });
});
