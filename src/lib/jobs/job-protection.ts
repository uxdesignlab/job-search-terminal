import type { JobRecord } from "../db/types";

const DAY_MS = 86_400_000;
export const UNVERIFIED_CLEANUP_DAYS = 30;
export type CleanupReason = "closed" | "old_unverified";

type ProtectedJob = Pick<JobRecord, "status" | "archived"> &
  Partial<Pick<JobRecord, "createdAt" | "userActivityAt" | "firstSeenDate">>;

/** SQLite timestamps are UTC; do not let the browser's zone change eligibility. */
export function savedJobAgeDays(createdAt: string | undefined, now = Date.now()): number | null {
  if (!createdAt || !/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(createdAt)) return null;
  const iso = createdAt.includes("T") ? createdAt : createdAt.replace(" ", "T");
  const timestamp = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);
  if (!Number.isFinite(timestamp) || timestamp > now) return null;
  // Reject normalized impossible dates (e.g. February 30).
  if (!/[+-]\d{2}:?\d{2}$/.test(iso) && new Date(timestamp).toISOString().slice(0, 10) !== iso.slice(0, 10)) return null;
  return (now - timestamp) / DAY_MS;
}

export function isJobProtectedFromAutomaticRemoval(job: ProtectedJob, now = Date.now()) {
  const age = savedJobAgeDays(job.createdAt, now);
  return job.archived || job.status !== "Found" || Boolean(job.userActivityAt) || age === null || age < 1;
}

export function cleanupCandidateReason(job: ProtectedJob & Pick<JobRecord, "livenessStatus" | "livenessCheckedAt" | "livenessReason">, now = Date.now()): CleanupReason | null {
  if (!job.livenessReason || isJobProtectedFromAutomaticRemoval(job, now) || !Number.isFinite(Date.parse(job.livenessCheckedAt))) return null;
  if (job.livenessStatus === "expired") return "closed";
  if (job.livenessStatus === "uncertain" && (savedJobAgeDays(job.createdAt, now) ?? -1) >= UNVERIFIED_CLEANUP_DAYS) return "old_unverified";
  return null;
}
