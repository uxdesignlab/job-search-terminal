import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let directory: string;
let client: typeof import("@/lib/db/client");
let q: typeof import("@/lib/db/queries");
beforeEach(async () => {
  vi.resetModules();
  directory = mkdtempSync(path.join(os.tmpdir(), "jst-cleanup-test-"));
  process.env.JST_DATABASE_PATH = path.join(directory, "test.sqlite");
  client = await import("@/lib/db/client"); q = await import("@/lib/db/queries");
  q.insertScannedJobs([{ id: "cleanup-test", company: "Acme", title: "Director", url: "https://example.com/jobs/1", source: "greenhouse-api", location: "Remote", datePosted: null, firstSeenDate: "2020-01-01" }]);
  // Test fixtures only: never backdate a real user's jobs.
  client.getDatabase().prepare("update jobs set created_at = datetime('now', '-40 days') where id = 'cleanup-test'").run();
});
afterEach(() => { client.closeDatabase(); delete process.env.JST_DATABASE_PATH; rmSync(directory, { recursive: true, force: true }); });
const id = "cleanup-test";
function verified(status = "uncertain") { q.saveJobLiveness(id, status, "Test evidence", "https://example.com/jobs/1"); }
describe("transactional job cleanup", () => {
  it("archives uncertain old jobs, records why, preserves dedup and restores with permanent protection", () => {
    verified();
    expect(q.archiveCleanupCandidates([id, id]).archivedIds).toEqual([id]);
    expect(q.getJobById(id)).toMatchObject({ archived: true, cleanupArchiveReason: "old_unverified", livenessStatus: "uncertain" });
    expect(q.getJobDedupKeys().openIds.has(id)).toBe(true);
    expect(q.archiveCleanupCandidates([id]).archived).toBe(0);
    q.unarchiveJob(id);
    expect(q.getJobById(id)?.userActivityAt).toBeTruthy();
    expect(q.archiveCleanupCandidates([id]).archived).toBe(0);
  });
  it("never archives without new verification, or with an active verdict", () => {
    expect(q.archiveCleanupCandidates([id]).archived).toBe(0);
    verified("active"); expect(q.archiveCleanupCandidates([id]).archived).toBe(0);
  });
  it("protects newly saved jobs even if their posting date is old", () => {
    client.getDatabase().prepare("update jobs set created_at = current_timestamp where id = ?").run(id);
    verified("expired"); expect(q.archiveCleanupCandidates([id]).archived).toBe(0);
  });
  it.each(["Reviewed", "Applied", "Rejected", "Interviewing", "Skipped", "Resume generated"])("keeps %s after preview and even after returning to Found", (status) => {
    verified(); q.updateJobStatus(id, status); q.updateJobStatus(id, "Found");
    expect(q.archiveCleanupCandidates([id]).archived).toBe(0);
  });
  it("rechecks edits between preview and archive", () => {
    verified(); q.updateJobDetails(id, { title: "Edited" });
    expect(q.archiveCleanupCandidates([id]).skipped[0].id).toBe(id);
  });
  it("keeps opening and verification non-protective", () => {
    expect(q.getJobById(id)?.userActivityAt).toBe("");
    verified(); expect(q.getJobById(id)?.userActivityAt).toBe("");
    expect(q.archiveCleanupCandidates([id]).archived).toBe(1);
  });
  it("backfills historical manual edits but not old liveness events", () => {
    const db = client.getDatabase();
    db.prepare("insert into activity_log values ('legacy', 'job', ?, 'Job details updated manually', current_timestamp, '{}')").run(id);
    expect(q.getJobById(id)?.userActivityAt).toBeTruthy();
  });
  it("backfills saved work even with Found status", () => {
    client.getDatabase().prepare("insert into application_answer_drafts (id, job_id, question, answer, source, sort_order) values ('draft', ?, 'Question', 'Answer', 'manual', 0)").run(id);
    expect(q.getJobById(id)?.userActivityAt).toBeTruthy();
  });
  it("protects posting resolution and manual additions", () => {
    q.updateJobPostingResolution(id, { url: "https://example.com/jobs/2" });
    verified(); expect(q.archiveCleanupCandidates([id]).archived).toBe(0);
    q.insertManualJob({ id: "manual-test", title: "Role", company: "Acme", url: "https://example.com/manual", rawDescription: "", datePosted: null, firstSeenDate: "2026-09-18" });
    expect(q.getJobById("manual-test")?.userActivityAt).toBeTruthy();
  });
  it("reports removed IDs and rolls back an archive batch on failure", () => {
    verified();
    expect(q.archiveCleanupCandidates(["missing"]).skipped[0].id).toBe("missing");
    client.getDatabase().exec("create trigger fail_cleanup_log before insert on activity_log when new.action = 'Cleanup archived' begin select raise(abort, 'test failure'); end;");
    expect(() => q.archiveCleanupCandidates([id])).toThrow("test failure");
    expect(q.getJobById(id)?.archived).toBe(false);
  });
});
