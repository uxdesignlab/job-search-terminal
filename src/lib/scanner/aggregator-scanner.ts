import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fetchWithRetry, type BackoffConfig } from "./transient-retry";
import { getBrowserBoardImportDirectory, importBrowserBoardJobs } from "./browser-board-importer";
import type { FreshnessWindowHours } from "@/lib/db/types";
import { buildTitleFilter } from "@/lib/jobs/title-filter";

export type AggregatorScanOptions = {
  adzunaAppId: string;
  adzunaApiKey: string;
  titles: string[];
  locations: string[];
  remotePreference: string;
  country?: string;
  titleFilters?: { positive: string[]; negative: string[] };
  freshnessWindowHours?: FreshnessWindowHours;
};

export type AggregatorScanResult = {
  status: "ok" | "error" | "no-credentials";
  imported: number;
  duplicates: number;
  fresh: number;
  unknownDate: number;
  staleFiltered: number;
  totalFound: number;
  errors: string[];
  jobs: Array<{ title: string; url: string; company: string }>;
};

type AdzunaJob = {
  id: string;
  title: string;
  company: { display_name: string };
  description: string;
  redirect_url: string;
  location: { display_name: string };
  salary_min?: number;
  salary_max?: number;
  created: string;
};

type AdzunaResponse = {
  count: number;
  results: AdzunaJob[];
};

/**
 * Adzuna retry profile.
 *
 * Deliberately faster than the Common Crawl profile: a search API answers in
 * well under a second when healthy, and a scan fans out over up to 5 titles x 3
 * locations sequentially, so a slow backoff multiplied by 15 queries turns a
 * brief outage into minutes of stalling.
 */
const ADZUNA_FETCH_ATTEMPTS = 3;
/**
 * Per-attempt deadline. `safeFetch` imposes none of its own, and this scan runs
 * under `Promise.all` alongside the other discovery sources — without a signal a
 * single hung socket stalled the entire run with no upper bound.
 */
const ADZUNA_FETCH_TIMEOUT_MS = 15_000;
const ADZUNA_BACKOFF: BackoffConfig = {
  baseMs: 1_000,
  factor: 2,
  jitterMs: 250,
  /**
   * Tight, because this scan blocks an interactive progress modal. Adzuna's free
   * tier is quota-based, so a 429 can carry a `Retry-After` measured in hours;
   * waiting that out would stall the whole discovery run.
   */
  maxDelayMs: 10_000,
};
/**
 * Consecutive whole-query failures that abandon the sweep.
 *
 * Mirrors the Common Crawl circuit breaker: once the host is refusing us,
 * working through the remaining title/location pairs only multiplies the wait.
 */
const ADZUNA_MAX_CONSECUTIVE_FAILURES = 3;

/** Renders a backpressure interval the way a person would say it. */
function formatWait(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.max(1, Math.round(ms / 1_000))}s`;
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

async function searchAdzuna(
  appId: string,
  apiKey: string,
  what: string,
  where: string,
  country: string,
  freshnessWindowHours: FreshnessWindowHours,
): Promise<AdzunaJob[]> {
  const params = new URLSearchParams({
    app_id: appId,
    app_key: apiKey,
    title_only: what,
    results_per_page: "50",
    sort_by: "date",
    max_days_old: String(Math.ceil(freshnessWindowHours / 24)),
  });
  if (where) params.set("where", where);
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`;

  const outcome = await fetchWithRetry(url, (res) => res.json() as Promise<AdzunaResponse>, {
    attempts: ADZUNA_FETCH_ATTEMPTS,
    timeoutMs: ADZUNA_FETCH_TIMEOUT_MS,
    backoff: ADZUNA_BACKOFF,
  });

  if (outcome.kind === "value") return outcome.value.results ?? [];

  if (outcome.kind === "status") {
    if (outcome.status === 401 || outcome.status === 403) {
      throw new Error("Invalid Adzuna credentials — check your App ID and API Key");
    }
    if (outcome.status === 404) return [];
    throw new Error(`Adzuna API returned HTTP ${outcome.status}`);
  }

  // Every attempt failed. Say which way it failed — a timeout and a gateway
  // error read the same to the user otherwise, and they are classified
  // differently on the dashboard.
  if (outcome.retryAfterMs !== undefined) {
    throw new Error(
      `Adzuna is rate limiting this account — it asked us to wait ${formatWait(outcome.retryAfterMs)} before retrying`,
    );
  }
  if (outcome.timedOut) {
    throw new Error(`Adzuna search timed out after ${ADZUNA_FETCH_TIMEOUT_MS / 1000}s`);
  }
  if (outcome.lastStatus !== null) {
    throw new Error(
      `Adzuna API returned HTTP ${outcome.lastStatus} on all ${ADZUNA_FETCH_ATTEMPTS} attempts`,
    );
  }
  throw new Error(`Adzuna could not be reached after ${ADZUNA_FETCH_ATTEMPTS} attempts`);
}

function adzunaStableUrl(redirectUrl: string): string {
  try {
    const u = new URL(redirectUrl);
    u.search = "";
    return u.toString();
  } catch {
    return redirectUrl;
  }
}

