import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ApplicationStatusSelect } from "@/components/application-status-select";
import { StreamingEvaluation } from "@/components/streaming-evaluation";
import { EvaluationRunMeta } from "@/components/evaluation-run-meta";
import { PostingResolutionPanel } from "@/components/posting-resolution-panel";
import { Badge, ExternalLinkButton, SubmitButton } from "@/components/ui";
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
  getCompanyContactMetadata,
  getCompanyJobStats,
  getJobById,
  getResolvedJobGapResponses,
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
import { resolveCompanyIdentifier } from "@/lib/contacts/company-domain";
import { companyLinkFor } from "@/lib/jobs/company-link";
import {
  reportsToTitleFromDescription,
  titleKeywordsForPeopleSearch,
} from "@/lib/contacts/search-details";
import { ensureResumeBuilderVersion } from "@/lib/documents/resume-builder";
import type { ResumeBuilderSection, ResumeBuilderVersionStatus } from "@/lib/db/types";
import { coerceResumeBaseToLane } from "@/lib/evaluation/resume-lane-picker";
import { toneForRecommendation } from "@/lib/evaluation/recommendation-tone";
import { nextBestAction, opportunityProgress } from "@/lib/jobs/next-best-action";
import { splitListValue } from "@/lib/profile/intelligence";
import { buildPostingSearchQuery, hasResolvedPosting } from "@/lib/jobs/posting-resolution";
import { ApplyTab } from "./tabs/apply-tab";
import { EvaluationTab } from "./tabs/evaluation-tab";
import { OutreachTab } from "./tabs/outreach-tab";
import { OverviewTab } from "./tabs/overview-tab";
import { ResumeTab } from "./tabs/resume-tab";
import { TABS, type Tab } from "./tabs/types";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
};


/**
 * Tab ids that used to exist, mapped to their replacement (§9). Links live in
 * bookmarks, notes and the browser history — silently dropping them to Overview
 * would look like the tab had been removed.
 */
const RENAMED_TABS: Record<string, Tab> = { analysis: "evaluation" };


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
  const savedCompanyContactMetadata = getCompanyContactMetadata(job.company);
  const companyResolution = resolveCompanyIdentifier({
    job,
    profileDomain: savedCompanyContactMetadata?.domain,
    profileLinkedIn: savedCompanyContactMetadata?.linkedinUrl,
  });
  const peopleSearchRoleKeywords = titleKeywordsForPeopleSearch(job.title, job.roleArchetype);
  const peopleSearchReportsToTitle = reportsToTitleFromDescription(
    job.rawDescription || job.parsedDescription,
  );
  // The company name in the header links to the Jobs list focused on that company,
  // but only when there is more there than the job already open (§ company-link).
  const companyLink = companyLinkFor(job.company, getCompanyJobStats(job.company));
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
            <p className="mt-0.5 text-sm text-muted">
              {companyLink ? (
                <Link
                  className="font-medium text-accent hover:underline"
                  href={companyLink.href}
                  title={
                    companyLink.appliedCount > 0
                      ? `See all ${job.company} positions — you have applied to ${companyLink.appliedCount}`
                      : `See all ${job.company} positions`
                  }
                >
                  {job.company}
                  {companyLink.appliedCount > 0 ? ` (${companyLink.appliedCount})` : ""}
                </Link>
              ) : (
                job.company
              )}{" "}
              · {job.location} · {job.remoteType}
            </p>
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


        {tab === "overview" && (
          <OverviewTab
            allGapItems={allGapItems}
            evaluation={evaluation}
            fetchDescriptionAction={fetchDescriptionAction}
            gapResponseMap={gapResponseMap}
            id={id}
            job={job}
            recommendation={recommendation}
            resolvedPosting={resolvedPosting}
            resolvedRecommendedResume={resolvedRecommendedResume}
            resumeLaneNames={resumeLaneNames}
            tabHref={tabHref}
          />
        )}

        {tab === "resume" && (
          <ResumeTab
            evaluation={evaluation}
            generatedDocument={generatedDocument}
            hasDraft={hasDraft}
            id={id}
            resolvedRecommendedResume={resolvedRecommendedResume}
            resumeLaneNames={resumeLaneNames}
            resumeVersions={resumeVersions}
            resumes={resumes}
            setResumeBaseAction={setResumeBaseAction}
          />
        )}

        {tab === "apply" && (
          <ApplyTab
            answerDrafts={answerDrafts}
            application={application}
            id={id}
            job={job}
            resolvedPosting={resolvedPosting}
            tabHref={tabHref}
            updateStatusAction={updateStatusAction}
          />
        )}

        {tab === "outreach" && (
          <OutreachTab
            clayConnected={clayConnected}
            companyIdentifier={companyResolution.identifier}
            companyName={job.company}
            contacts={contacts}
            id={id}
            jobTitle={job.title}
            outreachDrafts={outreachDrafts}
            outreachError={outreachError}
            outreachMessages={outreachMessages}
            reportsToTitle={peopleSearchReportsToTitle}
            roleKeywords={peopleSearchRoleKeywords}
          />
        )}

        {tab === "evaluation" && (
          <EvaluationTab
            evaluation={evaluation}
            id={id}
            isFastEvaluation={isFastEvaluation}
            job={job}
            linkStoryToJobAction={linkStoryToJobAction}
            saveCorrectionAction={saveCorrectionAction}
            saveStoryAction={saveStoryAction}
          />
        )}

      </div>
    </Shell>
  );
}
