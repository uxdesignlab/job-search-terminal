/**
 * Himalayas remote-job board scanner.
 *
 * Himalayas publishes a large remote-only feed (~97,000 live postings, ~2,900
 * added per day). Its public API has two constraints that shape this design:
 *
 *  - **No server-side filtering.** `search`, `category`, and friends are all
 *    accepted and then ignored — every query returns the same feed. Titles must
 *    therefore be filtered client-side.
 *  - **`limit` is hard-capped at 20**, whatever value is requested.
 *
 * What makes it usable anyway is that the feed is strictly newest-first, so a
 * scan can read the newest pages and stop, rather than crawling all ~4,800 pages.
 * A run reads at most `MAX_PAGES`, covering roughly the last ten hours of
 * postings — more than the six-hour scan interval. In practice the page cap, not
 * the freshness cutoff, ends the walk, so that alone is not reported; the run
 * only flags it when the pages read span less than the gap between scans.
 *
 * Measured against this project's own title/location filters: a live run read
 * 1,158 recent postings in ~28s and matched 12. Of those, 3 were `ux`
 * substring false positives ("Lin-ux", "BENEL-ux") and 2 were EU-restricted
 * remote roles; both classes are now filtered out upstream, leaving 7 genuine
 * design roles.
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeFetch } from "@/lib/safe-fetch";
import type { FreshnessWindowHours } from "@/lib/db/types";
import { getBrowserBoardImportDirectory, importBrowserBoardJobs } from "./browser-board-importer";
import { buildTitleFilter } from "@/lib/jobs/title-filter";

const API_URL = "https://himalayas.app/jobs/api";
/** The API silently caps `limit` at 20, so asking for more just wastes the round trip. */
const PAGE_SIZE = 20;
/**
 * Ceiling on pages per scan.
 *
 * At 20 per page this covers the newest ~1,200 postings, which at the observed
 * ~2,900/day posting rate is roughly ten hours of feed — comfortably more than
 * the six-hour scan interval, with margin.
 *
 * It is the *page cap*, not the freshness cutoff, that normally ends the walk:
 * a 72-hour window would need ~435 pages. See {@link MIN_COVERAGE_HOURS} for
 * when hitting the cap is worth reporting.
 */
const MAX_PAGES = 60;
const REQUEST_TIMEOUT_MS = 30_000;
const INTER_PAGE_DELAY_MS = 300;
/** Consecutive page failures that abort the walk, so a degraded API is not hammered. */
const MAX_CONSECUTIVE_FAILURES = 3;
/**
 * Hours of feed a run must cover before the page cap counts as a real gap.
 *
 * Hitting the cap is the normal way a run ends — a 72-hour window would need
 * ~435 pages — so reporting it every time trained the user to ignore a lane's
 * error row on a run that had just delivered new jobs. What actually matters is
 * whether the walk covered the gap since the previous scan (six hours), so the
 * cap is only reported when the postings read span less than that.
 */
const MIN_COVERAGE_HOURS = 6;

