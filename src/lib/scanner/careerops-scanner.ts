import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { getCustomScanSources, getJobDedupKeys, getScanSourceOverrides, getTitleFilters, getUserProfile, insertScannedJobs, recordScanRun, type CustomScanSource } from "../db/queries";
import type { FreshnessWindowHours, ScannedJobInput, ScanRunRecord, ScanTrigger } from "../db/types";
import { buildJobPreferenceFilter, type JobPreferenceProfile } from "../jobs/preference-fit";
import { buildTitleFilter as buildSharedTitleFilter } from "../jobs/title-filter";
import { classifyScanErrorMessage } from "../scan-error-category";
import { safeFetch } from "../safe-fetch";
import { localDateString } from "../dates";
import { classifyFreshness, DEFAULT_FRESHNESS_WINDOW_HOURS } from "./freshness";

const DEFAULT_CONFIG_PATH = "config/portals.yml";
const FALLBACK_CONFIG_PATH = "config/portals.example.yml";
/**
 * Requests in flight per job-board host. Each host gets its own lane so one host
 * slowing us down never stalls the others. The split keeps roughly the old total
 * of 20, weighted by how many boards each host carries.
 */
export const LANE_CONCURRENCY: Record<AtsType, number> = { greenhouse: 10, ashby: 8, lever: 4 };
/**
 * Upper bound for ATS job-list `fetch` + full JSON parse. Ashby boards with
 * many postings often exceed a short header-only budget because `response.json()`
 * waits on the full body.
 */
const ATS_JOB_LIST_FETCH_MS = 60_000;
/** After a timeout/abort, retry once (transient saturation or slow CDN). */
const ATS_JOB_LIST_FETCH_RETRIES = 1;

export type PortalCompany = {
  name: string;
  careers_url?: string;
  api?: string;
  enabled?: boolean;
  industry?: string;
};

type ScanConfig = {
  title_filter?: {
    positive?: string[];
    negative?: string[];
  };
  tracked_companies?: PortalCompany[];
};

export type AtsType = "greenhouse" | "ashby" | "lever";

type DetectedApi = {
  type: AtsType;
  url: string;
};

/** Display names for the hosts, used in user-facing copy. */
export const ATS_HOST_LABEL: Record<AtsType, string> = {
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  lever: "Lever",
};

/**
 * A board whose host answered HTTP 429 (or that was still waiting in that host's
 * lane when it did). It is handed to the background check instead of reported as
 * an error: the board is fine, the host only asked us to slow down.
 */
export type DeferredBoard = {
  name: string;
  apiType: AtsType;
  apiUrl: string;
  priority: number;
};

export type RateLimitedHost = {
  host: AtsType;
  /** Boards of this host left for the background check by this scan. */
  deferred: number;
  /** Boards of this host this scan set out to check. */
  total: number;
};

type RawJob = {
  title: string;
  url: string;
  company: string;
  location: string;
  datePosted: string | null;
};

type ScanTarget = PortalCompany & {
  _api: DetectedApi;
};

type ScanError = {
  company: string;
  error: string;
  category: ReturnType<typeof classifyScanErrorMessage>;
};

type ScanOptions = {
  /** Case-insensitive substring match on company name (multi-company runs). */
  company?: string;
  /** Exact case-insensitive company name; bypasses enable/disable and scans only that source when found. */
  companyExact?: string;
  configPath?: string;
  fetcher?: (url: string) => Promise<unknown>;
  persist?: boolean;
  now?: Date;
  profile?: JobPreferenceProfile;
  freshnessWindowHours?: FreshnessWindowHours;
  trigger?: ScanTrigger;
  /** Injected in tests; otherwise read from the jobs table when persisting. */
  dedup?: JobDedupKeys;
  /**
   * Higher scans first within each host's lane. Injected in tests; otherwise read
   * from the jobs table when persisting (see `getBoardPriorities`).
   */
  priorities?: Map<string, number>;
  /**
   * Board names to leave out because the background check already owns them.
   * Injected in tests; otherwise read from the catch-up queue when persisting.
   */
  skipNames?: Set<string>;
  /** Receives the boards a rate-limited host left unchecked. Persisting runs queue them. */
  onDeferred?: (boards: DeferredBoard[], runId: string) => void;
  /** Called after each board is checked (any outcome) with the running count and the total. */
  onBoardProgress?: (checked: number, total: number) => void;
};

