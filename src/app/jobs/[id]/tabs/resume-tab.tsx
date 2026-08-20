import { ResumeGeneratorModal } from "@/components/resume-generator-modal";
import { StreamingEvaluation } from "@/components/streaming-evaluation";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  LinkButton,
  SubmitButton,
} from "@/components/ui";
import type {
  EvaluationRecord,
  GeneratedDocumentRecord,
  ResumeBuilderSection,
  ResumeBuilderVersionStatus,
  ResumeRecord,
} from "@/lib/db/types";
import { coerceResumeBaseToLane } from "@/lib/evaluation/resume-lane-picker";

type Props = {
  evaluation: EvaluationRecord | undefined;
  generatedDocument: GeneratedDocumentRecord | undefined;
  hasDraft: boolean;
  id: string;
  resolvedRecommendedResume: string;
  resumeLaneNames: string[];
  resumeVersions: Record<string, { status: ResumeBuilderVersionStatus; sections: ResumeBuilderSection[] }>;
  resumes: ResumeRecord[];
  setResumeBaseAction: (formData: FormData) => Promise<void>;
};

export function ResumeTab({
  evaluation,
  generatedDocument,
  hasDraft,
  id,
  resolvedRecommendedResume,
  resumeLaneNames,
  resumeVersions,
  resumes,
  setResumeBaseAction,
}: Props) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-[0.6fr_1.4fr]">
        {/* Resume base selector */}
        <Card>
          <CardHeader>
            <CardTitle>Base resume</CardTitle>
            <CardDescription>
              {evaluation
                ? `AI suggests: ${coerceResumeBaseToLane(
                    evaluation.resumeBaseRecommendation,
                    evaluation.roleArchetype,
                    resumeLaneNames
                  )}`
                : "Pick which resume to tailor from"}
            </CardDescription>
          </CardHeader>
          {resumes.length > 0 ? (
            <form action={setResumeBaseAction} className="grid gap-3" key={`${id}-resume-base-${resolvedRecommendedResume}`}>
              <div className="grid gap-2">
                {resumes.map((r) => {
                  // Prefer a valid saved job.recommendedResume; otherwise fall back to a coerced lane from evaluation.
                  const isRec = r.name === resolvedRecommendedResume;
                  return (
                    <label
                      key={r.id}
                      className="flex cursor-pointer items-start gap-2 rounded-control border border-border bg-surface p-2.5 hover:border-accent/40"
                    >
                      <input
                        className="mt-0.5 shrink-0 accent-[rgb(var(--color-accent))]"
                        defaultChecked={isRec}
                        name="resumeName"
                        type="radio"
                        value={r.name}
                      />
                      <div>
                        <p className="text-sm font-medium text-ink">{r.name}</p>
                        <p className="text-xs text-muted">{r.wordCount > 0 ? `${r.wordCount} words` : r.sourceFile ? "Uploaded" : "Not uploaded"}</p>
                      </div>
                      {isRec && (
                        <span className="ml-auto shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-accent">
                          Recommended
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <SubmitButton label="Save preference" savedLabel="Saved ✓" variant="secondary" />
            </form>
          ) : (
            <p className="text-sm text-muted">No resumes uploaded. Go to Profile → Resume lanes.</p>
          )}
        </Card>

        {/* Generate + document */}
        <div className="grid gap-4 content-start">
          <Card>
            <CardHeader>
              <CardTitle>{generatedDocument ? "Resume generated" : "Generate tailored resume"}</CardTitle>
              <CardDescription>
                {generatedDocument
                  ? generatedDocument.tailoringSummary
                  : "The AI tailors your summary and reorders bullets to match this job's ATS keywords."}
              </CardDescription>
            </CardHeader>
            <div className="flex flex-wrap gap-2">
              <ResumeGeneratorModal
                hasExistingDocument={!!generatedDocument}
                jobId={id}
                recommendedResume={resolvedRecommendedResume}
                resumeVersions={resumeVersions}
                resumes={resumes}
              />
              {hasDraft && generatedDocument && (
                <LinkButton href={`/generated-documents/${generatedDocument.id}/edit`} variant="secondary">
                  Edit draft
                </LinkButton>
              )}
              {generatedDocument?.pdfUrl && (
                <a
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-accent bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-[rgb(var(--color-accent-strong))]"
                  href={`/generated-documents/${generatedDocument.id}/pdf`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Download PDF
                </a>
              )}
            </div>
            {generatedDocument && (
              <p className="mt-2 text-xs text-muted">
                {generatedDocument.baseResume} · {generatedDocument.keywordCoverage}% keyword coverage · {generatedDocument.generatedDate}
              </p>
            )}
          </Card>

          {!evaluation && (
            <Card>
              <CardHeader>
                <CardTitle>Evaluate first for best results</CardTitle>
                <CardDescription>
                  Evaluation extracts ATS keywords and match signals used to tailor the resume. You can still generate without it.
                </CardDescription>
              </CardHeader>
              <StreamingEvaluation hasExistingEvaluation={false} jobId={id} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
