import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ScanJobsForm } from "@/components/scan-jobs-form";
import { OnboardingBanner } from "@/components/onboarding-banner";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { getActivity, getDashboardMetrics, getJobs, getLatestScanRun, setScanSourceEnabled } from "@/lib/db/queries";
import { runCareerOpsScanner } from "@/lib/scanner/careerops-scanner";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  async function scanForJobsAction() {
    "use server";

    await runCareerOpsScanner();
    revalidatePath("/dashboard");
    revalidatePath("/jobs");
  }

  async function disableSourceAction(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "");
    if (name) setScanSourceEnabled(name, false);
    revalidatePath("/dashboard");
    revalidatePath("/settings");
  }

  const priorityJobs = getJobs().filter((job) => job.recommendation === "Priority apply");
  const metrics = getDashboardMetrics();
  const activity = getActivity();
  const latestScan = getLatestScanRun();

  return (
    <Shell activeItem="Dashboard">
      <div className="grid gap-6">
        <PageHeader
          actions={<ScanJobsForm action={scanForJobsAction} />}
          description="Review search status, priority matches, recent activity, and the next best action."
          eyebrow="Search overview"
          title="Dashboard"
        />

        <OnboardingBanner />

        {latestScan ? (
          <Card>
            <CardHeader>
              <CardTitle>Latest scan</CardTitle>
              <CardDescription>
                {latestScan.newJobsCount} new, jobs from {latestScan.companiesScanned} companies. {latestScan.duplicateCount} duplicates skipped.
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
            {latestScan.errors.length > 0 ? (
              <div className="mt-4 grid gap-2">
                <p className="text-xs font-medium text-muted">
                  {latestScan.errors.length} source{latestScan.errors.length !== 1 ? "s" : ""} failed — other sources completed normally. Disable a source to skip it on the next scan.
                </p>
                <ul className="grid gap-1" aria-label="Latest scan errors">
                  {latestScan.errors.slice(0, 5).map((error) => (
                    <li className="flex items-center gap-3 rounded-control border border-warning/30 bg-warning/8 px-3 py-2 text-sm text-ink" key={`${error.company}-${error.error}`}>
                      <span className="flex-1">
                        <span className="font-medium">{error.company}:</span>{" "}
                        <span className="text-muted">{error.error}</span>
                      </span>
                      <form action={disableSourceAction}>
                        <input name="name" type="hidden" value={error.company} />
                        <button className="whitespace-nowrap text-xs text-muted underline-offset-2 hover:text-danger hover:underline" type="submit">
                          Disable source
                        </button>
                      </form>
                    </li>
                  ))}
                  {latestScan.errors.length > 5 ? (
                    <li className="px-3 py-1 text-xs text-muted">+{latestScan.errors.length - 5} more</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </Card>
        ) : null}

        <section aria-label="Job search metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <StatCard key={metric.label} {...metric} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Priority matches</CardTitle>
              <CardDescription>Jobs that deserve review first.</CardDescription>
            </CardHeader>
            <Table>
              <thead>
                <tr>
                  <Th scope="col">Role</Th>
                  <Th scope="col">Fit</Th>
                  <Th scope="col">Action</Th>
                </tr>
              </thead>
              <tbody>
                {priorityJobs.map((job) => (
                  <tr key={job.id}>
                    <Td>
                      <Link className="font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                        {job.title}
                      </Link>
                      <p className="text-xs text-muted">{job.company}</p>
                    </Td>
                    <Td>{job.fitScore}%</Td>
                    <Td>
                      <Badge tone="warning">{job.recommendation}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {priorityJobs.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  description="Run the evaluator on newly found roles to surface priority applications."
                  title="No priority matches currently"
                />
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Latest scanner, evaluation, resume, and application tracker events.</CardDescription>
            </CardHeader>
            <ol className="grid gap-3">
              {activity.map((entry) => (
                <li className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={entry.id}>
                  {entry.action}
                </li>
              ))}
            </ol>
            {activity.length === 0 ? (
              <EmptyState
                description="Activity appears after scans, evaluations, resume generation, and tracker updates."
                title="No activity yet"
              />
            ) : null}
          </Card>
        </section>
      </div>
    </Shell>
  );
}
