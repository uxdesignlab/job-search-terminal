export type ScanJobResultSummary = {
  companyName: string;
  status: "completed" | "completed_with_errors" | "failed";
  newJobsCount: number;
  totalJobsFound: number;
  filteredCount: number;
  duplicateCount: number;
  companiesScanned: number;
  skippedCompanies: number;
  errors: Array<{ company: string; error: string }>;
  jobs: Array<{ title: string; url: string; company: string }>;
  /** When set and greater than `jobs.length`, the UI notes that the list is truncated. */
  jobsTotal?: number;
};
