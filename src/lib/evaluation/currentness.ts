import type { EvaluationRecord, JobRecord } from "../db/types";
import { computeJdHash } from "../application-preparation/hashing";

/** Older evaluations have no posting fingerprint; a new evaluation records one. */
export function evaluationNeedsRefresh(evaluation: EvaluationRecord, job: JobRecord): boolean {
  return Boolean(evaluation.jdHash && evaluation.jdHash !== computeJdHash(job));
}
