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

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return applicationStatuses.includes(value as ApplicationStatus);
}

