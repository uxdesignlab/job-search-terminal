import type { JobRecord } from "@/lib/db/types";

export function isHttpPostingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function hasResolvedPosting(job: Pick<JobRecord, "postingResolutionStatus" | "url">): boolean {
  return job.postingResolutionStatus !== "needs_resolution" && isHttpPostingUrl(job.url);
}

/**
 * Boards whose listings never carry the employer's own link. A job from one of
 * these whose URL still points at the board has a usable listing but no
 * employer posting — unlike `needs_resolution`, which means no URL at all.
 */
const BOARD_ONLY_SOURCES: Record<string, RegExp> = {
  "himalayas-api-scan": /(^|\.)himalayas\.app$/i,
};

/** Display name for a board-only source, for copy like "Himalayas listing". */
export function boardOnlySourceLabel(source: string): string | null {
  return source === "himalayas-api-scan" ? "Himalayas" : null;
}

/** True when the job still links only to a board that hides the employer's posting. */
export function needsEmployerPosting(job: Pick<JobRecord, "source" | "url" | "postingResolutionStatus">): boolean {
  return job.postingResolutionStatus !== "needs_resolution" && isBoardOnlyUrl(job.source, job.url);
}

/** True when a URL is the board's own page rather than an employer posting. */
export function isBoardOnlyUrl(source: string, url: string): boolean {
  const host = BOARD_ONLY_SOURCES[source];
  if (!host) return false;
  try {
    return host.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function buildPostingSearchQuery(job: Pick<JobRecord, "company" | "title" | "location" | "postingSearchQuery">): string {
  const saved = job.postingSearchQuery.trim();
  if (saved) return saved;
  return [job.company, job.title, job.location, "job"].filter(Boolean).join(" ");
}
