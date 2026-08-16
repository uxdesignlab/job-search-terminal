import type { JobRecord } from "@/lib/db/types";
import { OUTSIDE_PREFERENCES_LABEL, UNKNOWN_LOCATION_LABEL } from "@/lib/jobs/preference-fit";
import { sourceLabelFromJobSource } from "@/lib/scanner/browser-board-sources";
import type { AtsProvider } from "@/lib/scanner/source-discovery";

export type MainJobTableRecord = JobRecord & {
  preferenceLabel?: string;
  removalProtected?: boolean;
  /**
   * Resolved on the server by `getJobSourceLabel`, because label resolution may consult
   * a local-only config the browser cannot read. Client code should prefer this over
   * recomputing, and falls back to the public-only label when it is absent.
   */
  sourceLabel?: string;
};

/** Fit buckets for filter options and display (matches main jobs table). */
export const JOB_FIT_BUCKETS = ["80–100%", "60–79%", "40–59%", "20–39%", "0–19%"] as const;
export const MATCHES_PREFERENCES_LABEL = "Match";

/** Generic source label, and the value saved filters used before per-site labels existed. */
export const LEGACY_SCANNER_LABEL = "Scanner";

/** Display names for the ATS providers `careerops-scanner` writes as `<type>-api`. */
const ATS_PROVIDER_LABELS: Record<AtsProvider, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
};

const SOURCE_HOST_LABELS: Array<[string, string]> = [
  ["linkedin.com", "LinkedIn"],
  ["greenhouse.io", "Greenhouse"],
  ["lever.co", "Lever"],
  ["ashbyhq.com", "Ashby"],
  ["workatastartup.com", "Work at a Startup"],
  ["wellfound.com", "Wellfound"],
  ["indeed.com", "Indeed"],
  ["glassdoor.com", "Glassdoor"],
  ["monster.com", "Monster"],
  ["dice.com", "Dice"],
  ["adzuna.com", "Adzuna"],
];

/**
 * Derived from the `<provider>-api` source that careerops-scanner writes, so adding a
 * provider to `AtsProvider` surfaces a compile error here instead of silently falling
 * back to the generic "Scanner" label.
 */
function atsProviderLabel(source: string): string | null {
  const provider = source.endsWith("-api") ? source.slice(0, -"-api".length) : "";
  return provider in ATS_PROVIDER_LABELS ? ATS_PROVIDER_LABELS[provider as AtsProvider] : null;
}

function sourceLabelFromUrl(value: string, extraHostLabels: Array<[string, string]>): string | null {
  if (!value.trim()) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    const matches = ([domain]: [string, string]) => hostname === domain || hostname.endsWith(`.${domain}`);
    return (extraHostLabels.find(matches) ?? SOURCE_HOST_LABELS.find(matches))?.[1] ?? hostname;
  } catch {
    return null;
  }
}

/**
 * Human-readable label for a job's origin. Falls back to the bare hostname of the
 * source URL, then to "Scanner" when there is no usable URL.
 *
 * `extraHostLabels` lets a deployment name hosts the public list does not cover. It is
 * loaded server-side from a local-only config; see `@/lib/jobs/source-labels`.
 */
export function getJobSourceLabel(
  job: Pick<JobRecord, "source" | "sourceUrl">,
  extraHostLabels: Array<[string, string]> = [],
): string {
  return (
    sourceLabelFromJobSource(job.source) ??
    atsProviderLabel(job.source) ??
    sourceLabelFromUrl(job.sourceUrl, extraHostLabels) ??
    LEGACY_SCANNER_LABEL
  );
}

export function jobFitBucket(score: number): string {
  if (score >= 80) return "80–100%";
  if (score >= 60) return "60–79%";
  if (score >= 40) return "40–59%";
  if (score >= 20) return "20–39%";
  return "0–19%";
}

export type MainJobsSortCol =
  | "title"
  | "company"
  | "location"
  | "preference"
  | "fit"
  | "status"
  | "recommendation"
  | "posted"
  | "scanned"
  | "source"
  | "duplicate";

export function getMainJobColValue(job: MainJobTableRecord, col: MainJobsSortCol): string {
  switch (col) {
    case "title":
      return job.title;
    case "company":
      return job.company;
    case "location":
      return job.location;
    case "preference":
      return job.preferenceLabel ?? MATCHES_PREFERENCES_LABEL;
    case "fit":
      return jobFitBucket(job.fitScore);
    case "status":
      return job.status;
    case "recommendation":
      return job.recommendation;
    case "posted":
      return job.datePosted ? "Has date" : "No date";
    case "scanned":
      return job.firstSeenDate ? "Has date" : "No date";
    case "source":
      return job.sourceLabel ?? getJobSourceLabel(job);
    case "duplicate":
      return job.isDuplicate ? "Yes" : "No";
  }
}

/**
 * Preserve the meaning of source filters saved before scanner jobs began using
 * their originating site as the visible label. "Scanner" used to cover every source
 * without a browser-board label, so it still matches those jobs whatever they now
 * display as.
 */
export function matchesMainJobColFilter(
  job: MainJobTableRecord,
  col: MainJobsSortCol,
  allowed: ReadonlySet<string>,
): boolean {
  if (allowed.has(getMainJobColValue(job, col))) return true;
  return (
    col === "source" &&
    allowed.has(LEGACY_SCANNER_LABEL) &&
    sourceLabelFromJobSource(job.source) === null
  );
}

export function getMainJobColOptions(jobs: MainJobTableRecord[], col: MainJobsSortCol): string[] {
  if (col === "fit") return [...JOB_FIT_BUCKETS];
  if (col === "preference") return [MATCHES_PREFERENCES_LABEL, OUTSIDE_PREFERENCES_LABEL, UNKNOWN_LOCATION_LABEL];
  if (col === "posted" || col === "scanned") return ["Has date", "No date"];
  if (col === "source") {
    // "Scanner" is always offered even when no job currently carries it, so a saved
    // legacy filter stays reachable after being cleared.
    const labels = new Set(jobs.map((job) => getMainJobColValue(job, "source")));
    labels.add(LEGACY_SCANNER_LABEL);
    return [...labels].sort();
  }
  return [...new Set(jobs.map((j) => getMainJobColValue(j, col)))].sort();
}

export type ArchivedJobsSortCol = "title" | "company" | "score" | "archiveStatus" | "posted" | "reason";

export function getArchivedJobColValue(job: JobRecord, col: ArchivedJobsSortCol): string {
  switch (col) {
    case "title":
      return job.title;
    case "company":
      return job.company;
    case "score":
      return jobFitBucket(job.fitScore);
    case "archiveStatus":
      return job.livenessStatus === "expired" ? "Expired" : "Manually archived";
    case "posted":
      return job.datePosted ? "Has date" : "No date";
    case "reason":
      return job.status;
  }
}

export function getArchivedJobColOptions(jobs: JobRecord[], col: ArchivedJobsSortCol): string[] {
  if (col === "score") return [...JOB_FIT_BUCKETS];
  if (col === "posted") return ["Has date", "No date"];
  if (col === "archiveStatus") return ["Expired", "Manually archived"];
  return [...new Set(jobs.map((j) => getArchivedJobColValue(j, col)))].sort();
}
