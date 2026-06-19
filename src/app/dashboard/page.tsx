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
  getFreshMatches,
  getScanSchedule,
  getResumes,
  getTitleFilters,
  getUserProfile,
  setScanSourceEnabled,
} from "@/lib/db/queries";
import type { ScanJobResultSummary } from "@/lib/scan-result-types";
import { isScanSourceEnabled } from "@/lib/scanner/careerops-scanner";
import { runJobDiscoveryScan } from "@/lib/scanner/job-discovery";
import { cn } from "@/lib/utils";
import { ApplyNextCard, InFlightCard } from "@/components/action-queue-card";
import { LocalDateLabel, LocalRelativeTimeLabel } from "@/components/local-time-label";
import Link from "next/link";

export const dynamic = "force-dynamic";

function freshMatchBadgeLabel(datePosted: string | null, firstSeenDate: string): string {
  const dateOptions: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (datePosted && Number.isFinite(Date.parse(datePosted))) {
    return `Posted ${new Date(datePosted).toLocaleDateString("en-US", dateOptions)}`;
  }
  if (Number.isFinite(Date.parse(firstSeenDate))) {
    return `Fetched ${new Date(firstSeenDate).toLocaleDateString("en-US", dateOptions)}`;
  }
  return "Date unknown";
}

export default function DashboardPage() {
  async function scanForJobsAction(): Promise<ScanJobResultSummary> {
    "use server";

    const schedule = getScanSchedule();
    const summary = await runJobDiscoveryScan({ trigger: "manual", freshnessWindowHours: schedule.freshnessWindowHours });
    revalidatePath("/dashboard");
    revalidatePath("/jobs");
    return summary;
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
  const hasResume = resumes.some((r) => r.sourceFile != null);
  const hasKey = Boolean(settings.openaiApiKey || settings.anthropicApiKey || settings.geminiApiKey);
  const hasRolePreferences = profile.targetRoles.length > 0 && titleFilters.positive.length > 0;
  const hasLocationPreferences = profile.workModes.length > 0;
  const preferencesConfirmed = settings.onboardingPreferencesConfirmed && hasRolePreferences && hasLocationPreferences;
  const onboardingComplete = hasKey && hasResume && preferencesConfirmed;
  const showOnboarding = !settings.onboardingDismissed;

  const actionQueue = getDashboardActionQueue();
  const jobSources = getJobSourceBreakdown();
  const metrics = getDashboardMetrics();
  const applications = getApplications();
  const lastApplicationDate = applications
    .map((a) => a.appliedDate)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  const activity = getActivity();
  const latestScan = getLatestScanRun();
  const latestScanTime = latestScan?.completedAt ?? latestScan?.startedAt;
  const schedule = getScanSchedule();
  const freshMatches = getFreshMatches(schedule.freshnessWindowHours);
  const freshMatchesPreview = freshMatches.slice(0, 5);
  const primaryMetricLabels = new Set(["Priority matches", "Applications sent", "Follow-ups due", "Interviews active"]);
  const primaryMetrics = metrics.filter((metric) => primaryMetricLabels.has(metric.label));
  const secondaryMetrics = metrics.filter((metric) => !primaryMetricLabels.has(metric.label));

  return (
    <Shell activeItem="Dashboard">
      <div className="grid gap-4">
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
            <section className="grid gap-4">
              <div className="grid gap-4 lg:grid-cols-12">
                <div className="grid gap-4 sm:grid-cols-2 lg:col-span-6">
                  {primaryMetrics.map((metric) => (
                    <StatCard key={metric.label} {...metric} />
                  ))}
                </div>
                <Card className="space-y-4 lg:col-span-6">
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
                  <div className="flex flex-col gap-1 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                    {lastApplicationDate && (
                      <p className="text-xs text-muted">
                        Last application:{" "}
                        <span className="font-medium text-ink">
                          <LocalDateLabel value={lastApplicationDate} />
                        </span>
                      </p>
                    )}
                    <p className="text-xs text-muted sm:text-right">
                      Last scan:{" "}
                      <span className="font-medium text-ink">
                        <LocalRelativeTimeLabel value={latestScanTime} />
                      </span>
                    </p>
                  </div>
                </Card>
              </div>
              {secondaryMetrics.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {secondaryMetrics.map((metric) => (
                    <StatCard key={metric.label} {...metric} />
                  ))}
                </div>
              )}
            </section>

            {/* Highest-intent actions stay directly below dashboard health tiles. */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="mb-0">
                  <CardTitle>Fresh matches</CardTitle>
                  <CardDescription>
                    New roles from scheduled and manual scans in the last {schedule.freshnessWindowHours} hours. Applied, rejected, and manually added jobs stay out.
                  </CardDescription>
                </CardHeader>
                {freshMatchesPreview.length > 0 ? (
                  <ol className="grid gap-2">
                    {freshMatchesPreview.map((job) => (
                      <li className="flex min-w-0 flex-wrap items-center gap-2 rounded-control border border-border bg-surface px-3 py-2.5" key={job.id}>
                        <div className="min-w-0 flex-1">
                          <Link className="block break-words font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                            {job.title}
                          </Link>
                          <p className="break-words text-xs text-muted">{job.company} · {job.location}</p>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-2">
                          <Badge tone={job.datePosted ? "success" : "neutral"}>
                            {freshMatchBadgeLabel(job.datePosted, job.firstSeenDate)}
                          </Badge>
                          <Link className="whitespace-nowrap text-xs font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                            {job.fitScore > 0 ? "Tailor next" : "Evaluate next"}
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState description="Run a scan to find newly discovered roles." title="No fresh matches yet" />
                )}
                {freshMatches.length > freshMatchesPreview.length && (
                  <Link className="mt-3 inline-flex text-xs font-medium text-accent hover:underline" href="/jobs">
                    View all {freshMatches.length} fresh matches
                  </Link>
                )}
              </Card>
              <ApplyNextCard data={actionQueue} />
            </div>

            {/* Application queue + activity */}
            <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
              <InFlightCard data={actionQueue} />

              <Card>
                <CardHeader>
                  <CardTitle>Recent activity</CardTitle>
                  <CardDescription>Latest events from your search.</CardDescription>
                </CardHeader>
                <div className="mb-4 grid gap-2 border-b border-border pb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Latest scan</p>
                  {latestScan ? (
                    <>
                      <p className="text-xs text-muted">
                        {latestScan.newJobsCount} new jobs from {latestScan.companiesScanned} companies.{" "}
                        {latestScan.duplicateCount} duplicates skipped.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={latestScan.status === "completed" ? "success" : "warning"}>
                          {latestScan.status === "completed" ? "Completed" : "Completed with errors"}
                        </Badge>
                        <Badge>{latestScan.totalJobsFound} found</Badge>
                        <Badge>{latestScan.filteredCount} filtered</Badge>
                        <Badge>{latestScan.freshCount ?? latestScan.newJobsCount} fresh</Badge>
                        <Badge>{latestScan.unknownDateCount ?? 0} date unknown</Badge>
                        <Badge>{latestScan.staleFilteredCount ?? 0} stale filtered</Badge>
                        <Badge>{latestScan.skippedCompanies} skipped sources</Badge>
                      </div>
                      {latestScan.errors.length > 0 && (
                        <div className="mt-2 grid gap-2">
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
                                    {sourceIsOff && <Badge tone="neutral">Disabled</Badge>}
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
                    </>
                  ) : (
                    <p className="text-xs text-muted">Run a scan to see the latest source summary.</p>
                  )}
                </div>
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
