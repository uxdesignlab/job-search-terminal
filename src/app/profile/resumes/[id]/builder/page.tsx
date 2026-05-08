import { notFound } from "next/navigation";
import { Shell } from "@/components/ui/shell";
import { EmptyState } from "@/components/ui";
import { ResumeBuilderEditor } from "@/components/resume-builder-editor";
import { getResumes, getUserProfile } from "@/lib/db/queries";
import { ensureResumeBuilderVersion } from "@/lib/documents/resume-builder";

export const dynamic = "force-dynamic";

type BuilderPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ResumeBuilderPage({ params }: BuilderPageProps) {
  const { id } = await params;
  const resume = getResumes().find((item) => item.id === id);
  if (!resume) notFound();

  const profile = getUserProfile();
  const version = await ensureResumeBuilderVersion(resume, profile);

  return (
    <Shell activeItem="Resumes">
      {version && version.status !== "missing_source" ? (
        <ResumeBuilderEditor resumeId={resume.id} resumeName={resume.name} version={version} />
      ) : (
        <EmptyState
          title="No readable resume data"
          description="This lane does not have extracted resume text or a readable stored PDF. Replace the PDF on the Resumes tab to rebuild this version."
        />
      )}
    </Shell>
  );
}
