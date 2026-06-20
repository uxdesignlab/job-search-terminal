import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { formatPostedDate } from "@/lib/dates";
import { getJobs, getReviewQueueCount, getUserProfile } from "@/lib/db/queries";
import { OUTSIDE_PREFERENCES_LABEL, buildJobPreferenceFilter } from "@/lib/jobs/preference-fit";
import { isJobProtectedFromAutomaticRemoval } from "@/lib/jobs/job-protection";
import { hasResolvedPosting } from "@/lib/jobs/posting-resolution";
import { AddJobModal } from "@/components/AddJobModal";
import { BatchEvaluateForm } from "@/components/batch-evaluate-form";
import { approveReviewAction, dismissReviewAction } from "./actions";
import { JobMaintenancePanel } from "@/components/job-maintenance-panel";
import { LinkedInImportNotification } from "@/components/linkedin-import-notification";
import { EmailCandidateApprovalModal } from "@/components/email-candidate-approval-modal";
import { sourceLabelFromJobSource } from "@/lib/scanner/browser-board-sources";

export const dynamic = "force-dynamic";

function toneForRecommendation(recommendation: string) {
  if (recommendation === "Priority apply" || recommendation === "Strong apply") return "success" as const;
  if (recommendation === "Skip") return "danger" as const;
  return "warning" as const;
}

export default async function JobsPage() {
  const profile = getUserProfile();
  const preferenceFilter = buildJobPreferenceFilter(profile);
  const reviewQueueCount = getReviewQueueCount();
  const jobs = getJobs().map((job) => {
    const preferenceDecision = preferenceFilter(job);
    return {
      ...job,
      preferenceLabel: preferenceDecision.accepted ? undefined : OUTSIDE_PREFERENCES_LABEL,
      removalProtected: isJobProtectedFromAutomaticRemoval(job),
      sourceLabel: sourceLabelFromJobSource(job.source),
      hasResolvedPosting: hasResolvedPosting(job),
    };
  });

  return (
    <Shell activeItem="Jobs">
      <div className="grid gap-6">
        <PageHeader
          description="Discovered jobs with fit scoring, posted dates, status, and recommended action."
          eyebrow="Position dashboard"
          title="Jobs"
          actions={
            <div className="flex items-center gap-2">
              <Link
                className="inline-flex min-h-9 items-center justify-center rounded-control px-3 py-1.5 text-sm font-medium text-muted hover:text-ink"
                href="/archived"
              >
                Archived
              </Link>
              <AddJobModal />
            </div>
          }
        />

        {jobs.length > 0 ? <JobMaintenancePanel jobCount={jobs.length} /> : null}

        {reviewQueueCount > 0 ? (
          <div className="flex items-center justify-between rounded-panel border border-warning/40 bg-warning/8 px-4 py-3 text-sm">
            <span className="font-medium text-ink">
              {reviewQueueCount} job{reviewQueueCount !== 1 ? "s" : ""} need{reviewQueueCount === 1 ? "s" : ""} review — short or missing description
            </span>
            <span className="text-muted text-xs">Approve to keep · Dismiss to archive</span>
          </div>
        ) : null}

        {jobs.length === 0 ? (
          <EmptyState
            description="Run a scan from the dashboard to add discovered roles before reviewing fit or status."
            title="No jobs found yet"
          />
        ) : null}

        {/* Mobile card view */}
        <div className="grid gap-4 lg:hidden">
          {jobs.map((job) => (
            <div className="rounded-panel border border-border bg-panel p-4" key={job.id}>
              <Link className="font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                {job.title}
              </Link>
              <p className="mt-0.5 text-sm text-muted">
                {job.company} · {job.location}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>{job.fitScore}% fit</Badge>
                <Badge>{formatPostedDate(job)}</Badge>
                <Badge tone={toneForRecommendation(job.recommendation)}>{job.recommendation}</Badge>
                {job.sourceLabel ? <Badge tone="neutral">{job.sourceLabel}</Badge> : null}
                {job.preferenceLabel ? <Badge tone="warning">{job.preferenceLabel}</Badge> : null}
                {job.livenessStatus === "expired" ? <Badge tone="danger">Posting expired</Badge> : null}
                {job.hasResolvedPosting ? (
                  <a
                    className="text-xs font-medium text-accent hover:underline"
                    href={job.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Posting ↗
                  </a>
                ) : null}
                {job.postingResolutionStatus === "needs_resolution" ? <Badge tone="warning">Needs posting</Badge> : null}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table with column filters + batch actions */}
        {jobs.length > 0 ? (
          <div className="hidden lg:block">
            <BatchEvaluateForm
              jobs={jobs}
              onApproveReview={approveReviewAction}
              onDismissReview={dismissReviewAction}
            />
          </div>
        ) : null}
      </div>
      <LinkedInImportNotification />
      <EmailCandidateApprovalModal />
    </Shell>
  );
}
