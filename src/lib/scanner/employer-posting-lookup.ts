/**
 * Finds the employer's own posting for a job that a board only links to itself.
 *
 * Himalayas never hands out the employer's link: its API's `applicationLink` is
 * always its own job page, and those pages sit behind bot protection, so the
 * real Apply link cannot be read off them either. What it does give is the
 * company name, a company slug, and the exact title — and many employers post
 * on Greenhouse, Lever, or Ashby, whose public job-board APIs list every open
 * role by title.
 *
 * So this guesses the company's board slug, reads the board, and accepts a
 * posting only on an **exact** (normalised) title match. A wrong employer link
 * is worse than none — the user would apply to the wrong role, or trust a
 * liveness check against the wrong posting — so the matching is deliberately
 * strict, and Greenhouse boards must also report a matching company name.
 *
 * When a board lists the same title more than once (one per office or region),
 * the scan accepts a posting only if exactly one fits the Himalayas job's
 * location; otherwise it leaves the choice to the user, and the job page lists
 * every exact-title posting for them to pick from.
 *
 * Measured against 80 recent Himalayas design roles (2026-10-02): 11 resolved
 * to the correct employer posting, none wrongly. The rest fall through to the
 * "Find posting" panel on the job page.
 */

import { safeFetch } from "@/lib/safe-fetch";
import { getKnownJobUrls } from "@/lib/db/queries";

export type EmployerBoardProvider = "greenhouse" | "lever" | "ashby";

export type EmployerPostingMatch = {
  provider: EmployerBoardProvider;
  boardSlug: string;
  url: string;
  title: string;
  /** The posting's location as the ATS reports it; shown so the user can tell twins apart. */
  location: string;
};

export type EmployerPostingQuery = {
  company: string;
  title: string;
  /** The board's own company slug, e.g. the `acme` in himalayas.app/companies/acme/…. */
  companySlug?: string | null;
  /** The Himalayas location string, e.g. `United States (Remote); Canada (Remote)`, or `Remote`. */
  location?: string | null;
};

type BoardPosting = { title: string; url: string; location: string };
type BoardListing = { companyName: string | null; postings: BoardPosting[] };

/** Fetches JSON or returns null on any failure; injectable so tests touch no network. */
export type JsonFetcher = (url: string) => Promise<unknown | null>;

/** Shared across lookups in one run, so eight jobs from one company read its board once. */
export type BoardCache = Map<string, Promise<BoardListing | null>>;

const PROVIDERS: EmployerBoardProvider[] = ["greenhouse", "lever", "ashby"];
const REQUEST_TIMEOUT_MS = 8_000;
/** Slug guesses per company; each costs one request per provider. */
const MAX_SLUGS = 4;
const SCAN_LOOKUP_CONCURRENCY = 4;
/** Time a scan may spend on lookups before leaving the rest to the job page. */
const SCAN_LOOKUP_BUDGET_MS = 45_000;

const COMPANY_SUFFIX =
  /[,\s]+(inc|incorporated|llc|l\.l\.c|ltd|limited|gmbh|ag|sa|s\.a|bv|b\.v|plc|corp|corporation|co|company|group|holdings)\.?$/i;

function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Bracketed asides that do not change which job it is: a remote/hybrid note or a
 * gender marker ("(Remote)", "(Remote - US)", "(f/m/d)", "(all genders)").
 * Anything else in brackets — "(Frontend)", "(Contract)" — distinguishes one
 * opening from another and is kept.
 */
const NON_SEMANTIC_ASIDE =
  /\((?:[^)]*\b(?:remote|hybrid|anywhere|worldwide)\b[^)]*|\s*[mwfdhx]\s*\/\s*[mwfdhx](?:\s*\/\s*[mwfdhx])?\s*|\s*all genders?\s*|\s*any gender\s*)\)/gi;

/**
 * Title normalisation for matching: case, accents, punctuation, and remote or
 * gender asides are ignored. Every other word must agree, including words in
 * brackets, so "Engineer (Frontend)" never matches "Engineer (Backend)".
 */