export type HimalayasScanOptions = {
  titleFilters?: { positive: string[]; negative: string[] };
  freshnessWindowHours?: FreshnessWindowHours;
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

export function normalizeHimalayasJob(raw: HimalayasJob): NormalizedHimalayasJob | null {
  const position = str(raw.title);
  const company = str(raw.companyName);
  const url = str(raw.applicationLink) || str(raw.guid);
  if (!position || !company || !url) return null;

  const datePosted = himalayasPubDateToIso(raw.pubDate);
  return {
    id: randomUUID(),
    company,
    position,
    jobDescription: str(raw.description) || str(raw.excerpt),
    url,
    sourceUrl: str(raw.guid) || url,
    originalPostingUrl: url,
    discoveredAt: datePosted ?? new Date().toISOString(),
    datePosted,
    location: formatHimalayasLocation(raw.locationRestrictions),
    salaryNotes: formatHimalayasSalary(raw.minSalary, raw.maxSalary, raw.currency),
  };
}

async function fetchPage(offset: number): Promise<HimalayasJob[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await safeFetch(`${API_URL}?limit=${PAGE_SIZE}&offset=${offset}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; JobSearchTerminal/1.0; remote-board-fetch)" },
    });
    if (!res.ok) return null;
    const data = parseHimalayasPayload(await res.text()) as { jobs?: unknown };
    return Array.isArray(data.jobs) ? (data.jobs as HimalayasJob[]) : [];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runHimalayasScan(
  opts: HimalayasScanOptions = {},
  onProgress?: (msg: string) => void,
): Promise<HimalayasScanResult> {
  const freshnessWindowHours = opts.freshnessWindowHours ?? 72;
  const cutoffMs = Date.now() - freshnessWindowHours * 60 * 60 * 1000;
  const scanTimestamp = new Date().toISOString();

  const collected: NormalizedHimalayasJob[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let consecutiveFailures = 0;
  let reachedCutoff = false;
  let pagesRead = 0;
  let oldestSeenMs: number | null = null;

  for (let page = 0; page < MAX_PAGES && !reachedCutoff; page += 1) {
    const jobs = await fetchPage(page * PAGE_SIZE);

    if (jobs === null) {
      consecutiveFailures += 1;
      errors.push(`Himalayas page ${page} failed`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        errors.push(`Aborted after ${consecutiveFailures} consecutive page failures.`);
        onProgress?.("Himalayas is not responding — stopping early.");
        break;
      }
      await new Promise((r) => setTimeout(r, INTER_PAGE_DELAY_MS));
      continue;
    }

    consecutiveFailures = 0;
    pagesRead += 1;
    if (jobs.length === 0) break;

    for (const raw of jobs) {
      const job = normalizeHimalayasJob(raw);
      if (!job) continue;
      // The feed is newest-first, so the first posting past the window means
      // every remaining page is older still.
      if (job.datePosted && Date.parse(job.datePosted) < cutoffMs) {
        reachedCutoff = true;
        break;
      }
      if (job.datePosted) {
        const postedMs = Date.parse(job.datePosted);
        if (!Number.isNaN(postedMs) && (oldestSeenMs === null || postedMs < oldestSeenMs)) {
          oldestSeenMs = postedMs;
        }
      }
      if (seen.has(job.sourceUrl)) continue;
      seen.add(job.sourceUrl);
      collected.push(job);
    }

    if (jobs.length < PAGE_SIZE) break;
    await new Promise((r) => setTimeout(r, INTER_PAGE_DELAY_MS));
  }

  onProgress?.(`Read ${pagesRead} Himalayas page(s); ${collected.length} postings within the freshness window.`);

  // Exhausting the page budget before reaching the cutoff means the walk stopped
  // mid-feed. That is the normal ending, so it is only worth reporting when the
  // pages read span less than the interval between scans — that is the case
  // where postings could have slipped through unseen. A partial sweep reported
  // as a clean one is how a lane goes quiet without anyone noticing; a full
  // sweep reported as an error is how a real one stops being read.
  if (!reachedCutoff && pagesRead >= MAX_PAGES) {
    const coveredHours =
      oldestSeenMs === null ? 0 : (Date.now() - oldestSeenMs) / (60 * 60 * 1000);
    if (coveredHours < MIN_COVERAGE_HOURS) {
      const detail =
        `Reached the ${MAX_PAGES}-page cap after only ${coveredHours.toFixed(1)}h of postings ` +
        `(under the ${MIN_COVERAGE_HOURS}h between scans) — postings older than that were not seen this run.`;
      errors.push(detail);
      onProgress?.(`Note: ${detail}`);
    } else {
      onProgress?.(
        `Reached the ${MAX_PAGES}-page cap, covering the newest ${coveredHours.toFixed(1)}h of postings.`,
      );
    }
  }

  const { positive = [], negative = [] } = opts.titleFilters ?? {};
  const titleMatches = buildTitleFilter({ positive, negative });

  const totalFound = collected.length;
  const filteredJobs = collected.filter((j) => titleMatches(j.position));
  const skipped = totalFound - filteredJobs.length;

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
      searchCriteria: { titles: [], locations: [], remotePreference: "remote-only" },
      generatedBy: "Himalayas Remote Board Scanner v1.0",
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
