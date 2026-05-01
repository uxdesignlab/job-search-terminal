import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { formatPostedDate } from "@/lib/dates";
import { getGeneratedDocuments, getJobById, getResumes } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default function ResumesPage() {
  const resumes = getResumes();
  const generatedDocuments = getGeneratedDocuments();

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
            <Table>
              <thead>
                <tr>
                  <Th scope="col">Target</Th>
                  <Th scope="col">Posted</Th>
                  <Th scope="col">Base resume</Th>
                  <Th scope="col">Generated</Th>
                  <Th scope="col">Coverage</Th>
                  <Th scope="col">Status</Th>
                  <Th scope="col">Output</Th>
                </tr>
              </thead>
              <tbody>
                {generatedDocuments.map((document) => {
                  const job = getJobById(document.jobId);
                  const hasDraft = (() => {
                    try {
                      const p = JSON.parse(document.draftJson) as Record<string, unknown>;
                      return typeof p === "object" && p !== null && !!(p.name || p.summary);
                    } catch { return false; }
                  })();

                  return (
                    <tr key={document.id}>
                      <Td>
                        {hasDraft ? (
                          <Link className="font-medium text-accent hover:underline" href={`/generated-documents/${document.id}/edit`}>
                            {document.role}
                          </Link>
                        ) : job ? (
                          <Link className="font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                            {document.role}
                          </Link>
                        ) : (
                          document.role
                        )}
                        <p className="text-xs text-muted">{document.company}</p>
                      </Td>
                      <Td>{job ? formatPostedDate(job) : "Date unavailable"}</Td>
                      <Td>{document.baseResume}</Td>
                      <Td>{document.generatedDate}</Td>
                      <Td>{document.keywordCoverage}%</Td>
                      <Td>
                        <Badge>{document.status}</Badge>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          {document.content ? (
                            <a className="font-medium text-accent hover:underline" href={`/generated-documents/${document.id}/preview`} rel="noreferrer" target="_blank">
                              Preview
                            </a>
                          ) : (
                            <span className="text-xs text-muted">Preview pending</span>
                          )}
                          {document.pdfUrl ? (
                            <a className="font-medium text-accent hover:underline" href={`/generated-documents/${document.id}/pdf`} rel="noreferrer" target="_blank">
                              PDF
                            </a>
                          ) : null}
                          {job?.url ? (
                            <a className="font-medium text-accent hover:underline" href={job.url} rel="noreferrer" target="_blank">
                              Job posting ↗
                            </a>
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
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
