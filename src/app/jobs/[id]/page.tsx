import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ApplicationStatusSelect } from "@/components/application-status-select";
import { ApplicationQuestionsForm } from "@/components/application-questions-form";
import { CopyAnswerButton } from "@/components/copy-answer-button";
import { GapAddressingPanel } from "@/components/gap-addressing-panel";
import { ResumeGeneratorModal } from "@/components/resume-generator-modal";
import { StreamingEvaluation } from "@/components/streaming-evaluation";
import { AIProviderBadge } from "@/components/ai-provider-badge";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ExternalLinkButton,
  Input,
  LinkButton,
  Select,
  SubmitButton,
  Textarea,
} from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { prepareApplicationAnswers } from "@/lib/applications/application-assistant";
import { prepareApplicationAnswersWithAI } from "@/lib/applications/llm-answer-generator";
import { getAISettings } from "@/lib/db/queries";
import { isApplicationStatus } from "@/lib/applications/status";
import { formatPostedDate } from "@/lib/dates";
import {
  archiveJob,
  deleteJob,
  getApplicationAnswerDrafts,
  getApplicationByJobId,
  getEvaluationByJobId,
  getGeneratedDocumentById,
  getJobById,
	  getJobGapResponses,
	  getResumes,
	  getUserProfile,
	  saveEvaluationCorrection,
  saveJobLiveness,
  saveStory,
  unarchiveJob,
  updateApplicationStatus,
  updateJobRecommendedResume,
} from "@/lib/db/queries";
import { ensureResumeBuilderVersion } from "@/lib/documents/resume-builder";
import type { ResumeBuilderSection, ResumeBuilderVersionStatus } from "@/lib/db/types";
import { coerceResumeBaseToLane } from "@/lib/evaluation/resume-lane-picker";
import { splitListValue } from "@/lib/profile/intelligence";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const TABS = ["overview", "resume", "apply", "analysis"] as const;
type Tab = (typeof TABS)[number];

function validTab(t: string | undefined): Tab {
  return (TABS as readonly string[]).includes(t ?? "") ? (t as Tab) : "overview";
}

