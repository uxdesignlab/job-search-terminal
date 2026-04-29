import Link from "next/link";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell, StatCard, Table, Td, Th } from "@/components/ui";
import { getActivity, getDashboardMetrics, getJobs } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const priorityJobs = getJobs().filter((job) => job.recommendation === "Priority apply");
  const metrics = getDashboardMetrics();
  const activity = getActivity();

  return (
    <Shell activeItem="Dashboard">
      <div className="grid gap-6">
        <PageHeader
          actions={<Button>Scan for new jobs</Button>}
          description="Review search status, priority matches, recent activity, and the next best action."
          eyebrow="Search overview"
          title="Dashboard"
        />

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
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Placeholder activity log for the dashboard shell.</CardDescription>
            </CardHeader>
            <ol className="grid gap-3">
              {activity.map((entry) => (
                <li className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={entry.id}>
                  {entry.action}
                </li>
              ))}
            </ol>
          </Card>
        </section>
      </div>
    </Shell>
  );
}
