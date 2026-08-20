import { notFound } from "next/navigation";
import { Shell } from "@/components/ui/shell";
import { getGeneratedDocumentById, getEffectiveKeywordSignals, getJobGapResponses, getProfileSupplements, getResumes } from "@/lib/db/queries";
import { ResumeDraftEditor } from "@/components/resume-draft-editor";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";
import { keywordCoverageFor, isKeywordInText } from "@/lib/documents/keyword-coverage";
import { describeReverts, type EvidenceAudit } from "@/lib/documents/evidence-audit";
import { describeUnchanged } from "@/lib/documents/tailoring-effect";

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

  // A reverted section reads as approved source wording while the document still
  // reports a supported audit, so without this the draft looks tailored when the
  // summary — the section that carries the title and domain keywords for ATS —
  // is the untouched lane default.
  let revertNotice = "";
  let unchangedNotice = "";
  try {
    const audit = JSON.parse(doc.evidenceAuditJson) as EvidenceAudit;
    revertNotice = describeReverts(audit.reverted ?? []);
    // A model that ran and rewrote little is as invisible as a reverted section:
    // the draft stores a supported audit over source content and reads tailored.
    unchangedNotice = describeUnchanged(audit.unchanged ?? []);
  } catch {
    revertNotice = "";
    unchangedNotice = "";
  }

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
        revertNotice={revertNotice}
        unchangedNotice={unchangedNotice}
      />
    </Shell>
  );
}
