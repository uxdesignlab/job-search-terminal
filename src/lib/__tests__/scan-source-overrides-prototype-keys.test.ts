import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;

async function loadFreshDb() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-source-overrides-"));
  process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
  const client = await import("@/lib/db/client");
  const queries = await import("@/lib/db/queries");
  client.getDatabase();
  return { client, queries };
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

// Constructor (constructor.io) is a real tracked source, so "constructor" is a
// real source name. Keyed on a plain object it resolves through
// Object.prototype and returns a function instead of a boolean.
describe("scan source overrides with prototype-shaped names", () => {
  it("reports no override for a source named 'constructor' until one is set", async () => {
    const { queries } = await loadFreshDb();

    const overrides = queries.getScanSourceOverrides();

    expect(Object.getPrototypeOf(overrides)).toBeNull();
    expect(Object.hasOwn(overrides, "constructor")).toBe(false);
    expect(overrides["constructor"]).toBeUndefined();
  });

  it("round-trips an enabled flag for prototype-shaped source names", async () => {
    const { queries } = await loadFreshDb();

    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      queries.setScanSourceEnabled(name, false);
      expect(queries.getScanSourceOverrides()[name]).toBe(false);

      queries.setScanSourceEnabled(name, true);
      expect(queries.getScanSourceOverrides()[name]).toBe(true);
    }
  });
});