export type JobDedupKeys = ReturnType<typeof getJobDedupKeys>;

/** A dedup set that matches nothing — used for dry runs, which insert nothing. */
export function emptyDedupKeys(): JobDedupKeys {
  return {
    urls: new Set(),
    companyRoles: new Set(),
    companyRoleLocations: new Set(),
    urlToIds: new Map(),
    originalPostingKeyToIds: new Map(),
    companyRoleToIds: new Map(),
    companyRoleLocationToIds: new Map(),
    openIds: new Set()
  };
}

export type ScanResult = ScanRunRecord & {
  jobs: ScannedJobInput[];
  /** Hosts that asked us to slow down during this run, with what was left for later. */
  rateLimited: RateLimitedHost[];
  /** Boards skipped because an earlier scan's background check still holds them. */
  alreadyQueued: number;
};

/**
 * Filters, dedup set, and counters shared by a scan and by the background check,
 * so a board checked later lands in the app exactly as it would have during the scan.
 */
export type BoardJobContext = {
  titleFilter: (title: string) => boolean;
  preferenceFilter: ReturnType<typeof buildJobPreferenceFilter>;
  freshnessWindowHours: FreshnessWindowHours;
  now?: Date;
  date: string;
  dedup: JobDedupKeys;
  counts: {
    totalJobsFound: number;
    filteredCount: number;
    duplicateCount: number;
    repostCount: number;
    freshCount: number;
    unknownDateCount: number;
    staleFilteredCount: number;
  };
  newJobs: ScannedJobInput[];
};

export function createBoardJobContext(input: {
  titleFilter: ScanConfig["title_filter"];
  profile?: JobPreferenceProfile;
  freshnessWindowHours?: FreshnessWindowHours;
  now?: Date;
  dedup: JobDedupKeys;
}): BoardJobContext {
  return {
    titleFilter: buildTitleFilter(input.titleFilter),
    preferenceFilter: buildJobPreferenceFilter(input.profile),
    freshnessWindowHours: input.freshnessWindowHours ?? DEFAULT_FRESHNESS_WINDOW_HOURS,
    now: input.now,
    date: localDateString(input.now ?? new Date()),
    dedup: input.dedup,
    counts: {
      totalJobsFound: 0,
      filteredCount: 0,
      duplicateCount: 0,
      repostCount: 0,
      freshCount: 0,
      unknownDateCount: 0,
      staleFilteredCount: 0,
    },
    newJobs: [],
  };
}

/** Runs one board's job list through the title, profile, freshness, and dedup rules. */
export function collectBoardJobs(ctx: BoardJobContext, companyName: string, apiType: AtsType, json: unknown) {
  const { counts, dedup } = ctx;
  const jobs = parseJobs(apiType, json, companyName);
  counts.totalJobsFound += jobs.length;

  for (const job of jobs) {
    if (!job.title || !job.url) {
      counts.filteredCount++;
      continue;
    }

    if (!ctx.titleFilter(job.title)) {
      counts.filteredCount++;
      continue;
    }

    if (!ctx.preferenceFilter(job).accepted) {
      counts.filteredCount++;
      continue;
    }

    const freshness = classifyFreshness(job.datePosted, ctx.freshnessWindowHours, ctx.now);
    if (freshness === "stale") {
      counts.staleFilteredCount++;
      continue;
    }
    if (freshness === "unknown-date") counts.unknownDateCount++;
    else counts.freshCount++;

    // The posting URL is the requisition's identity: the same URL is always the
    // same job, whatever its status.
    if (dedup.urls.has(job.url)) {
      counts.duplicateCount++;
      continue;
    }

    // A new URL for a role already in the app is only a duplicate while that
    // existing row is still live — the same role arriving via another lane in
    // the current cycle. Once the user has closed it out (applied, rejected,
    // skipped, archived), a fresh requisition is a real opportunity, and
    // matching on company+title alone would hide it permanently.
    const location = job.location || "Not specified";
    const companyRoleLocationKey =
      `${job.company.toLowerCase()}::${job.title.toLowerCase()}::${location.toLowerCase()}`;
    const collidingIds = dedup.companyRoleLocationToIds.get(companyRoleLocationKey) ?? [];
    if (collidingIds.some((id) => dedup.openIds.has(id))) {
      counts.duplicateCount++;
      continue;
    }
    if (collidingIds.length > 0) counts.repostCount++;

    const id = stableJobId(job.url);
    dedup.urls.add(job.url);
    dedup.openIds.add(id);
    addDedupId(dedup.companyRoleLocationToIds, companyRoleLocationKey, id);
    ctx.newJobs.push({
      id,
      company: job.company,
      title: job.title,
      url: job.url,
      source: `${apiType}-api`,
      location,
      datePosted: job.datePosted,
      firstSeenDate: ctx.date
    });
  }
}

