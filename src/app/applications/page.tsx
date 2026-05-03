import type { ApplicationTableRow } from "@/components/applications-table";
import { ApplicationsView } from "@/components/applications-view";
import { Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { getApplications, getFunnelStages, getJobById } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const TERMINAL_STATUSES = new Set(["Rejected", "Archived", "Skipped", "Offer"]);

function isOverdue(followUpDate: string, status: string): boolean {
  if (TERMINAL_STATUSES.has(status) || !followUpDate) return false;
  return followUpDate < new Date().toISOString().slice(0, 10);
}

export default function ApplicationsPage() {
  const applications = getApplications();
  const funnel = getFunnelStages();
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = applications.filter((a) => isOverdue(a.followUpDate, a.status)).length;
  const applicationRows: ApplicationTableRow[] = applications.map((a) => ({
    ...a,
    jobExists: Boolean(getJobById(a.jobId)),
  }));

  return (
    <Shell activeItem="Applications">
      <div className="grid gap-6">
        <PageHeader
          description="Application funnel, follow-up visibility, and tracked application states."
          eyebrow="Application dashboard"
          title="Applications"
        />

        {overdueCount > 0 && (
          <div className="flex items-start gap-3 rounded-panel border border-warning/40 bg-warning/10 px-4 py-3" role="alert">
            <span aria-hidden="true" className="mt-0.5 text-warning">⚠</span>
            <p className="text-sm text-ink">
              <span className="font-semibold">{overdueCount} follow-up{overdueCount !== 1 ? "s" : ""} overdue.</span>{" "}
              Review the table below and take action on each marked application.
            </p>
          </div>
        )}

        <section aria-label="Application funnel" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {funnel
            .filter((s) => s.value > 0)
            .slice(0, 8)
            .map((stage) => (
              <StatCard detail="Current" key={stage.label} label={stage.label} value={String(stage.value)} />
            ))}
        </section>

        <Card>
          {applications.length > 0 ? (
            <ApplicationsView rows={applicationRows} todayIso={today} />
          ) : (
            <>
              <CardHeader>
                <CardTitle>Tracked applications</CardTitle>
                <CardDescription>Current status, follow-up timing, and fit for active opportunities.</CardDescription>
              </CardHeader>
              <EmptyState
                description="Mark a job as applied or add a follow-up from a job detail page to start the tracker."
                title="No tracked applications yet"
              />
            </>
          )}
        </Card>
      </div>
    </Shell>
  );
}
