import { safeFetch } from "../safe-fetch";
import { getAISettings } from "../db/queries";
import { tryGetActiveProvider } from "../ai/factory";
import type { CompensationResearchStatus, CompensationSource, JobRecord, MarketCompensation, PostedCompensation } from "../db/types";

/**
 * Compensation context for Application Preparation (PRD v0.2.1 §27).
 *
 * The rule that shapes this module: a model's recollection of salary bands is
 * not market research and must never be presented as though it were. Posted
 * compensation is a fact from the posting. Live research is a fact with sources.
 * Anything else is explicitly labelled unavailable — the application answer then
 * falls back to the user's own saved target, which is honest.
 */

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const MAX_SOURCES = 4;

type BraveWebResult = { url?: string; title?: string; description?: string };
type BraveResponse = { web?: { results?: BraveWebResult[] } };

const NOT_CAPTURED = /not captured|not provided|not specified|unavailable/i;

/**
 * Read compensation the posting already states. Evaluation surfaces this too, so
 * nothing here calls out to anything — it is parsing, not research.
 */
export function parsePostedCompensation(job: Pick<JobRecord, "salaryNotes">): PostedCompensation | null {
  const raw = (job.salaryNotes ?? "").trim();
  if (!raw || NOT_CAPTURED.test(raw)) return null;

  // Currency-marked figures only. A bare pair of numbers in prose is as likely to
  // be a team size or a year as a salary band.
  const amounts = [...raw.matchAll(/[$£€]\s?(\d{1,3}(?:,\d{3})*|\d+(?:\.\d+)?)\s*([kK])?/g)].map((match) => {
    const value = Number.parseFloat(match[1].replace(/,/g, ""));
    return match[2] ? value * 1000 : value;
  });

  const currency = raw.includes("£") ? "GBP" : raw.includes("€") ? "EUR" : raw.includes("$") ? "USD" : undefined;
  const period = /hour|hr\b/i.test(raw) ? "hour" : /month/i.test(raw) ? "month" : "year";

  return {
    raw,
    min: amounts.length > 0 ? Math.min(...amounts) : undefined,
    max: amounts.length > 1 ? Math.max(...amounts) : undefined,
    currency,
    period,
  };
}

async function braveCompensationSearch(apiKey: string, query: string): Promise<CompensationSource[]> {
  const params = new URLSearchParams({
    q: query,
    count: "10",
    search_lang: "en",
    text_decorations: "false",
    spellcheck: "false",
  });
  const res = await safeFetch(`${BRAVE_SEARCH_URL}?${params}`, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!res.ok) throw new Error(`Brave Search returned HTTP ${res.status}`);
  const data = (await res.json()) as BraveResponse;
  return (data.web?.results ?? [])
    .filter((result) => result.url && result.title)
    .slice(0, MAX_SOURCES)
    .map((result) => ({
      title: result.title ?? "",
      url: result.url ?? "",
      snippet: (result.description ?? "").slice(0, 400),
    }));
}

export type CompensationResearch = {
  market: MarketCompensation | null;
  sources: CompensationSource[];
  status: CompensationResearchStatus;
  provider: string;
  query: string;
};

/**
 * One live lookup, at most (§28). Brave when configured; otherwise the selected
 * AI provider's own `webSearch`, which is a real search rather than recall. When
 * neither exists the result is `unavailable` with no range attached — deliberately
 * empty rather than quietly filled from model memory.
 */
export async function researchMarketCompensation(job: Pick<JobRecord, "title" | "location">): Promise<CompensationResearch> {
  const query = `${job.title} salary range ${job.location || "United States"} 2026`;
  const braveKey = getAISettings().braveSearchApiKey;

  if (braveKey) {
    try {
      const sources = await braveCompensationSearch(braveKey, query);
      if (sources.length > 0) {
        return {
          market: { summary: sources.map((source) => source.snippet).filter(Boolean).join(" ").slice(0, 800) },
          sources,
          status: "completed",
          provider: "brave",
          query,
        };
      }
    } catch (error) {
      console.warn("[application-preparation] Brave compensation search failed:", error);
    }
  }

  const provider = tryGetActiveProvider();
  if (provider?.webSearch) {
    try {
      const summary = await provider.webSearch(query);
      if (summary && summary.trim().length > 0) {
        return {
          market: { summary: summary.trim().slice(0, 800) },
          // The provider returns prose, not a source list. Reporting no sources is
          // accurate; inventing citations to look rigorous would not be.
          sources: [],
          status: "completed",
          provider: `${provider.name}:webSearch`,
          query,
        };
      }
    } catch (error) {
      console.warn("[application-preparation] provider web search failed:", error);
    }
  }

  return { market: null, sources: [], status: "unavailable", provider: "", query };
}

/**
 * What to type into a salary field, and where the number came from (§33).
 * Posted compensation wins; then live research; then the user's saved target.
 */
export function suggestCompensationResponse(input: {
  posted: PostedCompensation | null;
  research: CompensationResearch;
  savedTarget: string;
}): string {
  if (input.posted) {
    return input.savedTarget
      ? `${input.posted.raw} (posted). Your saved target: ${input.savedTarget}.`
      : `${input.posted.raw} (posted).`;
  }
  if (input.research.status === "completed" && input.research.market) {
    return input.savedTarget
      ? `Your saved target: ${input.savedTarget}. Market context researched ${new Date().toISOString().slice(0, 10)}.`
      : "See researched market context — no target saved in your profile.";
  }
  return input.savedTarget
    ? `Your saved target: ${input.savedTarget}. No posted range and live market research was unavailable.`
    : "No posted range, no saved target, and live market research was unavailable.";
}
