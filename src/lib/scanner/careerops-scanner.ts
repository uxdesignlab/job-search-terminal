import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { getCustomScanSources, getJobDedupKeys, getScanSourceOverrides, getTitleFilters, insertScannedJobs, recordScanRun } from "../db/queries";
import type { ScannedJobInput, ScanRunRecord } from "../db/types";

const DEFAULT_CONFIG_PATH = "config/portals.yml";
const FALLBACK_CONFIG_PATH = "config/portals.example.yml";
const CONCURRENCY = 10;
const FETCH_TIMEOUT_MS = 30_000;

type PortalCompany = {
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

type DetectedApi = {
  type: "greenhouse" | "ashby" | "lever";
  url: string;
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
};

type ScanOptions = {
  company?: string;
  configPath?: string;
  fetcher?: (url: string) => Promise<unknown>;
  persist?: boolean;
  now?: Date;
};

export type ScanResult = ScanRunRecord & {
  jobs: ScannedJobInput[];
};

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
  const titleFilter = buildTitleFilter(effectiveFilter);
  const filterCompany = options.company?.toLowerCase();

  const sourceOverrides = persist ? getScanSourceOverrides() : {};
  const customSources = persist ? getCustomScanSources() : [];

  // Merge YAML companies with custom DB sources (custom sources with matching name override YAML)
  const yamlNames = new Set(companies.map((c) => c.name));
  const mergedCompanies = [
    ...companies,
    ...customSources
      .filter((c) => !yamlNames.has(c.name))
      .map((c) => ({ name: c.name, careers_url: c.careersUrl, api: c.api, enabled: c.enabled }))
  ];

  const enabledCompanies = mergedCompanies.filter((company) => {
    if (company.name in sourceOverrides) return sourceOverrides[company.name];
    return company.enabled !== false;
  });
  const targets = enabledCompanies
    .filter((company) => !filterCompany || company.name.toLowerCase().includes(filterCompany))
    .map((company) => ({ ...company, _api: detectApi(company) }))
    .filter((company): company is ScanTarget => company._api !== null);

  const skippedCompanies = enabledCompanies.length - targets.length;
  const dedup = getJobDedupKeys();
  const date = startedAt.slice(0, 10);
  const newJobs: ScannedJobInput[] = [];
  const errors: ScanError[] = [];
  let totalJobsFound = 0;
  let filteredCount = 0;
  let duplicateCount = 0;

  const tasks = targets.map((company) => async () => {
    try {
      const json = await fetcher(company._api.url);
      const jobs = parseJobs(company._api.type, json, company.name);
      totalJobsFound += jobs.length;

      for (const job of jobs) {
        if (!job.title || !job.url) {
          filteredCount++;
          continue;
        }

        if (!titleFilter(job.title)) {
          filteredCount++;
          continue;
        }

        const companyRoleKey = `${job.company.toLowerCase()}::${job.title.toLowerCase()}`;
        if (dedup.urls.has(job.url) || dedup.companyRoles.has(companyRoleKey)) {
          duplicateCount++;
          continue;
        }

        dedup.urls.add(job.url);
        dedup.companyRoles.add(companyRoleKey);
        newJobs.push({
          id: stableJobId(job.url),
          company: job.company,
          title: job.title,
          url: job.url,
          source: `${company._api.type}-api`,
          location: job.location || "Not specified",
          datePosted: job.datePosted,
          firstSeenDate: date
        });
      }
    } catch (error) {
      let message = error instanceof Error ? error.message : "Unknown scanner error";
      if (message === "This operation was aborted" || message === "The operation was aborted." || message.toLowerCase().includes("abort")) {
        message = `Fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s — the careers API may be slow or down`;
      }
      errors.push({ company: company.name, error: message });
    }
  });

  await parallelFetch(tasks, CONCURRENCY);

  const insertedCount = persist ? insertScannedJobs(newJobs) : newJobs.length;
  const completedAt = new Date().toISOString();
  const run: ScanRunRecord = {
    id: `scan-${Date.now()}`,
    status: errors.length > 0 ? "completed_with_errors" : "completed",
    startedAt,
    completedAt,
    companiesScanned: targets.length,
    skippedCompanies,
    totalJobsFound,
    filteredCount,
    duplicateCount: duplicateCount + (newJobs.length - insertedCount),
    newJobsCount: insertedCount,
    errors
  };

  if (persist) {
    recordScanRun(run);
  }

  return {
    ...run,
    jobs: newJobs
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
  const yamlNames = new Set(companies.map((c) => c.name));
  const mergedCompanies = [
    ...companies,
    ...customSources
      .filter((c) => !yamlNames.has(c.name))
      .map((c) => ({ name: c.name, careers_url: c.careersUrl, api: c.api, enabled: c.enabled }))
  ];
  const company = mergedCompanies.find((c) => c.name === name);
  if (company) {
    if (name in sourceOverrides) return sourceOverrides[name];
    return company.enabled !== false;
  }
  if (name in sourceOverrides) return sourceOverrides[name];
  return true;
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

export function buildTitleFilter(titleFilter: ScanConfig["title_filter"]) {
  const positive = (titleFilter?.positive ?? []).map((keyword) => keyword.toLowerCase());
  const negative = (titleFilter?.negative ?? []).map((keyword) => keyword.toLowerCase());

  return (title: string) => {
    const normalized = title.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some((keyword) => normalized.includes(keyword));
    const hasNegative = negative.some((keyword) => normalized.includes(keyword));
    return hasPositive && !hasNegative;
  };
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
      datePosted: stringValue(record.publishedDate) || null
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

function parseJobs(type: DetectedApi["type"], json: unknown, companyName: string) {
  if (type === "greenhouse") return parseGreenhouse(json, companyName);
  if (type === "ashby") return parseAshby(json, companyName);
  return parseLever(json, companyName);
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function parallelFetch(tasks: Array<() => Promise<void>>, limit: number) {
  let index = 0;

  async function next() {
    while (index < tasks.length) {
      const task = tasks[index++];
      await task();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
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
