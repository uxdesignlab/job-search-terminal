import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { EvaluateJobForm } from "@/components/evaluate-job-form";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, Input, PageHeader, Select, Shell, Textarea } from "@/components/ui";
import { getEvaluationByJobId, getJobById, saveEvaluationCorrection } from "@/lib/db/queries";
import { evaluateJob } from "@/lib/evaluation/job-evaluator";
import { splitListValue } from "@/lib/profile/intelligence";

export const dynamic = "force-dynamic";

type JobDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = await params;
  const job = getJobById(id);

  if (!job) {
    notFound();
  }

  const evaluation = getEvaluationByJobId(id);

  async function evaluateJobAction() {
    "use server";

    evaluateJob(id);
    revalidatePath(`/jobs/${id}`);
    revalidatePath("/jobs");
    revalidatePath("/dashboard");
  }

  async function saveCorrectionAction(formData: FormData) {
    "use server";

    saveEvaluationCorrection({
      jobId: id,
      roleArchetype: String(formData.get("roleArchetype") ?? ""),
      fitScore: Number(formData.get("fitScore") ?? 0),
      recommendation: String(formData.get("recommendation") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      strengths: splitListValue(formData.get("strengths")),
      gaps: splitListValue(formData.get("gaps")),
      redFlags: splitListValue(formData.get("redFlags")),
      correctionNote: String(formData.get("correctionNote") ?? "")
    });

    revalidatePath(`/jobs/${id}`);
    revalidatePath("/jobs");
    revalidatePath("/dashboard");
  }

  return (
    <Shell activeItem="Jobs">
      <div className="grid gap-6">
        <PageHeader
          actions={
            <>
              <EvaluateJobForm action={evaluateJobAction} />
              <Button disabled>Generate tailored resume</Button>
              <Button disabled variant="secondary">Prepare answers</Button>
              <Button variant="quiet">Save for later</Button>
            </>
          }
          description={`${job.company} · ${job.location} · ${job.remoteType}`}
          eyebrow="Job detail"
          title={job.title}
        />

        <section className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>{evaluation?.fitScore ?? job.fitScore}%</CardTitle>
              <CardDescription>Fit score</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{job.freshnessLabel}</CardTitle>
              <CardDescription>Freshness</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{job.status}</CardTitle>
              <CardDescription>Status</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{evaluation?.resumeBaseRecommendation ?? job.recommendedResume}</CardTitle>
              <CardDescription>Recommended resume base</CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Evaluation summary</CardTitle>
              <CardDescription>{evaluation?.summary ?? job.summary}</CardDescription>
            </CardHeader>
            <div className="grid gap-3">
              {evaluation ? (
                <div className="flex flex-wrap gap-2">
                  <Badge tone={evaluation.fitScore >= 85 ? "success" : evaluation.fitScore >= 70 ? "warning" : "neutral"}>{evaluation.scoreLabel}</Badge>
                  <Badge>{evaluation.roleArchetype}</Badge>
                  <Badge>{evaluation.legitimacyLabel || "Legitimacy not checked"}</Badge>
                </div>
              ) : null}
              <div>
                <h3 className="text-sm font-semibold text-ink">Why it matches</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{job.whyItMatches}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Main concern</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{job.mainConcern}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Salary/location notes</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{job.salaryNotes}</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recommended action</CardTitle>
              <CardDescription>Recommended next step for this opportunity.</CardDescription>
            </CardHeader>
            <Badge tone={(evaluation?.recommendation ?? job.recommendation) === "Skip" ? "danger" : "success"}>
              {evaluation?.recommendation ?? job.recommendation}
            </Badge>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <DetailList title="Requirement match" items={evaluation?.requirementMatch ?? job.requirementMatch} />
          <DetailList title="Resume evidence" items={evaluation?.resumeEvidence ?? job.resumeEvidence} />
          <DetailList title="Gaps and red flags" items={[...(evaluation?.gaps ?? job.gaps), ...(evaluation?.redFlags ?? job.redFlags)]} />
        </section>

        {evaluation ? (
          <>
            <section className="grid gap-4 lg:grid-cols-2">
              <EvaluationSection title="A. Role summary" items={evaluation.sections.roleSummary} />
              <EvaluationSection title="B. Match with resume" items={evaluation.sections.matchWithResume} />
              <EvaluationSection title="C. Level and strategy" items={evaluation.sections.levelStrategy} />
              <EvaluationSection title="D. Comp and demand" items={evaluation.sections.compensationDemand} />
              <EvaluationSection title="E. Personalization plan" items={evaluation.sections.tailoringPlan} />
              <EvaluationSection title="F. Interview plan" items={evaluation.sections.interviewPlan} />
              <EvaluationSection title="G. Posting legitimacy" items={evaluation.sections.postingLegitimacy} />
              <EvaluationSection title="Keywords" items={evaluation.keywords} />
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Correct evaluation</CardTitle>
                <CardDescription>Use this when the score or recommendation is wrong. Corrections are saved and added to the feedback history.</CardDescription>
              </CardHeader>
              <form action={saveCorrectionAction} className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-[1fr_9rem_14rem]">
                  <Input defaultValue={evaluation.roleArchetype} label="Role archetype" name="roleArchetype" />
                  <Input defaultValue={evaluation.fitScore} label="Fit score" max={100} min={0} name="fitScore" type="number" />
                  <Select defaultValue={evaluation.recommendation} label="Recommendation" name="recommendation">
                    <option>Priority apply</option>
                    <option>Strong apply</option>
                    <option>Review manually</option>
                    <option>Save for later</option>
                    <option>Skip</option>
                  </Select>
                </div>
                <Textarea defaultValue={evaluation.summary} label="Summary" name="summary" />
                <Textarea defaultValue={evaluation.strengths.join("\n")} hint="One strength per line." label="Strengths" name="strengths" />
                <Textarea defaultValue={evaluation.gaps.join("\n")} hint="One gap per line." label="Gaps" name="gaps" />
                <Textarea defaultValue={evaluation.redFlags.join("\n")} hint="One red flag per line." label="Red flags" name="redFlags" />
                <Textarea
                  defaultValue={String(evaluation.userCorrection.correctionNote ?? "")}
                  hint="Explain what the evaluator got wrong so future strategy can account for it."
                  label="Correction note"
                  name="correctionNote"
                />
                <div>
                  <Button type="submit" variant="secondary">Save correction</Button>
                </div>
              </form>
            </Card>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No saved evaluation yet</CardTitle>
              <CardDescription>Run the job evaluation to score this role against the profile, role strategy, constraints, and resume evidence.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </Shell>
  );
}

function EvaluationSection({ title, items }: { title: string; items: string[] }) {
  return <DetailList title={title} items={items.length > 0 ? items : ["No data captured."]} />;
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Supporting detail for the job view.</CardDescription>
      </CardHeader>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
