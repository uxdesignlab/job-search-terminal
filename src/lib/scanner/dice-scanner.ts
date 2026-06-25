import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeFetch } from "@/lib/safe-fetch";
import { getBrowserBoardImportDirectory, importBrowserBoardJobs } from "./browser-board-importer";
import type { FreshnessWindowHours } from "@/lib/db/types";

const DICE_MCP = "https://mcp.dice.com/mcp";

export type DiceScanOptions = {
  titles: string[];
  locations: string[];
  remotePreference: string;
  titleFilters?: { positive: string[]; negative: string[] };
  freshnessWindowHours?: FreshnessWindowHours;
};

export type DiceScanResult = {
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

// ── Minimal MCP streamable-HTTP transport ─────────────────────────────────────

let _msgId = 0;
const nextId = () => ++_msgId;

type RpcMsg = { jsonrpc: "2.0"; id?: number; method: string; params?: unknown };

async function rpcPost(sessionId: string | null, msg: RpcMsg): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await safeFetch(DICE_MCP, {
    method: "POST",
    headers,
    body: JSON.stringify(msg),
  });

  // 202 Accepted = notification acknowledged, no body
  if (res.status === 202) return null;
  if (!res.ok) throw new Error(`Dice MCP returned HTTP ${res.status}`);

  const ct = res.headers.get("content-type") ?? "";
  let data: unknown;

  if (ct.includes("text/event-stream")) {
    const text = await res.text();
    // SSE streams can contain multiple events (pings, progress, then the result).
    // Collect all valid JSON-RPC data lines and pick the one matching our request id,
    // falling back to the last valid response if no id match is found.
    let lastValid: unknown;
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed && typeof parsed === "object") {
          if (msg.id !== undefined && (parsed as Record<string, unknown>).id === msg.id) {
            data = parsed;
            break;
          }
          lastValid = parsed;
        }
      } catch {
        // skip malformed lines
      }
    }
    if (data === undefined) data = lastValid;
    if (data === undefined) return null;
  } else {
    data = await res.json();
  }

  const typed = data as { error?: { message?: string }; result?: unknown };
  if (typed?.error) throw new Error(typed.error.message ?? "MCP error");
  return typed?.result;
}

async function initSession(): Promise<string | null> {
  const res = await safeFetch(DICE_MCP, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "job-search-terminal", version: "1.0.0" },
      },
    }),
  });

  const sessionId = res.headers.get("mcp-session-id");

  // Drain body to allow connection reuse
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream")) {
    await res.text();
  } else {
    await res.json().catch(() => res.text().catch(() => null));
  }

  // Send initialized notification (fire-and-forget, no response expected)
  const notifHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionId) notifHeaders["Mcp-Session-Id"] = sessionId;
  safeFetch(DICE_MCP, {
    method: "POST",
    headers: notifHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  }).catch(() => {});

  return sessionId;
}

// ── Dice job field mapping ─────────────────────────────────────────────────────

type DiceJobRaw = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pick(...vals: unknown[]): string {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return "";
}

function diceUrl(raw: DiceJobRaw): string {
  return pick(raw.detailsPageUrl, raw.applyUrl, raw.url, raw.jobUrl, raw.link, raw.href);
}

function diceSalary(raw: DiceJobRaw): string {
  const s = raw.salary ?? raw.salaryRange ?? raw.compensation ?? raw.pay;
  if (typeof s === "string") return s;
  if (typeof s === "object" && s !== null) {
    const o = s as Record<string, unknown>;
    const min = Number(o.min ?? o.minimum ?? 0);
    const max = Number(o.max ?? o.maximum ?? 0);
    if (min && max) return `$${Math.round(min / 1000)}k–$${Math.round(max / 1000)}k/yr`;
    if (min) return `$${Math.round(min / 1000)}k+/yr`;
    if (max) return `up to $${Math.round(max / 1000)}k/yr`;
  }
  return "";
}

function diceDate(raw: DiceJobRaw): string {
  const d = pick(raw.postedDate, raw.datePosted, raw.date, raw.createdAt, raw.publishedAt);
  try {
    if (d) return new Date(d).toISOString();
  } catch {
    // fall through
  }
  return new Date().toISOString();
}

type NormalizedJob = {
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
  datePosted: string;
};

function normalizeJob(raw: DiceJobRaw): NormalizedJob | null {
  const company = pick(raw.company, raw.companyName, raw.employer, raw.organizationName);
  const position = pick(raw.title, raw.jobTitle, raw.name, raw.position);
  const url = diceUrl(raw);
  if (!company || !position || !url) return null;

  const postedAt = diceDate(raw);
  return {
    id: randomUUID(),
    company,
    position,
    jobDescription: pick(raw.description, raw.jobDescription, raw.summary, raw.body),
    url,
    sourceUrl: url,
    originalPostingUrl: pick(raw.applyUrl, raw.externalUrl, raw.employerUrl, raw.originalPostingUrl),
    discoveredAt: postedAt,
    location: pick(
      (raw.jobLocation as Record<string, unknown> | null)?.displayName,
      raw.location,
      raw.locationStr,
      raw.city,
      raw.address,
    ),
    salaryNotes: diceSalary(raw),
    datePosted: postedAt,
  };
}

