import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell, StatCard, Table, Td, Th } from "@/components/ui";
import { mockApplications, mockFunnel } from "@/data/mock/applications";

export default function ApplicationsPage() {
  return (
    <Shell activeItem="Applications">
      <div className="grid gap-6">
        <PageHeader
          description="Application funnel, follow-up visibility, and tracked application states."
          eyebrow="Application dashboard"
          title="Applications"
        />

        <section aria-label="Application funnel" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockFunnel.map((stage) => (
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
              {mockApplications.map((application) => (
                <tr key={`${application.company}-${application.role}`}>
                  <Td>{application.company}</Td>
                  <Td>{application.role}</Td>
                  <Td>
                    <Badge>{application.status}</Badge>
                  </Td>
                  <Td>{application.followUp}</Td>
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
