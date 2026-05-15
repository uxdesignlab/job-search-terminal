import { notFound } from "next/navigation";
import { Shell } from "@/components/ui/shell";
import { getGeneratedDocumentById, getEvaluationByJobId } from "@/lib/db/queries";
import { ResumeDraftEditor } from "@/components/resume-draft-editor";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";
import { keywordCoverageFor } from "@/lib/documents/resume-generator";

export const dynamic = "force-dynamic";

type EditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditResumePage({ params }: EditPageProps) {
  const { id } = await params;
  const doc = getGeneratedDocumentById(id);

  if (!doc) notFound();

  let draft: ResumeTemplateInput;
  try {
    const parsed = JSON.parse(doc.draftJson) as ResumeTemplateInput;
    if (!parsed.name && !parsed.summary) notFound();
    draft = parsed;
  } catch {
    notFound();
  }

  const evaluation = getEvaluationByJobId(doc.jobId);
  const keywordCoverage = evaluation?.keywords?.length
    ? keywordCoverageFor(draft, evaluation.keywords)
    : doc.keywordCoverage;

  return (
    <Shell activeItem="Resumes">
      <ResumeDraftEditor
        documentId={id}
        jobId={doc.jobId}
        initialDraft={draft}
        documentTitle={doc.title}
        baseResume={doc.baseResume}
        keywordCoverage={keywordCoverage}
        keywords={evaluation?.keywords ?? []}
      />
    </Shell>
  );
}