export function normalizeTitleForMatch(title: string): string {
  return stripDiacritics(title)
    .toLowerCase()
    .replace(NON_SEMANTIC_ASIDE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Boards often title themselves "Acme Careers" or "Acme Jobs"; that word is not the name. */
const BOARD_NAME_SUFFIX = /\s+(careers|jobs|hiring|talent)$/i;

export function normalizeCompanyForMatch(company: string): string {
  let name = stripDiacritics(company).toLowerCase().trim().replace(BOARD_NAME_SUFFIX, "");
  // Suffixes can stack ("Acme Group Ltd"), so strip until nothing changes.
  for (let previous = ""; previous !== name; ) {
    previous = name;
    name = name.replace(COMPANY_SUFFIX, "").trim();
  }
  return name.replace(/[^a-z0-9]+/g, "");
}

/** `https://himalayas.app/companies/acme/jobs/designer` → `acme`. */
export function himalayasCompanySlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)himalayas\.app$/i.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(/^\/companies\/([^/]+)/);
    return match ? decodeURIComponent(match[1]).toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Board slugs worth trying, most likely first. Himalayas disambiguates
 * same-named companies with a hex suffix (`fluency-inc-a92b56`), which no ATS
 * slug carries, so that is stripped.
 */
export function employerSlugCandidates(company: string, companySlug?: string | null): string[] {
  const out: string[] = [];
  const add = (slug: string) => {
    const clean = slug.toLowerCase().replace(/^-+|-+$/g, "");
    if (clean.length >= 3 && /[a-z]/.test(clean) && !out.includes(clean)) out.push(clean);
  };

  if (companySlug) {
    const base = companySlug.replace(/-[0-9a-f]{6}$/, "");
    add(base.replace(/-/g, ""));
    add(base);
  }
  const name = stripDiacritics(company).toLowerCase().trim();
  let trimmed = name;
  for (let previous = ""; previous !== trimmed; ) {
    previous = trimmed;
    trimmed = trimmed.replace(COMPANY_SUFFIX, "").trim();
  }
  add(trimmed.replace(/[^a-z0-9]/g, ""));
  add(trimmed.replace(/[^a-z0-9]+/g, "-"));

  return out.slice(0, MAX_SLUGS);
}

function boardApiUrl(provider: EmployerBoardProvider, slug: string): string {
  const s = encodeURIComponent(slug);
  if (provider === "greenhouse") return `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`;
  if (provider === "lever") return `https://api.lever.co/v0/postings/${s}?mode=json`;
  return `https://api.ashbyhq.com/posting-api/job-board/${s}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function parseBoardListing(provider: EmployerBoardProvider, json: unknown): BoardListing | null {
  if (provider === "lever") {
    if (!Array.isArray(json)) return null;
    return {
      companyName: null,
      postings: json.filter(isRecord).map((j) => ({
        title: str(j.text),
        url: str(j.hostedUrl),
        location: isRecord(j.categories) ? str(j.categories.location) : "",
      })),
    };
  }
  if (!isRecord(json) || !Array.isArray(json.jobs)) return null;
  const jobs = json.jobs.filter(isRecord);
  if (provider === "greenhouse") {
    return {
      companyName: jobs.map((j) => str(j.company_name)).find(Boolean) ?? null,
      postings: jobs.map((j) => ({
        title: str(j.title),
        url: str(j.absolute_url),
        location: isRecord(j.location) ? str(j.location.name) : "",
      })),
    };
  }
  return {
    companyName: null,
    postings: jobs
      // Unlisted Ashby postings are reachable by link but not meant to be found.
      .filter((j) => j.isListed !== false)
      .map((j) => ({ title: str(j.title), url: str(j.jobUrl), location: str(j.location) })),
  };
}

/**
 * Accepts a board's company name only when it names the same company once legal
 * suffixes, case, and punctuation are set aside. A prefix is not enough: "Base"
 * and "Base Operations" are different employers that could share a slug.
 */
export function companyNamesAgree(boardName: string | null, company: string): boolean {
  if (!boardName) return true;
  const a = normalizeCompanyForMatch(boardName);
  const b = normalizeCompanyForMatch(company);
  if (!a || !b) return true;
  return a === b;
}

const defaultFetchJson: JsonFetcher = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await safeFetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; JobSearchTerminal/1.0; employer-posting-lookup)",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

function readBoard(
  provider: EmployerBoardProvider,
  slug: string,
  fetchJson: JsonFetcher,
  cache: BoardCache,
): Promise<BoardListing | null> {
  const key = `${provider}:${slug}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = fetchJson(boardApiUrl(provider, slug)).then((json) =>
      json === null ? null : parseBoardListing(provider, json),
    );
    cache.set(key, pending);
  }
  return pending;
}

/**
 * Every posting on the company's Greenhouse, Lever, or Ashby board whose title
 * matches `query.title` exactly, from the first board that has any. The job page
 * lists these for the user to choose from.
 */
export async function findEmployerPostingCandidates(
  query: EmployerPostingQuery,
  options: { fetchJson?: JsonFetcher; cache?: BoardCache } = {},
): Promise<EmployerPostingMatch[]> {
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const cache = options.cache ?? new Map();
  const wanted = normalizeTitleForMatch(query.title);
  if (!wanted) return [];

  for (const slug of employerSlugCandidates(query.company, query.companySlug)) {
    const listings = await Promise.all(PROVIDERS.map((p) => readBoard(p, slug, fetchJson, cache)));
    for (const [index, listing] of listings.entries()) {
      if (!listing || listing.postings.length === 0) continue;
      if (!companyNamesAgree(listing.companyName, query.company)) continue;
      const hits = listing.postings.filter((p) => p.url && normalizeTitleForMatch(p.title) === wanted);
      if (hits.length === 0) continue;
      const unique = [...new Map(hits.map((h) => [h.url, h])).values()];
      return unique.map((hit) => ({
        provider: PROVIDERS[index],
        boardSlug: slug,
        url: hit.url,
        title: hit.title,
        location: hit.location,
      }));
    }
  }
  return [];
}