// ── MCP tool call ─────────────────────────────────────────────────────────────

type SearchArgs = {
  keyword: string;
  location?: string;
  workplace_types?: string[];
  employment_types?: string[];
  posted_date?: string;
  jobs_per_page?: number;
  page_number?: number;
};

type ToolResult = { content?: Array<{ type: string; text: string }>; isError?: boolean };

async function searchDice(sessionId: string | null, args: SearchArgs): Promise<DiceJobRaw[]> {
  const result = (await rpcPost(sessionId, {
    jsonrpc: "2.0",
    id: nextId(),
    method: "tools/call",
    params: { name: "search_jobs", arguments: args },
  })) as ToolResult | null;

  if (!result) return [];
  if (result.isError) throw new Error("Dice search_jobs returned an error");

  const text = result.content?.find((c) => c.type === "text")?.text ?? "[]";
  try {
    const parsed = JSON.parse(text);
    // Plain array
    if (Array.isArray(parsed)) return parsed as DiceJobRaw[];
    // Wrapped in a common envelope key
    if (parsed && typeof parsed === "object") {
      const wrapped = parsed as Record<string, unknown>;
      for (const key of ["jobs", "results", "data", "listings", "hits"]) {
        if (Array.isArray(wrapped[key])) return wrapped[key] as DiceJobRaw[];
      }
    }
    return [];
  } catch {
    return [];
  }
}

function toWorkplaceTypes(remotePreference: string): string[] {
  if (remotePreference === "remote-only") return ["Remote"];
  if (remotePreference === "local-or-remote") return ["Remote", "On-Site"];
  return ["Remote", "Hybrid", "On-Site"];
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runDiceScan(opts: DiceScanOptions): Promise<DiceScanResult> {
  if (opts.titles.length === 0) {
    return {
      status: "error", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0,
      totalFound: 0, errors: ["No target roles configured — add them in Profile"], jobs: [],
    };
  }

  const freshnessWindowHours = opts.freshnessWindowHours ?? 168;
  const scanTimestamp = new Date().toISOString();
  const wpTypes = toWorkplaceTypes(opts.remotePreference);
  const isRemoteOnly = opts.remotePreference === "remote-only";
  const locations = opts.locations.length > 0 ? opts.locations : [""];

  const jobs: NormalizedJob[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  let sessionId: string | null = null;
  try {
    sessionId = await initSession();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "error", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0,
      totalFound: 0, errors: [`Failed to connect to Dice MCP: ${msg}`], jobs: [],
    };
  }

  outer: for (const title of opts.titles.slice(0, 5)) {
    for (const loc of locations.slice(0, 3)) {
      for (let page = 1; page <= 3; page++) {
        if (jobs.length >= 50) break outer;
        try {
          const raw = await searchDice(sessionId, {
            keyword: title,
            ...(isRemoteOnly || !loc ? {} : { location: loc }),
            workplace_types: wpTypes,
            employment_types: ["FULLTIME"],
            posted_date: "SEVEN",
            jobs_per_page: 20,
            page_number: page,
          });

          if (raw.length === 0) break;

          for (const r of raw) {
            const job = normalizeJob(r);
            if (!job) continue;
            if (seen.has(job.url)) continue;
            seen.add(job.url);
            jobs.push(job);
            if (jobs.length >= 50) break outer;
          }

          await new Promise<void>((resolve) => setTimeout(resolve, 200));
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
          break;
        }
      }
    }
  }

  if (jobs.length === 0) {
    return {
      status: "ok", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0,
      totalFound: 0, errors, jobs: [],
    };
  }

  const { positive = [], negative = [] } = opts.titleFilters ?? {};
  const titleMatches = (t: string) => {
    const lower = t.toLowerCase();
    const passPos = positive.length === 0 || positive.some((k) => lower.includes(k.toLowerCase()));
    const failNeg = negative.some((k) => lower.includes(k.toLowerCase()));
    return passPos && !failNeg;
  };

  const totalFound = jobs.length;
  const filteredJobs = jobs.filter((j) => titleMatches(j.position));
  const skipped = totalFound - filteredJobs.length;

  if (filteredJobs.length === 0) {
    return {
      status: "ok", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0,
      totalFound, errors, jobs: [],
    };
  }

  const ts = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "Z");
  const filename = `dice-jobs-${ts}.json`;
  const dir = getBrowserBoardImportDirectory();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${filename}.tmp`);
  const finalPath = path.join(dir, filename);

  const payload = {
    metadata: {
      source: "dice",
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
      generatedBy: "Dice MCP Scanner v1.0",
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
    return { status: "error", imported: 0, duplicates: 0, fresh: 0, unknownDate: 0, staleFiltered: 0, totalFound, errors, jobs: preview };
  }
}