/** An HTTP error that keeps its status code, so callers need not parse the message. */
export class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpStatusError";
  }
}

/** True when a host answered "too many requests". Accepts plain `HTTP 429` errors from injected fetchers. */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof HttpStatusError) return error.status === 429;
  return error instanceof Error && error.message.trim() === "HTTP 429";
}

/**
 * Persisting scans in progress in this process. The background check holds off
 * while one runs, so the two never press the same host at once.
 *
 * Kept on `globalThis`, not in a module variable: Next.js may load this module
 * separately for the scan API route and for `instrumentation.ts` (which runs the
 * background check), and a plain `let` would give each its own counter.
 */
const scanCounter = globalThis as typeof globalThis & { __jstActiveCareerScans?: number };
export function isCareerScanInProgress() {
  return (scanCounter.__jstActiveCareerScans ?? 0) > 0;
}
function changeActiveScans(delta: number) {
  scanCounter.__jstActiveCareerScans = Math.max(0, (scanCounter.__jstActiveCareerScans ?? 0) + delta);
}

export async function runCareerOpsScanner(options: ScanOptions = {}): Promise<ScanResult> {
  const startedAt = (options.now ?? new Date()).toISOString();
  const config = loadScanConfig(options.configPath);
  const companies = config.tracked_companies ?? [];
  const persist = options.persist ?? true;
  const fetcher = options.fetcher ?? fetchJson;
  // DB filters take precedence over YAML when non-empty
  const dbFilters = persist ? getTitleFilters() : { positive: [], negative: [] };
  const effectiveFilter = (dbFilters.positive.length > 0 || dbFilters.negative.length > 0)
    ? dbFilters
    : config.title_filter;
  const filterCompany = options.company?.toLowerCase();
  const filterCompanyExact = options.companyExact?.trim();
  const filterCompanyExactLower = filterCompanyExact?.toLowerCase();

  const sourceOverrides = persist ? getScanSourceOverrides() : {};
  const customSources = persist ? getCustomScanSources() : [];

  // Custom DB sources with a matching name override their YAML entry.
  const mergedCompanies = mergeTrackedCompanies(companies, customSources);

  const enabledCompanies = mergedCompanies.filter((company) => {
    if (Object.hasOwn(sourceOverrides, company.name)) return sourceOverrides[company.name];
    return company.enabled !== false;
  });

  const preflightErrors: ScanError[] = [];
  let companiesForTargets: PortalCompany[];
  if (filterCompanyExactLower) {
    const match = mergedCompanies.find((c) => c.name.toLowerCase() === filterCompanyExactLower);
    if (!match) {
      const msg = "Company not found in scan sources.";
      preflightErrors.push({
        company: filterCompanyExact ?? filterCompanyExactLower,
        error: msg,
        category: classifyScanErrorMessage(msg),
      });
      companiesForTargets = [];
    } else {
      companiesForTargets = [match];
    }
  } else {
    companiesForTargets = enabledCompanies;
  }

  const substringOk = (company: PortalCompany) =>
    !filterCompany || company.name.toLowerCase().includes(filterCompany);

  const targets = companiesForTargets
    .filter((company) => (filterCompanyExactLower ? true : substringOk(company)))
    .map((company) => ({ ...company, _api: detectApi(company) }))
    .filter((company): company is ScanTarget => company._api !== null);

  const skippedCompanies = filterCompanyExactLower
    ? companiesForTargets.length - targets.length
    : enabledCompanies.length - targets.length;
  const dedup = options.dedup ?? (persist ? getJobDedupKeys() : emptyDedupKeys());
  const ctx = createBoardJobContext({
    titleFilter: effectiveFilter,
    profile: options.profile ?? (persist ? getUserProfile() : undefined),
    freshnessWindowHours: options.freshnessWindowHours,
    now: options.now,
    dedup,
  });
  const errors: ScanError[] = [...preflightErrors];
  if (
    filterCompanyExactLower &&
    companiesForTargets.length === 1 &&
    targets.length === 0 &&
    preflightErrors.length === 0
  ) {
    const msg =
      "Careers URL is missing or this portal is not a supported ATS (Greenhouse, Ashby, or Lever).";
    errors.push({
      company: companiesForTargets[0].name,
      error: msg,
      category: classifyScanErrorMessage(msg),
    });
  }

  // Boards the background check already holds stay with it: scanning them again
  // now would press the same host that just asked us to slow down.
  const skipNames = filterCompanyExactLower ? new Set<string>() : options.skipNames ?? new Set<string>();
  const scanTargets = targets.filter((t) => !skipNames.has(t.name));
  const alreadyQueued = targets.length - scanTargets.length;
  const priorities = options.priorities ?? new Map<string, number>();
  const priorityOf = (name: string) => priorities.get(name.toLowerCase()) ?? 0;

  const runId = `scan-${Date.now()}`;
  const rateLimited: RateLimitedHost[] = [];
  const deferred: DeferredBoard[] = [];

  let boardsChecked = 0;
  const boardDone = () => options.onBoardProgress?.(++boardsChecked, scanTargets.length);
  options.onBoardProgress?.(0, scanTargets.length);
  if (persist) changeActiveScans(1);
  try {
    await Promise.all(
      (Object.keys(LANE_CONCURRENCY) as AtsType[]).map(async (host) => {
        // Most promising boards first: if the host does slow us down, it is the
        // long tail that waits, not the companies most likely to have a match.
        const laneTargets = scanTargets
          .filter((t) => t._api.type === host)
          .sort((x, y) => priorityOf(y.name) - priorityOf(x.name));
        if (laneTargets.length === 0) return;

        const lane = await runLane(laneTargets, LANE_CONCURRENCY[host], async (company) => {
          try {
            const json = await fetcher(company._api.url);
            collectBoardJobs(ctx, company.name, company._api.type, json);
            boardDone();
            return "ok";
          } catch (error) {
            if (isRateLimitError(error)) return "rate_limited";
            let message = error instanceof Error ? error.message : "Unknown scanner error";
            if (message === "This operation was aborted" || message === "The operation was aborted." || message.toLowerCase().includes("abort")) {
              message = `Fetch timed out after ${ATS_JOB_LIST_FETCH_MS / 1000}s — the careers API may be slow or the job list is very large`;
            }
            errors.push({ company: company.name, error: message, category: classifyScanErrorMessage(message) });
            boardDone();
            return "error";
          }
        });

        if (lane.deferred.length > 0) {
          rateLimited.push({ host, deferred: lane.deferred.length, total: laneTargets.length });
          for (const t of lane.deferred) {
            deferred.push({ name: t.name, apiType: t._api.type, apiUrl: t._api.url, priority: priorityOf(t.name) });
          }
        }
      }),
    );
  } finally {
    if (persist) changeActiveScans(-1);
  }

  if (deferred.length > 0) {
    if (options.onDeferred) {
      options.onDeferred(deferred, runId);
    } else {
      // No background check behind this caller (a single-source check, a dry run):
      // report the refusals so they are not silently dropped.
      for (const board of deferred) {
        errors.push({ company: board.name, error: "HTTP 429", category: classifyScanErrorMessage("HTTP 429") });
      }
      rateLimited.length = 0;
    }
  }

  const { newJobs, counts } = ctx;
  const insertedCount = persist ? insertScannedJobs(newJobs) : newJobs.length;
  const completedAt = new Date().toISOString();
  const run: ScanRunRecord = {
    id: runId,
    status: errors.length > 0 ? "completed_with_errors" : "completed",
    startedAt,
    completedAt,
    // Boards handed to the background check (now or by an earlier scan) were not
    // checked by this run, so they are not counted as scanned.
    companiesScanned: scanTargets.length - (options.onDeferred ? deferred.length : 0),
    skippedCompanies,
    totalJobsFound: counts.totalJobsFound,
    filteredCount: counts.filteredCount,
    duplicateCount: counts.duplicateCount + (newJobs.length - insertedCount),
    newJobsCount: insertedCount,
    errors,
    scanType: "careerops"
    , trigger: options.trigger ?? "manual"
    , freshnessWindowHours: options.freshnessWindowHours ?? DEFAULT_FRESHNESS_WINDOW_HOURS
    , freshCount: counts.freshCount
    , unknownDateCount: counts.unknownDateCount
    , staleFilteredCount: counts.staleFilteredCount
    , repostCount: counts.repostCount
  };

  if (persist) {
    recordScanRun(run);
  }

  return {
    ...run,
    jobs: newJobs,
    rateLimited,
    alreadyQueued,
  };
}