/** Ways an ATS location might name a country the Himalayas listing names. */
const COUNTRY_ALIASES: Record<string, string[]> = {
  "united states": ["united states", "usa", "us", "u s", "america"],
  "united kingdom": ["united kingdom", "uk", "u k", "england", "great britain", "britain"],
  "united arab emirates": ["united arab emirates", "uae"],
};

function locationWords(value: string): string {
  return ` ${stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** Countries a Himalayas location string restricts the job to; empty means unrestricted. */
export function himalayasCountries(location: string | null | undefined): string[] {
  if (!location) return [];
  return location
    .split(";")
    .map((part) => part.replace(/\(remote\)/i, "").trim())
    .filter((part) => part && !/^remote$/i.test(part))
    .map((part) => locationWords(part).trim());
}

/** True when an ATS posting's location names one of the Himalayas job's countries. */
export function locationFitsCountries(atsLocation: string, countries: string[]): boolean {
  const haystack = locationWords(atsLocation);
  return countries.some((country) =>
    (COUNTRY_ALIASES[country] ?? [country]).some((alias) => haystack.includes(` ${alias} `)),
  );
}

/**
 * The single posting the scan may adopt without asking. With one exact-title
 * posting on the board, that is it. With several (one per office or region),
 * only a posting that is the sole fit for the Himalayas job's countries is
 * accepted; an unrestricted listing gives nothing to tell them apart by, so it
 * is left for the user to choose on the job page.
 */
export function pickUnambiguousPosting(
  candidates: EmployerPostingMatch[],
  location: string | null | undefined,
): EmployerPostingMatch | null {
  if (candidates.length === 1) return candidates[0];
  const countries = himalayasCountries(location);
  if (candidates.length === 0 || countries.length === 0) return null;
  const fitting = candidates.filter((c) => locationFitsCountries(c.location, countries));
  return fitting.length === 1 ? fitting[0] : null;
}

/**
 * Looks for `query.title` on the company's Greenhouse, Lever, or Ashby board.
 * Returns null when no board is found, no posting matches exactly, or several
 * match and the job's location does not single one out.
 */
export async function findEmployerPosting(
  query: EmployerPostingQuery,
  options: { fetchJson?: JsonFetcher; cache?: BoardCache } = {},
): Promise<EmployerPostingMatch | null> {
  return pickUnambiguousPosting(await findEmployerPostingCandidates(query, options), query.location);
}

export type ScanLookupJob = { company: string; position: string; sourceUrl: string; location?: string };

/**
 * Runs {@link findEmployerPosting} for a Himalayas scan's matched jobs, keyed by
 * `sourceUrl`. A job whose Himalayas listing is already in the database is
 * skipped — it was looked up when first imported. The check is by listing URL
 * only: a new posting with the same company and title is a different opening
 * and gets its own lookup. Lookups stop at a time budget so a slow ATS cannot
 * stall the scan; anything left over can still be found from the job page.
 */
export async function findEmployerPostingsForScan(
  jobs: ScanLookupJob[],
  options: { fetchJson?: JsonFetcher; budgetMs?: number; isKnown?: (job: ScanLookupJob) => boolean } = {},
): Promise<{ matches: Map<string, EmployerPostingMatch>; attempted: number; skippedForTime: number }> {
  const isKnown = options.isKnown ?? defaultIsKnown();
  const pending = jobs.filter((job) => !isKnown(job));
  const deadline = Date.now() + (options.budgetMs ?? SCAN_LOOKUP_BUDGET_MS);
  const cache: BoardCache = new Map();
  const matches = new Map<string, EmployerPostingMatch>();
  let attempted = 0;
  let next = 0;

  const worker = async () => {
    while (next < pending.length && Date.now() < deadline) {
      const job = pending[next++];
      attempted += 1;
      const match = await findEmployerPosting(
        {
          company: job.company,
          title: job.position,
          companySlug: himalayasCompanySlug(job.sourceUrl),
          location: job.location,
        },
        { fetchJson: options.fetchJson, cache },
      );
      if (match) matches.set(job.sourceUrl, match);
    }
  };
  await Promise.all(Array.from({ length: SCAN_LOOKUP_CONCURRENCY }, worker));

  return { matches, attempted, skippedForTime: pending.length - attempted };
}

function defaultIsKnown(): (job: ScanLookupJob) => boolean {
  try {
    const known = getKnownJobUrls();
    return (job) => known.has(job.sourceUrl);
  } catch {
    return () => false;
  }
}
