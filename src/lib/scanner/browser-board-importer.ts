import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  getJobDedupKeys,
  insertBrowserBoardJobs,
  logActivity,
  recordScanRun,
  type BrowserBoardJobInput
} from "@/lib/db/queries";
import type { BrowserBoardScanFile, FreshnessWindowHours, ImportResult } from "@/lib/db/types";
import {
  BROWSER_BOARD_SOURCES,
  browserBoardSourceLabel,
  browserBoardSourceToScanType,
  type BrowserBoardSource,
  isBrowserBoardSource
} from "./browser-board-sources";
import { localDateString } from "@/lib/dates";
import { classifyFreshness } from "./freshness";

const GENERIC_IMPORT_DIR = path.join(process.cwd(), "data", "job-board-imports");
const LINKEDIN_IMPORT_DIR = path.join(process.cwd(), "data", "linkedin-imports");
const BROWSER_BOARD_FRESHNESS_WINDOW_HOURS: FreshnessWindowHours = 168;

type RawBrowserBoardJob = BrowserBoardScanFile["jobs"][number];

export type NormalizedBrowserBoardScan = {
  source: BrowserBoardSource;
  metadata: BrowserBoardScanFile["metadata"];
  jobs: RawBrowserBoardJob[];
};

type PrepareOptions = {
  now?: Date;
  dedup?: ReturnType<typeof getJobDedupKeys>;
  freshnessWindowHours?: FreshnessWindowHours;
};

export function getBrowserBoardImportDirectory(): string {
  return GENERIC_IMPORT_DIR;
}

export function getLinkedInImportDirectory(): string {
  return LINKEDIN_IMPORT_DIR;
}

