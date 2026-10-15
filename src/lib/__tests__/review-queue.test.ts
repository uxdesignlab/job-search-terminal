import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempDir: string | null = null;
let queries: typeof import("@/lib/db/queries");

const LONG = "A full description of the role. ".repeat(6);

beforeEach(async () => {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-review-queue-"));
  process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
  const client = await import("@/lib/db/client");
  queries = await import("@/lib/db/queries");
  const db = client.getDatabase();
  const insert = db.prepare(
    `insert into jobs (
      id, company, title, url, source, location, remote_type, first_seen_date, freshness_label,
      raw_description, parsed_description, status, fit_score, role_archetype, recommendation, summary,
      why_it_matches, main_concern, recommended_resume, salary_notes, requirement_match_json,
      resume_evidence_json, gaps_json, red_flags_json, review_status, posting_resolution_status
    ) values (
      @id, 'Acme', @title, @url, 'linkedin', 'Remote', 'remote', @seen, 'fresh',
      'short', 'short', 'Found', 0, '', '', '', '', '', '', '', '[]', '[]', '[]', '[]',
      @review, @resolution
    )`
  );
  insert.run({ id: "short", title: "Short one", url: "https://example.com/1", seen: "2026-10-01", review: "pending_review", resolution: "" });
  insert.run({ id: "board", title: "Board only", url: "https://example.com/2", seen: "2026-10-02", review: "pending_review", resolution: "needs_resolution" });
  insert.run({ id: "fine", title: "Fine", url: "https://example.com/3", seen: "2026-10-03", review: "none", resolution: "" });
});

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  delete process.env.JST_DATABASE_PATH;
});

describe("review queue", () => {
  it("lists pending jobs newest first with the reason each is there", () => {
    expect(queries.getReviewQueueJobs()).toEqual([
      { id: "board", company: "Acme", title: "Board only", reason: "Posting not found yet" },
      { id: "short", company: "Acme", title: "Short one", reason: "Short or missing description" },
    ]);
    expect(queries.getReviewQueueCount()).toBe(2);
  });

  it("drops archived jobs and jobs marked reviewed", () => {
    queries.archiveJob("short");
    queries.setJobReviewStatus("board", "none");
    expect(queries.getReviewQueueJobs()).toEqual([]);
  });

  it("clears the flag once a full description is saved", () => {
    queries.saveJobDescription("short", LONG);
    expect(queries.getReviewQueueJobs().map((job) => job.id)).toEqual(["board"]);
  });

  it("keeps the flag when the saved description is still short", () => {
    queries.saveJobDescription("short", "Still too short.");
    expect(queries.getReviewQueueJobs().map((job) => job.id)).toContain("short");
  });

  it("keeps a board-only job queued until its posting is resolved", () => {
    queries.saveJobDescription("board", LONG);
    queries.updateJobDetails("board", { rawDescription: LONG });
    expect(queries.getReviewQueueJobs().map((job) => job.id)).toContain("board");
  });

  it("clears the flag when Edit job details saves a full description", () => {
    queries.updateJobDetails("short", { rawDescription: LONG });
    expect(queries.getReviewQueueJobs().map((job) => job.id)).toEqual(["board"]);
  });
});
