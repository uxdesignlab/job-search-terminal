import { Badge, Card, CardDescription, CardHeader, CardTitle, PageHeader, Shell, Table, Td, Th } from "@/components/ui";
import { mockGeneratedDocuments } from "@/data/mock/generated-documents";
import { resumeLanes } from "@/data/mock/resume-lanes";

export default function ResumesPage() {
  return (
    <Shell activeItem="Resumes">
      <div className="grid gap-6">
        <PageHeader
          description="Resume studio showing source lanes and generated documents for targeted applications."
          eyebrow="Resume studio"
          title="Resumes"
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {resumeLanes.map((lane) => (
            <Card key={lane.id}>
              <CardHeader>
                <CardTitle>{lane.label}</CardTitle>
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
                <Th scope="col">Status</Th>
              </tr>
            </thead>
            <tbody>
              {mockGeneratedDocuments.map((document) => (
                <tr key={`${document.company}-${document.role}`}>
                  <Td>
                    {document.company}
                    <p className="text-xs text-muted">{document.role}</p>
                  </Td>
                  <Td>{document.baseResume}</Td>
                  <Td>{document.generatedDate}</Td>
                  <Td>
                    <Badge>{document.status}</Badge>
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
