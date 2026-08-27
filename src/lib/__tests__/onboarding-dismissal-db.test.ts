import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;

async function loadFreshDb() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-onboarding-dismissal-"));
  process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
  const client = await import("@/lib/db/client");
  const queries = await import("@/lib/db/queries");
  const database = client.getDatabase();
  return { client, database, queries };
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

describe("onboarding dismissal", () => {
  /** Every resume upload calls setOnboardingPreferencesConfirmed(false). It used to
   *  clear onboarding_dismissed in the same statement, so replacing a resume years
   *  into a search reopened the full first-run wizard over the dashboard. */
  it("survives a preferences re-confirmation prompt", async () => {
    const { database, queries } = await loadFreshDb();
    database.prepare("update ai_settings set onboarding_dismissed = 1").run();

    queries.setOnboardingPreferencesConfirmed(false);

    const settings = queries.getAISettings();
    expect(settings.onboardingDismissed).toBe(true);
    expect(settings.onboardingPreferencesConfirmed).toBe(false);
  });

  it("still records the confirmation state it was given", async () => {
    const { queries } = await loadFreshDb();

    queries.setOnboardingPreferencesConfirmed(true);
    expect(queries.getAISettings().onboardingPreferencesConfirmed).toBe(true);

    queries.setOnboardingPreferencesConfirmed(false);
    expect(queries.getAISettings().onboardingPreferencesConfirmed).toBe(false);
  });

  it("leaves an undismissed wizard undismissed", async () => {
    const { queries } = await loadFreshDb();

    queries.setOnboardingPreferencesConfirmed(false);

    expect(queries.getAISettings().onboardingDismissed).toBe(false);
  });
});
