import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;
let queries: typeof import("@/lib/db/queries");

describe("integration metadata", () => {
  beforeEach(async () => {
    vi.resetModules();
    tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-integration-"));
    process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
    const client = await import("@/lib/db/client");
    queries = await import("@/lib/db/queries");
    client.getDatabase();
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
    delete process.env.JST_DATABASE_PATH;
  });

  it("keeps settings stored beside the connection when a test result is recorded", () => {
    // Testing a connection reports workspace and user ids and knows nothing about
    // the enrichment routine saved next to them. Writing its metadata wholesale
    // switched enrichment off every time the user clicked Test connection.
    queries.saveIntegrationCredential({ provider: "clay", credential: "clay_scoped_key" });
    queries.saveIntegrationMetadata("clay", { enrichmentRoutineId: "routine-123", autoEnrichSearchResults: true });

    queries.saveIntegrationTestResult({
      provider: "clay",
      status: "connected",
      accountLabel: "Workspace",
      metadata: { workspaceId: "ws-1", userId: "user-1" },
    });

    const metadata = queries.getIntegration("clay")?.metadata as Record<string, unknown>;
    expect(metadata.enrichmentRoutineId).toBe("routine-123");
    expect(metadata.autoEnrichSearchResults).toBe(true);
    expect(metadata.workspaceId).toBe("ws-1");
  });

  it("lets a later test result replace the connection facts it does own", () => {
    queries.saveIntegrationCredential({ provider: "clay", credential: "clay_scoped_key" });
    queries.saveIntegrationTestResult({ provider: "clay", status: "connected", metadata: { workspaceId: "ws-1" } });
    queries.saveIntegrationTestResult({ provider: "clay", status: "connected", metadata: { workspaceId: "ws-2" } });

    expect((queries.getIntegration("clay")?.metadata as Record<string, unknown>).workspaceId).toBe("ws-2");
  });

  it("leaves metadata untouched when a test reports none", () => {
    queries.saveIntegrationCredential({ provider: "clay", credential: "clay_scoped_key" });
    queries.saveIntegrationMetadata("clay", { enrichmentRoutineId: "routine-123" });

    queries.saveIntegrationTestResult({ provider: "clay", status: "invalid_credential" });

    expect((queries.getIntegration("clay")?.metadata as Record<string, unknown>).enrichmentRoutineId).toBe("routine-123");
  });
});
