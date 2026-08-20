import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;
let queries: typeof import("@/lib/db/queries");

const provider = (overrides: Record<string, unknown> = {}) => ({
  id: "contact-dana",
  name: "Dana Reeve",
  firstName: "Dana",
  lastName: "Reeve",
  title: "Director of Design",
  company: "Acme",
  companyDomain: "acme.com",
  linkedinUrl: "https://linkedin.com/in/danareeve",
  workEmail: "",
  sourceProvider: "clay",
  sourceRecordId: "clay-1",
  profileConfidence: "high",
  emailConfidence: "unverified",
  notes: "",
  ...overrides,
});

describe("contact notes survive a provider refresh", () => {
  beforeEach(async () => {
    vi.resetModules();
    tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-contact-notes-"));
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

  it("keeps notes the user wrote when the provider record carries none", () => {
    // Clay returns no notes, and the discovery action saves with notes: "" — so
    // an unconditional assignment erased the user's own writing, which nothing in
    // the app can recover.
    const saved = queries.saveContact(provider({ notes: "Met at a conference. Warm intro via Sam." }) as never);
    queries.saveContact({ ...provider(), id: saved.id, workEmail: "dana@acme.com" } as never);

    const refreshed = queries.getContact(saved.id)!;
    expect(refreshed.notes).toBe("Met at a conference. Warm intro via Sam.");
    expect(refreshed.workEmail).toBe("dana@acme.com");
  });

  it("still lets the user replace their own notes", () => {
    const saved = queries.saveContact(provider({ notes: "First pass." }) as never);
    queries.saveContact({ ...provider(), id: saved.id, notes: "Rewritten after the call." } as never);

    expect(queries.getContact(saved.id)!.notes).toBe("Rewritten after the call.");
  });
});
