import { notFound } from "next/navigation";
import { Shell } from "@/components/ui/shell";
import { getGeneratedDocumentById, getEffectiveKeywordSignals, getJobGapResponses, getProfileSupplements, getResumes } from "@/lib/db/queries";
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

  // One resolver for every consumer (§25.2): Application Preparation first, then
  // the legacy evaluation tiers. Reading evaluation.keywords here would leave a
  // fast-v2 job showing zero coverage even after preparation had extracted them.
  const keywordSignals = getEffectiveKeywordSignals(doc.jobId);
  const keywords = keywordSignals.map((signal) => signal.keyword);
  const keywordCoverage = keywordSignals.length > 0
    ? keywordCoverageFor(draft, keywordSignals)
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
  const supportedKeywords = keywords.filter((keyword) => isKeywordInText(evidenceText, keyword));

  return (
    <Shell activeItem="Resumes">
      <ResumeDraftEditor
        documentId={id}
        jobId={doc.jobId}
        initialDraft={draft}
        documentTitle={doc.title}
        baseResume={doc.baseResume}
        keywordCoverage={keywordCoverage}
        keywords={keywords}
        keywordSignals={keywordSignals}
        supportedKeywords={supportedKeywords}
        tailoringStatus={doc.tailoringStatus}
        fallbackReason={doc.fallbackReason}
      />
    </Shell>
  );
}
