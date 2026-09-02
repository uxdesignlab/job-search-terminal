/**
 * Core source discovery logic — runs the Common Crawl pipeline and writes
 * data/discovered-sources.json. Called from both the CLI script and the
 * Settings "Crawl for companies" server action.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { tryGetActiveProvider } from "@/lib/ai/factory";
import { getCustomScanSources } from "@/lib/db/queries";
import { safeFetch } from "@/lib/safe-fetch";
import { computeBackoffMs, fetchWithRetry, retryAfterMs, type BackoffConfig } from "./transient-retry";
import type { AIMessage } from "@/lib/ai/provider";

export const OUTPUT_PATH = path.join(process.cwd(), "data", "discovered-sources.json");
const PORTALS_PATH = path.join(process.cwd(), "config", "portals.yml");
const CC_COLLINFO = "https://index.commoncrawl.org/collinfo.json";
/** Used only when collinfo.json cannot be reached; the newest known crawl at time of writing. */
const CC_FALLBACK_INDEXES = ["CC-MAIN-2026-30"];
/** Recent crawls to sweep. Different crawls capture different boards, so >1 materially widens coverage. */
const CC_INDEX_COUNT = 3;
/**
 * Older crawls swept in addition to the recent ones.
 *
 * Not redundancy — coverage. `jobs.lever.co/*` returns a persistent 504 on every
 * recent index while answering normally on this one, so recent-only sweeps yield
 * almost no Lever boards (1 slug, versus 90 from this crawl). Slugs found here
 * are still validated live, so a stale crawl cannot introduce dead sources.
 */
const CC_ARCHIVE_INDEXES = ["CC-MAIN-2024-51"];
/** The CC index intermittently answers 502/503/504 under load; without retries a single blip drops a whole provider. */
const CC_FETCH_ATTEMPTS = 3;
const CC_FETCH_TIMEOUT_MS = 90_000;
/**
 * Exponential, not linear.
 *
 * Common Crawl is a free community service with no published rate limit, and it
 * throttles by refusing connections outright. Retrying hard while it is throttling
 * is a retry storm that turns a slowdown into a block — which is exactly what
 * happened here: aggressive sweeps plus 5 linear retries across 16 paginated
 * queries got this host connection-refused for a period.
 */
const CC_RETRY_BASE_MS = 2_000;
const CC_RETRY_FACTOR = 3;
/** Jitter avoids synchronising retries when several queries back off together. */
const CC_RETRY_JITTER_MS = 500;
const CC_INTER_PAGE_DELAY_MS = 1_000;
/**
 * Consecutive whole-query failures that trip the circuit breaker.
 *
 * Once the index is refusing us, continuing through the remaining patterns only
 * deepens the block and wastes minutes. Abort the sweep and say so plainly.
 */
const CC_MAX_CONSECUTIVE_FAILURES = 3;
const VALIDATE_CONCURRENCY = 25;
const VALIDATE_TIMEOUT_MS = 10_000;
const INTER_BATCH_DELAY_MS = 250;
const INDUSTRY_AI_BATCH_SIZE = 20;
/**
 * Cap on entries sent for AI industry classification per run.
 *
 * Previously the candidate pool was small enough that this was a handful of
 * calls. With a wider sweep it would be ~55 model calls per run for a label that
 * only decorates the review list, so it is bounded and degrades to the slug
 * heuristic beyond the cap.
 */
const MAX_AI_CLASSIFY_ENTRIES = 200;
/**
 * Ceiling on newly-validated slugs per run.
 *
 * A full sweep surfaces ~9,000 candidates; validating all of them takes tens of
 * minutes and produces a review list no one can work through. Discovery is
 * incremental — already-known and previously-discovered slugs are skipped — so
 * successive runs walk through the backlog instead of redoing it.
 */
const MAX_NEW_CANDIDATES_PER_RUN = 1_500;

export type AtsProvider = "greenhouse" | "lever" | "ashby";
export type ValidationStatus = "valid" | "dead" | "unknown";

export type DiscoveredEntry = {
  slug: string;
  provider: AtsProvider;
  careersUrl: string;
  apiUrl: string;
  validationStatus: ValidationStatus;
  checkedAt: string | null;
  snapshotDate: string | null;
  /** Display name from ATS JSON when available (Greenhouse/Ashby; often absent on Lever). */
  companyDisplayName: string | null;
  /** Short industry label from AI classification when an API key is configured. */
  industry: string | null;
  relevanceScore?: number;
  reviewReasons?: string[];
};

