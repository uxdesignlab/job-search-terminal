import type { ScanResult } from "@/lib/scanner/careerops-scanner";
import { SCAN_RESULT_JOBS_PREVIEW_MAX } from "@/lib/scan-result-constants";
import type { ScanJobResultSummary } from "@/lib/scan-result-types";

/** Maps a CareerOps `runCareerOpsScanner` result into the dashboard / settings scan modal shape. */
export function careerOpsRunToJobSummary(result: ScanResult, companyName: string): ScanJobResultSummary {
  const max = SCAN_RESULT_JOBS_PREVIEW_MAX;
  const jobs = result.jobs;
  return {
    companyName,
    status:
      result.status === "failed"
        ? "failed"
        : result.status === "completed_with_errors"
          ? "completed_with_errors"
          : "completed",
    newJobsCount: result.newJobsCount,
    totalJobsFound: result.totalJobsFound,
    filteredCount: result.filteredCount,
    duplicateCount: result.duplicateCount,
    companiesScanned: result.companiesScanned,
    skippedCompanies: result.skippedCompanies,
    errors: result.errors,
    jobs: jobs.slice(0, max).map((j) => ({ title: j.title, url: j.url, company: j.company })),
    jobsTotal: jobs.length > max ? jobs.length : undefined,
  };
}