function formatSalary(min?: number, max?: number): string {
  if (!min && !max) return "";
  if (min && max) return `$${Math.round(min / 1000)}k–$${Math.round(max / 1000)}k/yr`;
  if (min) return `$${Math.round(min / 1000)}k+/yr`;
  return `up to $${Math.round(max! / 1000)}k/yr`;
}

export async function runAggregatorScan(
  opts: AggregatorScanOptions,
  onProgress?: (msg: string) => void,
): Promise<AggregatorScanResult> {
  if (!opts.adzunaAppId || !opts.adzunaApiKey) {
    return { status: "no-credentials", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, totalFound: 0, errors: ["Adzuna App ID and API Key are required — configure them in Settings → AI Provider"], jobs: [] };
  }
  if (opts.titles.length === 0) {
    return { status: "error", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, totalFound: 0, errors: ["No target roles configured — add them in Profile"], jobs: [] };
  }

  const country = opts.country ?? "us";
  const freshnessWindowHours = opts.freshnessWindowHours ?? 72;
  const scanTimestamp = new Date().toISOString();
  const isRemoteOnly = opts.remotePreference === "remote-only";
  const locations = opts.locations.length > 0 ? opts.locations : [""];

  const jobs: Array<{
    id: string;
    company: string;
    position: string;
    jobDescription: string;
    url: string;
    sourceUrl: string;
    originalPostingUrl: string;
    discoveredAt: string;
    location: string;
    salaryNotes: string;
  }> = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let consecutiveFailures = 0;

  outer: for (const title of opts.titles.slice(0, 5)) {
    for (const location of locations.slice(0, 3)) {
      const where = isRemoteOnly ? "remote" : location;
      onProgress?.(`Searching Adzuna: "${title}"${where ? ` in "${where}"` : ""}…`);
      try {
        const results = await searchAdzuna(opts.adzunaAppId, opts.adzunaApiKey, title, where, country, freshnessWindowHours);
        for (const job of results) {
          const adzunaId = String(job.id);
          if (seen.has(adzunaId)) continue;
          seen.add(adzunaId);
          // Strip volatile query params (e.g. `v=<hash>`) from the redirect URL so the
          // sourceUrl — and the stable job ID derived from it — stays the same across scans.
          const stableSourceUrl = adzunaStableUrl(job.redirect_url);
          jobs.push({
            id: randomUUID(),
            company: job.company.display_name,
            position: job.title,
            jobDescription: job.description,
            url: job.redirect_url,
            sourceUrl: stableSourceUrl,
            // Full redirect URL (with volatile v= param) preserved as the navigable apply URL.
            // prepareBrowserBoardJobs uses originalPostingUrl → externalUrl → url in DB.
            originalPostingUrl: job.redirect_url,
            discoveredAt: new Date(job.created).toISOString(),
            location: job.location.display_name,
            salaryNotes: formatSalary(job.salary_min, job.salary_max),
          });
        }
        onProgress?.(`Found ${results.length} jobs for "${title}"${where ? ` / "${where}"` : ""}`);
        consecutiveFailures = 0;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
        onProgress?.(`Warning: ${msg}`);
        if (msg.includes("credentials")) {
          return { status: "error", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, totalFound: 0, errors, jobs: [] };
        }
        consecutiveFailures += 1;
        if (consecutiveFailures >= ADZUNA_MAX_CONSECUTIVE_FAILURES) {
          // Adzuna is down or throttling us, not failing one odd query. Each
          // remaining query would burn its full retry budget to learn the same
          // thing, so stop and report the abort instead of stalling the scan.
          const abort = `Adzuna stopped responding — gave up after ${consecutiveFailures} consecutive failed searches`;
          errors.push(abort);
          onProgress?.(abort);
          break outer;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (jobs.length === 0) {
    return { status: "ok", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, totalFound: 0, errors, jobs: [] };
  }

  const { positive = [], negative = [] } = opts.titleFilters ?? {};
  const titleMatches = buildTitleFilter({ positive, negative });
  const totalFound = jobs.length;
  const filteredJobs = jobs.filter((j) => titleMatches(j.position));
  const skipped = totalFound - filteredJobs.length;
  if (skipped > 0) onProgress?.(`Filtered out ${skipped} jobs that didn't match title filters`);

  if (filteredJobs.length === 0) {
    return { status: "ok", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, totalFound, errors, jobs: [] };
  }

  const ts = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "Z");
  const filename = `adzuna-jobs-${ts}.json`;
  const dir = getBrowserBoardImportDirectory();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${filename}.tmp`);
  const finalPath = path.join(dir, filename);

  const payload = {
    metadata: {
      source: "adzuna",
      scanTimestamp,
      scanDurationSeconds: 0,
      totalJobsDiscovered: totalFound,
      totalJobsValid: filteredJobs.length,
      totalJobsSkipped: skipped,
      searchCriteria: {
        titles: opts.titles,
        locations: opts.locations,
        remotePreference: opts.remotePreference,
      },
      generatedBy: "Adzuna Aggregator Scanner v1.0",
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
  onProgress?.(`Saved ${filteredJobs.length} jobs to ${filename}`);

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
      totalFound: jobs.length,
      errors: [...errors, ...importResult.errors],
      jobs: importResult.importedJobs.map((job) => ({ title: job.title, url: job.url, company: job.company })),
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { status: "error", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, totalFound, errors, jobs: preview };
  }
}
