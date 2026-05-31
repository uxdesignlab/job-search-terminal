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
};
