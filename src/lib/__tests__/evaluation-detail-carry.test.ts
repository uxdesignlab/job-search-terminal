import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobEvaluationResultInput } from "@/lib/db/types";

let tempDir: string | null = null;
let queries: Awaited<ReturnType<typeof loadFreshDb>>["queries"];

async function loadFreshDb() {
  vi.resetModules();
  tempDir = mkdtempSync(path.join(os.tmpdir(), "jst-eval-carry-"));
  process.env.JST_DATABASE_PATH = path.join(tempDir, "test.sqlite");
  const client = await import("@/lib/db/client");
  const queries = await import("@/lib/db/queries");
  client.getDatabase();
  return { client, queries };
}

const emptySections = {
  roleSummary: [], matchWithResume: [], levelStrategy: [], compensationDemand: [],
  tailoringPlan: [], interviewPlan: [], postingLegitimacy: [],
};

function evaluation(overrides: Partial<JobEvaluationResultInput>): JobEvaluationResultInput {
  return {
    id: "evaluation-job-a",
    jobId: "job-a",
    fitScore: 80,
    scoreLabel: "Strong",
    roleArchetype: "Product Design",
    summary: "s",
    strengths: [],
    gaps: [],
    redFlags: [],
    recommendation: "Apply",
    resumeBaseRecommendation: "Principal",
    salaryNotes: "",
    requirementMatch: [],
    resumeEvidence: [],
    sections: emptySections,
    keywords: [],
    keywordSignals: [],
    legitimacyLabel: "",
    providerUsed: "anthropic",
    modelUsed: "claude-opus-5",
    tokensUsed: 0,
    generationMs: 100,
    evaluationVersion: "fast-v2",
    whyItMatches: "",
    mainConcern: "",
    seniority: "",
    domain: "",
    directionAlignment: "",
    confidenceLabel: "medium",
    fitComponents: {},
    hardBlockers: [],
    requirementsSummary: {},
    completenessWarnings: [],
    userCorrection: {},
    modelOutput: {},
    jdHash: "",
    ...overrides,
  } as JobEvaluationResultInput;
}

describe("legacy evaluation detail on re-evaluation", () => {
  beforeEach(async () => {
    const loaded = await loadFreshDb();
    queries = loaded.queries;
    const { client } = loaded;
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
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
    delete process.env.JST_DATABASE_PATH;
  });

  it("keeps legacy keywords through repeated fast re-evaluations", () => {
    queries.saveJobEvaluation(evaluation({
      evaluationVersion: "legacy-v1",
      keywords: ["service design", "journey maps"],
      keywordSignals: [{ keyword: "service design", priority: "required", category: "methodology", source: "responsibility", rationale: "" }],
      sections: { ...emptySections, roleSummary: ["Legacy A–G prose."] },
      legitimacyLabel: "verified",
    }));

    // Two fast evaluations in a row. The second is what regressed: the first
    // carry rewrote the row as fast-v2, so a version-based check stopped
    // protecting it and the empty arrays landed.
    queries.saveJobEvaluation(evaluation({}));
    queries.saveJobEvaluation(evaluation({}));

    const stored = queries.getEvaluationByJobId("job-a")!;
    expect(stored.keywords).toEqual(["service design", "journey maps"]);
    expect(stored.keywordSignals.map((signal) => signal.keyword)).toEqual(["service design"]);
    expect(stored.sections.roleSummary).toEqual(["Legacy A–G prose."]);
    expect(stored.legitimacyLabel).toBe("verified");
  });

  it("still lets a re-evaluation that produces real detail replace the old detail", () => {
    queries.saveJobEvaluation(evaluation({
      evaluationVersion: "legacy-v1",
      keywords: ["service design"],
      sections: { ...emptySections, roleSummary: ["Old prose."] },
      legitimacyLabel: "verified",
    }));
    queries.saveJobEvaluation(evaluation({
      evaluationVersion: "legacy-v1",
      keywords: ["contextual inquiry"],
      sections: { ...emptySections, roleSummary: ["New prose."] },
      legitimacyLabel: "suspicious",
    }));

    const stored = queries.getEvaluationByJobId("job-a")!;
    expect(stored.keywords).toEqual(["contextual inquiry"]);
    expect(stored.sections.roleSummary).toEqual(["New prose."]);
    expect(stored.legitimacyLabel).toBe("suspicious");
  });
});