export type DiscoveredSources = {
  fetchedAt: string;
  totalCrawled: number;
  entries: DiscoveredEntry[];
  /**
   * Per-pattern query failures from the last run. A run that cannot reach the
   * index must say so — writing `totalCrawled: 0` with no errors previously made
   * a total outage indistinguishable from "nothing new to find".
   */
  errors?: string[];
  /** True when the candidate cap stopped the sweep early; rerun to continue. */
  truncated?: boolean;
};

export type DiscoverySummary = {
  totalCrawled: number;
  newSlugs: number;
  valid: number;
  dead: number;
  unknown: number;
  /** Query failures, surfaced so a failed sweep is never reported as an empty one. */
  errors: string[];
  /** True when the candidate cap stopped the sweep early. */
  truncated: boolean;
};

type CcQueryPattern = { urlPattern: string; provider: AtsProvider };

const CC_PATTERNS: CcQueryPattern[] = [
  { urlPattern: "boards.greenhouse.io/*", provider: "greenhouse" },
  { urlPattern: "job-boards.greenhouse.io/*", provider: "greenhouse" },
  { urlPattern: "jobs.lever.co/*", provider: "lever" },
  { urlPattern: "jobs.ashbyhq.com/*", provider: "ashby" },
];

// ─── CC Query ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Opts these requests out of Next.js's fetch cache.
 *
 * Next patches global `fetch` in server actions and buffers responses to cache
 * them, which logs `Failed to set fetch cache … TypeError: terminated` on
 * multi-megabyte index pages. That is wasted work regardless, and caching a
 * liveness probe would return stale validation results on the next run.
 *
 * Note: this is hygiene, not a fix for a specific outage. A Settings run that
 * failed all 16 queries was initially attributed to this; the real cause was
 * Common Crawl rate-limiting the host (see CC_MAX_CONSECUTIVE_FAILURES).
 */
const NO_STORE: RequestInit = { cache: "no-store" };

/**
 * CC backoff profile. The retry mechanics live in `transient-retry.ts`; only the
 * timing is CC-specific, because this host throttles by refusing connections.
 */
const CC_BACKOFF: BackoffConfig = {
  baseMs: CC_RETRY_BASE_MS,
  factor: CC_RETRY_FACTOR,
  jitterMs: CC_RETRY_JITTER_MS,
  /** Generous: this is a background sweep, not an interactive scan. */
  maxDelayMs: 60_000,
};

export { retryAfterMs };

/** Backoff for CC retry attempt `attempt` (0-based). Retained for the CC-tuned constants. */
export function computeRetryDelayMs(
  attempt: number,
  serverDelayMs: number | null,
  random: () => number = Math.random,
): number {
  return computeBackoffMs(attempt, serverDelayMs, CC_BACKOFF, random);
}

/**
 * Fetches a CC index URL, retrying transient gateway failures with exponential backoff.
 *
 * Returns `null` when the resource is genuinely absent (404) or every attempt
 * failed. Callers must distinguish those from an empty result set, because
 * "query failed" and "no records" previously collapsed into the same silent zero.
 */
async function ccFetchText(url: string): Promise<string | null> {
  const outcome = await fetchWithRetry(url, (res) => res.text(), {
    attempts: CC_FETCH_ATTEMPTS,
    timeoutMs: CC_FETCH_TIMEOUT_MS,
    backoff: CC_BACKOFF,
    init: NO_STORE,
  });
  return outcome.kind === "value" ? outcome.value : null;
}

/**
 * Crawls to sweep: the `count` most recent, plus the archival ones.
 *
 * Resolved from collinfo.json so the sweep does not rot — the previous
 * implementation pinned a single crawl that was 20 months stale.
 */
export async function resolveCcIndexes(count = CC_INDEX_COUNT): Promise<string[]> {
  const text = await ccFetchText(CC_COLLINFO);
  let recent = CC_FALLBACK_INDEXES.slice(0, count);
  if (text) {
    try {
      const collections = JSON.parse(text) as Array<{ id?: string }>;
      const ids = collections.map((c) => c.id).filter((id): id is string => Boolean(id));
      if (ids.length > 0) recent = ids.slice(0, count);
    } catch {
      /* keep the fallback */
    }
  }
  return [...new Set([...recent, ...CC_ARCHIVE_INDEXES])];
}

function parseCcRecords(text: string): Array<{ url: string; timestamp: string }> {
  const results: Array<{ url: string; timestamp: string }> = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as { url?: string; timestamp?: string };
      if (record.url && record.timestamp) results.push({ url: record.url, timestamp: record.timestamp });
    } catch { /* skip malformed lines */ }
  }
  return results;
}

