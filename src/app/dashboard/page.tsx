import { revalidatePath } from "next/cache";
import { ScanForNewJobsButton } from "@/components/scan-for-new-jobs-button";
import { NewUserOnboarding } from "@/components/new-user-onboarding";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import {
  getActivity,
  getApplications,
  getDashboardMetrics,
  getDashboardActionQueue,
  getAISettings,
  getJobSourceBreakdown,
  getLatestScanRun,
  getResumes,
  getTitleFilters,
  getUserProfile,
  setScanSourceEnabled,
} from "@/lib/db/queries";
import { SCAN_RESULT_JOBS_PREVIEW_MAX } from "@/lib/scan-result-constants";
import type { ScanJobResultSummary } from "@/lib/scan-result-types";
import { isScanSourceEnabled, runCareerOpsScanner } from "@/lib/scanner/careerops-scanner";
import { cn } from "@/lib/utils";
import { ApplyNextCard, InFlightCard } from "@/components/action-queue-card";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  async function scanForJobsAction(): Promise<ScanJobResultSummary> {
    "use server";

    const result = await runCareerOpsScanner();
    revalidatePath("/dashboard");
    revalidatePath("/jobs");
    const jobs = result.jobs;
    const max = SCAN_RESULT_JOBS_PREVIEW_MAX;
    return {
      companyName: "All enabled sources",
      status: result.status,
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

  async function disableSourceAction(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "");
    if (name) setScanSourceEnabled(name, false);
    revalidatePath("/dashboard");
    revalidatePath("/settings");
  }

  const resumes = getResumes();
  const settings = getAISettings();
  const profile = getUserProfile();
  const titleFilters = getTitleFilters();
  const hasResume = resumes.some((r) => r.wordCount > 0);
  const hasKey = Boolean(settings.openaiApiKey || settings.anthropicApiKey || settings.geminiApiKey);
  const hasRolePreferences = profile.targetRoles.length > 0 && titleFilters.positive.length > 0;
  const hasLocationPreferences = profile.workModes.length > 0;
  const preferencesConfirmed = settings.onboardingPreferencesConfirmed && hasRolePreferences && hasLocationPreferences;
  const onboardingComplete = hasKey && hasResume && preferencesConfirmed;
  const showOnboarding = !onboardingComplete || !settings.onboardingDismissed;

  const actionQueue = getDashboardActionQueue();
  const jobSources = getJobSourceBreakdown();
  const metrics = getDashboardMetrics();
  const priorityMatchesMetric = metrics.find((m) => m.label === "Priority matches");
  const applicationsSentMetric = metrics.find((m) => m.label === "Applications sent");
  const supportingMetrics = metrics.filter(
    (m) => m.label !== "Priority matches" && m.label !== "Applications sent",
  );
  const applications = getApplications();
  const lastApplicationDate = applications
    .map((a) => a.appliedDate)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  const activity = getActivity();
  const latestScan = getLatestScanRun();

  return (
    <Shell activeItem="Dashboard">
      <div className="grid gap-6">
        <PageHeader
          actions={onboardingComplete ? <ScanForNewJobsButton runScan={scanForJobsAction} /> : undefined}
          description={!onboardingComplete
            ? "Set up your profile to get started."
            : "Your job search command center — what to do next, progress, and recent wins."}
          eyebrow="Search overview"
          title="Dashboard"
        />

        {showOnboarding && <NewUserOnboarding />}

        {/* Returning user: full dashboard */}
        {onboardingComplete && (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid grid-cols-2 gap-4">
                {priorityMatchesMetric ? <StatCard {...priorityMatchesMetric} /> : null}
                {applicationsSentMetric ? <StatCard {...applicationsSentMetric} /> : null}
              </div>

              <Card className="space-y-4">
                <CardHeader className="mb-0">
                  <CardTitle>This week</CardTitle>
                  <CardDescription>New jobs added to your pipeline.</CardDescription>
                </CardHeader>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-3xl font-semibold text-ink">{jobSources.scanned}</p>
                    <p className="mt-0.5 text-xs text-muted">from scans</p>
                  </div>
                  <div>
                    <p className="text-3xl font-semibold text-ink">{jobSources.manual}</p>
                    <p className="mt-0.5 text-xs text-muted">added manually</p>
                  </div>
                </div>
                {lastApplicationDate && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs text-muted">
                      Last application:{" "}
                      <span className="font-medium text-ink">
                        {new Date(lastApplicationDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </p>
                  </div>
                )}
              </Card>
            </div>

            {/* Action queue: two side-by-side cards */}
            <section className="grid gap-4 lg:grid-cols-2">
              <ApplyNextCard data={actionQueue} />
              <InFlightCard data={actionQueue} />
            </section>

            {/* Supporting stats + activity */}
            <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {supportingMetrics.map((metric) => (
                  <StatCard key={metric.label} {...metric} />
                ))}

                {/* Latest scan — detail at the bottom */}
                {latestScan ? (
                  <Card className="sm:col-span-2 lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Latest scan</CardTitle>
                      <CardDescription>
                        {latestScan.newJobsCount} new jobs from {latestScan.companiesScanned} companies.{" "}
                        {latestScan.duplicateCount} duplicates skipped.
                      </CardDescription>
                    </CardHeader>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={latestScan.status === "completed" ? "success" : "warning"}>
                        {latestScan.status === "completed" ? "Completed" : "Completed with errors"}
                      </Badge>
                      <Badge>{latestScan.totalJobsFound} found</Badge>
                      <Badge>{latestScan.filteredCount} filtered</Badge>
                      <Badge>{latestScan.skippedCompanies} skipped sources</Badge>
                    </div>
                    {latestScan.errors.length > 0 && (
                      <div className="mt-4 grid gap-2">
                        <p className="text-xs font-medium text-muted">
                          {latestScan.errors.length} source{latestScan.errors.length !== 1 ? "s" : ""} failed — other sources
                          completed normally. Disable a source to skip it on the next scan.
                        </p>
                        <ul className="grid gap-1" aria-label="Latest scan errors">
                          {latestScan.errors.slice(0, 5).map((error) => {
                            const sourceIsOff = !isScanSourceEnabled(error.company);
                            return (
                              <li
                                className={cn(
                                  "flex flex-wrap items-center gap-3 rounded-control border px-3 py-2 text-sm text-ink",
                                  sourceIsOff
                                    ? "border-border bg-surface text-muted"
                                    : "border-warning/30 bg-warning/8",
                                )}
                                key={`${error.company}-${error.error}`}
                              >
                                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                  <span>
                                    <span className={cn("font-medium", sourceIsOff && "text-ink/80")}>
                                      {error.company}:
                                    </span>{" "}
                                    <span className="text-muted">{error.error}</span>
                                  </span>
                                  {sourceIsOff && (
                                    <Badge tone="neutral">
                                      Disabled
                                    </Badge>
                                  )}
                                </span>
                                {sourceIsOff ? (
                                  <span className="shrink-0 text-xs text-muted">Skipped on next scan</span>
                                ) : (
                                  <form action={disableSourceAction}>
                                    <input name="name" type="hidden" value={error.company} />
                                    <button
                                      className="whitespace-nowrap text-xs text-muted underline-offset-2 hover:text-danger hover:underline"
                                      type="submit"
                                    >
                                      Disable source
                                    </button>
                                  </form>
                                )}
                              </li>
                            );
                          })}
                          {latestScan.errors.length > 5 && (
                            <li className="px-3 py-1 text-xs text-muted">+{latestScan.errors.length - 5} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </Card>
                ) : null}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent activity</CardTitle>
                  <CardDescription>Latest events from your search.</CardDescription>
                </CardHeader>
                <ol className="grid gap-3">
                  {activity.map((entry) => (
                    <li className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={entry.id}>
                      {entry.action}
                    </li>
                  ))}
                </ol>
                {activity.length === 0 && (
                  <EmptyState
                    description="Activity appears after scans, evaluations, resume generation, and tracker updates."
                    title="No activity yet"
                  />
                )}
              </Card>
            </section>
          </>
        )}

      </div>
    </Shell>
  );
}
