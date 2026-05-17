import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeFetch } from "@/lib/safe-fetch";
import { getBrowserBoardImportDirectory, importBrowserBoardJobs } from "./browser-board-importer";

export type AggregatorScanOptions = {
  adzunaAppId: string;
  adzunaApiKey: string;
  titles: string[];
  locations: string[];
  remotePreference: string;
  country?: string;
  titleFilters?: { positive: string[]; negative: string[] };
};

export type AggregatorScanResult = {
  status: "ok" | "error" | "no-credentials";
  imported: number;
  duplicates: number;
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

async function searchAdzuna(
  appId: string,
  apiKey: string,
  what: string,
  where: string,
  country: string,
): Promise<AdzunaJob[]> {
  const params = new URLSearchParams({
    app_id: appId,
    app_key: apiKey,
    what,
    results_per_page: "50",
    sort_by: "date",
    max_days_old: "14",
  });
  if (where) params.set("where", where);
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`;
  const res = await safeFetch(url);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("Invalid Adzuna credentials — check your App ID and API Key");
    if (res.status === 404) return [];
    throw new Error(`Adzuna API returned HTTP ${res.status}`);
  }
  const data = await res.json() as AdzunaResponse;
  return data.results ?? [];
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
    return { status: "no-credentials", imported: 0, duplicates: 0, totalFound: 0, errors: ["Adzuna App ID and API Key are required — configure them in Settings → AI Provider"], jobs: [] };
  }
  if (opts.titles.length === 0) {
    return { status: "error", imported: 0, duplicates: 0, totalFound: 0, errors: ["No target roles configured — add them in Profile"], jobs: [] };
  }

  const country = opts.country ?? "us";
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

  for (const title of opts.titles.slice(0, 5)) {
    for (const location of locations.slice(0, 3)) {
      const where = isRemoteOnly ? "remote" : location;
      onProgress?.(`Searching Adzuna: "${title}"${where ? ` in "${where}"` : ""}…`);
      try {
        const results = await searchAdzuna(opts.adzunaAppId, opts.adzunaApiKey, title, where, country);
        for (const job of results) {
          const adzunaId = String(job.id);
          if (seen.has(adzunaId)) continue;
          seen.add(adzunaId);
          // Use the stable Adzuna job page URL instead of the session-scoped redirect_url,
          // so the same job always maps to the same DB id across scan runs.
          const stableUrl = `https://www.adzuna.com/land/ad/${adzunaId}`;
          jobs.push({
            id: randomUUID(),
            company: job.company.display_name,
            position: job.title,
            jobDescription: job.description,
            url: stableUrl,
            sourceUrl: stableUrl,
            originalPostingUrl: "",
            discoveredAt: new Date(job.created).toISOString(),
            location: job.location.display_name,
            salaryNotes: formatSalary(job.salary_min, job.salary_max),
          });
        }
        onProgress?.(`Found ${results.length} jobs for "${title}"${where ? ` / "${where}"` : ""}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
        onProgress?.(`Warning: ${msg}`);
        if (msg.includes("credentials")) {
          return { status: "error", imported: 0, duplicates: 0, totalFound: 0, errors, jobs: [] };
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (jobs.length === 0) {
    return { status: "ok", imported: 0, duplicates: 0, totalFound: 0, errors, jobs: [] };
  }

  const { positive = [], negative = [] } = opts.titleFilters ?? {};
  const titleMatches = (title: string) => {
    const t = title.toLowerCase();
    const passPositive = positive.length === 0 || positive.some((k) => t.includes(k.toLowerCase()));
    const failNegative = negative.some((k) => t.includes(k.toLowerCase()));
    return passPositive && !failNegative;
  };
  const totalFound = jobs.length;
  const filteredJobs = jobs.filter((j) => titleMatches(j.position));
  const skipped = totalFound - filteredJobs.length;
  if (skipped > 0) onProgress?.(`Filtered out ${skipped} jobs that didn't match title filters`);

  if (filteredJobs.length === 0) {
    return { status: "ok", imported: 0, duplicates: 0, totalFound, errors, jobs: [] };
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
    const importResult = await importBrowserBoardJobs(finalPath);
    return {
      status: "ok",
      imported: importResult.imported,
      duplicates: importResult.duplicates,
      totalFound: jobs.length,
      errors: [...errors, ...importResult.errors],
      jobs: importResult.importedJobs.map((job) => ({ title: job.title, url: job.url, company: job.company })),
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { status: "error", imported: 0, duplicates: 0, totalFound, errors, jobs: preview };
  }
}
