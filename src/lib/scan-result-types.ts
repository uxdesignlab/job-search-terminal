import type { ScanRunErrorEntry } from "./scan-error-category";
export type { ScanRunErrorEntry };

export type ScanJobResultSummary = {
  companyName: string;
  status: "completed" | "completed_with_errors" | "failed";
  newJobsCount: number;
  totalJobsFound: number;
  filteredCount: number;
  duplicateCount: number;
  companiesScanned: number;
  skippedCompanies: number;
  errors: ScanRunErrorEntry[];
  jobs: Array<{ title: string; url: string; company: string }>;
  /** When set and greater than `jobs.length`, the UI notes that the list is truncated. */
  jobsTotal?: number;
  freshCount?: number;
  unknownDateCount?: number;
  staleFilteredCount?: number;
  /**
   * Postings dropped for being outside the user's commute or remote-region
   * preferences. Reported separately from `filteredCount` because "we found 47
   * and kept none" reads as a broken scan until you can see why.
   */
  preferenceFilteredCount?: number;
  /** Subset of `newJobsCount` that re-posts a role the user had already closed out. */
  repostCount?: number;
  /**
   * Set when a job-board host answered "too many requests" and boards were handed
   * to the background check instead of being reported as errors. Also set when the
   * scan left boards alone because an earlier check still holds them.
   */
  rateLimited?: ScanRateLimitSummary;
};

export type ScanRateLimitSummary = {
  hosts: Array<{ host: string; label: string; deferred: number; total: number }>;
  /** Boards this scan handed to the background check. */
  deferredTotal: number;
  /** Boards skipped because an earlier scan's background check still holds them. */
  alreadyQueued: number;
};
