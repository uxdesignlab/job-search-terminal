import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;

async function loadFreshDb() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-source-check-"));
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

/** Minimal scan_runs row — only the columns getLastSourceCheckAt used to read. */
type TestDatabase = Awaited<ReturnType<typeof loadFreshDb>>["database"];

function insertCareerOpsRun(
  database: TestDatabase,
  id: string,
  startedAt: string,
  companiesScanned: number,
) {
  database
    .prepare(
      `insert into scan_runs (id, status, started_at, completed_at, companies_scanned, scan_type)
       values (?, 'completed', ?, ?, ?, 'careerops')`,
    )
    .run(id, startedAt, startedAt, companiesScanned);
}

describe("source check runs", () => {
  it("reports nothing until a check has actually run", async () => {
    const { queries } = await loadFreshDb();
    expect(queries.getLastSourceCheckAt()).toBeUndefined();
    expect(queries.getLatestSourceCheckRun()).toBeUndefined();
  });

  /** The bug this table exists to fix. "Last source check" read the newest CareerOps
   *  run, but CareerOps is the scheduled discovery lane — so the label reported a
   *  fresh check on a source list nobody had validated in months. */
  it("is not moved by a job scan", async () => {
    const { database, queries } = await loadFreshDb();
    insertCareerOpsRun(database, "scan-1", "2026-08-29T11:59:08.838Z", 2704);

    expect(queries.getLastSourceCheckAt()).toBeUndefined();
  });

  /** A single-source check also persists a CareerOps run, which used to reset the
   *  clock on the whole list after checking exactly one board. */
  it("is not moved by a single-source scan either", async () => {
    const { database, queries } = await loadFreshDb();
    queries.recordSourceCheckRun({
      startedAt: "2026-05-19T12:00:00.000Z",
      completedAt: "2026-05-19T12:04:00.000Z",
      results: [{ name: "Acme", status: "valid", jobCount: 12 }],
    });
    insertCareerOpsRun(database, "scan-2", "2026-08-29T11:59:08.838Z", 1);

    expect(queries.getLastSourceCheckAt()).toBe("2026-05-19T12:04:00.000Z");
  });

  it("counts the verdicts itself rather than trusting the caller", async () => {
    const { queries } = await loadFreshDb();
    const run = queries.recordSourceCheckRun({
      startedAt: "2026-08-27T12:00:00.000Z",
      results: [
        { name: "Acme", status: "valid", jobCount: 12 },
        { name: "Globex", status: "valid", jobCount: 0 },
        { name: "Initech", status: "dead", jobCount: null, error: "404" },
        { name: "Umbrella", status: "unknown", jobCount: null, error: "timeout" },
      ],
    });

    expect(run.sourcesChecked).toBe(4);
    expect(run.validCount).toBe(2);
    expect(run.deadCount).toBe(1);
    expect(run.unknownCount).toBe(1);
  });

  it("returns the newest check and its per-source verdicts", async () => {
    const { queries } = await loadFreshDb();
    queries.recordSourceCheckRun({
      startedAt: "2026-05-19T12:00:00.000Z",
      completedAt: "2026-05-19T12:04:00.000Z",
      results: [{ name: "Acme", status: "dead", jobCount: null, error: "404" }],
    });
    queries.recordSourceCheckRun({
      startedAt: "2026-08-27T12:00:00.000Z",
      completedAt: "2026-08-27T12:06:00.000Z",
      results: [{ name: "Acme", status: "valid", jobCount: 12 }],
    });

    const latest = queries.getLatestSourceCheckRun();
    expect(latest?.completedAt).toBe("2026-08-27T12:06:00.000Z");
    // Round-tripped through JSON, because the Sources table renders these directly.
    expect(latest?.results).toEqual([{ name: "Acme", status: "valid", jobCount: 12 }]);
  });

  it("survives a corrupt results blob without losing the timestamp", async () => {
    const { database, queries } = await loadFreshDb();
    queries.recordSourceCheckRun({
      startedAt: "2026-08-27T12:00:00.000Z",
      completedAt: "2026-08-27T12:06:00.000Z",
      results: [{ name: "Acme", status: "valid", jobCount: 12 }],
    });
    database.prepare("update source_check_runs set results_json = '{not json'").run();

    const latest = queries.getLatestSourceCheckRun();
    expect(latest?.completedAt).toBe("2026-08-27T12:06:00.000Z");
    expect(latest?.results).toEqual([]);
  });
});
