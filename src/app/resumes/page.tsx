import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import {
  GeneratedDocumentsTable,
  type GeneratedDocumentTableRow,
} from "@/components/generated-documents-table";
import { formatPostedDate } from "@/lib/dates";
import { getGeneratedDocuments, getJobById, getResumes } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

function documentHasDraft(draftJson: string): boolean {
  try {
    const p = JSON.parse(draftJson) as Record<string, unknown>;
    return typeof p === "object" && p !== null && !!(p.name || p.summary);
  } catch {
    return false;
  }
}

export default function ResumesPage() {
  const resumes = getResumes();
  const generatedDocuments = getGeneratedDocuments();
  const documentRows: GeneratedDocumentTableRow[] = generatedDocuments.map((document) => {
    const job = getJobById(document.jobId);
    return {
      id: document.id,
      company: document.company,
      role: document.role,
      postedLabel: job ? formatPostedDate(job) : "Date unavailable",
      baseResume: document.baseResume,
      generatedDate: document.generatedDate,
      keywordCoverage: document.keywordCoverage,
      status: document.status,
      hasContent: Boolean(document.content),
      hasPdf: Boolean(document.pdfUrl),
      jobUrl: job?.url ?? null,
      editHref: `/generated-documents/${document.id}/edit`,
      jobHref: job ? `/jobs/${job.id}` : null,
      hasDraft: documentHasDraft(document.draftJson),
    };
  });

  return (
    <Shell activeItem="Resumes">
      <div className="grid gap-6">
        <PageHeader
          description="Resume studio showing source lanes and generated documents for targeted applications."
          eyebrow="Resume studio"
          title="Resumes"
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resumes.length === 0 ? (
            <EmptyState
              description="Add source resume PDFs before generating tailored documents."
              title="No resume lanes available"
            />
          ) : null}
          {resumes.map((resume) => (
            <Card key={resume.id}>
              <CardHeader>
                <CardTitle>{resume.name}</CardTitle>
                <CardDescription>Base resume lane ready for future tailoring.</CardDescription>
              </CardHeader>
              <Badge tone="success">Source ready</Badge>
            </Card>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Generated documents</CardTitle>
            <CardDescription>Tailored documents prepared for target roles.</CardDescription>
          </CardHeader>
          {generatedDocuments.length > 0 ? (
            <GeneratedDocumentsTable rows={documentRows} />
          ) : (
            <EmptyState
              description="Generate, a tailored, resume from a job detail page to populate this table."
              title="No generated documents yet"
            />
          )}
        </Card>
      </div>
    </Shell>
  );
}
