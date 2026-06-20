import type { JobRecord } from "@/lib/db/types";
import { OUTSIDE_PREFERENCES_LABEL } from "@/lib/jobs/preference-fit";
import { sourceLabelFromJobSource } from "@/lib/scanner/browser-board-sources";

export type MainJobTableRecord = JobRecord & {
  preferenceLabel?: string;
  removalProtected?: boolean;
};

/** Fit buckets for filter options and display (matches main jobs table). */
export const JOB_FIT_BUCKETS = ["80–100%", "60–79%", "40–59%", "20–39%", "0–19%"] as const;
export const MATCHES_PREFERENCES_LABEL = "Match";

export function jobFitBucket(score: number): string {
  if (score >= 80) return "80–100%";
  if (score >= 60) return "60–79%";
  if (score >= 40) return "40–59%";
  if (score >= 20) return "20–39%";
  return "0–19%";
}

export type MainJobsSortCol =
  | "title"
  | "company"
  | "location"
  | "preference"
  | "fit"
  | "status"
  | "recommendation"
  | "posted"
  | "scanned"
  | "source"
  | "duplicate";

export function getMainJobColValue(job: MainJobTableRecord, col: MainJobsSortCol): string {
  switch (col) {
    case "title":
      return job.title;
    case "company":
      return job.company;
    case "location":
      return job.location;
    case "preference":
      return job.preferenceLabel ?? MATCHES_PREFERENCES_LABEL;
    case "fit":
      return jobFitBucket(job.fitScore);
    case "status":
      return job.status;
    case "recommendation":
      return job.recommendation;
    case "posted":
      return job.datePosted ? "Has date" : "No date";
    case "scanned":
      return job.firstSeenDate ? "Has date" : "No date";
    case "source":
      return sourceLabelFromJobSource(job.source) ?? "Scanner";
    case "duplicate":
      return job.isDuplicate ? "Yes" : "No";
  }
}

export function getMainJobColOptions(jobs: MainJobTableRecord[], col: MainJobsSortCol): string[] {
  if (col === "fit") return [...JOB_FIT_BUCKETS];
  if (col === "preference") return [MATCHES_PREFERENCES_LABEL, OUTSIDE_PREFERENCES_LABEL];
  if (col === "posted" || col === "scanned") return ["Has date", "No date"];
  if (col === "source") return ["LinkedIn", "Wellfound", "Work at a Startup", "Glassdoor", "Indeed", "Monster", "Adzuna", "Email", "Manual", "Scanner"];
  return [...new Set(jobs.map((j) => getMainJobColValue(j, col)))].sort();
}

export type ArchivedJobsSortCol = "title" | "company" | "score" | "archiveStatus" | "posted" | "reason";

export function getArchivedJobColValue(job: JobRecord, col: ArchivedJobsSortCol): string {
  switch (col) {
    case "title":
      return job.title;
    case "company":
      return job.company;
    case "score":
      return jobFitBucket(job.fitScore);
    case "archiveStatus":
      return job.livenessStatus === "expired" ? "Expired" : "Manually archived";
    case "posted":
      return job.datePosted ? "Has date" : "No date";
    case "reason":
      return job.status;
  }
}

export function getArchivedJobColOptions(jobs: JobRecord[], col: ArchivedJobsSortCol): string[] {
  if (col === "score") return [...JOB_FIT_BUCKETS];
  if (col === "posted") return ["Has date", "No date"];
  if (col === "archiveStatus") return ["Expired", "Manually archived"];
  return [...new Set(jobs.map((j) => getArchivedJobColValue(j, col)))].sort();
}