export type CcQueryOutcome = {
  records: Array<{ url: string; timestamp: string }>;
  /** Pages the index reported. */
  pages: number;
  /** Pages that exhausted every retry — the caller surfaces these instead of silently under-reporting. */
  failedPages: number;
  /** True when consecutive page failures tripped the in-query breaker and pages were left unread. */
  aborted: boolean;
};

/**
 * Whether a query came back too damaged to treat as a success.
 *
 * Used to drive the sweep-level breaker. Checking only "zero records" was too
 * weak: partial failure is the *typical* throttling signature, so a query that
 * lost four of five pages but salvaged one record would reset the breaker and
 * the sweep would keep hammering a rate-limited index.
 */
export function isQueryDegraded(outcome: CcQueryOutcome): boolean {
  if (outcome.aborted) return true;
  if (outcome.failedPages === 0) return false;
  // The page-count request itself failed, so nothing was reachable.
  if (outcome.pages === 0) return true;
  return outcome.failedPages * 2 >= outcome.pages;
}

/**
 * Queries one crawl for one URL pattern, walking every page.
 *
 * The original implementation fetched a flat `limit=1000` slice of page 0, which
 * capped patterns holding tens of thousands of records.
 *
 * Stops early once `CC_MAX_CONSECUTIVE_FAILURES` pages fail back to back. The
 * sweep-level breaker cannot help here — it only runs between queries, so a
 * blocked multi-page pattern would otherwise burn every page (and every retry
 * inside it) before yielding control.
 */
export async function queryCcIndex(index: string, urlPattern: string): Promise<CcQueryOutcome> {
  const base = `https://index.commoncrawl.org/${index}-index`;
  const countQuery = new URLSearchParams({ url: urlPattern, output: "json", showNumPages: "true" });
  const countText = await ccFetchText(`${base}?${countQuery}`);
  if (!countText) return { records: [], pages: 0, failedPages: 1, aborted: false };

  let pages = 0;
  try {
    const parsed: unknown = JSON.parse(countText);
    const raw = isRecord(parsed) ? parsed.pages : undefined;
    // An unexpected-but-parseable payload is a failure, not "zero pages" —
    // reporting it as a clean empty result would quietly reset the breaker.
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return { records: [], pages: 0, failedPages: 1, aborted: false };
    }
    pages = raw;
  } catch {
    return { records: [], pages: 0, failedPages: 1, aborted: false };
  }
  if (pages <= 0) return { records: [], pages: 0, failedPages: 0, aborted: false };

  const records: Array<{ url: string; timestamp: string }> = [];
  let failedPages = 0;
  let consecutivePageFailures = 0;
  let aborted = false;

  for (let page = 0; page < pages; page += 1) {
    const query = new URLSearchParams({ url: urlPattern, output: "json", page: String(page) });
    const text = await ccFetchText(`${base}?${query}`);

    if (text === null) {
      failedPages += 1;
      consecutivePageFailures += 1;
      if (consecutivePageFailures >= CC_MAX_CONSECUTIVE_FAILURES) {
        aborted = true;
        break;
      }
      // Pace after a failure too. Skipping the delay here meant the loop ran
      // fastest exactly when the index was least willing to serve it.
      await sleep(CC_INTER_PAGE_DELAY_MS);
      continue;
    }

    consecutivePageFailures = 0;
    records.push(...parseCcRecords(text));
    if (page < pages - 1) await sleep(CC_INTER_PAGE_DELAY_MS);
  }

  return { records, pages, failedPages, aborted };
}

// ─── Slug Helpers ─────────────────────────────────────────────────────────────

function extractSlug(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    const segment = parsed.pathname.split("/").filter(Boolean)[0];
    if (!segment) return null;
    if (["jobs", "api", "v0", "v1", "boards", "postings", "job-board"].includes(segment.toLowerCase())) return null;
    if (segment.length < 3 || /^\d+$/.test(segment) || !/[a-z]/i.test(segment)) return null;
    return segment.toLowerCase();
  } catch {
    return null;
  }
}

export function buildApiUrl(slug: string, provider: AtsProvider): string {
  if (provider === "greenhouse") return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
  if (provider === "lever") return `https://api.lever.co/v0/postings/${slug}`;
  return `https://api.ashbyhq.com/posting-api/job-board/${slug}`;
}

export function buildCareersUrl(slug: string, provider: AtsProvider): string {
  if (provider === "greenhouse") return `https://job-boards.greenhouse.io/${slug}`;
  if (provider === "lever") return `https://jobs.lever.co/${slug}`;
  return `https://jobs.ashbyhq.com/${slug}`;
}

