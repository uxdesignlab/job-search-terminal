import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fetchWithRetry, type BackoffConfig } from "./transient-retry";
import { getBrowserBoardImportDirectory, importBrowserBoardJobs } from "./browser-board-importer";
import type { FreshnessWindowHours } from "@/lib/db/types";
import { buildTitleFilter } from "@/lib/jobs/title-filter";
import { recordScanRun } from "@/lib/db/queries";
import { browserBoardSourceToScanType } from "./browser-board-sources";

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
  /**
   * Dropped by the location/remote-region filter inside the importer.
   *
   * Carried out of the scanner because the importer already counts it and the
   * mapping used to throw it away: a scan that found 47 roles and imported none
   * reported "47 listings found" with no errors and no explanation.
   */
  preferenceFiltered: number;
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

/**
 * Distinct search terms per scan.
 *
 * Adzuna's free tier allows 2,000 queries a month. A full discovery scan runs
 * around seven times a day — roughly 210 runs a month — and each term costs one
 * query per lane, so four terms across two lanes is about 1,680 queries: inside
 * the tier with room for a busy day. Raising this quietly overruns the quota,
 * and Adzuna answers an exhausted quota with a `Retry-After` measured in hours,
 * which ends the sweep for every remaining query.
 */
const ADZUNA_MAX_SEARCH_TERMS = 4;

/**
 * Adzuna told us how long its backpressure lasts.
 *
 * Fatal to the whole sweep, not just the query that hit it: every remaining
 * title/location pair goes to the same account against the same limit, so
 * continuing only spends requests to be told the same thing again. Carried as a
 * type rather than matched out of the message — the message is user-facing prose
 * and must stay free to change.
 */
class AdzunaBackpressureError extends Error {
  constructor(readonly status: number | null, readonly waitMs: number) {
    super(
      status === 429
        ? `Adzuna is rate limiting this account — it asked us to wait ${formatWait(waitMs)} before retrying`
        : `Adzuna is temporarily unavailable (HTTP ${status}) — it asked us to wait ${formatWait(waitMs)} before retrying`,
    );
    this.name = "AdzunaBackpressureError";
  }
}

/** Bad App ID / API Key. Fatal to the sweep for the same reason. */
class AdzunaCredentialsError extends Error {
  constructor() {
    super("Invalid Adzuna credentials — check your App ID and API Key");
    this.name = "AdzunaCredentialsError";
  }
}

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
      throw new AdzunaCredentialsError();
    }
    if (outcome.status === 404) return [];
    throw new Error(`Adzuna API returned HTTP ${outcome.status}`);
  }

  // Every attempt failed. Say which way it failed — a timeout and a gateway
  // error read the same to the user otherwise, and they are classified
  // differently on the dashboard.
  // Not necessarily a 429 — 502/503/504 carry `Retry-After` too, and a gateway
  // saying "come back later" must not be reported as an account rate limit.
  if (outcome.retryAfterMs !== undefined) {
    throw new AdzunaBackpressureError(outcome.lastStatus, outcome.retryAfterMs);
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

/**
 * The terms this scan will search Adzuna with.
 *
 * Deliberately *not* the target roles. `title_only` ANDs every word against the
 * job title, so a role written the way a person says it — "VP of User Experience
 * and Web Management" — matches no posting anywhere, and the lane returned zero
 * for weeks because every configured role was a phrase of that shape. The
 * positive title-filter keywords are the right shape instead: short, generic,
 * and already curated. Querying broadly costs no precision, because
 * `buildTitleFilter` re-applies those same keywords — and the negatives — to
 * every result a moment later.
 */
export function buildAdzunaSearchTerms(
  titleFilters: { positive: string[]; negative: string[] } | undefined,
  targetRoles: string[],
): string[] {
  const clean = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);
  const positives = clean(titleFilters?.positive ?? []);
  // Fall back to the target roles only when there is no positive filter at all.
  // A poor query still beats no scan, and it keeps a profile that has never
  // opened Title filters working exactly as it did before.
  const source = positives.length > 0 ? positives : clean(targetRoles);

  const kept: string[] = [];
  for (const term of source) {
    // Adzuna stems, so `title_only=product design` and `title_only=product
    // designer` return the identical result set. Keeping both spends a query
    // from a metered budget to learn the same thing twice.
    const lower = term.toLowerCase();
    const redundant = kept.some((existing) => {
      const other = existing.toLowerCase();
      return lower.startsWith(other) || other.startsWith(lower);
    });
    if (redundant) continue;
    kept.push(term);
    if (kept.length === ADZUNA_MAX_SEARCH_TERMS) break;
  }
  return kept;
}

/**
 * The `where` values each term is searched under. An empty string means no
 * `where` parameter at all — a nationwide search.
 *
 * Two lanes, because Adzuna publishes no remote signal of any kind: there is no
 * flag on a result, and `location.display_name` is always a geographic path,
 * never "Remote". The only way to reach a role open across the whole country is
 * to search without a location and let the importer's preference filter judge
 * what comes back.
 *
 * The remote-only branch used to pass `where: "remote"`. Adzuna geocodes that to
 * nowhere and returns nothing at all, so the one preference that most needs the
 * nationwide search was the one guaranteed to find nothing.
 */
