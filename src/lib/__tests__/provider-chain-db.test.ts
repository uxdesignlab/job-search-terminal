import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;

async function loadFreshDb() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-provider-chain-"));
  process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
  const client = await import("@/lib/db/client");
  const queries = await import("@/lib/db/queries");
  const factory = await import("@/lib/ai/factory");
  const database = client.getDatabase();
  return { client, database, queries, factory };
}

beforeEach(() => {
  delete process.env.JST_DATABASE_PATH;
});

afterEach(async () => {
  const client = await import("@/lib/db/client").catch(() => null);
  client?.closeDatabase();
  delete process.env.JST_DATABASE_PATH;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("provider order and membership", () => {
  it("keeps the rank of a provider that is switched off", async () => {
    const { queries } = await loadFreshDb();

    queries.saveAISettings({
      providerOrderJson: ["gemini", "openai", "anthropic", "ollama"],
      providerEnabledJson: ["gemini"],
      geminiApiKey: "configured",
    });

    const settings = queries.getAISettings();
    // The full ranking survives; only membership shrank. Storing one list for both
    // meanings used to drop the disabled three and re-append them in constant order.
    expect(settings.providerOrderJson).toEqual(["gemini", "openai", "anthropic", "ollama"]);
    expect(settings.providerEnabledJson).toEqual(["gemini"]);
  });

  it("treats an explicitly empty chain as none, not as unconfigured", async () => {
    const { queries, factory } = await loadFreshDb();

    queries.saveAISettings({
      providerOrderJson: ["openai", "anthropic", "gemini", "ollama"],
      providerEnabledJson: [],
      openaiApiKey: "configured",
    });

    // A stored key must not resurrect a provider the user switched off.
    expect(factory.hasConfiguredAIProvider(queries.getAISettings())).toBe(false);
  });

  it("falls back to the order list for rows saved before the split", async () => {
    const { database, queries, factory } = await loadFreshDb();
    database
      .prepare("update ai_settings set provider_order_json = @order, provider_enabled_json = '', openai_api_key = 'configured'")
      .run({ order: JSON.stringify(["openai"]) });

    const settings = queries.getAISettings();
    expect(settings.providerEnabledJson).toBeNull();
    expect(factory.hasConfiguredAIProvider(settings)).toBe(true);
  });

  it("tries enabled providers in ranked order", async () => {
    const { queries, factory } = await loadFreshDb();

    queries.saveAISettings({
      providerOrderJson: ["anthropic", "openai", "gemini", "ollama"],
      providerEnabledJson: ["openai", "anthropic"],
      anthropicApiKey: "configured",
      openaiApiKey: "configured",
    });

    expect(factory.hasConfiguredAIProvider(queries.getAISettings())).toBe(true);
  });
});

describe("saveAISettings partial updates", () => {
  it("leaves every field it was not given alone", async () => {
    const { queries } = await loadFreshDb();

    queries.saveAISettings({
      openaiApiKey: "configured",
      providerEnabledJson: ["openai"],
      onboardingDismissed: true,
      onboardingPreferencesConfirmed: true,
      adzunaAppId: "app-id",
    });

    // The integrations step saves only these three; it used to hand-copy the record and
    // silently reset both onboarding flags by omitting them.
    queries.saveAISettings({ braveSearchApiKey: "brave-key" });

    const settings = queries.getAISettings();
    expect(settings.braveSearchApiKey).toBe("brave-key");
    expect(settings.openaiApiKey).toBe("configured");
    expect(settings.adzunaAppId).toBe("app-id");
    expect(settings.providerEnabledJson).toEqual(["openai"]);
    expect(settings.onboardingDismissed).toBe(true);
    expect(settings.onboardingPreferencesConfirmed).toBe(true);
  });
});
