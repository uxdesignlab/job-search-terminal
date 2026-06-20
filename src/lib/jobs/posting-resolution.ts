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

export function buildPostingSearchQuery(job: Pick<JobRecord, "company" | "title" | "location" | "postingSearchQuery">): string {
  const saved = job.postingSearchQuery.trim();
  if (saved) return saved;
  return [job.company, job.title, job.location, "job"].filter(Boolean).join(" ");
}
