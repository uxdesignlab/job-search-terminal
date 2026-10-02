import { getAISettings, getJobById, markJobUserActivity, updateJobPostingResolution } from "@/lib/db/queries";
import { buildPostingSearchQuery, isBoardOnlyUrl, needsEmployerPosting } from "@/lib/jobs/posting-resolution";
import { safeFetch } from "@/lib/safe-fetch";
import { fetchJobDescription } from "./jd-fetcher";
import { findEmployerPostingCandidates, himalayasCompanySlug, type EmployerBoardProvider } from "./employer-posting-lookup";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

export type PostingCandidate = {
  title: string;
  url: string;
  description: string;
  /** Where the candidate came from, shown beside it so the user can weigh it. */
  origin?: string;
};

const PROVIDER_LABEL: Record<EmployerBoardProvider, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
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

  // A board-only job (Himalayas) gets the free, exact-title check of the
  // company's own Greenhouse, Lever, or Ashby board before any web search.
  // Every exact-title posting is listed, with its location: when a company posts
  // the same title per office or region, the user is the one to choose.
  const boardCandidates: PostingCandidate[] = [];
  if (needsEmployerPosting(job)) {
    const matches = await findEmployerPostingCandidates({
      company: job.company,
      title: job.title,
      companySlug: himalayasCompanySlug(job.sourceUrl) ?? himalayasCompanySlug(job.url),
      location: job.location,
    }).catch(() => []);
    const several = matches.length > 1;
    for (const match of matches.slice(0, 5)) {
      const where = match.location ? ` · ${match.location}` : "";
      boardCandidates.push({
        title: `${match.title} — ${job.company}`,
        url: match.url,
        description: several
          ? `One of ${matches.length} postings with this title on ${job.company}'s ${PROVIDER_LABEL[match.provider]} job board. Check the location before using it.`
          : `Exact title match on ${job.company}'s ${PROVIDER_LABEL[match.provider]} job board.`,
        origin: `${PROVIDER_LABEL[match.provider]} · exact title match${where}`,
      });
    }
  }

  if (!settings.braveSearchApiKey) {
    return { query, candidates: boardCandidates, externalSearchUrl: externalSearch, usedBrave: false };
  }

  const params = new URLSearchParams({
    q: `${toBraveQuery(query)} (jobs OR careers OR greenhouse OR lever OR ashby OR workday)`,
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
    .filter((result) => !isBoardOnlyUrl(job.source, result.url))
    .filter((result) => !boardCandidates.some((c) => c.url === result.url))
    .map((result) => ({
      title: result.title,
      url: result.url,
      description: result.description ?? "",
      origin: "Web search",
    }))
    .slice(0, 5);

  return { query, candidates: [...boardCandidates, ...candidates], externalSearchUrl: externalSearch, usedBrave: true };
}

export async function resolveEmailJobPosting(jobId: string, postingUrl: string): Promise<{ success: true; descriptionFetched: boolean }> {
  const job = getJobById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  if (!isLikelyPostingUrl(postingUrl)) throw new Error("Enter a valid public job posting URL.");
  if (isBoardOnlyUrl(job.source, postingUrl)) {
    throw new Error("That is the job board's own page. Paste the link from the company's careers site instead.");
  }

  // A board-only job already has a real listing (its Himalayas page). That stays
  // as the source, so the job can always be traced back to where it was found.
  const keepSource = needsEmployerPosting(job) && Boolean(job.sourceUrl);
  const sourceUrl = keepSource ? job.sourceUrl : postingUrl;

  markJobUserActivity(jobId);
  const resolvedJob = {
    ...job,
    url: postingUrl,
    sourceUrl,
    originalPostingUrl: postingUrl,
    postingResolutionStatus: "resolved" as const,
  };
  const description = await fetchJobDescription(resolvedJob).catch(() => null);
  const hasUsefulDescription = Boolean(description && description.trim().length >= 100);
  // Keep the board's description when the employer page cannot be read.
  const keepsGoodDescription = !hasUsefulDescription && job.rawDescription.trim().length >= 100;

  updateJobPostingResolution(jobId, {
    url: postingUrl,
    sourceUrl,
    originalPostingUrl: postingUrl,
    originalPostingKey: atsPostingKey(postingUrl),
    rawDescription: keepsGoodDescription ? undefined : description ?? undefined,
    postingResolutionStatus: "resolved",
    reviewStatus: hasUsefulDescription || keepsGoodDescription ? "none" : "pending_review",
    userInitiated: true,
  });

  return { success: true, descriptionFetched: hasUsefulDescription };
}

/**
 * Brave documents exclusion as `NOT site:x`, not Google's `-site:x`, so the
 * query shown to the user (and sent to Google) is translated for Brave.
 */
export function toBraveQuery(query: string): string {
  return query.replace(/(^|\s)-site:/g, "$1NOT site:");
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
