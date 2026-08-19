import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ApplicationStatusSelect } from "@/components/application-status-select";
import { ApplicationQuestionsForm } from "@/components/application-questions-form";
import { CopyAnswerButton } from "@/components/copy-answer-button";
import { GapAddressingPanel } from "@/components/gap-addressing-panel";
import { EditJobModal } from "@/components/EditJobModal";
import { ResumeGeneratorModal } from "@/components/resume-generator-modal";
import { StreamingEvaluation } from "@/components/streaming-evaluation";
import { AIProviderBadge } from "@/components/ai-provider-badge";
import { EvaluationRunMeta } from "@/components/evaluation-run-meta";
import { InterviewPlanSection } from "@/components/interview-plan-section";
import { PostingResolutionPanel } from "@/components/posting-resolution-panel";
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
import { isApplicationStatus } from "@/lib/applications/status";
import { formatPostedDate } from "@/lib/dates";
import {
  archiveJob,
  deleteJob,
  getApplicationAnswerDrafts,
  getApplicationByJobId,
  getEvaluationByJobId,
  getEmailImportEvidence,
  getGeneratedDocumentById,
  getJobById,
	  getResolvedJobGapResponses,
	  getMatchingStoriesForJob,
	  getResumes,
	  getUserProfile,
	  saveEvaluationCorrection,
  saveJobLiveness,
  saveStory,
  setStoryJobLink,
  unarchiveJob,
  updateApplicationStatus,
  updateJobRecommendedResume,
  getEffectiveKeywords,
  getIntegration,
  getJobContacts,
  getOutreachDrafts,
  getOutreachMessagesForJob,
} from "@/lib/db/queries";
import { ensureResumeBuilderVersion } from "@/lib/documents/resume-builder";
import type { ResumeBuilderSection, ResumeBuilderVersionStatus } from "@/lib/db/types";
import { coerceResumeBaseToLane } from "@/lib/evaluation/resume-lane-picker";
import { toneForRecommendation } from "@/lib/evaluation/recommendation-tone";
import { FastEvaluationCard } from "@/components/fast-evaluation-card";
import { nextBestAction, opportunityProgress } from "@/lib/jobs/next-best-action";
import { ContactsPanel } from "./outreach/contacts-panel";
import { OutreachClient } from "./outreach/outreach-client";
import { splitListValue } from "@/lib/profile/intelligence";
import { buildPostingSearchQuery, hasResolvedPosting } from "@/lib/jobs/posting-resolution";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
};

const TABS = ["overview", "evaluation", "resume", "apply", "outreach"] as const;
type Tab = (typeof TABS)[number];

/**
 * Tab ids that used to exist, mapped to their replacement (§9). Links live in
 * bookmarks, notes and the browser history — silently dropping them to Overview
 * would look like the tab had been removed.
 */
const RENAMED_TABS: Record<string, Tab> = { analysis: "evaluation" };

const OUTREACH_ERRORS: Record<string, string> = {
  "name-required": "A name is required to add a contact.",
  "missing-job": "That job could not be found.",
  suppressed: "You previously chose to forget this person. Clear the forgotten list in Settings before adding them again.",
  "needs-company": "This company has no saved domain, and the job link points at a job board rather than the employer. Add the company's domain before searching so results come from the right organisation.",
  // §63: each provider failure needs a different response from the user, so each
  // gets its own message rather than a single "Clay error".
  "clay-not_connected": "Connect Clay in Settings → Integrations before searching for people.",
  "clay-invalid_credential": "Clay rejected the API key. Re-check it in Settings → Integrations.",
  "clay-allowance_reached": "Your Clay search allowance is used up for this period. Add contacts manually, or try again after it resets.",
  "clay-rate_limited": "Clay rate-limited the request. Wait a moment and try again.",
  "clay-ambiguous_company": "Not enough is known about this company to search. Add its domain first.",
  "clay-unavailable": "Clay could not be reached. Everything else in Job Search Terminal is unaffected.",
  "clay-no-results": "Clay returned nobody new for this company. You can still add people manually.",
  "missing-contact": "That contact could not be found.",
  "clay-no-enrichment": "Enrichment is not available for this provider.",
  "enrich-no-email": "The Clay routine ran but returned no email for this person.",
  "enrich-needs-linkedin": "This contact has no LinkedIn URL, which the email lookup needs. Add one and try again.",
  "draft-failed": "The message could not be drafted. Check your AI provider in Settings and try again.",
};

