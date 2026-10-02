/**
 * Himalayas remote-job board scanner.
 *
 * Himalayas publishes a large remote-only board (~97,000 live postings, ~600
 * added per hour). The scanner reads it through the documented search endpoint,
 * `/jobs/api/search`, one request per title keyword per page:
 *
 *  - **Search filters server-side.** "product designer" returns ~1,100 postings
 *    rather than the whole board. The match is fuzzy ("Airtable Specialist"
 *    comes back for "product designer"), so the client-side title filter still
 *    decides what is kept. The plain `/jobs/api` feed ignores every filter, which
 *    is why the scanner used to walk it page by page — 60 pages covered only
 *    about two hours of postings and more tripped Himalayas' rate limit.
 *  - **`sort=recent` is newest-first** on the pages a scan reads. The final page
 *    of a result set is not in date order, so a query stops when an *entire*
 *    page is older than the coverage horizon, never at the first old posting.
 *  - **`limit` is hard-capped at 20**, and a page often carries 17–19 because
 *    Himalayas drops duplicates after counting. A short page is not the end;
 *    `totalCount` and an empty page are.
 *  - **Paging is by `page=`**, starting at 1. The search endpoint has no cursor.
 *  - **No employer link.** `applicationLink` is always Himalayas' own job page,
 *    and those pages are behind bot protection. The employer's posting is looked
 *    up separately on Greenhouse, Lever, and Ashby — see
 *    `employer-posting-lookup.ts` — and when none is found the job keeps its
 *    Himalayas link with `originalPostingUrl` left empty, so the job page can
 *    offer the "Find the employer's posting" panel.
 *
 * Measured against this project's own title filters (2026-10-02): the nine
 * keywords need ~25 requests to cover twelve hours, and every title match found
 * by walking the newest 400 feed postings also came back from search.
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeFetch } from "@/lib/safe-fetch";
import type { FreshnessWindowHours } from "@/lib/db/types";
import { getBrowserBoardImportDirectory, importBrowserBoardJobs } from "./browser-board-importer";
import { buildTitleFilter } from "@/lib/jobs/title-filter";
import { findEmployerPostingsForScan, type EmployerPostingMatch } from "./employer-posting-lookup";

const SEARCH_URL = "https://himalayas.app/jobs/api/search";
/** The API silently caps `limit` at 20, so asking for more just wastes the round trip. */
const PAGE_SIZE = 20;
/**
 * How far back each query reads, in hours.
 *
 * Twice the six-hour scan interval, so one missed scheduled scan loses nothing.
 * Postings older than this but inside the freshness window are still kept when a
 * page carries them; the horizon only decides when to stop asking for more.
 */
const COVERAGE_HOURS = 12;
/**
 * Ceiling on pages for one query. The busiest keyword measured ("product
 * design", ~11 postings an hour) covers the horizon in about 7 pages.
 */
const MAX_PAGES_PER_QUERY = 10;
/**
 * Ceiling on requests for a whole run. Himalayas answered with Cloudflare 429s
 * after about 60 requests under repeated load, so a run stays well under that.
 */
const MAX_REQUESTS = 50;
/** Keywords searched per run; past this, the run would mostly spend its budget. */
const MAX_QUERIES = 12;
const REQUEST_TIMEOUT_MS = 30_000;
const INTER_PAGE_DELAY_MS = 500;
/** Consecutive page failures that abort the run, so a degraded API is not hammered. */
const MAX_CONSECUTIVE_FAILURES = 3;
/**
 * Hours a query must cover before stopping short counts as a real gap.
 *
 * A query that hits its page cap after covering the six hours since the previous
 * scan has missed nothing new, and reporting it anyway trains the user to ignore
 * the lane's error row on a run that just delivered jobs.
 */
const MIN_COVERAGE_HOURS = 6;

