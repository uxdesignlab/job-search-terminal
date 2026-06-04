import { notFound } from "next/navigation";
import { Shell } from "@/components/ui/shell";
import { getGeneratedDocumentById, getEvaluationByJobId, getJobGapResponses, getProfileSupplements, getResumes } from "@/lib/db/queries";
import { ResumeDraftEditor } from "@/components/resume-draft-editor";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";
import { keywordCoverageFor, isKeywordInText } from "@/lib/documents/keyword-coverage";

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
  const resumes = getResumes();
  const lane = resumes.find((resume) => resume.id === doc.baseResumeId)
    ?? resumes.find((resume) => resume.name === doc.baseResume);
  const gapEvidence = getJobGapResponses(doc.jobId)
    .filter((response) => response.qualityStatus === "addressed")
    .map((response) => response.polishedResponse || response.rawResponse);
  const evidenceText = [lane?.extractedText ?? "", ...getProfileSupplements().filter((supplement) => supplement.qualityStatus === "addressed").map((supplement) => supplement.content), ...gapEvidence]
    .join(" ")
    .toLowerCase();
  const supportedKeywords = (evaluation?.keywords ?? []).filter((keyword) => isKeywordInText(evidenceText, keyword));

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
        supportedKeywords={supportedKeywords}
        tailoringStatus={doc.tailoringStatus}
        fallbackReason={doc.fallbackReason}
      />
    </Shell>
  );
}
