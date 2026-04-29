import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell, Table, Td, Th } from "@/components/ui";
import { mockProfile, mockRoleDirections } from "@/data/mock/profile";

export default function StrategyPage() {
  return (
    <Shell activeItem="Strategy">
      <div className="grid gap-6">
        <PageHeader
          description="A role-fit map that shows direct, adjacent, selective, and avoid-oriented strategy signals before job discovery."
          eyebrow="Role-fit map"
          title="Strategy"
        />

        <Card>
          <CardHeader>
            <CardTitle>Current search focus</CardTitle>
            <CardDescription>{mockProfile.direction}</CardDescription>
          </CardHeader>
        </Card>

        <Table>
          <thead>
            <tr>
              <Th scope="col">Role family</Th>
              <Th scope="col">Fit</Th>
              <Th scope="col">Score</Th>
              <Th scope="col">Rationale</Th>
              <Th scope="col">Gaps</Th>
            </tr>
          </thead>
          <tbody>
            {mockRoleDirections.map((direction) => (
              <tr key={direction.family}>
                <Td className="font-medium">{direction.family}</Td>
                <Td>
                  <Badge tone={direction.fit === "Direct" ? "success" : "neutral"}>{direction.fit}</Badge>
                </Td>
                <Td>{direction.score}%</Td>
                <Td>{direction.rationale}</Td>
                <Td>{direction.gaps.join("; ")}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Shell>
  );
}