export default async function JobDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = validTab(rawTab);

  const job = getJobById(id);
  if (!job) notFound();

  const evaluation = getEvaluationByJobId(id);
  const generatedDocument = getGeneratedDocumentById(`document-${id}`);
  const application = getApplicationByJobId(id);
  const answerDrafts = getApplicationAnswerDrafts(id);
  const resumes = getResumes();
  const profile = getUserProfile();
  const resumeVersions: Record<string, { status: ResumeBuilderVersionStatus; sections: ResumeBuilderSection[] }> = Object.fromEntries(
    await Promise.all(
      resumes.map(async (resume) => {
        const version = await ensureResumeBuilderVersion(resume, profile);
        return [
          resume.id,
          {
            status: version?.status ?? "missing_source",
            sections: version?.sections ?? []
          }
        ];
      })
    )
  );
  const resumeLaneNames = resumes.map((r) => r.name);
  const resolvedRecommendedResume = resumeLaneNames.includes(job.recommendedResume)
    ? job.recommendedResume
    : evaluation
      ? coerceResumeBaseToLane(
          evaluation.resumeBaseRecommendation,
          evaluation.roleArchetype,
          resumeLaneNames
        )
      : "";
  const gapResponses = getJobGapResponses(id);
  const gapResponseMap = Object.fromEntries(
    gapResponses.map((r) => [r.gapText, { rawResponse: r.rawResponse, polishedResponse: r.polishedResponse }])
  );
  const allGapItems = [...(evaluation?.gaps ?? job.gaps), ...(evaluation?.redFlags ?? job.redFlags)];

  const hasDraft = (() => {
    try {
      const p = JSON.parse(generatedDocument?.draftJson ?? "{}") as Record<string, unknown>;
      return typeof p === "object" && p !== null && !!(p.name || p.summary);
    } catch { return false; }
  })();

  // ── Server actions ────────────────────────────────────────────────────────

  async function deleteJobAction() {
    "use server";
    deleteJob(id);
    redirect("/jobs");
  }

  async function saveCorrectionAction(formData: FormData) {
    "use server";
    saveEvaluationCorrection({
      jobId: id,
      roleArchetype: String(formData.get("roleArchetype") ?? ""),
      fitScore: Number(formData.get("fitScore") ?? 0),
      recommendation: String(formData.get("recommendation") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      strengths: splitListValue(formData.get("strengths")),
      gaps: splitListValue(formData.get("gaps")),
      redFlags: splitListValue(formData.get("redFlags")),
      correctionNote: String(formData.get("correctionNote") ?? ""),
    });
    revalidatePath(`/jobs/${id}`);
    revalidatePath("/jobs");
    revalidatePath("/dashboard");
  }

  async function prepareAnswersAction(formData: FormData) {
    "use server";
    const customQuestions = formData.getAll("question").map(String).filter((q) => q.trim());
    const aiSettings = getAISettings();
    const hasAIKey = aiSettings.anthropicApiKey || aiSettings.geminiApiKey || aiSettings.openaiApiKey;
    if (hasAIKey) {
      await prepareApplicationAnswersWithAI(id, customQuestions);
    } else {
      prepareApplicationAnswers(id, customQuestions);
    }
    revalidatePath(`/jobs/${id}`);
    revalidatePath("/applications");
    revalidatePath("/dashboard");
  }

  async function saveStoryAction(formData: FormData) {
    "use server";
    const { randomUUID } = await import("node:crypto");
    saveStory({
      id: randomUUID(),
      title: String(formData.get("title") ?? ""),
      situation: String(formData.get("situation") ?? ""),
      task: String(formData.get("task") ?? ""),
      action: String(formData.get("action") ?? ""),
      result: String(formData.get("result") ?? ""),
      reflection: "",
      skills: [],
      themes: [],
      sourceJobId: String(formData.get("jobId") ?? ""),
      sourceBlockF: String(formData.get("sourceBlockF") ?? ""),
    });
    revalidatePath("/interview-prep");
  }

  async function setResumeBaseAction(formData: FormData) {
    "use server";
    const resumeName = String(formData.get("resumeName") ?? "").trim();
    if (resumeName) updateJobRecommendedResume(id, resumeName);
    revalidatePath(`/jobs/${id}`);
  }

  async function fetchDescriptionAction() {
    "use server";
    const { fetchJobDescription } = await import("@/lib/scanner/jd-fetcher");
    const { saveJobDescription } = await import("@/lib/db/queries");
    const current = getJobById(id);
    if (current && !current.rawDescription && current.url) {
      const desc = await fetchJobDescription(current);
      if (desc) saveJobDescription(id, desc);
    }
    revalidatePath(`/jobs/${id}`);
  }

  async function checkLivenessAction() {
    "use server";
    const { checkJobLiveness } = await import("@/lib/scanner/liveness-checker");
    const current = getJobById(id);
    if (current?.url) {
      const result = await checkJobLiveness(current.url);
      saveJobLiveness(id, result.status, result.reason);
    }
    revalidatePath(`/jobs/${id}`);
    revalidatePath("/jobs");
    revalidatePath("/archived");
  }

  async function archiveJobAction() {
    "use server";
    archiveJob(id);
    revalidatePath(`/jobs/${id}`);
    revalidatePath("/jobs");
    revalidatePath("/archived");
    redirect("/jobs");
  }

  async function unarchiveJobAction() {
    "use server";
    unarchiveJob(id);
    revalidatePath(`/jobs/${id}`);
    revalidatePath("/jobs");
    revalidatePath("/archived");
    redirect("/jobs");
  }

  async function updateStatusAction(formData: FormData) {
    "use server";
    const status = String(formData.get("status") ?? "");
    if (!isApplicationStatus(status)) throw new Error(`Unsupported status: ${status}`);
    const followUpDate = String(formData.get("followUpDate") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    updateApplicationStatus({
      jobId: id,
      status,
      followUpDate: followUpDate || undefined,
      notes: notes || undefined,
    });
    revalidatePath(`/jobs/${id}`);
    revalidatePath("/applications");
    revalidatePath("/dashboard");
  }

  // ── Derived display values ────────────────────────────────────────────────

  const fitScore = evaluation?.fitScore ?? job.fitScore;
  const recommendation = evaluation?.recommendation ?? job.recommendation;
  const scoreLabel = evaluation?.scoreLabel ?? (fitScore >= 85 ? "Strong fit" : fitScore >= 70 ? "Review" : "Selective");
  const scoreTone = fitScore >= 85 ? "success" : fitScore >= 70 ? "warning" : "neutral";

  // ── Tab link helper ───────────────────────────────────────────────────────

  const tabHref = (t: Tab) => `/jobs/${id}?tab=${t}`;
  const tabCls = (t: Tab) =>
    `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      tab === t
        ? "border-accent text-accent"
        : "border-transparent text-muted hover:text-ink hover:border-border"
    }`;

  return (
    <Shell activeItem="Jobs">
      <div className="grid gap-0">

        {/* ── Archived banner ──────────────────────────────────────── */}
        {job.archived && (
          <div className="mb-4 flex items-center gap-3 rounded-control border border-warning/40 bg-warning/8 px-4 py-3">
            <span className="text-sm font-medium text-warning">This job is archived</span>
            <span className="text-xs text-muted">— hidden from the main Jobs list. Click Unarchive to restore it.</span>
          </div>
        )}

        {/* ── Page header ─────────────────────────────────────────── */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted">Job detail</p>
            <h1 className="text-xl font-semibold text-ink">{job.title}</h1>
            <p className="mt-0.5 text-sm text-muted">{job.company} · {job.location} · {job.remoteType}</p>
          </div>

          {/* Header actions — evaluate, liveness, posting link */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!job.archived && <StreamingEvaluation hasExistingEvaluation={!!evaluation} jobId={id} />}
            {!job.archived && (
              <form action={checkLivenessAction}>
                <SubmitButton label="Check live" pendingLabel="Checking…" savedLabel="Done ✓" variant="secondary" />
              </form>
            )}
            <ExternalLinkButton href={job.url}>Job posting ↗</ExternalLinkButton>
          </div>
        </div>

        {/* ── Status & score bar ───────────────────────────────────── */}
        <div className="mb-4 flex items-center justify-between gap-4 rounded-panel border border-border bg-panel px-4 py-2.5">
          {/* Left: status dropdown + job actions */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Status</span>
            <ApplicationStatusSelect
              action={updateStatusAction}
              currentStatus={application?.status ?? job.status}
            />
            {job.archived ? (
              <form action={unarchiveJobAction}>
                <button
                  className="inline-flex min-h-8 items-center justify-center rounded-control border border-border px-3 py-1 text-sm font-medium text-muted hover:text-ink"
                  type="submit"
                >
                  Unarchive
                </button>
              </form>
            ) : (
              <form action={archiveJobAction}>
                <button
                  className="inline-flex min-h-8 items-center justify-center rounded-control border border-border px-3 py-1 text-sm font-medium text-muted hover:text-ink"
                  type="submit"
                >
                  Archive
                </button>
              </form>
            )}
            <form action={deleteJobAction}>
              <button
                className="inline-flex min-h-8 items-center justify-center rounded-control border border-danger/40 px-3 py-1 text-sm font-medium text-danger hover:bg-danger/8"
                type="submit"
              >
                Delete
              </button>
            </form>
          </div>
          {/* Right: score strip */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge tone={scoreTone}>{fitScore}% · {scoreLabel}</Badge>
            <Badge tone={recommendation === "Skip" ? "danger" : "success"}>{recommendation}</Badge>
            {evaluation?.legitimacyLabel ? <Badge>{evaluation.legitimacyLabel}</Badge> : null}
            {job.livenessStatus === "active" && <Badge tone="success">Live ✓</Badge>}
            {job.livenessStatus === "expired" && <Badge tone="danger">Expired</Badge>}
            {job.livenessStatus === "uncertain" && <Badge tone="warning">Status uncertain</Badge>}
            <span className="text-xs text-muted">{formatPostedDate(job)}</span>
            <span className="text-xs text-muted">· {job.status}</span>
          </div>
        </div>

        {/* ── Tab navigation ───────────────────────────────────────── */}
        <div className="mb-6 flex border-b border-border overflow-x-auto">
          <Link href={tabHref("overview")} className={tabCls("overview")}>Overview</Link>
          <Link href={tabHref("resume")} className={tabCls("resume")}>
            Resume {generatedDocument ? <span className="ml-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">Ready</span> : null}
          </Link>
          <Link href={tabHref("apply")} className={tabCls("apply")}>
            Apply {application ? <span className="ml-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{application.status}</span> : null}
          </Link>
          <Link href={tabHref("analysis")} className={tabCls("analysis")}>
            Analysis {!evaluation ? <span className="ml-1 text-[10px] text-muted">(run evaluate)</span> : null}
          </Link>
        </div>

        {/* ── Tab: Overview ────────────────────────────────────────── */}
        {tab === "overview" && (
          <div className="grid gap-6">
            <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
              {/* Evaluation summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Evaluation summary</CardTitle>
                  <CardDescription>{evaluation?.summary ?? job.summary}</CardDescription>
                </CardHeader>
                {evaluation && (
                  <div className="grid gap-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge>{evaluation.roleArchetype}</Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Why it matches</p>
                        <p className="mt-1 text-sm leading-6 text-ink">{job.whyItMatches}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Main concern</p>
                        <p className="mt-1 text-sm leading-6 text-ink">{job.mainConcern}</p>
                      </div>
                    </div>
                    {job.salaryNotes && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Salary / location</p>
                        <p className="mt-1 text-sm leading-6 text-ink">{job.salaryNotes}</p>
                      </div>
                    )}
                  </div>
                )}
                {!evaluation && (
                  <p className="text-sm text-muted">Run Evaluate with AI to get a detailed assessment of this role.</p>
                )}
              </Card>

              {/* Quick actions sidebar */}
              <div className="grid gap-3 content-start">
                <Card>
                  <CardHeader>
                    <CardTitle>Next step</CardTitle>
                  </CardHeader>
                  <div className="grid gap-2">
                    <Badge tone={recommendation === "Skip" ? "danger" : "success"} >{recommendation}</Badge>
                    <Link href={tabHref("resume")} className="mt-1 text-sm font-medium text-accent hover:underline">
                      → Go to Resume tab
                    </Link>
                    <Link href={tabHref("apply")} className="text-sm font-medium text-accent hover:underline">
                      → Go to Apply tab
                    </Link>
                    <LinkButton href={`/jobs/${id}/research`} variant="quiet">Company research</LinkButton>
                    <LinkButton href={`/jobs/${id}/outreach`} variant="quiet">Draft outreach</LinkButton>
                  </div>
                </Card>
              </div>
            </div>

            {/* Match grid */}
            <section className="grid gap-4 md:grid-cols-3">
              <DetailList title="Requirement match" items={evaluation?.requirementMatch ?? job.requirementMatch} />
              <DetailList title="Resume evidence" items={evaluation?.resumeEvidence ?? job.resumeEvidence} />
              <GapAddressingPanel jobId={id} items={allGapItems} initialResponses={gapResponseMap} />
            </section>

            {/* Job description — collapsed by default */}
            <Card>
              {job.rawDescription || job.parsedDescription ? (
                <details>
                  <summary className="cursor-pointer list-none px-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">Job description</p>
                        <p className="text-xs text-muted">Saved locally — readable even if the posting is taken down</p>
                      </div>
                      <span className="text-xs text-muted select-none">▸ Show</span>
                    </div>
                  </summary>
                  <div className="mt-4 border-t border-border pt-4">
                    <pre className="whitespace-pre-wrap text-sm leading-6 text-ink font-sans">
                      {job.parsedDescription || job.rawDescription}
                    </pre>
                  </div>
                </details>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">Job description not saved</p>
                    <p className="text-xs text-muted">Fetch from the ATS to enable accurate evaluation and resume tailoring.</p>
                  </div>
                  <form action={fetchDescriptionAction}>
                    <SubmitButton label="Fetch description" pendingLabel="Fetching…" savedLabel="Saved ✓" variant="secondary" />
                  </form>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Tab: Resume ──────────────────────────────────────────── */}
        {tab === "resume" && (
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
                              <p className="text-xs text-muted">{r.wordCount} words</p>
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
        )}

        {/* ── Tab: Apply ───────────────────────────────────────────── */}
        {tab === "apply" && (
          <div className="grid gap-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Application tracker */}
              <Card>
                <CardHeader>
                  <CardTitle>Application status</CardTitle>
                  <CardDescription>
                    <span className="flex flex-wrap items-center gap-2">
                      <span>Track where you are in the process. All actions are manual — the app never submits anything on your behalf.</span>
                      {application?.followUpDate && (
                        <Badge>{`Follow-up ${application.followUpDate}`}</Badge>
                      )}
                    </span>
                  </CardDescription>
                </CardHeader>
                <div className="grid gap-4">
                  <form action={updateStatusAction} className="grid gap-3">
                    <input name="status" type="hidden" value="Follow-up needed" />
                    <Input
                      defaultValue={application?.followUpDate ?? ""}
                      hint="Set a date to check back after applying."
                      label="Follow-up date"
                      name="followUpDate"
                      type="date"
                    />
                    <Textarea
                      defaultValue={application?.notes ?? ""}
                      label="Note"
                      name="notes"
                      hint="Private note for your next action."
                    />
                    <div>
                      <Button type="submit" variant="secondary">Save follow-up</Button>
                    </div>
                  </form>
                </div>
              </Card>

              {/* Quick links */}
              <div className="grid gap-4 content-start">
                <Card>
                  <CardHeader>
                    <CardTitle>Next actions</CardTitle>
                  </CardHeader>
                  <div className="grid gap-2">
                    <ExternalLinkButton href={job.url}>Open job posting ↗</ExternalLinkButton>
                    <LinkButton href={`/jobs/${id}/research`} variant="secondary">Company research</LinkButton>
                    <LinkButton href={`/jobs/${id}/outreach`} variant="secondary">Draft LinkedIn outreach</LinkButton>
                  </div>
                </Card>
              </div>
            </div>

            {/* Application assistant */}
            <Card>
              <CardHeader>
                <CardTitle>Application assistant</CardTitle>
                <CardDescription>Paste the questions from the application form and get AI-generated answers grounded in your resume and evaluation.</CardDescription>
              </CardHeader>
              <div className="grid gap-4">
                <ApplicationQuestionsForm action={prepareAnswersAction} />
                {answerDrafts.length > 0 ? (
                  <ol className="grid gap-3">
                    {answerDrafts.map((draft) => (
                      <li className="rounded-control border border-border bg-surface px-3 py-3" key={draft.id}>
                        <p className="text-sm font-semibold text-ink">{draft.question}</p>
                        <p className="mt-2 text-sm leading-6 text-ink whitespace-pre-wrap">{draft.answer}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-xs text-muted">{draft.source}</p>
                          <CopyAnswerButton answer={draft.answer} />
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted">No drafts yet. Add your questions and click Prepare answers.</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ── Tab: Analysis ────────────────────────────────────────── */}
        {tab === "analysis" && (
          <div className="grid gap-6">
            {evaluation ? (
              <>
                <AIProviderBadge
                  generationMs={evaluation.generationMs}
                  model={evaluation.modelUsed}
                  provider={evaluation.providerUsed}
                  tokensUsed={evaluation.tokensUsed}
                />

                <section className="grid gap-4 lg:grid-cols-2">
                  <EvaluationSection title="A. Role summary" items={evaluation.sections.roleSummary} />
                  <EvaluationSection title="B. Match with resume" items={evaluation.sections.matchWithResume} />
                  <EvaluationSection title="C. Level and strategy" items={evaluation.sections.levelStrategy} />
                  <EvaluationSection title="D. Comp and demand" items={evaluation.sections.compensationDemand} />
                  <EvaluationSection title="E. Personalization plan" items={evaluation.sections.tailoringPlan} />
                  <EvaluationSection title="F. Interview plan" items={evaluation.sections.interviewPlan} />
                  <EvaluationSection title="G. Posting legitimacy" items={evaluation.sections.postingLegitimacy} />
                  <EvaluationSection title="Keywords" items={evaluation.keywords} />
                </section>

                {/* Save a story */}
                <Card>
                  <CardHeader>
                    <CardTitle>Save a story from Block F</CardTitle>
                    <CardDescription>Pre-fill a STAR story from this job&apos;s interview plan. Complete it in Interview Prep.</CardDescription>
                  </CardHeader>
                  <form action={saveStoryAction} className="grid gap-3">
                    <input name="jobId" type="hidden" value={id} />
                    <input name="sourceBlockF" type="hidden" value={evaluation.sections.interviewPlan.join(" ")} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input label="Story title" name="title" placeholder="e.g. Led design system rollout" />
                      <Input label="Situation" name="situation" placeholder="What was the context?" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Input label="Task" name="task" placeholder="Your role" />
                      <Input label="Action" name="action" placeholder="What you did" />
                      <Input label="Result" name="result" placeholder="Measurable outcome" />
                    </div>
                    <div><SubmitButton label="Save to story bank" savedLabel="Saved" variant="secondary" /></div>
                  </form>
                </Card>

                {/* Correct evaluation */}
                <Card>
                  <CardHeader>
                    <CardTitle>Correct evaluation</CardTitle>
                    <CardDescription>Override score or recommendation when the AI got it wrong. Corrections feed back into future evaluations.</CardDescription>
                  </CardHeader>
                  <form action={saveCorrectionAction} className="grid gap-4">
                    <div className="grid gap-4 md:grid-cols-[1fr_9rem_14rem]">
                      <Input defaultValue={evaluation.roleArchetype} label="Role archetype" name="roleArchetype" />
                      <Input defaultValue={evaluation.fitScore} label="Fit score" max={100} min={0} name="fitScore" type="number" />
                      <Select defaultValue={evaluation.recommendation} label="Recommendation" name="recommendation">
                        <option>Priority apply</option>
                        <option>Strong apply</option>
                        <option>Review manually</option>
                        <option>Save for later</option>
                        <option>Skip</option>
                      </Select>
                    </div>
                    <Textarea defaultValue={evaluation.summary} label="Summary" name="summary" />
                    <Textarea defaultValue={evaluation.strengths.join("\n")} hint="One per line." label="Strengths" name="strengths" />
                    <Textarea defaultValue={evaluation.gaps.join("\n")} hint="One per line." label="Gaps" name="gaps" />
                    <Textarea defaultValue={evaluation.redFlags.join("\n")} hint="One per line." label="Red flags" name="redFlags" />
                    <Textarea
                      defaultValue={String(evaluation.userCorrection.correctionNote ?? "")}
                      hint="Explain what the evaluator got wrong."
                      label="Correction note"
                      name="correctionNote"
                    />
                    <div><SubmitButton label="Save correction" savedLabel="Saved" variant="secondary" /></div>
                  </form>
                </Card>
              </>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No evaluation yet</CardTitle>
                  <CardDescription>Run the evaluation to see all seven analysis blocks for this role.</CardDescription>
                </CardHeader>
                <StreamingEvaluation hasExistingEvaluation={false} jobId={id} />
              </Card>
            )}
          </div>
        )}

      </div>
    </Shell>
  );
}

function EvaluationSection({ title, items }: { title: string; items: string[] }) {
  return <DetailList title={title} items={items.length > 0 ? items : ["No data captured."]} />;
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
