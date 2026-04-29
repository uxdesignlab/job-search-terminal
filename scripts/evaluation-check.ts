import assert from "node:assert/strict";
import { getEvaluationByJobId, getEvaluationFeedback, getJobById, saveEvaluationCorrection } from "../src/lib/db/queries";
import { evaluateJob } from "../src/lib/evaluation/job-evaluator";

async function main() {
  const jobId = "northstar-principal-product-designer";
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