export function buildAdzunaLanes(locations: string[], isRemoteOnly: boolean): string[] {
  if (isRemoteOnly) return [""];
  const commute = locations.map((location) => location.trim()).find(Boolean);
  return commute ? [commute, ""] : [""];
}

/**
 * Record a run that imported nothing.
 *
 * Both empty paths return before the importer, and the importer is where the
 * `scan_runs` row is written — so a lane returning zero left no trace anywhere,
 * and "Adzuna found nothing" was indistinguishable from "Adzuna never ran". That
 * is why this lane could go dark for three weeks unnoticed.
 */
function recordEmptyAdzunaScanRun(args: {
  startedAt: string;
  totalFound: number;
  filteredCount: number;
  errors: string[];
  freshnessWindowHours: FreshnessWindowHours;
}): void {
  try {
    recordScanRun({
      id: randomUUID(),
      status: args.errors.length > 0 ? "completed_with_errors" : "completed",
      startedAt: args.startedAt,
      completedAt: new Date().toISOString(),
      companiesScanned: 0,
      skippedCompanies: 0,
      totalJobsFound: args.totalFound,
      filteredCount: args.filteredCount,
      duplicateCount: 0,
      newJobsCount: 0,
      errors: args.errors.map((error) => ({ company: "Adzuna", error })),
      scanType: browserBoardSourceToScanType("adzuna"),
      freshnessWindowHours: args.freshnessWindowHours,
      freshCount: 0,
      unknownDateCount: 0,
      staleFilteredCount: 0,
    });
  } catch {
    // History is a diagnostic, not the product. A scan must not fail because we
    // could not write a row saying it found nothing.
  }
}

export async function runAggregatorScan(
  opts: AggregatorScanOptions,
  onProgress?: (msg: string) => void,
): Promise<AggregatorScanResult> {
  if (!opts.adzunaAppId || !opts.adzunaApiKey) {
    return { status: "no-credentials", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, preferenceFiltered: 0, totalFound: 0, errors: ["Adzuna App ID and API Key are required — configure them in Settings → AI Provider"], jobs: [] };
  }
  const terms = buildAdzunaSearchTerms(opts.titleFilters, opts.titles);
  if (terms.length === 0) {
    return { status: "error", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, preferenceFiltered: 0, totalFound: 0, errors: ["Nothing to search for — add title keywords under Settings → Preferences → Title filters, or target roles in Profile"], jobs: [] };
  }

  const country = opts.country ?? "us";
  const freshnessWindowHours = opts.freshnessWindowHours ?? 72;
  const scanTimestamp = new Date().toISOString();
  const isRemoteOnly = opts.remotePreference === "remote-only";
  const lanes = buildAdzunaLanes(opts.locations, isRemoteOnly);

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

  outer: for (const term of terms) {
    for (const where of lanes) {
      const laneLabel = where ? `in "${where}"` : "nationwide";
      onProgress?.(`Searching Adzuna: "${term}" ${laneLabel}…`);
      try {
        const results = await searchAdzuna(opts.adzunaAppId, opts.adzunaApiKey, term, where, country, freshnessWindowHours);
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
        onProgress?.(`Found ${results.length} jobs for "${term}" ${laneLabel}`);
        consecutiveFailures = 0;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
        onProgress?.(`Warning: ${msg}`);
        if (err instanceof AdzunaCredentialsError) {
          return { status: "error", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, preferenceFiltered: 0, totalFound: 0, errors, jobs: [] };
        }
        if (err instanceof AdzunaBackpressureError) {
          // Adzuna has already told us how long the wait is. Every remaining
          // query would spend a request to be told the same thing, so end the
          // sweep here rather than letting the failure counter walk it out.
          break outer;
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
    onProgress?.("Adzuna returned no matching listings");
    recordEmptyAdzunaScanRun({ startedAt: scanTimestamp, totalFound: 0, filteredCount: 0, errors, freshnessWindowHours });
    return { status: "ok", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, preferenceFiltered: 0, totalFound: 0, errors, jobs: [] };
  }

  const { positive = [], negative = [] } = opts.titleFilters ?? {};
  const titleMatches = buildTitleFilter({ positive, negative });
  const totalFound = jobs.length;
  const filteredJobs = jobs.filter((j) => titleMatches(j.position));
  const skipped = totalFound - filteredJobs.length;
  if (skipped > 0) onProgress?.(`Filtered out ${skipped} jobs that didn't match title filters`);

  if (filteredJobs.length === 0) {
    onProgress?.(`All ${totalFound} Adzuna listings were removed by your title filters`);
    recordEmptyAdzunaScanRun({ startedAt: scanTimestamp, totalFound, filteredCount: skipped, errors, freshnessWindowHours });
    return { status: "ok", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, preferenceFiltered: 0, totalFound, errors, jobs: [] };
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
        // The terms and lanes actually sent, not the raw profile. The archived
        // file is the ground truth when a scan is later found to have imported
        // nothing, and the profile may have changed by the time anyone looks.
        titles: terms,
        locations: lanes.map((lane) => lane || "Nationwide"),
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
      preferenceFiltered: importResult.preferenceFiltered,
      totalFound: jobs.length,
      errors: [...errors, ...importResult.errors],
      jobs: importResult.importedJobs.map((job) => ({ title: job.title, url: job.url, company: job.company })),
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { status: "error", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, preferenceFiltered: 0, totalFound, errors, jobs: preview };
  }
}
