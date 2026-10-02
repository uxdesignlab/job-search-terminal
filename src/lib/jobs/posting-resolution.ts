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
const BOARD_ONLY_SOURCES: Record<string, { host: RegExp; domain: string }> = {
  "himalayas-api-scan": { host: /(^|\.)himalayas\.app$/i, domain: "himalayas.app" },
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
  const board = BOARD_ONLY_SOURCES[source];
  if (!board) return false;
  try {
    return board.host.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * The web search used to find a job's real posting. A saved query wins.
 *
 * The title is quoted so results must contain that exact phrase — otherwise a
 * search for one company's "Accessibility Coordinator" fills up with other
 * companies' coordinators. For a board-only job (Himalayas) the location is
 * left out, because it is in the board's own format ("United States (Remote)")
 * that careers pages rarely repeat, and the board itself is excluded so the
 * search does not lead straight back to the listing it started from.
 */
export function buildPostingSearchQuery(
  job: Pick<JobRecord, "company" | "title" | "location" | "postingSearchQuery"> & Partial<Pick<JobRecord, "source">>,
): string {
  const saved = job.postingSearchQuery.trim();
  if (saved) return saved;
  const title = job.title.replace(/["\u201C\u201D]/g, "").trim();
  const quotedTitle = title ? `"${title}"` : "";
  const board = job.source ? BOARD_ONLY_SOURCES[job.source] : undefined;
  if (board) {
    return [job.company, quotedTitle, `-site:${board.domain}`].filter(Boolean).join(" ");
  }
  return [job.company, quotedTitle, job.location, "job"].filter(Boolean).join(" ");
}