// ─── ATS JSON: company display name ───────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractCompanyDisplayName(json: unknown, provider: AtsProvider): string | null {
  if (provider === "greenhouse") {
    if (!isRecord(json) || !Array.isArray(json.jobs)) return null;
    for (const job of json.jobs) {
      if (!isRecord(job)) continue;
      const company = job.company;
      if (isRecord(company) && typeof company.name === "string") {
        const n = company.name.trim();
        if (n) return n;
      }
    }
    return null;
  }

  if (provider === "ashby") {
    if (!isRecord(json)) return null;
    const org = json.organization;
    if (isRecord(org) && typeof org.name === "string") {
      const n = org.name.trim();
      if (n) return n;
    }
    const jobs = json.jobs;
    if (Array.isArray(jobs)) {
      for (const job of jobs) {
        if (!isRecord(job)) continue;
        for (const key of ["organizationName", "companyName"] as const) {
          const v = job[key];
          if (typeof v === "string" && v.trim()) return v.trim();
        }
        const jOrg = job.organization;
        if (isRecord(jOrg) && typeof jOrg.name === "string" && jOrg.name.trim()) {
          return jOrg.name.trim();
        }
      }
    }
    return null;
  }

  // Lever: postings list rarely includes a separate company name; try common fields.
  if (!Array.isArray(json) || json.length === 0) return null;
  const first = json[0];
  if (!isRecord(first)) return null;
  if (typeof first.company === "string" && first.company.trim()) return first.company.trim();
  const brand = first.brand;
  if (isRecord(brand) && typeof brand.name === "string" && brand.name.trim()) return brand.name.trim();
  return null;
}

function entryStableId(entry: DiscoveredEntry): string {
  return `${entry.provider}::${entry.slug}`;
}

/** Ashby/Lever public JSON often omits a legal name; title-cased slug helps the model more than a raw token. */
function labelFromSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");
}

function classificationLabel(entry: DiscoveredEntry): string {
  const name = entry.companyDisplayName?.trim();
  if (name) return name;
  return labelFromSlug(entry.slug);
}

function addReviewRanking(entry: DiscoveredEntry): DiscoveredEntry {
  const reasons: string[] = [];
  let relevanceScore = 0;
  if (entry.validationStatus === "valid") {
    relevanceScore += 60;
    reasons.push("ATS endpoint is live");
  }
  if (entry.companyDisplayName && entry.companyDisplayName.toLowerCase() !== entry.slug.toLowerCase()) {
    relevanceScore += 20;
    reasons.push("Employer name confirmed by ATS");
  }
  if (entry.industry) {
    relevanceScore += 10;
    reasons.push(`Industry: ${entry.industry}`);
  }
  if (/[-_]/.test(entry.slug)) {
    relevanceScore += 5;
    reasons.push("Readable employer slug");
  }
  return { ...entry, relevanceScore, reviewReasons: reasons };
}

/** Cheap fallback when AI is unavailable or returns nothing for a row. */
function heuristicIndustry(slug: string): string | null {
  const s = slug.toLowerCase();
  if (/(health|med|clinic|pharma|bio|life.?sci|care|hospital|therap)/i.test(s)) return "Healthcare";
  if (/(fin|bank|pay|lend|wealth|insur|crypto|ledger)/i.test(s)) return "Fintech";
  if (/(ai|llm|ml|neural|deep|data|robot|autom)/i.test(s)) return "AI / ML";
  if (/(cloud|saas|software|api|devops|security|cyber)/i.test(s)) return "Enterprise software";
  if (/(game|gaming|esport|studio)/i.test(s)) return "Gaming";
  if (/(shop|commerce|retail|market|consumer)/i.test(s)) return "E-commerce";
  if (/(gov|defense|aero|space|satellite)/i.test(s)) return "Aerospace & defense";
  return null;
}

type RawClassifyItem = { id?: string; industry?: string };

function normalizeClassificationPayload(parsed: unknown): RawClassifyItem[] {
  if (parsed === null || parsed === undefined) return [];
  if (Array.isArray(parsed)) {
    return parsed.filter((x): x is RawClassifyItem => typeof x === "object" && x !== null);
  }
  if (!isRecord(parsed)) return [];
  const candidates = [parsed.items, parsed.results, parsed.companies, parsed.classifications, parsed.data];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.filter((x): x is RawClassifyItem => typeof x === "object" && x !== null);
    }
  }
  return [];
}

