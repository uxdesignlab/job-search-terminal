import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationPreparationInput } from "@/lib/db/types";
import { suggestCompensationResponse } from "@/lib/application-preparation/compensation";

let tempDir: string | null = null;

async function loadFreshDb() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-prep-comp-"));
  process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
  const client = await import("@/lib/db/client");
  const queries = await import("@/lib/db/queries");
  client.getDatabase().prepare(
    `insert into jobs (
      id, company, title, url, source, location, remote_type, first_seen_date,
      freshness_label, raw_description, parsed_description, status, fit_score,
      role_archetype, recommendation, summary, why_it_matches, main_concern,
      recommended_resume, salary_notes, requirement_match_json, resume_evidence_json,
      gaps_json, red_flags_json
    ) values (
      'job-a', 'Acme', 'Design Director', 'https://example.com/a', 'manual', 'Remote',
      'remote', '2026-07-01', 'fresh', '', '', 'Found', 80, '', '', '', '', '', '', '',
      '[]', '[]', '[]', '[]'
    )`
  ).run();
  return { client, queries };
}

afterEach(async () => {
  const client = await import("@/lib/db/client").catch(() => null);
  client?.closeDatabase();
  delete process.env.JST_DATABASE_PATH;
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function preparation(overrides: Partial<ApplicationPreparationInput>): ApplicationPreparationInput {
  return {
    id: "preparation-job-a",
    jobId: "job-a",
    evaluationId: "evaluation-a",
    status: "ready",
    jdHash: "jd-1",
    evidenceHash: "ev-1",
    requirements: [],
    keywordSignals: [],
    evidenceMap: [],
    postedCompensation: null,
    marketCompensation: null,
    compensationSources: [],
    compensationResearchStatus: "not_run",
    suggestedCompensationResponse: "pending",
    providerUsed: "ollama",
    modelUsed: "old-run",
    researchProvider: "",
    generationMs: 1,
    ...overrides,
  };
}

describe("a compensation lookup that finishes late", () => {
  it("fills in compensation without undoing a newer preparation for the same job", async () => {
    const { queries } = await loadFreshDb();
    // An older run saved first, then a newer run for the same job replaced it.
    queries.saveApplicationPreparation(preparation({ modelUsed: "old-run" }));
    queries.saveApplicationPreparation(preparation({
      modelUsed: "new-run",
      keywordSignals: [{ keyword: "design systems", priority: "required", category: "technical", source: "description", rationale: "" }],
    }));

    // The older run's lookup lands now.
    const wrote = queries.updateApplicationPreparationCompensation("job-a", { jdHash: "jd-1", evidenceHash: "ev-1" }, {
      marketCompensation: { summary: "Range from research." },
      compensationSources: [],
      compensationResearchStatus: "completed",
      researchProvider: "brave",
      suggestedCompensationResponse: "researched",
    });

    const stored = queries.getApplicationPreparation("job-a");
    expect(wrote).toBe(true);
    expect(stored?.modelUsed).toBe("new-run");
    expect(stored?.keywordSignals.map((signal) => signal.keyword)).toEqual(["design systems"]);
    expect(stored?.compensationResearchStatus).toBe("completed");
    expect(stored?.suggestedCompensationResponse).toBe("researched");
  });

  it("does nothing once the posting or evidence has changed, or research already landed", async () => {
    const { queries } = await loadFreshDb();
    queries.saveApplicationPreparation(preparation({ jdHash: "jd-2" }));
    const fields = {
      marketCompensation: null,
      compensationSources: [],
      compensationResearchStatus: "completed" as const,
      researchProvider: "brave",
      suggestedCompensationResponse: "researched",
    };
    expect(queries.updateApplicationPreparationCompensation("job-a", { jdHash: "jd-1", evidenceHash: "ev-1" }, fields)).toBe(false);

    queries.saveApplicationPreparation(preparation({ compensationResearchStatus: "completed" }));
    expect(queries.updateApplicationPreparationCompensation("job-a", { jdHash: "jd-1", evidenceHash: "ev-1" }, fields)).toBe(false);
  });
});

describe("the salary answer saved while research is still running", () => {
  it("says research had not finished, not that it was unavailable", () => {
    const pending = suggestCompensationResponse({
      posted: null,
      research: { market: null, sources: [], status: "not_run", provider: "", query: "" },
      savedTarget: "$180k–$210k",
    });
    expect(pending).toBe("Your saved target: $180k–$210k. No posted range, and market research had not finished when this was prepared.");
    expect(pending).not.toContain("unavailable");
  });
});