export function loadScanConfig(configPath?: string): ScanConfig {
  const selectedPath = configPath ?? (existsSync(path.join(process.cwd(), DEFAULT_CONFIG_PATH)) ? DEFAULT_CONFIG_PATH : FALLBACK_CONFIG_PATH);
  const absolutePath = path.join(process.cwd(), selectedPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Scanner config not found: ${selectedPath}`);
  }

  return yaml.load(readFileSync(absolutePath, "utf-8")) as ScanConfig;
}

/** Whether a source will be scanned on the next run (YAML/custom defaults + `scan_source_overrides`). */
export function isScanSourceEnabled(name: string, configPath?: string): boolean {
  const config = loadScanConfig(configPath);
  const companies = config.tracked_companies ?? [];
  const sourceOverrides = getScanSourceOverrides();
  const customSources = getCustomScanSources();
  const mergedCompanies = mergeTrackedCompanies(companies, customSources);
  const company = mergedCompanies.find((c) => c.name === name);
  if (company) {
    if (Object.hasOwn(sourceOverrides, name)) return sourceOverrides[name];
    return company.enabled !== false;
  }
  if (Object.hasOwn(sourceOverrides, name)) return sourceOverrides[name];
  return true;
}

/**
 * The scan sources as the scanner sees them: the YAML `tracked_companies` plus the
 * custom sources stored in the app database, where a custom source of the same name
 * replaces the YAML entry. Exported because the description fetcher needs the same
 * view to recover a Greenhouse board token from a company name.
 */
export function mergeTrackedCompanies(
  yamlCompanies: PortalCompany[],
  customSources: CustomScanSource[],
): PortalCompany[] {
  const yamlNames = new Set(yamlCompanies.map((c) => c.name));
  return [
    ...yamlCompanies,
    ...customSources
      .filter((c) => !yamlNames.has(c.name))
      .map((c) => ({ name: c.name, careers_url: c.careersUrl, api: c.api, enabled: c.enabled }))
  ];
}

export function detectApi(company: PortalCompany): DetectedApi | null {
  if (company.api && company.api.includes("greenhouse")) {
    return { type: "greenhouse", url: company.api };
  }

  const url = company.careers_url ?? "";
  const ashbyMatch = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashbyMatch) {
    return {
      type: "ashby",
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashbyMatch[1]}?includeCompensation=true`
    };
  }

  const leverMatch = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (leverMatch) {
    return {
      type: "lever",
      url: `https://api.lever.co/v0/postings/${leverMatch[1]}`
    };
  }

  const greenhouseMatch = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (greenhouseMatch && !company.api) {
    return {
      type: "greenhouse",
      url: `https://boards-api.greenhouse.io/v1/boards/${greenhouseMatch[1]}/jobs`
    };
  }

  return null;
}

