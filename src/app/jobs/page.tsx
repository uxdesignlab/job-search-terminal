import Link from "next/link";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Shell } from "@/components/ui/shell";
import { formatPostedDate } from "@/lib/dates";
import { getJobs, getUserProfile } from "@/lib/db/queries";
import { AddJobModal } from "@/components/AddJobModal";
import { BatchEvaluateForm } from "@/components/batch-evaluate-form";

export const dynamic = "force-dynamic";

type JobsPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

function toneForRecommendation(recommendation: string) {
  if (recommendation === "Priority apply" || recommendation === "Strong apply") return "success" as const;
  if (recommendation === "Skip") return "danger" as const;
  return "warning" as const;
}

function isLocationMatch(location: string, remoteType: string, preferredLocations: string[], remotePreference: string): boolean {
  const loc = location.toLowerCase();
  const rtype = remoteType.toLowerCase();
  const isRemote = loc.includes("remote") || rtype.includes("remote");
  const isHybrid = loc.includes("hybrid") || rtype.includes("hybrid");

  if (remotePreference === "remote-only") return isRemote;
  if (remotePreference === "local-or-remote") {
    if (isRemote) return true;
    return preferredLocations.some((pl) => loc.includes(pl.toLowerCase().split(",")[0].trim().toLowerCase()));
  }
  return true;
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  const statusFilter = params.status ?? "all";
  const fitFilter = params.fit ?? "all";
  const dateFilter = params.date ?? "all";
  const sortFilter = params.sort ?? "score";
  const locationFilter = params.location ?? "profile";

  const profile = getUserProfile();
  let jobs = getJobs();

  // Status filter
  if (statusFilter !== "all") {
    jobs = jobs.filter((j) => j.status === statusFilter);
  }

  // Fit score filter
  if (fitFilter === "80+") {
    jobs = jobs.filter((j) => j.fitScore >= 80);
  } else if (fitFilter === "60+") {
    jobs = jobs.filter((j) => j.fitScore >= 60);
  } else if (fitFilter === "below60") {
    jobs = jobs.filter((j) => j.fitScore < 60);
  }

  // Date filter
  if (dateFilter === "known") {
    jobs = jobs.filter((j) => !!j.firstSeenDate);
  } else if (dateFilter === "unknown") {
    jobs = jobs.filter((j) => !j.firstSeenDate);
  }

  // Location filter
  const activeRemotePref = locationFilter === "profile" ? profile.remotePreference : locationFilter as typeof profile.remotePreference;
  if (activeRemotePref !== "all") {
    jobs = jobs.filter((j) => isLocationMatch(j.location, j.remoteType, profile.preferredLocations, activeRemotePref));
  }

  // Sort
  if (sortFilter === "newest") {
    jobs = [...jobs].sort((a, b) => (b.firstSeenDate ?? "").localeCompare(a.firstSeenDate ?? ""));
  } else if (sortFilter === "action") {
    jobs = [...jobs].filter((j) => j.recommendation === "Priority apply").concat(
      jobs.filter((j) => j.recommendation !== "Priority apply")
    );
  }
  // default: score (already sorted by getJobs)

  const hasFilters = statusFilter !== "all" || fitFilter !== "all" || dateFilter !== "all" || sortFilter !== "score" || locationFilter !== "profile";

  return (
    <Shell activeItem="Jobs">
      <div className="grid gap-6">
        <PageHeader
          description="Discovered jobs with fit scoring, posted dates, status, and recommended action."
          eyebrow="Position dashboard"
          title="Jobs"
          actions={<AddJobModal />}
        />

        <div className="rounded-panel border border-border bg-panel p-5">
          <p className="mb-3 text-sm font-semibold text-ink">Filters</p>
          <form className="grid gap-4 md:grid-cols-5" method="GET">
            <label className="grid gap-1 text-xs font-medium text-muted">
              Location
              <select
                className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                defaultValue={locationFilter}
                name="location"
              >
                <option value="profile">My profile preference</option>
                <option value="remote-only">Remote only</option>
                <option value="local-or-remote">
                  {profile.preferredLocations.length > 0 ? `${profile.preferredLocations[0]} or remote` : "Local or remote"}
                </option>
                <option value="all">All locations</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted">
              Status
              <select
                className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                defaultValue={statusFilter}
                name="status"
              >
                <option value="all">All statuses</option>
                <option value="Found">Found</option>
                <option value="Reviewed">Reviewed</option>
                <option value="Resume generated">Resume generated</option>
                <option value="Applied">Applied</option>
                <option value="Skipped">Skipped</option>
                <option value="Archived">Archived</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted">
              Fit score
              <select
                className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                defaultValue={fitFilter}
                name="fit"
              >
                <option value="all">All scores</option>
                <option value="80+">80% and above</option>
                <option value="60+">60% and above</option>
                <option value="below60">Below 60%</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted">
              Posted date
              <select
                className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                defaultValue={dateFilter}
                name="date"
              >
                <option value="all">All dates</option>
                <option value="known">Has posted date</option>
                <option value="unknown">Date unavailable</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted">
              Sort
              <select
                className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                defaultValue={sortFilter}
                name="sort"
              >
                <option value="score">Highest match</option>
                <option value="newest">Freshest first</option>
                <option value="action">Priority first</option>
              </select>
            </label>
            <div className="flex items-end gap-2 md:col-span-5">
              <button
                className="inline-flex min-h-9 items-center justify-center rounded-control border border-accent bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[rgb(var(--color-accent-strong))]"
                type="submit"
              >
                Apply filters
              </button>
              {hasFilters && (
                <Link
                  className="inline-flex min-h-9 items-center justify-center rounded-control border border-border px-4 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
                  href="/jobs"
                >
                  Clear
                </Link>
              )}
              {hasFilters && (
                <span className="text-xs text-muted">{jobs.length} result{jobs.length !== 1 ? "s" : ""}</span>
              )}
            </div>
          </form>
        </div>

        {jobs.length === 0 ? (
          <EmptyState
            description={hasFilters ? "Try adjusting the filters above, or clear them to see all jobs." : "Run a scan from the dashboard to add discovered roles before reviewing fit or status."}
            title={hasFilters ? "No jobs match these filters" : "No jobs found yet"}
          />
        ) : null}

        {/* Mobile card view */}
        <div className="grid gap-4 lg:hidden">
          {jobs.map((job) => (
            <div className="rounded-panel border border-border bg-panel p-4" key={job.id}>
              <Link className="font-medium text-accent hover:underline" href={`/jobs/${job.id}`}>
                {job.title}
              </Link>
              <p className="mt-0.5 text-sm text-muted">{job.company} · {job.location}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>{job.fitScore}% fit</Badge>
                <Badge>{formatPostedDate(job)}</Badge>
                <Badge tone={toneForRecommendation(job.recommendation)}>{job.recommendation}</Badge>
                {job.url ? (
                  <a className="text-xs font-medium text-accent hover:underline" href={job.url} rel="noreferrer" target="_blank">
                    Posting ↗
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table with batch evaluate */}
        {jobs.length > 0 ? (
          <div className="hidden lg:block">
            <BatchEvaluateForm jobs={jobs} />
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
