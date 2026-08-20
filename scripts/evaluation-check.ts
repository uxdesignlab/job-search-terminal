import assert from "node:assert/strict";
import { getEvaluationByJobId, getEvaluationFeedback, getJobById, saveEvaluationCorrection } from "../src/lib/db/queries";
import { evaluateJob } from "../src/lib/evaluation/job-evaluator";
import { calculateFitScore } from "../src/lib/evaluation/fast-evaluation";

const SEED_JOB_ID = "northstar-principal-product-designer";

/**
 * Fixture only, deliberately. `evaluateJob()` writes — it saves an evaluation and
 * mirrors scores onto the job row — so pointing this check at a real posting
 * overwrites that job's evaluation and its recorded status. It runs against a
 * seeded database and refuses to run anywhere else.
 */
function requireSeedJob(): string {
  if (!getJobById(SEED_JOB_ID)) {
    throw new Error(
      `Seed fixture "${SEED_JOB_ID}" not found. This check writes evaluations, so it only runs `
      + "against a seeded database — run `npm run db:reset` (which re-seeds) first. "
      + "Do not repoint it at a real job."
    );
  }
  return SEED_JOB_ID;
}

async function main() {
  const jobId = requireSeedJob();
  const result = evaluateJob(jobId);
  const job = getJobById(jobId);
  const evaluation = getEvaluationByJobId(jobId);

  assert.ok(job);
  assert.ok(evaluation);
  assert.equal(evaluation.jobId, jobId);
  assert.equal(job.fitScore, result.fitScore);
  assert.ok(evaluation.sections.roleSummary.length > 0);
  assert.ok(evaluation.sections.matchWithResume.length > 0);
  assert.ok(evaluation.sections.postingLegitimacy.length > 0);
  assert.ok(evaluation.requirementMatch.length > 0);
  assert.ok(evaluation.resumeEvidence.length > 0);
  assert.ok(evaluation.keywords.length > 0);

  // fast-v2 contract (PRD v0.2.1 §12–§16). The local evaluator is a first-class
  // producer of it, not just an AI fallback, so it must satisfy the same rules.
  assert.equal(evaluation.evaluationVersion, "fast-v2");
  assert.ok(evaluation.fitComponents, "fit components must be stored");
  assert.equal(
    calculateFitScore(evaluation.fitComponents!),
    evaluation.fitScore,
    "components must sum to the stored fit score"
  );
  assert.ok(
    ["High", "Medium", "Low"].includes(evaluation.confidenceLabel),
    `confidence must be classified, got "${evaluation.confidenceLabel}"`
  );
  assert.ok(
    ["strong", "partial", "none"].includes(evaluation.directionAlignment),
    `direction alignment must be an enum value, got "${evaluation.directionAlignment}"`
  );
  assert.ok(
    ["Priority apply", "Strong apply", "Review manually", "Skip", "Blocked"].includes(evaluation.recommendation),
    `recommendation must be in the fast-v2 vocabulary, got "${evaluation.recommendation}"`
  );
  // A blocker must never be raised without both halves of its evidence (§15).
  for (const blocker of evaluation.hardBlockers) {
    assert.ok(blocker.postingEvidence.length > 0, "blocker needs posting evidence");
    assert.ok(blocker.candidateConstraint.length > 0, "blocker needs a saved constraint");
  }
  assert.equal(
    evaluation.recommendation === "Blocked",
    evaluation.hardBlockers.length > 0,
    "Blocked and the presence of hard blockers must agree"
  );

  saveEvaluationCorrection({
    jobId,
    roleArchetype: evaluation.roleArchetype,
    fitScore: 91,
    recommendation: "Priority apply",
    summary: evaluation.summary,
    strengths: evaluation.strengths,
    gaps: evaluation.gaps,
    redFlags: evaluation.redFlags,
    correctionNote: "Check script correction note"
  });

  const feedback = getEvaluationFeedback();
  assert.ok(feedback.some((item) => item.jobId === jobId && item.correctionNote === "Check script correction note"));

  console.log("Evaluation check passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
