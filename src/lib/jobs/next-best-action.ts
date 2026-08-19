import type { ApplicationRecord, EvaluationRecord, GeneratedDocumentRecord, JobRecord } from "../db/types";

/**
 * The one action a job is waiting on, and the progress behind it
 * (PRD v0.2.1 §64–§66).
 *
 * Everything here is derived from records that already exist — an evaluation
 * row, a generated document, an application. §64 is explicit that analysis state
 * must not become another status column on `jobs`, because two sources of truth
 * for "where is this job" is how they drift.
 */

export type NextAction = {
  label: string;
  href: string;
  /** Why this is next, in the user's terms. */
  reason: string;
};

export type NextBestAction = {
  primary: NextAction;
  /**
   * Outreach when it is worth doing but must not displace the primary CTA.
   * §8 and §34 allow outreach before applying; §65 asks for one primary action.
   * Keeping it secondary satisfies both instead of picking a side.
   */
  secondary: NextAction | null;
};

export type ProgressStep = {
  label: string;
  done: boolean;
};

export type JobStageInput = {
  job: Pick<JobRecord, "id" | "status" | "recommendation">;
  evaluation: Pick<EvaluationRecord, "recommendation"> | null | undefined;
  preparation: { id: string } | null | undefined;
  generatedDocument: Pick<GeneratedDocumentRecord, "id"> | null | undefined;
  application: Pick<ApplicationRecord, "status"> | null | undefined;
  contactCount: number;
};

/** Recommendations that mean "stop here" — pursuing anyway is the user's call, not a prompt. */
const NOT_WORTH_PURSUING = new Set(["Skip", "Blocked"]);

const APPLIED_STATUSES = new Set([
  "Applied", "Follow-up needed", "Recruiter responded", "Interviewing", "Offer", "Rejected",
]);

function outreachAction(jobId: string): NextAction {
  return {
    label: "Find people",
    href: `/jobs/${jobId}/outreach`,
    reason: "Build relationships around this opportunity",
  };
}

export function nextBestAction(input: JobStageInput): NextBestAction {
  const { job, evaluation, generatedDocument, application } = input;
  const jobId = job.id;
  const recommendation = evaluation?.recommendation ?? job.recommendation;
  const applied = application ? APPLIED_STATUSES.has(application.status) : false;

  // Interviewing outranks everything: the opportunity is live and preparation is
  // time-bound in a way nothing earlier is.
  if (application?.status === "Interviewing" || application?.status === "Offer") {
    return {
      primary: { label: "Prepare interview", href: "/interview-prep", reason: "This opportunity has advanced" },
      secondary: null,
    };
  }

  if (!evaluation) {
    return {
      primary: { label: "Evaluate", href: `/jobs/${jobId}?tab=evaluation`, reason: "Not evaluated yet" },
      secondary: null,
    };
  }

  // A blocked or skipped role gets no encouragement to proceed. The user can
  // still act — the tabs are right there — but the app should not nudge.
  if (NOT_WORTH_PURSUING.has(recommendation)) {
    return {
      primary: {
        label: "Review evaluation",
        href: `/jobs/${jobId}?tab=evaluation`,
        reason: recommendation === "Blocked" ? "A saved requirement rules this out" : "Fit is below your threshold",
      },
      secondary: null,
    };
  }

  if (!generatedDocument) {
    return {
      primary: { label: "Generate resume", href: `/jobs/${jobId}?tab=resume`, reason: "Evaluation says this is worth pursuing" },
      secondary: input.contactCount === 0 ? outreachAction(jobId) : null,
    };
  }

  if (!applied) {
    return {
      primary: { label: "Apply", href: `/jobs/${jobId}?tab=apply`, reason: "Resume is ready" },
      secondary: input.contactCount === 0 ? outreachAction(jobId) : null,
    };
  }

  // Applied with nobody contacted: outreach is now the most useful thing left,
  // so it becomes the primary rather than staying a suggestion.
  if (input.contactCount === 0) {
    return { primary: outreachAction(jobId), secondary: null };
  }

  return {
    primary: { label: "Track application", href: `/jobs/${jobId}?tab=apply`, reason: "Applied — waiting on a reply" },
    secondary: null,
  };
}

/** §66. Derived, so it cannot disagree with the records it describes. */
export function opportunityProgress(input: JobStageInput): ProgressStep[] {
  const applied = input.application ? APPLIED_STATUSES.has(input.application.status) : false;
  return [
    { label: "Evaluated", done: Boolean(input.evaluation) },
    { label: "Application prepared", done: Boolean(input.preparation) },
    { label: "Resume ready", done: Boolean(input.generatedDocument) },
    { label: "Applied", done: applied },
    { label: "Outreach", done: input.contactCount > 0 },
    {
      label: "Interview prep",
      done: input.application?.status === "Interviewing" || input.application?.status === "Offer",
    },
  ];
}
