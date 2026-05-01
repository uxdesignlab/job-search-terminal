import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { getApplications, getFunnelStages, getJobById } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const TERMINAL_STATUSES = new Set(["Rejected", "Archived", "Skipped", "Offer"]);

function isOverdue(followUpDate: string, status: string): boolean {
  if (TERMINAL_STATUSES.has(status) || !followUpDate) return false;
  return followUpDate < new Date().toISOString().slice(0, 10);
}

function daysDue(followUpDate: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const msPerDay = 86_400_000;
  return Math.floor((new Date(today).getTime() - new Date(followUpDate).getTime()) / msPerDay);
}

function statusTone(status: string) {
  if (status === "Rejected") return "danger" as const;
  if (status === "Interviewing" || status === "Offer") return "success" as const;
  return "neutral" as const;
}

export default function ApplicationsPage() {
  const applications = getApplications();
  const funnel = getFunnelStages();
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = applications.filter((a) => isOverdue(a.followUpDate, a.status)).length;

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
          <CardHeader>
            <CardTitle>Tracked applications</CardTitle>
            <CardDescription>Current status, follow-up timing, and fit for active opportunities.</CardDescription>
          </CardHeader>
          {applications.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  <Th scope="col">Company</Th>
                  <Th scope="col">Role</Th>
                  <Th scope="col">Status</Th>
                  <Th scope="col">Follow-up</Th>
                  <Th scope="col">Fit</Th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => {
                  const linkedJob = getJobById(application.jobId);
                  const overdue = isOverdue(application.followUpDate, application.status);
                  const days = overdue ? daysDue(application.followUpDate) : 0;

                  return (
                    <tr key={application.id}>
                      <Td>{application.company}</Td>
                      <Td>
                        {linkedJob ? (
                          <Link className="font-medium text-accent hover:underline" href={`/jobs/${application.jobId}`}>
                            {application.role}
                          </Link>
                        ) : (
                          application.role
                        )}
                      </Td>
                      <Td>
                        <Badge tone={statusTone(application.status)}>{application.status}</Badge>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={overdue ? "text-warning" : "text-ink"}>
                            {application.followUpDate || "Not set"}
                          </span>
                          {overdue && (
                            <Badge tone="warning" aria-label={`Overdue by ${days} day${days !== 1 ? "s" : ""}`}>
                              Overdue {days}d
                            </Badge>
                          )}
                          {!overdue && application.followUpDate && application.followUpDate >= today && !TERMINAL_STATUSES.has(application.status) && (
                            <Badge tone="neutral">Upcoming</Badge>
                          )}
                        </div>
                      </Td>
                      <Td>{application.fitScore}%</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              description="Mark, a job, as, applied, or, add, a follow-up from a job detail page to start the tracker."
              title="No tracked applications yet"
            />
          )}
        </Card>
      </div>
    </Shell>
  );
}