function mergeClassificationBatch(
  batch: DiscoveredEntry[],
  items: RawClassifyItem[],
  out: Map<string, string>,
): void {
  const byNormId = new Map<string, string>();
  for (const item of items) {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const ind = typeof item.industry === "string" ? item.industry.trim() : "";
    if (!id || !ind) continue;
    byNormId.set(id.toLowerCase(), ind);
    const slugOnly = id.includes("::") ? id.split("::").pop()!.trim().toLowerCase() : id.toLowerCase();
    if (slugOnly && slugOnly !== id.toLowerCase()) {
      byNormId.set(slugOnly, ind);
    }
  }
  for (const e of batch) {
    const fullId = entryStableId(e);
    const slug = e.slug.toLowerCase();
    const hit =
      byNormId.get(fullId.toLowerCase()) ??
      byNormId.get(slug) ??
      [...byNormId.entries()].find(([k]) => k.endsWith(`::${slug}`))?.[1];
    if (hit) out.set(fullId, hit);
  }
}

async function classifyIndustriesWithAI(
  entries: DiscoveredEntry[],
  onProgress?: (msg: string) => void,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const provider = tryGetActiveProvider();
  if (!provider) {
    onProgress?.("Skipping industry classification (no AI API key configured).");
    return out;
  }

  const valid = entries.filter((e) => e.validationStatus === "valid");
  if (valid.length === 0) return out;

  // Industry labels are a review-list nicety, not core data, and callers now
  // hand us far more entries than before. Bound the spend; anything past the cap
  // falls back to heuristicIndustry, which the caller already applies.
  const targets = valid.slice(0, MAX_AI_CLASSIFY_ENTRIES);
  if (valid.length > targets.length) {
    onProgress?.(
      `Classifying industries for the first ${targets.length} of ${valid.length} validated sources ` +
      `(AI budget cap); the rest use slug heuristics.`,
    );
  } else {
    onProgress?.(`Classifying industries for ${targets.length} validated sources…`);
  }

  for (let i = 0; i < targets.length; i += INDUSTRY_AI_BATCH_SIZE) {
    const batch = targets.slice(i, i + INDUSTRY_AI_BATCH_SIZE);
    const payload = batch.map((e) => ({
      id: entryStableId(e),
      company: classificationLabel(e),
    }));

    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          "You classify employers into one short industry label (1–4 words) for a job-search dashboard. " +
          "Prefer specific sectors when well known: e.g. Enterprise Software, Healthcare, Biotech, Fintech, " +
          "Defense, Gaming, E-commerce, AI/ML, Consulting, Manufacturing, Nonprofit. " +
          "If unclear, choose a reasonable broad category. " +
          'Return JSON only: {"items":[{"id":"string","industry":"string"}]} with exactly one item per input id, same ids as provided.',
      },
      { role: "user", content: JSON.stringify(payload) },
    ];

    try {
      // Omit temperature so OpenAI/o-series and strict JSON models are less likely to reject the request.
      const parsed = await provider.generateJSON<Record<string, unknown>>(
        messages,
        '{"items":[{"id":"","industry":""}]}',
        { maxTokens: 4096 },
      );
      const items = normalizeClassificationPayload(parsed);
      if (items.length === 0) {
        onProgress?.(
          "Warning: industry model returned no items for a batch (unexpected JSON shape or empty content).",
        );
      }
      mergeClassificationBatch(batch, items, out);
    } catch (err) {
      onProgress?.(`Warning: industry classification batch failed: ${(err as Error).message}`);
    }

    onProgress?.(`Industry classification ${Math.min(i + INDUSTRY_AI_BATCH_SIZE, targets.length)}/${targets.length}…`);
  }

  return out;
}

// ─── Validation ───────────────────────────────────────────────────────────────

