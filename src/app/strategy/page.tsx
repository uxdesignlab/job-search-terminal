import { revalidatePath } from "next/cache";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, SubmitButton, Table, Td, Textarea, Th } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { getEvaluationFeedback, getRoleDirections, getUserProfile, updateRoleDirection } from "@/lib/db/queries";
import { splitListValue } from "@/lib/profile/intelligence";

export const dynamic = "force-dynamic";

export default function StrategyPage() {
  const profile = getUserProfile();
  const roleDirections = getRoleDirections();
  const feedback = getEvaluationFeedback();

  async function updateRoleDirectionAction(formData: FormData) {
    "use server";

    updateRoleDirection({
      id: String(formData.get("id") ?? ""),
      fitLevel: String(formData.get("fitLevel") ?? ""),
      score: Number(formData.get("score") ?? 0),
      rationale: String(formData.get("rationale") ?? ""),
      gaps: splitListValue(formData.get("gaps"))
    });

    revalidatePath("/strategy");
    revalidatePath("/dashboard");
  }

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

        {roleDirections.length > 0 ? (
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
        ) : (
          <EmptyState
            description="Role, directions, are, generated from your profile and resume evidence. Run a profile extraction to populate this."
            title="No role directions yet"
          />
        )}

        {feedback.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Evaluation feedback</CardTitle>
              <CardDescription>Corrections from job evaluations that should inform future role strategy.</CardDescription>
            </CardHeader>
            <ol className="grid gap-2">
              {feedback.map((item) => (
                <li className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={item.id}>
                  <span className="font-medium">{item.company} · {item.title}:</span> {item.correctedScore}% {item.correctedRecommendation}. {item.correctionNote}
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        <section className="grid gap-4">
          {roleDirections.map((direction) => (
            <Card key={`${direction.id}-edit`}>
              <CardHeader>
                <CardTitle>Edit {direction.roleFamily}</CardTitle>
                <CardDescription>Refine generated direction output after reviewing the evidence.</CardDescription>
              </CardHeader>
              <form action={updateRoleDirectionAction} className="grid gap-4">
                <input name="id" type="hidden" value={direction.id} />
                <div className="grid gap-4 md:grid-cols-[1fr_8rem]">
                  <Textarea defaultValue={direction.fitLevel} id={`${direction.id}-fit-level`} label="Fit level" name="fitLevel" />
                  <Textarea defaultValue={String(direction.score)} id={`${direction.id}-score`} label="Score" name="score" />
                </div>
                <Textarea defaultValue={direction.rationale} id={`${direction.id}-rationale`} label="Rationale" name="rationale" />
                <Textarea defaultValue={direction.gaps.join("\n")} id={`${direction.id}-gaps`} label="Gaps" name="gaps" />
                <div>
                  <SubmitButton label="Save direction" savedLabel="Saved" variant="secondary" />
                </div>
              </form>
            </Card>
          ))}
        </section>
      </div>
    </Shell>
  );
}
