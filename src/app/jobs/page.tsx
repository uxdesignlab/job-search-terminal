import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { formatPostedDate } from "@/lib/dates";
import { getJobs, getReviewQueueCount, getUserProfile } from "@/lib/db/queries";
import { OUTSIDE_PREFERENCES_LABEL, UNKNOWN_LOCATION_LABEL, buildJobPreferenceFilter } from "@/lib/jobs/preference-fit";
import { isJobProtectedFromAutomaticRemoval } from "@/lib/jobs/job-protection";
import { hasResolvedPosting, isHttpPostingUrl } from "@/lib/jobs/posting-resolution";
import { getSourceLabelOverrides } from "@/lib/jobs/source-labels";
import { AddJobModal } from "@/components/AddJobModal";
import { BatchEvaluateForm } from "@/components/batch-evaluate-form";
import { JobMaintenancePanel } from "@/components/job-maintenance-panel";
import { LinkedInImportNotification } from "@/components/linkedin-import-notification";
import { EmailCandidateApprovalModal } from "@/components/email-candidate-approval-modal";
import { getJobSourceLabel } from "@/lib/job-table-helpers";

import { toneForRecommendation } from "@/lib/evaluation/recommendation-tone";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ company?: string }>;
};

export default async function JobsPage({ searchParams }: Props) {
  // `?company=` arrives from a job detail header. It focuses the list on one
  // company across every position and status, ignoring the saved column filters —
  // otherwise the default status filter would hide the applications the link is
  // there to show.
  const { company: rawCompanyFocus } = await searchParams;
  const companyFocus = rawCompanyFocus?.trim() || null;
  const profile = getUserProfile();
  const preferenceFilter = buildJobPreferenceFilter(profile);
  const reviewQueueCount = getReviewQueueCount();
  const sourceLabelOverrides = getSourceLabelOverrides();
  const jobs = getJobs().map((job) => {
    const preferenceDecision = preferenceFilter(job);
    return {
      ...job,
      preferenceLabel: !preferenceDecision.accepted
        ? OUTSIDE_PREFERENCES_LABEL
        : preferenceDecision.locationUnknown
          ? UNKNOWN_LOCATION_LABEL
          : undefined,
      removalProtected: isJobProtectedFromAutomaticRemoval(job),
      sourceLabel: getJobSourceLabel(job, sourceLabelOverrides),
      hasResolvedPosting: hasResolvedPosting(job),
    };
  });

  // The mobile card list has no column filters of its own, so the focus is applied
  // here rather than inside the desktop table component.
  const mobileJobs = companyFocus ? jobs.filter((job) => job.company === companyFocus) : jobs;

  return (
    <Shell activeItem="Jobs">
      {/* min-w-0: grid items default to min-width:auto, so a wide table would stretch
          the track and push every sibling past the Shell's max width. */}
      <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
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
            <span className="text-xs text-muted">Open a job to add the missing detail</span>
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
          {companyFocus ? (
            <div className="flex items-center justify-between gap-3 rounded-panel border border-accent/40 bg-accent/8 px-4 py-3 text-sm">
              <span className="font-medium text-ink">
                All {companyFocus} positions ({mobileJobs.length})
              </span>
              <Link className="text-xs font-medium text-accent hover:underline" href="/jobs">
                Show all jobs
              </Link>
            </div>
          ) : null}
          {mobileJobs.map((job) => (
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
                {isHttpPostingUrl(job.sourceUrl) ? (
                  <a
                    aria-label={`Open source on ${job.sourceLabel} in a new tab`}
                    className="text-xs font-medium text-accent hover:underline"
                    href={job.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {job.sourceLabel} ↗
                  </a>
                ) : (
                  <Badge tone="neutral">{job.sourceLabel}</Badge>
                )}
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
            <BatchEvaluateForm companyFocus={companyFocus} jobs={jobs} />
          </div>
        ) : null}
      </div>
      <LinkedInImportNotification />
      <EmailCandidateApprovalModal />
    </Shell>
  );
}
