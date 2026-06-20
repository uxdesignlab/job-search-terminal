import { getAISettings, getJobById, updateJobPostingResolution } from "@/lib/db/queries";
import { buildPostingSearchQuery } from "@/lib/jobs/posting-resolution";
import { safeFetch } from "@/lib/safe-fetch";
import { fetchJobDescription } from "./jd-fetcher";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

export type PostingCandidate = {
  title: string;
  url: string;
  description: string;
};

type BraveSearchResponse = {
  web?: {
    results?: Array<{ title?: string; url?: string; description?: string }>;
  };
};

export function externalPostingSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export async function searchPostingCandidates(jobId: string): Promise<{
  query: string;
  candidates: PostingCandidate[];
  externalSearchUrl: string;
  usedBrave: boolean;
}> {
  const job = getJobById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  const query = buildPostingSearchQuery(job);
  const externalSearch = externalPostingSearchUrl(query);
  const settings = getAISettings();

  if (!settings.braveSearchApiKey) {
    return { query, candidates: [], externalSearchUrl: externalSearch, usedBrave: false };
  }

  const params = new URLSearchParams({
    q: `${query} (jobs OR careers OR greenhouse OR lever OR ashby OR workday)`,
    count: "8",
    search_lang: "en",
    country: "us",
  });
  const res = await safeFetch(`${BRAVE_SEARCH_URL}?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": settings.braveSearchApiKey,
    },
  });
  if (!res.ok) throw new Error(`Brave Search returned HTTP ${res.status}`);
  const data = await res.json() as BraveSearchResponse;
  const candidates = (data.web?.results ?? [])
    .filter((result): result is { title: string; url: string; description?: string } => Boolean(result.title && result.url))
    .filter((result) => isLikelyPostingUrl(result.url))
    .map((result) => ({
      title: result.title,
      url: result.url,
      description: result.description ?? "",
    }))
    .slice(0, 5);

  return { query, candidates, externalSearchUrl: externalSearch, usedBrave: true };
}

export async function resolveEmailJobPosting(jobId: string, postingUrl: string): Promise<{ success: true; descriptionFetched: boolean }> {
  const job = getJobById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  if (!isLikelyPostingUrl(postingUrl)) throw new Error("Enter a valid public job posting URL.");

  const resolvedJob = {
    ...job,
    url: postingUrl,
    sourceUrl: postingUrl,
    originalPostingUrl: postingUrl,
    postingResolutionStatus: "resolved" as const,
  };
  const description = await fetchJobDescription(resolvedJob).catch(() => null);
  const hasUsefulDescription = Boolean(description && description.trim().length >= 100);

  updateJobPostingResolution(jobId, {
    url: postingUrl,
    sourceUrl: postingUrl,
    originalPostingUrl: postingUrl,
    originalPostingKey: atsPostingKey(postingUrl),
    rawDescription: description ?? undefined,
    postingResolutionStatus: "resolved",
    reviewStatus: hasUsefulDescription ? "none" : "pending_review",
  });

  return { success: true, descriptionFetched: hasUsefulDescription };
}

function isLikelyPostingUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const haystack = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
    if (/(unsubscribe|preferences|settings|privacy|terms|login|signin|account|notification)/i.test(haystack)) return false;
    return /(job|career|greenhouse|lever|ashby|workday|smartrecruiters|icims|apply|posting|requisition|linkedin|indeed|monster|wellfound)/i.test(haystack);
  } catch {
    return false;
  }
}

function atsPostingKey(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    if (host.includes("greenhouse.io")) {
      const jobsIndex = segments.indexOf("jobs");
      if (jobsIndex > 0 && segments[jobsIndex + 1]) return `greenhouse:${segments[jobsIndex - 1]}:${segments[jobsIndex + 1]}`;
    }
    if (host === "jobs.lever.co" && segments.length >= 2) return `lever:${segments[0]}:${segments[1]}`;
    if (host === "jobs.ashbyhq.com" && segments.length >= 2) return `ashby:${segments[0]}:${segments[1]}`;
  } catch {
    return "";
  }
  return "";
}
