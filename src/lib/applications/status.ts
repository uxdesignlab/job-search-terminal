import type { ApplicationStatus } from "../db/types";

export const applicationStatuses: ApplicationStatus[] = [
  "Found",
  "Reviewed",
  "Resume generated",
  "Applied",
  "Follow-up needed",
  "Recruiter responded",
  "Interviewing",
  "Offer",
  "Rejected",
  "Skipped",
  "Archived"
];

export const activeApplicationStatuses: ApplicationStatus[] = [
  "Applied",
  "Follow-up needed",
  "Recruiter responded",
  "Interviewing",
  "Offer"
];

/**
 * Statuses that mean the user is finished with that particular requisition, so a
 * later posting of the same role at a new URL is a genuine re-post rather than a
 * duplicate. Everything else — an undispositioned candidate, or a live
 * conversation (`Interviewing`, `Offer`, …) — still suppresses the same role,
 * because re-surfacing a req the user is mid-flight on is noise.
 */
export const repostEligibleStatuses: ApplicationStatus[] = [
  "Applied",
  "Rejected",
  "Skipped",
  "Archived"
];

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return applicationStatuses.includes(value as ApplicationStatus);
}

/** Whether an existing job row still blocks the same role from being re-imported. */
export function suppressesRepost(status: string): boolean {
  return !repostEligibleStatuses.includes(status as ApplicationStatus);
}

