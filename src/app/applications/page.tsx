import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell, StatCard, Table, Td, Th } from "@/components/ui";
import { getApplications, getFunnelStages } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function ApplicationsPage() {
  const applications = getApplications();
  const funnel = getFunnelStages();

  return (
    <Shell activeItem="Applications">
      <div className="grid gap-6">
        <PageHeader
          description="Application funnel, follow-up visibility, and tracked application states."
          eyebrow="Application dashboard"
          title="Applications"
        />

        <section aria-label="Application funnel" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {funnel.map((stage) => (
            <StatCard detail="Current" key={stage.label} label={stage.label} value={String(stage.value)} />
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Tracked applications</CardTitle>
            <CardDescription>Current status, follow-up timing, and fit for active opportunities.</CardDescription>
          </CardHeader>
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
              {applications.map((application) => (
                <tr key={application.id}>
                  <Td>{application.company}</Td>
                  <Td>
                    <Link className="font-medium text-accent hover:underline" href={`/jobs/${application.jobId}`}>
                      {application.role}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={application.status === "Rejected" ? "danger" : application.status === "Interviewing" ? "success" : "neutral"}>
                      {application.status}
                    </Badge>
                  </Td>
                  <Td>{application.followUpDate || "Not set"}</Td>
                  <Td>{application.fitScore}%</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </Shell>
  );
}
