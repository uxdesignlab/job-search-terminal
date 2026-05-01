import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { formatPostedDate } from "@/lib/dates";
import { getJobs, getUserProfile, purgeJobs } from "@/lib/db/queries";
import { AddJobModal } from "@/components/AddJobModal";
import { BatchEvaluateForm } from "@/components/batch-evaluate-form";

export const dynamic = "force-dynamic";

function toneForRecommendation(recommendation: string) {
  if (recommendation === "Priority apply" || recommendation === "Strong apply") return "success" as const;
  if (recommendation === "Skip") return "danger" as const;
  return "warning" as const;
}

export default async function JobsPage() {
  const profile = getUserProfile();
  const jobs = getJobs();

  async function purgeJobsAction(formData: FormData) {
    "use server";

    const mode = String(formData.get("purgeMode") ?? "");
    const pref = getUserProfile();

    if (mode === "skipped-archived") {
      purgeJobs({ statuses: ["Skipped"], includeArchived: true });
    } else if (mode === "below50") {
      purgeJobs({ belowScore: 50, statuses: ["Found", "Reviewed"] });
    } else if (mode === "location-mismatch") {
      purgeJobs({
        belowScore: 100,
        statuses: ["Found", "Reviewed"],
        locationKeywords: pref.preferredLocations,
      });
    } else if (mode === "all") {
      purgeJobs({ belowScore: 100 });
    }
    revalidatePath("/jobs");
    revalidatePath("/dashboard");
    redirect("/jobs");
  }

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

        {/* Sweep / cleanup panel */}
        {jobs.length > 0 ? (
          <details className="rounded-panel border border-border bg-panel">
            <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-muted hover:text-ink">
              Sweep irrelevant jobs ({jobs.length} total)
            </summary>
            <div className="border-t border-border px-5 pb-4 pt-4">
              <p className="mb-4 text-xs text-muted">
                Permanently deletes jobs and all associated evaluations, documents, and drafts. This cannot be undone.
              </p>
              <form action={purgeJobsAction} className="flex flex-wrap gap-2">
                <select
                  className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  name="purgeMode"
                >
                  <option value="skipped-archived">Skipped + Archived jobs</option>
                  <option value="below50">Below 50% fit — unreviewed only</option>
                  {profile.preferredLocations.length > 0 ? (
                    <option value="location-mismatch">
                      Outside {profile.preferredLocations[0]} + not remote — unreviewed only
                    </option>
                  ) : null}
                  <option value="all">⚠ Delete all jobs</option>
                </select>
                <button
                  className="inline-flex items-center rounded-control border border-danger/40 bg-danger/8 px-4 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/15"
                  type="submit"
                >
                  Delete matching
                </button>
              </form>
            </div>
          </details>
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
                {job.url ? (
                  <a
                    className="text-xs font-medium text-accent hover:underline"
                    href={job.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Posting ↗
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table with column filters + batch actions */}
        {jobs.length > 0 ? (
          <div className="hidden lg:block">
            <BatchEvaluateForm jobs={jobs} />
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
