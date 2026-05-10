import Link from "next/link";
import { Badge, Card, CardDescription, CardHeader, CardTitle, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { CreateResumeButton } from "@/components/create-resume-button";
import {
  GeneratedDocumentsTable,
  type GeneratedDocumentTableRow,
} from "@/components/generated-documents-table";
import { formatPostedDate } from "@/lib/dates";
import { getGeneratedDocuments, getJobById, getResumes, getUserProfile } from "@/lib/db/queries";
import type { ResumeBuilderVersionRecord, ResumeRecord } from "@/lib/db/types";
import { ensureResumeBuilderVersion } from "@/lib/documents/resume-builder";
import { dataTableClass } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function documentHasDraft(draftJson: string): boolean {
  try {
    const p = JSON.parse(draftJson) as Record<string, unknown>;
    return typeof p === "object" && p !== null && !!(p.name || p.summary);
  } catch {
    return false;
  }
}

type ResumeLaneRow = {
  resume: ResumeRecord;
  version?: ResumeBuilderVersionRecord;
};

function builderStatus(version?: ResumeBuilderVersionRecord) {
  if (!version || version.status === "needs_review") {
    return {
      label: "Needs review",
      tone: "warning" as const,
      description: "Review and approve before using this lane for generation.",
      action: "Review and approve",
    };
  }
  if (version.status === "approved") {
    return {
      label: "Approved",
      tone: "success" as const,
      description: "Approved source lane ready for targeted resume generation.",
      action: "Edit approved version",
    };
  }
  return {
    label: "Missing readable data",
    tone: "danger" as const,
    description: "Stored resume text or a readable source file is needed to build this lane.",
    action: "Open builder",
  };
}

function ResumeLaneCards({ rows }: { rows: ResumeLaneRow[] }) {
  return (
    <div className="grid gap-4 lg:hidden">
      {rows.map(({ resume, version }) => {
        const status = builderStatus(version);
        return (
          <div className="rounded-panel border border-border bg-panel p-4" key={resume.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-medium text-ink">{resume.name}</h2>
                <p className="mt-1 text-sm text-muted">{status.description}</p>
              </div>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{resume.wordCount > 0 ? `${resume.wordCount.toLocaleString()} words` : "No extracted text"}</span>
              {resume.extractedAt ? <span>Extracted {resume.extractedAt.slice(0, 10)}</span> : null}
            </div>
            <div className="mt-4">
              <LinkButton className="min-h-9 px-3 py-1.5" href={`/profile/resumes/${resume.id}/builder`}>
                {status.action}
              </LinkButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResumeLaneTable({ rows }: { rows: ResumeLaneRow[] }) {
  return (
    <Card className="hidden lg:block">
      <CardHeader>
        <CardTitle>Resume lanes</CardTitle>
        <CardDescription>Source PDF lanes — review and approve each before generating tailored resumes.</CardDescription>
      </CardHeader>
      <div className="w-full overflow-x-auto" role="region" aria-label="Resume lanes table">
        <table className={cn(dataTableClass)}>
          <thead>
            <tr>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">Lane</th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">Status</th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">Source text</th>
              <th className="pb-3 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted">Extracted</th>
              <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ resume, version }) => {
              const status = builderStatus(version);
              return (
                <tr key={resume.id}>
                  <td className="py-3 pr-4">
                    <Link className="font-medium text-accent hover:underline" href={`/profile/resumes/${resume.id}/builder`}>
                      {resume.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-muted">
                    {resume.wordCount > 0 ? `${resume.wordCount.toLocaleString()} words` : "—"}
                  </td>
                  <td className="py-3 pr-4 text-muted">{resume.extractedAt?.slice(0, 10) ?? "—"}</td>
                  <td className="py-3">
                    <LinkButton className="min-h-9 px-3 py-1.5" href={`/profile/resumes/${resume.id}/builder`}>
                      {status.action}
                    </LinkButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function ResumesPage() {
  const resumes = getResumes();
  const profile = getUserProfile();
  const resumeRows = await Promise.all(
    resumes.map(async (resume) => ({
      resume,
      version: await ensureResumeBuilderVersion(resume, profile),
    }))
  );
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
      <div className="grid grid-cols-1 gap-6">
        <PageHeader
          actions={<CreateResumeButton />}
          description="Resume studio showing source lanes and generated documents for targeted applications."
          eyebrow="Resume studio"
          title="Resumes"
        />

        <section className="grid gap-4">
          {resumes.length === 0 ? (
            <EmptyState
              description="Add source resume PDFs before generating tailored documents."
              title="No resume lanes available"
            />
          ) : null}
          {resumeRows.length > 0 ? (
            <>
              <ResumeLaneCards rows={resumeRows} />
              <ResumeLaneTable rows={resumeRows} />
            </>
          ) : null}
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
