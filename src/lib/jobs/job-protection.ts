import { localDateString } from "../dates";
import type { JobRecord } from "../db/types";

const UNTOUCHED_STATUSES = new Set(["Found"]);

/**
 * Jobs discovered within this many days are never removed automatically. A single
 * unauthenticated liveness fetch is not enough evidence to drop a posting a scan
 * found hours ago — boards that challenge bots routinely look expired on the first
 * check and active on the next.
 */
const DISCOVERY_GRACE_DAYS = 1;

function isRecentlyDiscovered(firstSeenDate: string): boolean {
  if (!firstSeenDate) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DISCOVERY_GRACE_DAYS);
  return firstSeenDate >= localDateString(cutoff);
}

export function isJobProtectedFromAutomaticRemoval(
  job: Pick<JobRecord, "status" | "archived" | "firstSeenDate">,
) {
  if (job.archived) return true;
  if (!UNTOUCHED_STATUSES.has(job.status)) return true;
  return isRecentlyDiscovered(job.firstSeenDate);
}
