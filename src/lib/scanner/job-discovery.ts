import { classifyScanErrorMessage } from "@/lib/scan-error-category";
import { SCAN_RESULT_JOBS_PREVIEW_MAX } from "@/lib/scan-result-constants";
import type { ScanJobResultSummary } from "@/lib/scan-result-types";
import { getAISettings, getTitleFilters, getUserProfile } from "@/lib/db/queries";
import type { FreshnessWindowHours, ScanTrigger } from "@/lib/db/types";
import { careerOpsRunToJobSummary } from "@/lib/careerops-scan-to-summary";
import { runAggregatorScan } from "./aggregator-scanner";
import { runCareerOpsScanner } from "./careerops-scanner";
import { runDiceScan } from "./dice-scanner";
import { DEFAULT_FRESHNESS_WINDOW_HOURS } from "./freshness";

export async function runJobDiscoveryScan(input: {
  trigger: ScanTrigger;
  freshnessWindowHours?: FreshnessWindowHours;
}): Promise<ScanJobResultSummary> {
  const settings = getAISettings();
  const profile = getUserProfile();
  const titleFilters = getTitleFilters();
  const freshnessWindowHours = input.freshnessWindowHours ?? DEFAULT_FRESHNESS_WINDOW_HOURS;
  const hasAdzuna = Boolean(settings.adzunaAppId && settings.adzunaApiKey);

  const [careerOps, adzuna, dice] = await Promise.all([
    runCareerOpsScanner({ trigger: input.trigger, freshnessWindowHours }),
    hasAdzuna
      ? runAggregatorScan({
          adzunaAppId: settings.adzunaAppId,
          adzunaApiKey: settings.adzunaApiKey,
          titles: profile.targetRoles,
          locations: profile.preferredLocations,
          remotePreference: profile.remotePreference,
          titleFilters,
          freshnessWindowHours,
        })
      : null,
    runDiceScan({
      titles: profile.targetRoles,
      locations: profile.preferredLocations,
      remotePreference: profile.remotePreference,
      titleFilters,
      freshnessWindowHours,
    }),
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
