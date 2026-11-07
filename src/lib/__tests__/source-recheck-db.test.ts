import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;

async function loadFreshDb() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-source-recheck-"));
  process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
  const client = await import("@/lib/db/client");
  const queries = await import("@/lib/db/queries");
  return { database: client.getDatabase(), queries };
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

describe("getLatestScanErrorsBySource", () => {
  it("returns the newest error per source across runs and skips malformed blobs", async () => {
    const { database, queries } = await loadFreshDb();
    const insert = database.prepare(
      `insert into scan_runs (id, status, started_at, completed_at, errors_json) values (?, 'completed', ?, ?, ?)`,
    );
    insert.run("a", "2026-10-01T00:00:00Z", "2026-10-01T00:01:00Z", JSON.stringify([{ company: "Acme", error: "HTTP 502" }]));
    insert.run(
      "b",
      "2026-10-05T00:00:00Z",
      "2026-10-05T00:01:00Z",
      JSON.stringify([{ company: "Acme", error: "HTTP 404" }, { company: "Beta", error: "fetch failed" }]),
    );
    insert.run("c", "2026-10-06T00:00:00Z", "2026-10-06T00:01:00Z", "{not json");

    const errors = queries.getLatestScanErrorsBySource();
    expect(errors.get("Acme")).toEqual({ error: "HTTP 404", at: "2026-10-05T00:00:00Z" });
    expect(errors.get("Beta")).toEqual({ error: "fetch failed", at: "2026-10-05T00:00:00Z" });
  });
});

describe("source re-check results", () => {
  it("keeps only the newest verdict and forgets it when the source is removed", async () => {
    const { queries } = await loadFreshDb();
    queries.addCustomScanSource("Acme", "https://boards.greenhouse.io/acme", "");
    queries.recordSourceRecheckResults([
      { name: "Acme", status: "unknown", jobCount: null, error: "HTTP 503", checkedAt: "2026-11-01T00:00:00Z" },
    ]);
    queries.recordSourceRecheckResults([{ name: "Acme", status: "valid", jobCount: 4, checkedAt: "2026-11-02T00:00:00Z" }]);

    expect(queries.getSourceRecheckResults().get("Acme")).toEqual({
      name: "Acme",
      status: "valid",
      jobCount: 4,
      checkedAt: "2026-11-02T00:00:00Z",
    });

    queries.deleteCustomScanSource("Acme");
    expect(queries.getSourceRecheckResults().has("Acme")).toBe(false);
  });
});