export type HimalayasScanOptions = {
  titleFilters?: { positive: string[]; negative: string[] };
  /** Searched only when there are no positive title keywords. */
  targetRoles?: string[];
  freshnessWindowHours?: FreshnessWindowHours;
  /** Replaces the employer-posting lookup; `null` turns it off. Tests use both. */
  findEmployerPostings?: typeof findEmployerPostingsForScan | null;
};

export type HimalayasScanResult = {
  status: "ok" | "error";
  imported: number;
  duplicates: number;
  fresh: number;
  unknownDate: number;
  staleFiltered: number;
  totalFound: number;
  errors: string[];
  jobs: Array<{ title: string; url: string; company: string }>;
};

type HimalayasJob = {
  title?: unknown;
  companyName?: unknown;
  locationRestrictions?: unknown;
  pubDate?: unknown;
  applicationLink?: unknown;
  guid?: unknown;
  description?: unknown;
  excerpt?: unknown;
  minSalary?: unknown;
  maxSalary?: unknown;
  currency?: unknown;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Himalayas emits raw control characters inside JSON string values, which
 * `JSON.parse` rejects outright. Newlines and tabs become spaces; other C0
 * controls are dropped.
 */
export function parseHimalayasPayload(text: string): unknown {
  // Literal control bytes in a source file are invisible and easy to mangle,
  // so the range is written with explicit escapes.
  const sanitised = text.replace(/[\u0000-\u001F]/g, (c) =>
    c === "\n" || c === "\r" || c === "\t" ? " " : ""
  );
  return JSON.parse(sanitised);
}

/** `pubDate` is UNIX epoch **seconds**, not milliseconds. */
export function himalayasPubDateToIso(pubDate: unknown): string | null {
  if (typeof pubDate !== "number" || !Number.isFinite(pubDate)) return null;
  const ms = pubDate * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatHimalayasSalary(min: unknown, max: unknown, currency: unknown): string {
  const lo = typeof min === "number" && min > 0 ? min : null;
  const hi = typeof max === "number" && max > 0 ? max : null;
  if (!lo && !hi) return "";
  const unit = str(currency) || "USD";
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  if (lo && hi) return `${unit} ${k(lo)}–${k(hi)}/yr`;
  return lo ? `${unit} ${k(lo)}+/yr` : `up to ${unit} ${k(hi!)}/yr`;
}

/**
 * `locationRestrictions` is an array of countries the role is open to. An empty
 * array means unrestricted, which is materially different from "unknown" — it is
 * rendered as `Remote` so the preference filter treats it as open.
 */
export function formatHimalayasLocation(restrictions: unknown): string {
  if (!Array.isArray(restrictions) || restrictions.length === 0) return "Remote";
  const named = restrictions.map(str).filter(Boolean);
  if (named.length === 0) return "Remote";
  // Joined with "; " so the preference filter's multi-location splitting sees
  // each country as its own candidate.
  return named.map((n) => `${n} (Remote)`).join("; ");
}

export type NormalizedHimalayasJob = {
  id: string;
  company: string;
  position: string;
  jobDescription: string;
  url: string;
  sourceUrl: string;
  originalPostingUrl: string;
  discoveredAt: string;
  datePosted: string | null;
  location: string;
  salaryNotes: string;
};

export function isHimalayasUrl(url: string): boolean {
  try {
    return /(^|\.)himalayas\.app$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function normalizeHimalayasJob(raw: HimalayasJob): NormalizedHimalayasJob | null {
  const position = str(raw.title);
  const company = str(raw.companyName);
  const url = str(raw.applicationLink) || str(raw.guid);
  if (!position || !company || !url) return null;
  // `applicationLink` has only ever been Himalayas' own page. Should it ever
  // carry a real employer link, it is kept as one; a Himalayas page never is.
  const originalPostingUrl = isHimalayasUrl(url) ? "" : url;

  const datePosted = himalayasPubDateToIso(raw.pubDate);
  return {
    id: randomUUID(),
    company,
    position,
    jobDescription: str(raw.description) || str(raw.excerpt),
    url,
    sourceUrl: str(raw.guid) || url,
    originalPostingUrl,
    discoveredAt: datePosted ?? new Date().toISOString(),
    datePosted,
    location: formatHimalayasLocation(raw.locationRestrictions),
    salaryNotes: formatHimalayasSalary(raw.minSalary, raw.maxSalary, raw.currency),
  };
}

type HimalayasPage = { jobs: HimalayasJob[]; totalCount: number | null };

/**
 * The keywords a run searches for: the positive title keywords when there are
 * any, otherwise the target roles. Keywords are short and broad, which suits a
 * fuzzy search whose results the title filter narrows afterwards; full role
 * titles are the fallback for a profile with no keywords. Duplicates are
 * dropped case-insensitively, and the list is capped at {@link MAX_QUERIES}.
 */
export function himalayasSearchTerms(positive: string[] = [], targetRoles: string[] = []): string[] {
  const pick = (list: string[]) => list.map((t) => t.trim()).filter(Boolean);
  const candidates = pick(positive).length > 0 ? pick(positive) : pick(targetRoles);
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of candidates) {
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }
  return terms.slice(0, MAX_QUERIES);
}

/**
 * Swaps in the employer's own posting wherever one is found, keeping the
 * Himalayas page as `sourceUrl`. A failed lookup never fails the scan — the job
 * simply keeps its Himalayas link and can be resolved from the job page.
 */
async function attachEmployerPostings(
  jobs: NormalizedHimalayasJob[],
  opts: HimalayasScanOptions,
  onProgress?: (msg: string) => void,
): Promise<NormalizedHimalayasJob[]> {
  const lookup = opts.findEmployerPostings === undefined ? findEmployerPostingsForScan : opts.findEmployerPostings;
  const needLookup = jobs.filter((j) => !j.originalPostingUrl);
  if (!lookup || needLookup.length === 0) return jobs;

  let matches: Map<string, EmployerPostingMatch>;
  try {
    const result = await lookup(needLookup);
    matches = result.matches;
    if (result.attempted > 0) {
      onProgress?.(
        `Found the employer's own posting for ${matches.size} of ${result.attempted} new Himalayas ` +
          `${result.attempted === 1 ? "job" : "jobs"} (Greenhouse, Lever, Ashby).`,
      );
    }
  } catch {
    return jobs;
  }

  return jobs.map((job) => {
    const match = matches.get(job.sourceUrl);
    return match ? { ...job, url: match.url, originalPostingUrl: match.url } : job;
  });
}

type FetchOutcome = { kind: "page"; page: HimalayasPage } | { kind: "failed" } | { kind: "rate-limited" };

async function fetchSearchPage(term: string, page: number): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const params = new URLSearchParams({ q: term, sort: "recent", page: String(page) });
  try {
    const res = await safeFetch(`${SEARCH_URL}?${params}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; JobSearchTerminal/1.0; remote-board-fetch)" },
    });
    if (res.status === 429) return { kind: "rate-limited" };
    if (!res.ok) return { kind: "failed" };
    const data = parseHimalayasPayload(await res.text()) as { jobs?: unknown; totalCount?: unknown };
    return {
      kind: "page",
      page: {
        jobs: Array.isArray(data.jobs) ? (data.jobs as HimalayasJob[]) : [],
        totalCount: typeof data.totalCount === "number" ? data.totalCount : null,
      },
    };
  } catch {
    return { kind: "failed" };
  } finally {
    clearTimeout(timer);
  }
}

const quoted = (term: string) => `\u201c${term}\u201d`;

export async function runHimalayasScan(
  opts: HimalayasScanOptions = {},
  onProgress?: (msg: string) => void,
): Promise<HimalayasScanResult> {
  const freshnessWindowHours = opts.freshnessWindowHours ?? 72;
  const hourMs = 60 * 60 * 1000;
  const cutoffMs = Date.now() - freshnessWindowHours * hourMs;
  const horizonMs = Date.now() - Math.min(COVERAGE_HOURS, freshnessWindowHours) * hourMs;
  const scanTimestamp = new Date().toISOString();

  const terms = himalayasSearchTerms(opts.titleFilters?.positive, opts.targetRoles);
  if (terms.length === 0) {
    const detail =
      "Himalayas was not searched: add an include keyword under Account → Settings → Preferences → Title filters, " +
      "or a target role under Account → Profile.";
    onProgress?.(detail);
    return {
      status: "ok", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0,
      totalFound: 0, errors: [detail], jobs: [],
    };
  }

  const collected: NormalizedHimalayasJob[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let requests = 0;
  let consecutiveFailures = 0;
  let stopReason: "rate-limited" | "failing" | "budget" | null = null;
  const unsearched: string[] = [];

  for (const term of terms) {
    if (stopReason) {
      unsearched.push(term);
      continue;
    }
    onProgress?.(`Searching Himalayas for ${quoted(term)}`);
    let pagesRead = 0;
    let reachedHorizon = false;
    let oldestSeenMs: number | null = null;

    for (let page = 1; page <= MAX_PAGES_PER_QUERY && !reachedHorizon; page += 1) {
      if (requests >= MAX_REQUESTS) {
        stopReason = "budget";
        break;
      }
      if (requests > 0) await new Promise((r) => setTimeout(r, INTER_PAGE_DELAY_MS));
      requests += 1;
      const outcome = await fetchSearchPage(term, page);

      if (outcome.kind === "rate-limited") {
        stopReason = "rate-limited";
        break;
      }
      if (outcome.kind === "failed") {
        consecutiveFailures += 1;
        errors.push(`Himalayas search for ${quoted(term)}, page ${page}, failed`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          stopReason = "failing";
          break;
        }
        // A failed page is retried once more from the same position.
        page -= 1;
        continue;
      }

      consecutiveFailures = 0;
      pagesRead += 1;
      const { jobs, totalCount } = outcome.page;
      if (jobs.length === 0) break;

      let newestOnPageMs: number | null = null;
      for (const raw of jobs) {
        const job = normalizeHimalayasJob(raw);
        if (!job) continue;
        const postedMs = job.datePosted ? Date.parse(job.datePosted) : NaN;
        if (!Number.isNaN(postedMs)) {
          if (newestOnPageMs === null || postedMs > newestOnPageMs) newestOnPageMs = postedMs;
          if (oldestSeenMs === null || postedMs < oldestSeenMs) oldestSeenMs = postedMs;
          if (postedMs < cutoffMs) continue;
        }
        if (seen.has(job.sourceUrl)) continue;
        seen.add(job.sourceUrl);
        collected.push(job);
      }

      // Only a page that is old *throughout* ends the query: the last page of a
      // result set mixes dates, so one old posting proves nothing.
      if (newestOnPageMs !== null && newestOnPageMs < horizonMs) reachedHorizon = true;
      if (totalCount !== null && page * PAGE_SIZE >= totalCount) reachedHorizon = true;
    }

    // Stopping short — on the page cap, the request budget, or a rate limit — is
    // only worth reporting when the pages read span less than the gap between
    // scans: the case where postings could have slipped through unseen. A
    // partial sweep reported as a clean one is how a lane goes quiet without
    // anyone noticing; a full sweep reported as an error is how a real one stops
    // being read.
    if (!reachedHorizon) {
      const coveredHours = oldestSeenMs === null ? 0 : (Date.now() - oldestSeenMs) / hourMs;
      if (coveredHours < MIN_COVERAGE_HOURS) {
        if (stopReason) {
          unsearched.push(term);
        } else if (pagesRead >= MAX_PAGES_PER_QUERY) {
          const detail =
            `Himalayas search for ${quoted(term)} reached the ${MAX_PAGES_PER_QUERY}-page cap after only ` +
            `${coveredHours.toFixed(1)}h of postings (under the ${MIN_COVERAGE_HOURS}h between scans) — ` +
            `older matches were not seen this run.`;
          errors.push(detail);
          onProgress?.(`Note: ${detail}`);
        }
      }
    }
  }

  if (stopReason === "rate-limited") {
    errors.push(`Himalayas rate-limited the scan (HTTP 429) after ${requests} requests, so it stopped early.`);
    onProgress?.("Himalayas asked the scan to slow down — stopping early.");
  } else if (stopReason === "failing") {
    errors.push(`Aborted after ${MAX_CONSECUTIVE_FAILURES} consecutive page failures.`);
    onProgress?.("Himalayas is not responding — stopping early.");
  } else if (stopReason === "budget" && unsearched.length > 0) {
    errors.push(`Reached the ${MAX_REQUESTS}-request limit for one scan.`);
  }
  if (unsearched.length > 0) {
    errors.push(
      `Not searched back ${MIN_COVERAGE_HOURS}h this run: ${unsearched.map(quoted).join(", ")}. ` +
        `The next scan starts from the newest postings again.`,
    );
  }

  onProgress?.(
    `Ran ${requests} Himalayas ${requests === 1 ? "search" : "searches"} for ${terms.length} ` +
      `${terms.length === 1 ? "keyword" : "keywords"}; ${collected.length} postings within the freshness window.`,
  );

  const { positive = [], negative = [] } = opts.titleFilters ?? {};
  const titleMatches = buildTitleFilter({ positive, negative });

  const totalFound = collected.length;
  const titleMatched = collected.filter((j) => titleMatches(j.position));
  const skipped = totalFound - titleMatched.length;
  const filteredJobs = await attachEmployerPostings(titleMatched, opts, onProgress);

  if (filteredJobs.length === 0) {
    return {
      status: "ok", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0,
      totalFound, errors, jobs: [],
    };
  }

  const ts = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "Z");
  const filename = `himalayas-jobs-${ts}.json`;
  const dir = getBrowserBoardImportDirectory();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${filename}.tmp`);
  const finalPath = path.join(dir, filename);

  const payload = {
    metadata: {
      source: "himalayas",
      scanTimestamp,
      scanDurationSeconds: 0,
      totalJobsDiscovered: totalFound,
      totalJobsValid: filteredJobs.length,
      totalJobsSkipped: skipped,
      searchCriteria: { titles: terms, locations: [], remotePreference: "remote-only" },
      generatedBy: "Himalayas Remote Board Scanner v2.0",
    },
    jobs: filteredJobs.map((j) => ({
      ...j,
      dataQuality: {
        hasCompany: Boolean(j.company),
        hasPosition: Boolean(j.position),
        hasDescription: Boolean(j.jobDescription),
        hasUrl: Boolean(j.url),
        descriptionLength: j.jobDescription.length,
        warnings: [],
      },
    })),
    validationSummary: {
      totalRecords: filteredJobs.length,
      validRecords: filteredJobs.length,
      invalidRecords: 0,
      errors: [],
    },
  };

  writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  renameSync(tmpPath, finalPath);
  onProgress?.(`Saved ${filteredJobs.length} Himalayas jobs to ${filename}`);

  const preview = filteredJobs.map((j) => ({ title: j.position, url: j.url, company: j.company }));
  try {
    const importResult = await importBrowserBoardJobs(finalPath, { freshnessWindowHours });
    return {
      status: "ok",
      imported: importResult.imported,
      duplicates: importResult.duplicates,
      fresh: importResult.fresh,
      unknownDate: importResult.unknownDate,
      staleFiltered: importResult.staleFiltered,
      totalFound,
      errors: [...errors, ...importResult.errors],
      jobs: importResult.importedJobs.map((j) => ({ title: j.title, url: j.url, company: j.company })),
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return {
      status: "error", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0,
      totalFound, errors, jobs: preview,
    };
  }
}
