import Link from "next/link";
import { EditJobModal } from "@/components/EditJobModal";
import { GapAddressingPanel } from "@/components/gap-addressing-panel";
import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  LinkButton,
  SubmitButton,
} from "@/components/ui";
import type { EvaluationRecord, JobRecord, ResolvedGapResponse } from "@/lib/db/types";
import { toneForRecommendation } from "@/lib/evaluation/recommendation-tone";
import { DetailList } from "./detail-list";
import type { TabHref } from "./types";

type Props = {
  allGapItems: string[];
  evaluation: EvaluationRecord | undefined;
  fetchDescriptionAction: () => Promise<void>;
  gapResponseMap: Record<string, ResolvedGapResponse>;
  id: string;
  job: JobRecord;
  recommendation: string;
  resolvedPosting: boolean;
  resolvedRecommendedResume: string;
  resumeLaneNames: string[];
  tabHref: TabHref;
};

export function OverviewTab({
  allGapItems,
  evaluation,
  fetchDescriptionAction,
  gapResponseMap,
  id,
  job,
  recommendation,
  resolvedPosting,
  resolvedRecommendedResume,
  resumeLaneNames,
  tabHref,
}: Props) {
  return (
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

          {/* Which resume to tailor from. This used to be a full column in the
              match grid, where a one-line answer sat beside two long lists. */}
          <Card>
            <CardHeader>
              <CardTitle>Recommended resume</CardTitle>
            </CardHeader>
            {resolvedRecommendedResume ? (
              <div className="grid gap-2">
                <p className="text-sm font-semibold text-ink">{resolvedRecommendedResume}</p>
                <p className="text-xs text-muted">
                  {resumeLaneNames.includes(job.recommendedResume)
                    ? "Your saved choice for this role."
                    : "Suggested by the evaluation. Change it on the Resume tab."}
                </p>
                {/* Kept when it says something the lane name does not — the
                    evaluation sometimes cites the resume it drew evidence from. */}
                {(evaluation?.resumeEvidence ?? job.resumeEvidence)
                  .filter((item) => !item.toLowerCase().includes(resolvedRecommendedResume.toLowerCase()))
                  .map((item) => (
                    <p className="text-xs text-muted" key={item}>{item}</p>
                  ))}
                <Link href={tabHref("resume")} className="text-sm font-medium text-accent hover:underline">
                  → Tailor this resume
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted">
                No resume recommended yet — run an evaluation, or pick one on the Resume tab.
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Match grid. Resume evidence moved to the sidebar (§65): it answered
          "which resume", which is a one-line answer, not a column. */}
      <section className="grid gap-4 md:grid-cols-2">
        <DetailList title="Requirement match" items={evaluation?.requirementMatch ?? job.requirementMatch} />
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
  );
}
