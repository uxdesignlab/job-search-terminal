/**
 * Core source discovery logic — runs the Common Crawl pipeline and writes
 * data/discovered-sources.json. Called from both the CLI script and the
 * Settings "Scan for new sources" server action.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { tryGetActiveProvider } from "@/lib/ai/factory";
import { safeFetch } from "@/lib/safe-fetch";
import type { AIMessage } from "@/lib/ai/provider";

export const OUTPUT_PATH = path.join(process.cwd(), "data", "discovered-sources.json");
const PORTALS_PATH = path.join(process.cwd(), "config", "portals.yml");
const CC_INDEX = "https://index.commoncrawl.org/CC-MAIN-2024-51-index";
const VALIDATE_CONCURRENCY = 10;
const VALIDATE_TIMEOUT_MS = 10_000;
const INTER_BATCH_DELAY_MS = 500;
const INDUSTRY_AI_BATCH_SIZE = 20;

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
};

export type DiscoveredSources = {
  fetchedAt: string;
  totalCrawled: number;
  entries: DiscoveredEntry[];
};

export type DiscoverySummary = {
  totalCrawled: number;
  newSlugs: number;
  valid: number;
  dead: number;
  unknown: number;
};

type CcQueryPattern = { urlPattern: string; provider: AtsProvider };

const CC_PATTERNS: CcQueryPattern[] = [
  { urlPattern: "boards.greenhouse.io/*", provider: "greenhouse" },
  { urlPattern: "job-boards.greenhouse.io/*", provider: "greenhouse" },
  { urlPattern: "jobs.lever.co/*", provider: "lever" },
  { urlPattern: "jobs.ashbyhq.com/*", provider: "ashby" },
];

// ─── CC Query ─────────────────────────────────────────────────────────────────

async function queryCcIndex(urlPattern: string): Promise<Array<{ url: string; timestamp: string }>> {
  const query = new URLSearchParams({ url: urlPattern, output: "json", limit: "1000" });
  const res = await safeFetch(`${CC_INDEX}?${query}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`CC index returned HTTP ${res.status} for ${urlPattern}`);
  const text = await res.text();
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

// ─── Slug Helpers ─────────────────────────────────────────────────────────────

function extractSlug(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    const segment = parsed.pathname.split("/").filter(Boolean)[0];
    if (!segment) return null;
    if (["jobs", "api", "v0", "v1", "boards", "postings", "job-board"].includes(segment.toLowerCase())) return null;
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

  const targets = entries.filter((e) => e.validationStatus === "valid");
  if (targets.length === 0) return out;

  onProgress?.(`Classifying industries for ${targets.length} validated sources…`);

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
    const res = await safeFetch(entry.apiUrl, { signal: controller.signal });
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

function loadExistingSlugs(): Set<string> {
  const existing = new Set<string>();
  try {
    const config = yaml.load(readFileSync(PORTALS_PATH, "utf-8")) as {
      tracked_companies?: Array<{ careers_url?: string }>;
    };
    for (const c of config.tracked_companies ?? []) {
      const url = c.careers_url ?? "";
      const match =
        url.match(/(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/) ||
        url.match(/jobs\.lever\.co\/([^/?#]+)/) ||
        url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
      if (match?.[1]) existing.add(match[1].toLowerCase());
    }
  } catch { /* portals.yml is optional */ }
  return existing;
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

export async function runSourceDiscovery(
  onProgress?: (msg: string) => void,
): Promise<DiscoverySummary> {
  const existingSlugs = loadExistingSlugs();
  const seen = new Map<string, DiscoveredEntry>();
  let totalCrawled = 0;

  for (const { urlPattern, provider } of CC_PATTERNS) {
    onProgress?.(`Querying Common Crawl for ${urlPattern}…`);
    let records: Array<{ url: string; timestamp: string }> = [];
    try {
      records = await queryCcIndex(urlPattern);
    } catch (err) {
      onProgress?.(`Warning: CC query failed for ${urlPattern}: ${(err as Error).message}`);
      continue;
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

  const candidates = [...seen.values()];
  onProgress?.(`Validating ${candidates.length} unique slugs…`);

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
    return { ...e, companyDisplayName, industry };
  });

  const output: DiscoveredSources = {
    fetchedAt: new Date().toISOString(),
    totalCrawled,
    entries: withIndustries.sort(
      (a, b) => a.provider.localeCompare(b.provider) || a.slug.localeCompare(b.slug),
    ),
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
  let totalCrawled = 0;

  for (const { query, provider } of SEARCH_PATTERNS) {
    onProgress?.(`Searching Brave: ${query}…`);
    for (let page = 0; page < BRAVE_PAGES_PER_PATTERN; page++) {
      const offset = page * BRAVE_RESULTS_PER_PAGE;
      let results: BraveSearchResult[] = [];
      try {
        results = await queryBraveSearch(braveApiKey, query, offset);
      } catch (err) {
        onProgress?.(`Warning: Brave Search failed for ${query} offset ${offset}: ${(err as Error).message}`);
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
    return { ...e, companyDisplayName, industry };
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
  };
}