async function validateEntry(entry: DiscoveredEntry): Promise<DiscoveredEntry> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  try {
    const res = await safeFetch(entry.apiUrl, { signal: controller.signal, ...NO_STORE });
    const text = await res.text();
    const status: ValidationStatus = res.ok ? "valid" : res.status === 404 ? "dead" : "unknown";
    let companyDisplayName: string | null = entry.companyDisplayName;
    if (res.ok && text) {
      try {
        companyDisplayName = extractCompanyDisplayName(JSON.parse(text) as unknown, entry.provider);
      } catch {
        /* non-JSON or unexpected shape */
      }
    }
    return {
      ...entry,
      validationStatus: status,
      checkedAt: new Date().toISOString(),
      companyDisplayName,
    };
  } catch {
    return { ...entry, validationStatus: "unknown", checkedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

async function validateInBatches(
  entries: DiscoveredEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<DiscoveredEntry[]> {
  const results: DiscoveredEntry[] = [];
  for (let i = 0; i < entries.length; i += VALIDATE_CONCURRENCY) {
    const batch = entries.slice(i, i + VALIDATE_CONCURRENCY);
    const validated = await Promise.all(batch.map(validateEntry));
    results.push(...validated);
    onProgress?.(Math.min(i + VALIDATE_CONCURRENCY, entries.length), entries.length);
    if (i + VALIDATE_CONCURRENCY < entries.length) {
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }
  return results;
}

// ─── Existing Sources ─────────────────────────────────────────────────────────

function slugFromCareersUrl(url: string): string | null {
  const match =
    url.match(/(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/) ||
    url.match(/jobs\.lever\.co\/([^/?#]+)/) ||
    url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Slugs a run should skip: already tracked, or already surfaced by an earlier run.
 *
 * All three sources matter. `portals.yml` alone covers 31 companies, so a run
 * that consulted only it re-validated the hundreds of sources already imported
 * into the database and every candidate it had already reported — making each
 * run redo the last one's work and burying genuinely new boards in the review
 * list. Including prior discoveries is what makes `MAX_NEW_CANDIDATES_PER_RUN`
 * a rolling window rather than a permanent ceiling.
 */
function loadExistingSlugs(): Set<string> {
  const existing = new Set<string>();

  try {
    const config = yaml.load(readFileSync(PORTALS_PATH, "utf-8")) as {
      tracked_companies?: Array<{ careers_url?: string }>;
    };
    for (const c of config.tracked_companies ?? []) {
      const slug = slugFromCareersUrl(c.careers_url ?? "");
      if (slug) existing.add(slug);
    }
  } catch { /* portals.yml is optional */ }

  try {
    for (const source of getCustomScanSources()) {
      existing.add(source.name.toLowerCase());
      const slug = slugFromCareersUrl(source.careersUrl ?? "");
      if (slug) existing.add(slug);
    }
  } catch { /* database unavailable in CLI/test contexts */ }

  // Entries reported by earlier runs, so a rerun advances the backlog rather
  // than repeating it. Declared below; hoisting makes the ordering legal.
  for (const entry of loadDiscoveredEntries()) {
    existing.add(entry.slug.toLowerCase());
  }

  return existing;
}

/**
 * Takes up to `limit` candidates, round-robin across providers.
 *
 * A flat slice would be dominated by whichever provider the sweep happened to
 * enumerate first — Greenhouse outnumbers Ashby roughly 2:1 and Lever by orders
 * of magnitude, so Lever boards would never survive the cap.
 */
export function selectBalancedCandidates(
  entries: DiscoveredEntry[],
  limit: number,
): DiscoveredEntry[] {
  if (entries.length <= limit) return entries;

  const queues = new Map<AtsProvider, DiscoveredEntry[]>();
  for (const entry of entries) {
    const queue = queues.get(entry.provider);
    if (queue) queue.push(entry);
    else queues.set(entry.provider, [entry]);
  }

  const selected: DiscoveredEntry[] = [];
  const lanes = [...queues.values()];
  let cursor = 0;
  while (selected.length < limit) {
    const before = selected.length;
    for (const lane of lanes) {
      if (selected.length >= limit) break;
      if (cursor < lane.length) selected.push(lane[cursor]);
    }
    if (selected.length === before) break; // every lane exhausted
    cursor += 1;
  }
  return selected;
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

export async function runSourceDiscovery(
  onProgress?: (msg: string) => void,
): Promise<DiscoverySummary> {
  const previousEntries = loadDiscoveredEntries();
  const existingSlugs = loadExistingSlugs();
  const seen = new Map<string, DiscoveredEntry>();
  const queryErrors: string[] = [];
  let totalCrawled = 0;
  let truncated = false;

  const indexes = await resolveCcIndexes();
  onProgress?.(`Sweeping ${indexes.length} Common Crawl index(es): ${indexes.join(", ")}`);

  let consecutiveFailures = 0;
  sweep: for (const index of indexes) {
    for (const { urlPattern, provider } of CC_PATTERNS) {
      onProgress?.(`Querying ${index} for ${urlPattern}…`);
      const outcome = await queryCcIndex(index, urlPattern);
      const { records, pages, failedPages, aborted } = outcome;

      if (failedPages > 0) {
        const detail =
          pages === 0
            ? `${index} ${urlPattern}: index query failed after retries`
            : `${index} ${urlPattern}: ${failedPages} of ${pages} pages failed after retries` +
              (aborted ? " (stopped early — consecutive failures)" : "");
        queryErrors.push(detail);
        onProgress?.(`Warning: ${detail}`);
      }

      // Trip the breaker when queries keep coming back damaged. Grinding through
      // the remaining patterns deepens the block and burns minutes for nothing.
      if (isQueryDegraded(outcome)) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= CC_MAX_CONSECUTIVE_FAILURES) {
          const detail =
            `Aborted after ${consecutiveFailures} consecutive failed queries — Common Crawl is ` +
            `rate-limiting or refusing this host. Wait before running discovery again.`;
          queryErrors.push(detail);
          onProgress?.(`Warning: ${detail}`);
          break sweep;
        }
      } else {
        consecutiveFailures = 0;
      }

      totalCrawled += records.length;

      for (const { url, timestamp } of records) {
        const slug = extractSlug(url);
        if (!slug || existingSlugs.has(slug)) continue;
        const key = `${provider}::${slug}`;
        if (seen.has(key)) continue;
        seen.set(key, {
          slug,
          provider,
          careersUrl: buildCareersUrl(slug, provider),
          apiUrl: buildApiUrl(slug, provider),
          validationStatus: "unknown",
          checkedAt: null,
          snapshotDate: timestamp.slice(0, 6) || null,
          companyDisplayName: null,
          industry: null,
        });
      }
    }
  }

  // Cap *after* the full sweep, never during it. Sweeping is cheap (parsing
  // index lines); validation and classification are what cost time and money.
  // Breaking out mid-sweep also skipped whole indexes — including the archival
  // one that carries essentially all Lever coverage.
  const discovered = [...seen.values()];
  const candidates = selectBalancedCandidates(discovered, MAX_NEW_CANDIDATES_PER_RUN);
  truncated = candidates.length < discovered.length;
  if (truncated) {
    onProgress?.(
      `Found ${discovered.length} new slugs; validating ${candidates.length} this run ` +
      `(per-run cap). Run discovery again to continue through the backlog.`,
    );
  }
  onProgress?.(`Validating ${candidates.length} new slugs…`);

  const validated = await validateInBatches(candidates, (done, total) => {
    onProgress?.(`Validating ${done}/${total}…`);
  });

  const industryById = await classifyIndustriesWithAI(validated, onProgress);
  const withIndustries = validated.map((e) => {
    const id = entryStableId(e);
    let industry = industryById.get(id) ?? null;
    if (e.validationStatus === "valid" && !industry) {
      industry = heuristicIndustry(e.slug);
    }
    const companyDisplayName =
      e.companyDisplayName?.trim() ||
      (e.validationStatus === "valid" ? labelFromSlug(e.slug) : null);
    return addReviewRanking({ ...e, companyDisplayName, industry });
  });

  // Runs are incremental, so this run only carries newly-found slugs. Merge with
  // what earlier runs reported, or the pending review list would be wiped each time.
  const merged = new Map<string, DiscoveredEntry>();
  for (const entry of previousEntries) merged.set(entryStableId(entry), entry);
  for (const entry of withIndustries) merged.set(entryStableId(entry), entry);

  const output: DiscoveredSources = {
    fetchedAt: new Date().toISOString(),
    totalCrawled,
    entries: [...merged.values()].sort(
      (a, b) => a.provider.localeCompare(b.provider) || a.slug.localeCompare(b.slug),
    ),
    errors: queryErrors,
    truncated,
  };

  if (!existsSync(path.dirname(OUTPUT_PATH))) {
    mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  }
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  return {
    totalCrawled,
    newSlugs: candidates.length,
    valid: validated.filter((e) => e.validationStatus === "valid").length,
    dead: validated.filter((e) => e.validationStatus === "dead").length,
    unknown: validated.filter((e) => e.validationStatus === "unknown").length,
    errors: queryErrors,
    truncated,
  };
}

// ─── Search-based Discovery ───────────────────────────────────────────────────

type BraveSearchResult = { url?: string; title?: string };
type BraveSearchResponse = { web?: { results?: BraveSearchResult[] } };

const SEARCH_PATTERNS: Array<{ query: string; provider: AtsProvider }> = [
  { query: "site:jobs.ashbyhq.com", provider: "ashby" },
  { query: "site:jobs.lever.co", provider: "lever" },
  { query: "site:boards.greenhouse.io", provider: "greenhouse" },
  { query: "site:job-boards.greenhouse.io", provider: "greenhouse" },
];

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const BRAVE_PAGES_PER_PATTERN = 5;
const BRAVE_RESULTS_PER_PAGE = 20;

async function queryBraveSearch(
  apiKey: string,
  query: string,
  offset: number,
): Promise<BraveSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    count: String(BRAVE_RESULTS_PER_PAGE),
    offset: String(offset),
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
  const data = await res.json() as BraveSearchResponse;
  return data.web?.results ?? [];
}

export function loadDiscoveredEntries(): DiscoveredEntry[] {
  if (!existsSync(OUTPUT_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(OUTPUT_PATH, "utf-8")) as DiscoveredSources;
    return data.entries ?? [];
  } catch {
    return [];
  }
}

/**
 * Completion time of the latest Crawl for companies or Search for companies run.
 *
 * Both discovery paths replace `fetchedAt` only after their output is ready, so
 * this is the durable source-activity timestamp the Dashboard should report.
 */
export function loadLastSourceDiscoveryAt(outputPath = OUTPUT_PATH): string | undefined {
  if (!existsSync(outputPath)) return undefined;
  try {
    const data = JSON.parse(readFileSync(outputPath, "utf-8")) as { fetchedAt?: unknown };
    return typeof data.fetchedAt === "string" && Number.isFinite(Date.parse(data.fetchedAt))
      ? data.fetchedAt
      : undefined;
  } catch {
    return undefined;
  }
}

export async function runSearchDiscovery(
  braveApiKey: string,
  onProgress?: (msg: string) => void,
): Promise<DiscoverySummary> {
  if (!braveApiKey) throw new Error("Brave Search API key is required");

  const existingSlugs = loadExistingSlugs();
  // Also skip slugs already discovered in previous runs
  const prevEntries = loadDiscoveredEntries();
  const prevKeys = new Set(prevEntries.map(entryStableId));

  const seen = new Map<string, DiscoveredEntry>();
  const queryErrors: string[] = [];
  let totalCrawled = 0;

  for (const { query, provider } of SEARCH_PATTERNS) {
    onProgress?.(`Searching Brave: ${query}…`);
    for (let page = 0; page < BRAVE_PAGES_PER_PATTERN; page++) {
      const offset = page * BRAVE_RESULTS_PER_PAGE;
      let results: BraveSearchResult[] = [];
      try {
        results = await queryBraveSearch(braveApiKey, query, offset);
      } catch (err) {
        const detail = `Brave Search failed for ${query} offset ${offset}: ${(err as Error).message}`;
        queryErrors.push(detail);
        onProgress?.(`Warning: ${detail}`);
        break;
      }
      if (results.length === 0) break;
      totalCrawled += results.length;

      for (const { url } of results) {
        if (!url) continue;
        const slug = extractSlug(url);
        if (!slug || existingSlugs.has(slug)) continue;
        const key = `${provider}::${slug}`;
        if (seen.has(key) || prevKeys.has(key)) continue;
        seen.set(key, {
          slug,
          provider,
          careersUrl: buildCareersUrl(slug, provider),
          apiUrl: buildApiUrl(slug, provider),
          validationStatus: "unknown",
          checkedAt: null,
          snapshotDate: null,
          companyDisplayName: null,
          industry: null,
        });
      }
      if (results.length < BRAVE_RESULTS_PER_PAGE) break;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const candidates = [...seen.values()];
  onProgress?.(`Validating ${candidates.length} new slugs from search…`);

  const validated = await validateInBatches(candidates, (done, total) => {
    onProgress?.(`Validating ${done}/${total}…`);
  });

  const industryById = await classifyIndustriesWithAI(validated, onProgress);
  const withIndustries = validated.map((e) => {
    const id = entryStableId(e);
    let industry = industryById.get(id) ?? null;
    if (e.validationStatus === "valid" && !industry) {
      industry = heuristicIndustry(e.slug);
    }
    const companyDisplayName =
      e.companyDisplayName?.trim() ||
      (e.validationStatus === "valid" ? labelFromSlug(e.slug) : null);
    return addReviewRanking({ ...e, companyDisplayName, industry });
  });

  // Merge with existing entries — new entries added, existing untouched
  const merged = [...prevEntries];
  for (const entry of withIndustries) {
    const key = entryStableId(entry);
    if (!prevKeys.has(key)) merged.push(entry);
  }

  const output: DiscoveredSources = {
    fetchedAt: new Date().toISOString(),
    totalCrawled,
    entries: merged.sort(
      (a, b) => a.provider.localeCompare(b.provider) || a.slug.localeCompare(b.slug),
    ),
    errors: queryErrors,
    truncated: false,
  };

  if (!existsSync(path.dirname(OUTPUT_PATH))) {
    mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  }
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  return {
    totalCrawled,
    newSlugs: candidates.length,
    valid: validated.filter((e) => e.validationStatus === "valid").length,
    dead: validated.filter((e) => e.validationStatus === "dead").length,
    unknown: validated.filter((e) => e.validationStatus === "unknown").length,
    errors: queryErrors,
    truncated: false,
  };
}
