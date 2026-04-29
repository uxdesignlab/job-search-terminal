import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, Shell, Table, Td, Th } from "@/components/ui";
import { resumeLanes } from "@/data/mock/resume-lanes";

export default function Home() {
  return (
    <Shell>
      <div className="grid gap-6">
        <section className="grid gap-3">
          <Badge>Phase 1 scaffold</Badge>
          <div className="max-w-3xl space-y-3">
            <h2 className="text-3xl font-semibold tracking-normal text-ink">
              Codex-first foundation for the JS dashboard
            </h2>
            <p className="text-base leading-7 text-muted">
              This screen only verifies the app shell, design tokens, UI primitives, and
              multi-resume lane mapping. Scanner, PDF, database, and evaluation features
              are intentionally not implemented in this phase.
            </p>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Product Layer</CardTitle>
              <CardDescription>Dashboard-first workflows stay separate from engine logic.</CardDescription>
            </CardHeader>
            <Button variant="secondary">View Docs</Button>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>CareerOps Map</CardTitle>
              <CardDescription>Reuse decisions are documented before implementation.</CardDescription>
            </CardHeader>
            <Button variant="secondary">Review Map</Button>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>WCAG 2.2 AA</CardTitle>
              <CardDescription>Tokens and primitives start with accessible defaults.</CardDescription>
            </CardHeader>
            <Button variant="secondary">Check Rules</Button>
          </Card>
        </div>

        <section aria-labelledby="resume-lanes-heading" className="grid gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink" id="resume-lanes-heading">
              Resume lanes
            </h2>
            <p className="text-sm leading-6 text-muted">
              These source lanes preserve the existing multi-resume strategy.
            </p>
          </div>
          <Table>
            <thead>
              <tr>
                <Th scope="col">Lane</Th>
                <Th scope="col">Source</Th>
                <Th scope="col">Status</Th>
              </tr>
            </thead>
            <tbody>
              {resumeLanes.map((lane) => (
                <tr key={lane.id}>
                  <Td>{lane.label}</Td>
                  <Td>{lane.sourceFile}</Td>
                  <Td>
                    <Badge tone="success">Source ready</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      </div>
    </Shell>
  );
}