export function ensureBrowserBoardImportDirectories(): void {
  for (const dir of [GENERIC_IMPORT_DIR, LINKEDIN_IMPORT_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

export function parseBrowserBoardScanFile(raw: unknown, fallbackSource?: BrowserBoardSource): NormalizedBrowserBoardScan {
  if (!isRecord(raw) || !isRecord(raw.metadata) || !Array.isArray(raw.jobs)) {
    throw new Error("Invalid file structure: missing metadata or jobs array.");
  }

  const source = isBrowserBoardSource(raw.metadata.source) ? raw.metadata.source : fallbackSource;
  if (!source) {
    throw new Error(`Invalid file structure: metadata.source must be one of: ${BROWSER_BOARD_SOURCES.join(", ")}.`);
  }

  return {
    source,
    metadata: {
      source,
      scanTimestamp: stringValue(raw.metadata.scanTimestamp) || new Date().toISOString(),
      scanDurationSeconds: numberValue(raw.metadata.scanDurationSeconds),
      totalJobsDiscovered: numberValue(raw.metadata.totalJobsDiscovered),
      totalJobsValid: optionalNumberValue(raw.metadata.totalJobsValid),
      totalJobsSkipped: optionalNumberValue(raw.metadata.totalJobsSkipped),
      searchCriteria: isRecord(raw.metadata.searchCriteria) ? raw.metadata.searchCriteria : {},
      generatedBy: stringValue(raw.metadata.generatedBy) || undefined
    },
    jobs: raw.jobs.filter(isRecord) as RawBrowserBoardJob[]
  };
}

export function prepareBrowserBoardJobs(
  scan: NormalizedBrowserBoardScan,
  options: PrepareOptions = {}
): { jobs: BrowserBoardJobInput[]; skipped: number; duplicates: number; fresh: number; unknownDate: number; staleFiltered: number } {
  const dedup = options.dedup ?? getJobDedupKeys();
  const firstSeenDate = localDateString(options.now ?? new Date());
  const jobs: BrowserBoardJobInput[] = [];
  let skipped = 0;
  let duplicates = 0;
  let fresh = 0;
  let unknownDate = 0;
  let staleFiltered = 0;

  for (const raw of scan.jobs) {
    const company = stringValue(raw.company).trim();
    const title = (stringValue(raw.position) || stringValue(raw.title)).trim();
    const sourceUrl = normalizeUrl(
      stringValue(raw.sourceUrl) || stringValue(raw.platformUrl) || stringValue(raw.url)
    );
    const externalUrl = normalizeUrl(
      stringValue(raw.originalPostingUrl) || stringValue(raw.externalApplyUrl) || stringValue(raw.applyUrl)
    );
    const url = externalUrl || sourceUrl;

    if (!company || !title || !url) {
      skipped++;
      continue;
    }
    const datePosted = stringValue(raw.datePosted) || null;
    const freshness = classifyFreshness(datePosted, options.freshnessWindowHours ?? BROWSER_BOARD_FRESHNESS_WINDOW_HOURS, options.now);
    if (freshness === "stale") {
      staleFiltered++;
      continue;
    }
    if (freshness === "unknown-date") unknownDate++;
    else fresh++;

    const location = (stringValue(raw.location) || "Not specified").trim();
    const originalPostingUrl = externalUrl;
    const originalPostingKey = buildOriginalPostingKey({
      source: scan.source,
      sourceUrl,
      originalPostingUrl,
      explicitKey: isRecord(raw.dataQuality) ? stringValue(raw.dataQuality.originalPostingKey) : ""
    });
    const duplicateOf = findDuplicateIds({
      dedup,
      url,
      originalPostingUrl,
      originalPostingKey,
      company,
      title,
      location
    });
    const isDuplicate = duplicateOf.length > 0;

    if (isDuplicate) duplicates++;

    addDedupKeys({ dedup, id: stableJobId(scan.source, sourceUrl || url), url, originalPostingUrl, originalPostingKey, company, title, location });

    const rawDescription = (stringValue(raw.jobDescription) || stringValue(raw.description)).trim();

    jobs.push({
      id: stableJobId(scan.source, sourceUrl || url),
      company,
      title,
      url,
      sourceUrl: sourceUrl || url,
      originalPostingUrl,
      originalPostingKey,
      source: browserBoardSourceToScanType(scan.source),
      location,
      rawDescription,
      datePosted,
      firstSeenDate: (stringValue(raw.discoveredAt) ? localDateString(new Date(stringValue(raw.discoveredAt)!)) : null) || firstSeenDate,
      salaryNotes: stringValue(raw.salaryNotes) || "Not captured by scanner.",
      isDuplicate,
      duplicateOf: isDuplicate ? duplicateOf : null,
      reviewStatus: rawDescription.length < 100 ? "pending_review" : "none"
    });
  }

  return { jobs, skipped, duplicates, fresh, unknownDate, staleFiltered };
}

export async function importBrowserBoardJobs(
  jsonFilePath: string,
  options: { source?: BrowserBoardSource; freshnessWindowHours?: FreshnessWindowHours } = {}
): Promise<ImportResult> {
  const scanRunId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

  let scan: NormalizedBrowserBoardScan;
  try {
    scan = parseBrowserBoardScanFile(JSON.parse(readFileSync(jsonFilePath, "utf-8")), options.source);
  } catch (e) {
    return {
      success: false,
      imported: 0,
      duplicates: 0,
      fresh: 0,
      unknownDate: 0,
      staleFiltered: 0,
      errors: [String(e)],
      summary: "Failed to parse job board import file.",
      jobIds: [],
      importedJobs: [],
      scanRunId
    };
  }

  const freshnessWindowHours = options.freshnessWindowHours ?? BROWSER_BOARD_FRESHNESS_WINDOW_HOURS;
  const prepared = prepareBrowserBoardJobs(scan, { freshnessWindowHours });
  const { inserted, jobIds } = insertBrowserBoardJobs(prepared.jobs);
  const insertedJobIds = new Set(jobIds);
  const importedJobs = prepared.jobs
    .filter((job) => insertedJobIds.has(job.id))
    .map((job) => ({ id: job.id, title: job.title, url: job.url, company: job.company }));

  try {
    archiveImportFile(jsonFilePath);
  } catch (e) {
    errors.push(`Archive failed (file left in place): ${String(e)}`);
  }

  const completedAt = new Date().toISOString();
  recordScanRun({
    id: scanRunId,
    status: errors.length > 0 ? "completed_with_errors" : "completed",
    startedAt,
    completedAt,
    companiesScanned: 0,
    skippedCompanies: 0,
    totalJobsFound: scan.metadata.totalJobsDiscovered || scan.jobs.length,
    filteredCount: prepared.skipped,
    duplicateCount: prepared.duplicates,
    newJobsCount: inserted,
    errors: errors.map((e) => ({ company: scan.source, error: e })),
    scanType: browserBoardSourceToScanType(scan.source),
    freshnessWindowHours,
    freshCount: prepared.fresh,
    unknownDateCount: prepared.unknownDate,
    staleFilteredCount: prepared.staleFiltered
  });

  const label = browserBoardSourceLabel(scan.source);
  logActivity(
    "browser-board-import",
    scanRunId,
    `${label} scan imported ${inserted} new jobs (${prepared.duplicates} duplicates)`,
    { inserted, duplicateCount: prepared.duplicates, skipped: prepared.skipped, source: scan.source }
  );

  const s = inserted !== 1 ? "s" : "";
  const ds = prepared.duplicates !== 1 ? "s" : "";
  const summary = `Imported ${inserted} ${label} job${s}. ${prepared.duplicates} duplicate${ds} detected.`;

  return {
    success: true,
    imported: inserted,
    duplicates: prepared.duplicates,
    fresh: prepared.fresh,
    unknownDate: prepared.unknownDate,
    staleFiltered: prepared.staleFiltered,
    errors,
    summary,
    jobIds,
    importedJobs,
    scanRunId
  };
}

function archiveImportFile(jsonFilePath: string) {
  const today = localDateString();
  const archiveDir = path.join(path.dirname(jsonFilePath), "archive", today);
  mkdirSync(archiveDir, { recursive: true });
  const dest = path.join(archiveDir, path.basename(jsonFilePath));
  try {
    renameSync(jsonFilePath, dest);
  } catch {
    copyFileSync(jsonFilePath, dest);
    unlinkSync(jsonFilePath);
  }
}

function findDuplicateIds(input: {
  dedup: ReturnType<typeof getJobDedupKeys>;
  url: string;
  originalPostingUrl: string;
  originalPostingKey: string;
  company: string;
  title: string;
  location: string;
}) {
  const ids = new Set<string>();
  for (const id of input.dedup.originalPostingKeyToIds.get(input.originalPostingKey) ?? []) ids.add(id);
  for (const id of input.dedup.urlToIds.get(input.url) ?? []) ids.add(id);
  for (const id of input.dedup.urlToIds.get(input.originalPostingUrl) ?? []) ids.add(id);
  const companyRoleLocation = `${input.company.toLowerCase()}::${input.title.toLowerCase()}::${input.location.toLowerCase()}`;
  for (const id of input.dedup.companyRoleLocationToIds.get(companyRoleLocation) ?? []) ids.add(id);
  return [...ids];
}

function addDedupKeys(input: {
  dedup: ReturnType<typeof getJobDedupKeys>;
  id: string;
  url: string;
  originalPostingUrl: string;
  originalPostingKey: string;
  company: string;
  title: string;
  location: string;
}) {
  input.dedup.urls.add(input.url);
  if (input.originalPostingUrl) input.dedup.urls.add(input.originalPostingUrl);
  input.dedup.companyRoles.add(`${input.company.toLowerCase()}::${input.title.toLowerCase()}`);
  input.dedup.companyRoleLocations.add(`${input.company.toLowerCase()}::${input.title.toLowerCase()}::${input.location.toLowerCase()}`);
  addMapValue(input.dedup.urlToIds, input.url, input.id);
  addMapValue(input.dedup.urlToIds, input.originalPostingUrl, input.id);
  addMapValue(input.dedup.originalPostingKeyToIds, input.originalPostingKey, input.id);
  addMapValue(
    input.dedup.companyRoleLocationToIds,
    `${input.company.toLowerCase()}::${input.title.toLowerCase()}::${input.location.toLowerCase()}`,
    input.id
  );
}

function addMapValue(map: Map<string, string[]>, key: string, value: string) {
  if (!key) return;
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function buildOriginalPostingKey(input: {
  source: BrowserBoardSource;
  sourceUrl: string;
  originalPostingUrl: string;
  explicitKey: string;
}) {
  if (input.explicitKey) return input.explicitKey.trim().toLowerCase();
  const canonicalUrl = input.originalPostingUrl || input.sourceUrl;
  const atsKey = atsPostingKey(canonicalUrl);
  if (atsKey) return atsKey;

  const platformId = platformPostingId(input.source, input.sourceUrl || canonicalUrl);
  if (platformId) return `${input.source}:${platformId}`;

  return `${input.source}:${canonicalUrl}`;
}

function atsPostingKey(rawUrl: string) {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);

    if (host.includes("greenhouse.io")) {
      const jobsIndex = segments.indexOf("jobs");
      if (jobsIndex > 0 && segments[jobsIndex + 1]) return `greenhouse:${segments[jobsIndex - 1]}:${segments[jobsIndex + 1]}`;
    }

    if (host === "jobs.lever.co" && segments.length >= 2) {
      return `lever:${segments[0]}:${segments[1]}`;
    }

    if (host === "jobs.ashbyhq.com" && segments.length >= 2) {
      return `ashby:${segments[0]}:${segments[1]}`;
    }
  } catch {
    return "";
  }

  return "";
}

function platformPostingId(source: BrowserBoardSource, rawUrl: string) {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    if (source === "wellfound") {
      const jobsIndex = segments.indexOf("jobs");
      return jobsIndex >= 0 ? segments[jobsIndex + 1] ?? "" : "";
    }
    if (source === "workatastartup") {
      const jobsIndex = segments.indexOf("jobs");
      return jobsIndex >= 0 ? segments[jobsIndex + 1] ?? "" : "";
    }
    if (source === "linkedin") {
      const viewIndex = segments.indexOf("view");
      return viewIndex >= 0 ? segments[viewIndex + 1] ?? "" : "";
    }
    if (source === "glassdoor") {
      const jobListing = segments.find((segment) => /(?:^|-)JV_[A-Z0-9]+/i.test(segment));
      return jobListing || segments.at(-1) || "";
    }
    if (source === "indeed") {
      return url.searchParams.get("jk") || url.searchParams.get("vjk") || segments.at(-1) || "";
    }
    if (source === "monster") {
      const jobIndex = segments.findIndex((segment) => segment === "job-openings" || segment === "jobs");
      return jobIndex >= 0 ? segments[jobIndex + 1] ?? segments.at(-1) ?? "" : segments.at(-1) ?? "";
    }
  } catch {
    return "";
  }
  return "";
}

function stableJobId(source: BrowserBoardSource, url: string): string {
  const prefix =
    source === "linkedin"
      ? "li"
      : source === "wellfound"
        ? "wf"
        : source === "workatastartup"
          ? "was"
          : source === "glassdoor"
            ? "gd"
            : source === "indeed"
              ? "ind"
              : source === "adzuna"
                ? "adz"
                : "mon";
  const stableInput = source === "linkedin" ? url : `${source}:${url}`;
  return `${prefix}-${createHash("sha1").update(stableInput).digest("hex").slice(0, 16)}`;
}

function normalizeUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
