import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;

async function loadFreshDb() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-profile-readiness-"));
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

describe("profile work-mode state", () => {
  it("does not treat an inferred compatibility mode as an explicit selection", async () => {
    const { database, queries } = await loadFreshDb();
    database.prepare(
      "update user_profile set work_modes_json = '[]', work_preferences_json = '[]', remote_preference = 'all'"
    ).run();

    const profile = queries.getUserProfile();

    expect(profile.workModes).toEqual(["onsite"]);
    expect(profile.hasExplicitWorkModes).toBe(false);
  });

  it("recognizes a saved work-mode selection", async () => {
    const { database, queries } = await loadFreshDb();
    database.prepare("update user_profile set work_modes_json = '[\"remote\"]'").run();

    const profile = queries.getUserProfile();

    expect(profile.workModes).toEqual(["remote"]);
    expect(profile.hasExplicitWorkModes).toBe(true);
  });
});
