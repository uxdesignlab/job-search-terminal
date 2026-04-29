import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell, Table, Td, Th } from "@/components/ui";
import { getGeneratedDocuments, getResumes } from "@/lib/db/queries";

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
          <Table>
            <thead>
              <tr>
                <Th scope="col">Target</Th>
                <Th scope="col">Base resume</Th>
                <Th scope="col">Generated</Th>
                <Th scope="col">Coverage</Th>
                <Th scope="col">Status</Th>
                <Th scope="col">Output</Th>
              </tr>
            </thead>
            <tbody>
              {generatedDocuments.map((document) => (
                <tr key={document.id}>
                  <Td>
                    {document.company}
                    <p className="text-xs text-muted">{document.role}</p>
                  </Td>
                  <Td>{document.baseResume}</Td>
                  <Td>{document.generatedDate}</Td>
                  <Td>{document.keywordCoverage}%</Td>
                  <Td>
                    <Badge>{document.status}</Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      {document.content ? (
                        <Link className="font-medium text-accent hover:underline" href={`/generated-documents/${document.id}/preview`}>
                          Preview
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">Preview pending</span>
                      )}
                      {document.pdfUrl ? (
                        <a className="font-medium text-accent hover:underline" href={`/generated-documents/${document.id}/pdf`}>
                          PDF
                        </a>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </Shell>
  );
}
