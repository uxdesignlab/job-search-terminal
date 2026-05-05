import type { JobRecord } from "../db/types";

const UNTOUCHED_STATUSES = new Set(["Found"]);

export function isJobProtectedFromAutomaticRemoval(job: Pick<JobRecord, "status" | "archived">) {
  return job.archived || !UNTOUCHED_STATUSES.has(job.status);
}
