import { notFound } from "next/navigation";
import { Shell } from "@/components/ui/shell";
import { getGeneratedDocumentById } from "@/lib/db/queries";
import { ResumeDraftEditor } from "@/components/resume-draft-editor";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";

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

  return (
    <Shell activeItem="Resumes">
      <ResumeDraftEditor
        documentId={id}
        jobId={doc.jobId}
        initialDraft={draft}
        documentTitle={doc.title}
        baseResume={doc.baseResume}
        keywordCoverage={doc.keywordCoverage}
      />
    </Shell>
  );
}