/** Re-exported so existing callers keep a single import site; logic lives in jobs/title-filter. */
export function buildTitleFilter(titleFilter: ScanConfig["title_filter"]) {
  return buildSharedTitleFilter(titleFilter);
}

export function parseGreenhouse(json: unknown, companyName: string): RawJob[] {
  const jobs = isRecord(json) && Array.isArray(json.jobs) ? json.jobs : [];
  return jobs.map((job) => {
    const record = isRecord(job) ? job : {};
    const location = isRecord(record.location) ? record.location.name : "";
    return {
      title: stringValue(record.title),
      url: stringValue(record.absolute_url),
      company: companyName,
      location: stringValue(location),
      datePosted: stringValue(record.updated_at) || null
    };
  });
}

export function parseAshby(json: unknown, companyName: string): RawJob[] {
  const jobs = isRecord(json) && Array.isArray(json.jobs) ? json.jobs : [];
  return jobs.map((job) => {
    const record = isRecord(job) ? job : {};
    return {
      title: stringValue(record.title),
      url: stringValue(record.jobUrl),
      company: companyName,
      location: stringValue(record.location),
      // Ashby's posting API names this `publishedAt`; `publishedDate` never
      // existed, so every Ashby job used to arrive undated and skip freshness.
      datePosted: stringValue(record.publishedAt) || null
    };
  });
}