function validTab(t: string | undefined): Tab {
  const requested = t ?? "";
  if ((TABS as readonly string[]).includes(requested)) return requested as Tab;
  return RENAMED_TABS[requested] ?? "overview";
}

export default async function JobDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { tab: rawTab, error: outreachError } = await searchParams;
  const tab = validTab(rawTab);

  const job = getJobById(id);
  if (!job) notFound();

  const evaluation = getEvaluationByJobId(id);
  const generatedDocument = getGeneratedDocumentById(`document-${id}`);
  const application = getApplicationByJobId(id);
  const contacts = getJobContacts(id);
  const clayConnected = getIntegration("clay")?.connectionStatus === "connected";
  const outreachDrafts = getOutreachDrafts(id);
  const outreachMessages = getOutreachMessagesForJob(id);
  const stage = {
    job, evaluation, generatedDocument, application, contactCount: contacts.length,
  };
  const action = nextBestAction(stage);
  const progress = opportunityProgress(stage);
  const answerDrafts = getApplicationAnswerDrafts(id);
  const emailEvidence = getEmailImportEvidence(id);
  const resumes = getResumes();
  const profile = getUserProfile();
  const resolvedPosting = hasResolvedPosting(job);
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
  const allGapItems = [...(evaluation?.gaps ?? job.gaps), ...(evaluation?.redFlags ?? job.redFlags)];
  // Answers already in the global evidence bank fill themselves in here, so a
  // gap answered on an earlier role never has to be typed a second time.
  const gapResponseMap = getResolvedJobGapResponses(id, allGapItems);

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

  async function saveStoryAction(formData: FormData) {
    "use server";
    const { randomUUID } = await import("node:crypto");
    const sourceJobId = String(formData.get("jobId") ?? "");
    // Reuse the job's own extracted ATS keywords as tags — same vocabulary as
    // autoSaveEvaluationStories, so this story can auto-match other positions too.
    const jobKeywords = sourceJobId ? getEffectiveKeywords(sourceJobId) : [];
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
      tags: jobKeywords,
      sourceJobId,
      storySource: String(formData.get("storySource") ?? ""),
    });
    revalidatePath("/interview-prep");
  }

  async function linkStoryToJobAction(formData: FormData) {
    "use server";
    const storyId = String(formData.get("storyId") ?? "");
    const targetJobId = String(formData.get("jobId") ?? "");
    const linked = String(formData.get("linked") ?? "") === "true";
    if (!storyId || !targetJobId) return;
    setStoryJobLink(storyId, targetJobId, linked);
    revalidatePath(`/jobs/${targetJobId}`);
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
    if (current && !current.rawDescription && hasResolvedPosting(current)) {
      const desc = await fetchJobDescription(current);
      if (desc) saveJobDescription(id, desc);
    }
    revalidatePath(`/jobs/${id}`);
  }

  async function checkLivenessAction() {
    "use server";
    const { checkJobLiveness } = await import("@/lib/scanner/liveness-checker");
    const current = getJobById(id);
    if (current && hasResolvedPosting(current)) {
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

  // §21: rows written before Phase 1 still render their A–G sections. The card
  // and the legacy view are mutually exclusive, keyed on the stored version.
  const isFastEvaluation = evaluation?.evaluationVersion === "fast-v2";
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
            {!job.archived && resolvedPosting && (
              <form action={checkLivenessAction}>
                <SubmitButton label="Check live" pendingLabel="Checking…" savedLabel="Done ✓" variant="secondary" />
              </form>
            )}
            {resolvedPosting ? <ExternalLinkButton href={job.url}>Job posting ↗</ExternalLinkButton> : null}
          </div>
        </div>

        {job.postingResolutionStatus === "needs_resolution" ? (
          <PostingResolutionPanel
            evidence={emailEvidence}
            jobId={id}
            searchQuery={buildPostingSearchQuery(job)}
          />
        ) : null}

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
            {/* fast-v2 leads with fit, recommendation and confidence. scoreLabel is a
                compatibility column (§13), so it stays out of the headline here and
                only shows for legacy rows that have nothing else to say. */}
            <Badge tone={scoreTone}>{fitScore}%{isFastEvaluation ? "" : ` · ${scoreLabel}`}</Badge>
            <Badge tone={toneForRecommendation(recommendation)}>{recommendation}</Badge>
            {isFastEvaluation && evaluation?.confidenceLabel
              ? <Badge>{evaluation.confidenceLabel} confidence</Badge>
              : null}
            {/* Posting legitimacy is a different question from evaluation confidence,
                and its values ("High Confidence") read as the same thing. Name the
                subject so the two cannot be mistaken for a contradiction. */}
            {!isFastEvaluation && evaluation?.legitimacyLabel
              ? <Badge>Posting: {evaluation.legitimacyLabel}</Badge>
              : null}
            {job.postingResolutionStatus === "needs_resolution" && <Badge tone="warning">Needs posting</Badge>}
            {job.livenessStatus === "active" && <Badge tone="success">Live ✓</Badge>}
            {job.livenessStatus === "expired" && <Badge tone="danger">Expired</Badge>}
            {job.livenessStatus === "uncertain" && <Badge tone="warning">Status uncertain</Badge>}
            <span className="text-xs text-muted">{formatPostedDate(job)}</span>
            <span className="text-xs text-muted">· {job.status}</span>
          </div>
        </div>

        {/* ── Interview transition (§59) ───────────────────────────── */}
        {(application?.status === "Interviewing" || application?.status === "Offer") && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-control border border-success/35 bg-success/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Interview preparation available</p>
              <p className="text-xs text-muted">
                Company briefing, themes, stories and practice questions for this role.
              </p>
            </div>
            <Link
              className="inline-flex min-h-8 items-center rounded-control bg-accent px-3 text-sm font-medium text-white hover:opacity-90"
              href="/interview-prep"
            >
              Prepare interview
            </Link>
          </div>
        )}

        {/* ── Opportunity progress (§65, §66) ──────────────────────── */}
        {/* A plain breadcrumb of the five moves a job goes through, and nothing
            else: every action it could name is already the header button or a
            tab, so a CTA here was the same click twice. Completion is not shown
            by colour alone — done steps carry a ✓ and the next step is bold —
            because colour is the one cue some users will not receive. */}
        <nav aria-label="Opportunity progress" className="mb-5">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            {progress.map((step, index) => {
              const isNext = !step.done && step.id === action.primary.step;
              return (
                <li className="flex items-center gap-1.5" key={step.id}>
                  {index > 0 ? <span aria-hidden className="text-muted/40">›</span> : null}
                  <Link
                    aria-current={isNext ? "step" : undefined}
                    className={`flex items-center gap-1 underline-offset-2 hover:underline ${
                      step.done
                        ? "text-success"
                        : isNext
                          ? "font-semibold text-accent"
                          : "text-muted/60 hover:text-muted"
                    }`}
                    href={step.href}
                  >
                    {step.done ? <span aria-hidden>✓</span> : null}
                    {step.label}
                    <span className="sr-only">
                      {step.done ? " complete" : isNext ? " — next step" : " not started"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* ── Tab navigation ───────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 border-b border-border">
          <div className="flex overflow-x-auto">
            <Link href={tabHref("overview")} className={tabCls("overview")}>Overview</Link>
            <Link href={tabHref("evaluation")} className={tabCls("evaluation")}>
              Evaluation {!evaluation ? <span className="ml-1 text-[10px] text-muted">(run evaluate)</span> : null}
            </Link>
            <Link href={tabHref("resume")} className={tabCls("resume")}>
              Resume {generatedDocument ? <span className="ml-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">Ready</span> : null}
            </Link>
            <Link href={tabHref("apply")} className={tabCls("apply")}>
              Apply {application ? <span className="ml-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{application.status}</span> : null}
            </Link>
            <Link href={tabHref("outreach")} className={tabCls("outreach")}>
              Outreach {contacts.length > 0 ? <span className="ml-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">{contacts.length}</span> : null}
            </Link>
          </div>
          {/* Provenance for the run behind everything on screen (§20). */}
          {evaluation ? (
            <EvaluationRunMeta
              createdAt={evaluation.createdAt}
              generationMs={evaluation.generationMs}
              model={evaluation.modelUsed}
              provider={evaluation.providerUsed}
            />
          ) : null}
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
                    <Badge tone={toneForRecommendation(recommendation)} >{recommendation}</Badge>
                    <Link href={tabHref("resume")} className="mt-1 text-sm font-medium text-accent hover:underline">
                      → Go to Resume tab
                    </Link>
                    <Link href={tabHref("apply")} className="text-sm font-medium text-accent hover:underline">
                      → Go to Apply tab
                    </Link>
                    <LinkButton href={`/jobs/${id}/research`} variant="quiet">Company research</LinkButton>
                    <LinkButton href={tabHref("outreach")} variant="quiet">Draft outreach</LinkButton>
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
                    <p className="text-xs text-muted">
                      {resolvedPosting
                        ? "Fetch from the ATS to enable accurate evaluation and resume tailoring."
                        : "Resolve the posting URL first, then fetch or paste the job description."}
                    </p>
                  </div>
                  {resolvedPosting ? (
                    <form action={fetchDescriptionAction}>
                      <SubmitButton label="Fetch description" pendingLabel="Fetching…" savedLabel="Saved ✓" variant="secondary" />
                    </form>
                  ) : null}
                </div>
              )}
            </Card>

            {/* Edit job details */}
            <div className="flex justify-end">
              <EditJobModal
                jobId={id}
                defaultTitle={job.title}
                defaultCompany={job.company}
                defaultUrl={job.url}
                defaultDescription={job.rawDescription || job.parsedDescription || ""}
              />
            </div>
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
                    {resolvedPosting ? <ExternalLinkButton href={job.url}>Open job posting ↗</ExternalLinkButton> : null}
                    <LinkButton href={`/jobs/${id}/research`} variant="secondary">Company research</LinkButton>
                    <LinkButton href={tabHref("outreach")} variant="secondary">Find people</LinkButton>
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
                <ApplicationQuestionsForm jobId={id} />
                {answerDrafts.length > 0 ? (
                  <ol className="grid gap-3">
                    {answerDrafts.map((draft) => (
                      <li className="rounded-control border border-border bg-surface px-3 py-3" key={draft.id}>
                        <p className="text-sm font-semibold text-ink">{draft.question}</p>
                        <p className="mt-2 text-sm leading-6 text-ink whitespace-pre-wrap">{draft.answer}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-xs text-muted font-mono">
                            {draft.modelUsed ? `${draft.modelUsed} · ${draft.providerUsed}` : draft.source}
                          </p>
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

        {/* ── Tab: Outreach ────────────────────────────────────────── */}
        {tab === "outreach" && (
          <div className="grid gap-8">
            {outreachError ? (
              <p className="rounded-control border border-danger/35 bg-danger/10 px-4 py-2 text-sm text-danger" role="alert">
                {OUTREACH_ERRORS[outreachError] ?? "Something went wrong."}
              </p>
            ) : null}

            <ContactsPanel clayConnected={clayConnected} contacts={contacts} jobId={id} messagesByLink={outreachMessages} />

            {outreachDrafts.length > 0 && (
              <section>
                <h2 className="mb-1 text-sm font-semibold text-ink">Previous generic drafts</h2>
                <p className="mb-4 text-xs text-muted">
                  Written before outreach targeted real people. Kept readable; new drafts are
                  written per contact.
                </p>
                <OutreachClient jobId={id} saved={outreachDrafts} />
              </section>
            )}
          </div>
        )}

        {tab === "evaluation" && (
          <div className="grid gap-6">
            {evaluation ? (
              <>
                {isFastEvaluation ? (
                  <FastEvaluationCard evaluation={evaluation} />
                ) : (
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
                  <div className="lg:col-span-2">
                    <EvaluationSection title="E. Personalization plan" items={evaluation.sections.tailoringPlan} />
                  </div>
                  <div className="lg:col-span-2">
                    <InterviewPlanSection
                      items={evaluation.sections.interviewPlan}
                      jobId={id}
                      linkStoryAction={linkStoryToJobAction}
                      matchedStories={getMatchingStoriesForJob(id)}
                    />
                  </div>
                  <EvaluationSection title="G. Posting legitimacy" items={evaluation.sections.postingLegitimacy} />
                  <EvaluationSection title="Keywords" items={evaluation.keywords} />
                </section>

                {/* Save a story */}
                <Card>
                  <CardHeader>
                    <CardTitle>Save a story from this evaluation</CardTitle>
                    <CardDescription>Pre-fill a STAR story from this job&apos;s interview plan. Complete it in Interview Prep. Only older evaluations carry an interview plan — new ones route story work to Interview Prep instead.</CardDescription>
                  </CardHeader>
                  <form action={saveStoryAction} className="grid gap-3">
                    <input name="jobId" type="hidden" value={id} />
                    <input name="storySource" type="hidden" value={evaluation.sections.interviewPlan.join(" ")} />
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
                </>
                )}

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
                        <option>Blocked</option>
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
