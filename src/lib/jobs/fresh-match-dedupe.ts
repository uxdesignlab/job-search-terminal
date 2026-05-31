import type { JobRecord } from "@/lib/db/types";

type FreshMatchCandidate = Pick<JobRecord, "company" | "isDuplicate" | "originalPostingKey" | "title" | "url">;
type FreshScanMatchCandidate = FreshMatchCandidate & Pick<
  JobRecord,
  "datePosted" | "firstSeenDate" | "fitScore" | "id" | "source" | "status"
>;

function normalizeCompany(company: string) {
  return company
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:inc|incorporated|llc|ltd|limited|corp|corporation|co)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeRole(title: string) {
  return title
    .toLowerCase()
    .replace(/\s+at\s+.+$/i, " ")
    .replace(/[—–-]\s*(?:remote|hybrid|on[- ]?site).*$/i, " ")
    .replace(/[$£€]\s*\d[\w,.-]*/g, " ")
    .replace(/\b(?:remote|hybrid|on[- ]?site|equity|yr|year)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function semanticKey(job: FreshMatchCandidate) {
  return `${normalizeCompany(job.company)}::${normalizeRole(job.title)}`;
}

export function dedupeFreshMatches<T extends FreshMatchCandidate>(jobs: T[]): T[] {
  const seenPostingKeys = new Set<string>();
  const seenSemanticKeys = new Set<string>();
  const seenUrls = new Set<string>();

  return jobs.filter((job) => {
    if (job.isDuplicate) return false;
    const postingKey = job.originalPostingKey.trim().toLowerCase();
    const url = job.url.trim().toLowerCase().replace(/[?#].*$/, "");
    const semantic = semanticKey(job);
    if (
      (postingKey && seenPostingKeys.has(postingKey)) ||
      (url && seenUrls.has(url)) ||
      (semantic && seenSemanticKeys.has(semantic))
    ) return false;
    if (postingKey) seenPostingKeys.add(postingKey);
    if (url) seenUrls.add(url);
    if (semantic) seenSemanticKeys.add(semantic);
    return true;
  });
}

export function filterFreshScanMatches<T extends FreshScanMatchCandidate>(
  jobs: T[],
  applicationJobIds: ReadonlySet<string>,
  windowHours: number,
  now = new Date()
): T[] {
  const cutoff = now.getTime() - windowHours * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoff).toISOString().slice(0, 10);

  return dedupeFreshMatches(jobs
    .filter((job) => {
      const postedAt = job.datePosted ? Date.parse(job.datePosted) : Number.NaN;
      return job.source !== "manual"
        && job.status === "Found"
        && !applicationJobIds.has(job.id)
        && job.firstSeenDate >= cutoffDate
        && (!Number.isFinite(postedAt) || postedAt >= cutoff);
    })
    .sort((a, b) => {
      const aPosted = a.datePosted ? Date.parse(a.datePosted) : 0;
      const bPosted = b.datePosted ? Date.parse(b.datePosted) : 0;
      return bPosted - aPosted || b.fitScore - a.fitScore || b.firstSeenDate.localeCompare(a.firstSeenDate);
    }));
}
