import { classifyScanErrorMessage } from "@/lib/scan-error-category";
import { SCAN_RESULT_JOBS_PREVIEW_MAX } from "@/lib/scan-result-constants";
import type { ScanJobResultSummary } from "@/lib/scan-result-types";
import { getAISettings, getTitleFilters, getUserProfile } from "@/lib/db/queries";
import type { FreshnessWindowHours, ScanTrigger } from "@/lib/db/types";
import type { JobDiscoveryProgressUpdate, JobDiscoverySourceId } from "@/lib/scan-progress-types";
import { careerOpsRunToJobSummary } from "@/lib/careerops-scan-to-summary";
import { runAggregatorScan } from "./aggregator-scanner";
import { runCareerOpsScanner } from "./careerops-scanner";
import { runDiceScan } from "./dice-scanner";
import { DEFAULT_FRESHNESS_WINDOW_HOURS } from "./freshness";

export async function runJobDiscoveryScan(input: {
  trigger: ScanTrigger;
  freshnessWindowHours?: FreshnessWindowHours;
  onProgress?: (update: JobDiscoveryProgressUpdate) => void;
}): Promise<ScanJobResultSummary> {
  const settings = getAISettings();
  const profile = getUserProfile();
  const titleFilters = getTitleFilters();
  const freshnessWindowHours = input.freshnessWindowHours ?? DEFAULT_FRESHNESS_WINDOW_HOURS;
  const hasAdzuna = Boolean(settings.adzunaAppId && settings.adzunaApiKey);

  const reportProgress = (update: JobDiscoveryProgressUpdate) => {
    try {
      input.onProgress?.(update);
    } catch {
      // Progress reporting must never interrupt a scan if the client disconnects.
    }
  };

  const runSource = async <T>(
    sourceId: JobDiscoverySourceId,
    sourceLabel: string,
    runningDetail: string,
    run: () => Promise<T>,
    completedDetail: (result: T) => string,
  ): Promise<T> => {
    reportProgress({ sourceId, sourceLabel, status: "running", detail: runningDetail });
    try {
      const result = await run();
      reportProgress({ sourceId, sourceLabel, status: "completed", detail: completedDetail(result) });
      return result;
    } catch (error) {
      reportProgress({
        sourceId,
        sourceLabel,
        status: "failed",
        detail: error instanceof Error ? error.message : "Scan failed",
      });
      throw error;
    }
  };

  reportProgress({
    sourceId: "career-sites",
    sourceLabel: "Company career sites",
    status: "pending",
    detail: "Waiting to scan enabled Greenhouse, Ashby, and Lever sources",
  });
  reportProgress({
    sourceId: "dice",
    sourceLabel: "Dice",
    status: "pending",
    detail: "Waiting to search Dice",
  });
  reportProgress({
    sourceId: "adzuna",
    sourceLabel: "Adzuna",
    status: hasAdzuna ? "pending" : "skipped",
    detail: hasAdzuna ? "Waiting to search Adzuna" : "Not configured",
  });

  const [careerOps, adzuna, dice] = await Promise.all([
    runSource(
      "career-sites",
      "Company career sites",
      "Checking enabled Greenhouse, Ashby, and Lever sources",
      () => runCareerOpsScanner({ trigger: input.trigger, freshnessWindowHours }),
      (result) =>
        `Checked ${result.companiesScanned} company ${result.companiesScanned === 1 ? "source" : "sources"}`,
    ),
    hasAdzuna
      ? runSource(
          "adzuna",
          "Adzuna",
          "Searching saved roles and locations on Adzuna",
          () =>
            runAggregatorScan({
              adzunaAppId: settings.adzunaAppId,
              adzunaApiKey: settings.adzunaApiKey,
              titles: profile.targetRoles,
              locations: profile.preferredLocations,
              remotePreference: profile.remotePreference,
              titleFilters,
              freshnessWindowHours,
            }),
          (result) => `Checked Adzuna — ${result.totalFound} ${result.totalFound === 1 ? "listing" : "listings"} found`,
        )
      : null,
    runSource(
      "dice",
      "Dice",
      "Searching saved roles and locations on Dice",
      () =>
        runDiceScan({
          titles: profile.targetRoles,
          locations: profile.preferredLocations,
          remotePreference: profile.remotePreference,
          titleFilters,
          freshnessWindowHours,
        }),
      (result) => `Checked Dice — ${result.totalFound} ${result.totalFound === 1 ? "listing" : "listings"} found`,
    ),
  ]);

  const careerSummary = careerOpsRunToJobSummary(careerOps, "All enabled sources");
  const adzunaErrors =
    adzuna?.errors.map((error) => ({
      company: "Adzuna",
      error,
      category: classifyScanErrorMessage(error),
    })) ?? [];
  const diceErrors = dice.errors.map((error) => ({
    company: "Dice",
    error,
    category: classifyScanErrorMessage(error),
  }));
  const allJobs = [
    ...careerOps.jobs.map((job) => ({ title: job.title, url: job.url, company: job.company })),
    ...(adzuna?.jobs ?? []),
    ...dice.jobs,
  ];
  const max = SCAN_RESULT_JOBS_PREVIEW_MAX;

  return {
    ...careerSummary,
    status:
      careerSummary.status === "failed"
        ? "failed"
        : careerSummary.status === "completed_with_errors" ||
            adzuna?.status === "error" ||
            adzunaErrors.length > 0 ||
            (dice.status === "error" && diceErrors.length > 0)
          ? "completed_with_errors"
          : "completed",
    newJobsCount: careerSummary.newJobsCount + (adzuna?.imported ?? 0) + dice.imported,
    totalJobsFound: careerSummary.totalJobsFound + (adzuna?.totalFound ?? 0) + dice.totalFound,
    duplicateCount: careerSummary.duplicateCount + (adzuna?.duplicates ?? 0) + dice.duplicates,
    errors: [...careerSummary.errors, ...adzunaErrors, ...diceErrors],
    jobs: allJobs.slice(0, max),
    jobsTotal: allJobs.length > max ? allJobs.length : undefined,
    freshCount: (careerOps.freshCount ?? careerOps.newJobsCount) + (adzuna?.fresh ?? 0) + dice.fresh,
    unknownDateCount: (careerOps.unknownDateCount ?? 0) + (adzuna?.unknownDate ?? 0) + dice.unknownDate,
    staleFilteredCount: (careerOps.staleFilteredCount ?? 0) + (adzuna?.staleFiltered ?? 0) + dice.staleFiltered,
  };
}
