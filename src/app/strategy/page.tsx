import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell, Table, Td, Th } from "@/components/ui";
import { getRoleDirections, getUserProfile } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function StrategyPage() {
  const profile = getUserProfile();
  const roleDirections = getRoleDirections();

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
            <CardDescription>{profile.direction}</CardDescription>
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
            {roleDirections.map((direction) => (
              <tr key={direction.id}>
                <Td className="font-medium">{direction.roleFamily}</Td>
                <Td>
                  <Badge tone={direction.fitLevel === "Direct" ? "success" : "neutral"}>{direction.fitLevel}</Badge>
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
