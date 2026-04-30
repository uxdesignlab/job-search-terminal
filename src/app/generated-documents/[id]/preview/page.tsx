import { notFound } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell } from "@/components/ui";
import { getGeneratedDocumentById, getJobById } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type GeneratedDocumentPreviewProps = {
  params: Promise<{ id: string }>;
};

export default async function GeneratedDocumentPreview({ params }: GeneratedDocumentPreviewProps) {
  const { id } = await params;
  const document = getGeneratedDocumentById(id);

  if (!document) {
    notFound();
  }

  const job = getJobById(document.jobId);

  return (
    <Shell activeItem="Resumes">
      <div className="grid gap-6">
        <PageHeader
          actions={
            <>
              {job ? (
                <a
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-panel px-4 py-2 text-sm font-medium text-ink hover:border-accent"
                  href={job.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Job posting
                </a>
              ) : null}
              <a className="inline-flex min-h-11 items-center justify-center rounded-control border border-accent bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(var(--color-accent-strong))]" href={`/generated-documents/${document.id}/pdf`}>
                Open PDF
              </a>
            </>
          }
          description={`${document.company} · ${document.role}`}
          eyebrow="Generated resume"
          title={document.title}
        />

        <Card>
          <CardHeader>
            <CardTitle>Tailoring plan</CardTitle>
            <CardDescription>{document.tailoringSummary}</CardDescription>
          </CardHeader>
          <ul className="grid gap-2">
            {document.tailoringPlan.map((item) => (
              <li className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <iframe className="min-h-[70vh] w-full rounded-panel border border-border bg-white" srcDoc={document.content} title={`${document.title} preview`} />
      </div>
    </Shell>
  );
}
