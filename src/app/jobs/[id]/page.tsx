import { notFound } from "next/navigation";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell } from "@/components/ui";
import { getJobById } from "@/lib/db/queries";

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

  return (
    <Shell activeItem="Jobs">
      <div className="grid gap-6">
        <PageHeader
          actions={
            <>
              <Button>Generate tailored resume</Button>
              <Button variant="secondary">Prepare answers</Button>
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
              <CardTitle>{job.fitScore}%</CardTitle>
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
              <CardTitle>{job.recommendedResume}</CardTitle>
              <CardDescription>Recommended resume base</CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>Evaluation summary</CardTitle>
              <CardDescription>{job.summary}</CardDescription>
            </CardHeader>
            <div className="grid gap-3">
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
            <Badge tone={job.recommendation === "Skip" ? "danger" : "success"}>{job.recommendation}</Badge>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <DetailList title="Requirement match" items={job.requirementMatch} />
          <DetailList title="Resume evidence" items={job.resumeEvidence} />
          <DetailList title="Gaps and red flags" items={[...job.gaps, ...job.redFlags]} />
        </section>
      </div>
    </Shell>
  );
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
