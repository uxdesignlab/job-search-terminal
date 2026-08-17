import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gapEvidenceId, GAP_EVIDENCE_TAG } from "@/lib/gaps/evidence-id";

let tempDir: string | null = null;

async function loadFreshDb() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-gap-evidence-"));
  process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
  const client = await import("@/lib/db/client");
  const queries = await import("@/lib/db/queries");
  client.getDatabase();
  return { client, queries };
}

const PEOPLE_GAP = "No explicit evidence of direct people management for product designers.";
const NONPROFIT_GAP = "No nonprofit, fundraising, or social-impact product experience is stated.";

function seedJobsAndEvaluations(
  db: ReturnType<Awaited<ReturnType<typeof loadFreshDb>>["client"]["getDatabase"]>,
) {
  const insertJob = db.prepare(
    `insert into jobs (
      id, company, title, url, source, location, remote_type, first_seen_date,
      freshness_label, raw_description, parsed_description, status, fit_score,
      role_archetype, recommendation, summary, why_it_matches, main_concern,
      recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
      gaps_json, red_flags_json
    ) values (
      @id, @company, @title, @url, 'manual', 'Remote', 'remote', '2026-07-01',
      'fresh', '', '', 'Found', 80,
      '', '', '', '', '', '', '', '[]', '[]', '[]', '[]'
    )`
  );
  insertJob.run({ id: "job-a", company: "Acme", title: "Design Director", url: "https://example.com/a" });
  insertJob.run({ id: "job-b", company: "Beta", title: "VP of Design", url: "https://example.com/b" });

  const insertEvaluation = db.prepare(
    `insert into evaluations (
      id, job_id, fit_score, score_label, role_archetype, summary, strengths_json,
      gaps_json, red_flags_json, recommendation, resume_base_recommendation,
      requirement_match_json, resume_evidence_json
    ) values (
      @id, @jobId, 80, 'Strong', 'Design leadership', '', '[]',
      @gapsJson, @redFlagsJson, 'Apply', '', '[]', '[]'
    )`
  );
  // The people-management gap recurs across both roles; the nonprofit one is a one-off.
  insertEvaluation.run({
    id: "eval-a", jobId: "job-a",
    gapsJson: JSON.stringify([PEOPLE_GAP]),
    redFlagsJson: JSON.stringify([NONPROFIT_GAP]),
  });
  insertEvaluation.run({
    id: "eval-b", jobId: "job-b",
    gapsJson: JSON.stringify([PEOPLE_GAP]),
    redFlagsJson: JSON.stringify([]),
  });
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

describe("global gap evidence bank", () => {
  it("collects every gap raised across the pipeline with the roles that raised it", async () => {
    const { client, queries } = await loadFreshDb();
    seedJobsAndEvaluations(client.getDatabase());

    const backlog = queries.getGapEvidenceBacklog();
    const people = backlog.find((entry) => entry.gapText === PEOPLE_GAP);
    const nonprofit = backlog.find((entry) => entry.gapText === NONPROFIT_GAP);

    expect(people?.status).toBe("unanswered");
    expect(people?.jobs.map((job) => job.id).sort()).toEqual(["job-a", "job-b"]);
    // Red flags are answerable gaps too — they carry the same "Needs detail" chip.
    expect(nonprofit?.jobs.map((job) => job.id)).toEqual(["job-a"]);
  });

  it("counts only recurring gaps as worth answering centrally", async () => {
    const { client, queries } = await loadFreshDb();
    seedJobsAndEvaluations(client.getDatabase());

    const counts = queries.getGapEvidenceCounts();

    // Both are unanswered, but only the people-management gap recurs.
    expect(counts.totalUnanswered).toBe(2);
    expect(counts.recurringUnanswered).toBe(1);
    expect(counts.needsDetail).toBe(0);
    expect(counts.addressed).toBe(0);
  });

  it("surfaces a half-finished answer in the backlog instead of stranding it on one job", async () => {
    const { client, queries } = await loadFreshDb();
    seedJobsAndEvaluations(client.getDatabase());

    queries.saveProfileSupplement({
      id: gapEvidenceId(PEOPLE_GAP),
      content: "I have managed designers.",
      tags: [GAP_EVIDENCE_TAG, PEOPLE_GAP],
      qualityStatus: "needs_followup",
      followUpQuestion: "How many designers, at which company, and for how long?",
    });

    const entry = queries.getGapEvidenceBacklog().find((item) => item.gapText === PEOPLE_GAP);

    expect(entry?.status).toBe("needs_followup");
    expect(entry?.followUpQuestion).toContain("How many designers");
    expect(queries.getGapEvidenceCounts().needsDetail).toBe(1);
  });

  it("keeps answers written before evidence went global", async () => {
    const { client, queries } = await loadFreshDb();
    seedJobsAndEvaluations(client.getDatabase());

    // A job-level answer with no matching supplement — the pre-global shape.
    queries.saveJobGapResponse({
      id: "gap-job-a-legacy",
      jobId: "job-a",
      gapText: PEOPLE_GAP,
      rawResponse: "Managed six designers at Acme for three years.",
      polishedResponse: "",
      qualityStatus: "addressed",
    });

    const entry = queries.getGapEvidenceBacklog().find((item) => item.gapText === PEOPLE_GAP);

    expect(entry?.status).toBe("addressed");
    expect(entry?.content).toContain("six designers");
  });
});

describe("resolving a job's gap answers against the bank", () => {
  it("auto-fills a gap this job never answered from the global bank", async () => {
    const { client, queries } = await loadFreshDb();
    seedJobsAndEvaluations(client.getDatabase());

    queries.saveProfileSupplement({
      id: gapEvidenceId(PEOPLE_GAP),
      content: "Managed six product designers at Acme for three years.",
      tags: [GAP_EVIDENCE_TAG, PEOPLE_GAP],
      qualityStatus: "addressed",
    });

    const resolved = queries.getResolvedJobGapResponses("job-b", [PEOPLE_GAP]);

    expect(resolved[PEOPLE_GAP].fromBank).toBe(true);
    expect(resolved[PEOPLE_GAP].qualityStatus).toBe("addressed");
    expect(resolved[PEOPLE_GAP].rawResponse).toContain("six product designers");
  });

  it("keeps a job-specific answer instead of the bank's", async () => {
    const { client, queries } = await loadFreshDb();
    seedJobsAndEvaluations(client.getDatabase());

    queries.saveProfileSupplement({
      id: gapEvidenceId(PEOPLE_GAP),
      content: "Generic bank answer.",
      tags: [GAP_EVIDENCE_TAG, PEOPLE_GAP],
      qualityStatus: "addressed",
    });
    queries.saveJobGapResponse({
      id: "gap-job-b-specific",
      jobId: "job-b",
      gapText: PEOPLE_GAP,
      rawResponse: "Answer tailored to this role.",
      polishedResponse: "",
      qualityStatus: "addressed",
    });

    const resolved = queries.getResolvedJobGapResponses("job-b", [PEOPLE_GAP]);

    expect(resolved[PEOPLE_GAP].fromBank).toBe(false);
    expect(resolved[PEOPLE_GAP].rawResponse).toBe("Answer tailored to this role.");
  });

  it("lets a finished bank answer replace an unfinished job-level draft", async () => {
    const { client, queries } = await loadFreshDb();
    seedJobsAndEvaluations(client.getDatabase());

    queries.saveJobGapResponse({
      id: "gap-job-b-thin",
      jobId: "job-b",
      gapText: PEOPLE_GAP,
      rawResponse: "I have managed designers.",
      polishedResponse: "",
      qualityStatus: "needs_followup",
      followUpQuestion: "How many, and where?",
    });
    queries.saveProfileSupplement({
      id: gapEvidenceId(PEOPLE_GAP),
      content: "Managed six product designers at Acme for three years, cutting cycle time 30%.",
      tags: [GAP_EVIDENCE_TAG, PEOPLE_GAP],
      qualityStatus: "addressed",
    });

    const resolved = queries.getResolvedJobGapResponses("job-b", [PEOPLE_GAP]);

    expect(resolved[PEOPLE_GAP].fromBank).toBe(true);
    expect(resolved[PEOPLE_GAP].qualityStatus).toBe("addressed");
  });

  it("does not replace an unfinished job draft with an equally unfinished bank answer", async () => {
    const { client, queries } = await loadFreshDb();
    seedJobsAndEvaluations(client.getDatabase());

    queries.saveJobGapResponse({
      id: "gap-job-b-thin",
      jobId: "job-b",
      gapText: PEOPLE_GAP,
      rawResponse: "Job-level draft in progress.",
      polishedResponse: "",
      qualityStatus: "needs_followup",
    });
    queries.saveProfileSupplement({
      id: gapEvidenceId(PEOPLE_GAP),
      content: "Bank draft in progress.",
      tags: [GAP_EVIDENCE_TAG, PEOPLE_GAP],
      qualityStatus: "needs_followup",
    });

    const resolved = queries.getResolvedJobGapResponses("job-b", [PEOPLE_GAP]);

    expect(resolved[PEOPLE_GAP].fromBank).toBe(false);
    expect(resolved[PEOPLE_GAP].rawResponse).toBe("Job-level draft in progress.");
  });
});