export function parseLever(json: unknown, companyName: string): RawJob[] {
  if (!Array.isArray(json)) {
    return [];
  }

  return json.map((job) => {
    const record = isRecord(job) ? job : {};
    const categories = isRecord(record.categories) ? record.categories : {};
    return {
      title: stringValue(record.text),
      url: stringValue(record.hostedUrl),
      company: companyName,
      location: stringValue(categories.location),
      datePosted: null
    };
  });
}

function parseJobs(type: AtsType, json: unknown, companyName: string) {
  if (type === "greenhouse") return parseGreenhouse(json, companyName);
  if (type === "ashby") return parseAshby(json, companyName);
  return parseLever(json, companyName);
}

function isLikelyFetchTimeout(error: unknown): boolean {
  const m = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return m.includes("abort") || m.includes("aborted") || m.includes("timeout") || m.includes("etimedout");
}

async function fetchJsonOnce(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATS_JOB_LIST_FETCH_MS);
  try {
    const response = await safeFetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; JobSearchTerminal/1.0; careers-board-fetch)",
      },
    });
    if (!response.ok) {
      throw new HttpStatusError(response.status);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url: string): Promise<unknown> {
  let attempt = 0;
  while (true) {
    try {
      return await fetchJsonOnce(url);
    } catch (e) {
      if (attempt < ATS_JOB_LIST_FETCH_RETRIES && isLikelyFetchTimeout(e)) {
        attempt++;
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }
      throw e;
    }
  }
}

type LaneOutcome = "ok" | "error" | "rate_limited";

/**
 * Works through one host's boards with at most `limit` requests in flight. The
 * first "too many requests" closes the lane: nothing new is sent to that host,
 * because every further request would be refused too and may lengthen the block.
 * The refused board, any others refused while in flight, and every board not yet
 * started come back as `deferred`.
 */
export async function runLane<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<LaneOutcome>,
): Promise<{ deferred: T[] }> {
  let index = 0;
  let closed = false;
  const deferred: T[] = [];

  async function next() {
    while (!closed && index < items.length) {
      const item = items[index++];
      const outcome = await task(item);
      if (outcome === "rate_limited") {
        closed = true;
        deferred.push(item);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  if (closed) deferred.push(...items.slice(index));
  return { deferred };
}

function addDedupId(map: Map<string, string[]>, key: string, id: string) {
  const existing = map.get(key);
  if (existing) existing.push(id);
  else map.set(key, [id]);
}

function stableJobId(url: string) {
  return `job-${createHash("sha1").update(url).digest("hex").slice(0, 16)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
