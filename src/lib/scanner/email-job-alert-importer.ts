import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { importBrowserBoardJobs } from "./browser-board-importer";
import {
  getTitleFilters,
  getUserProfile,
  logActivity,
  saveEmailImportEvidence,
  savePendingEmailCandidates,
  type EmailImportEvidenceInput,
} from "@/lib/db/queries";
import { localDateString } from "@/lib/dates";
import type { BrowserBoardScanFile, ImportResult, PendingEmailJobCandidate, PendingEmailJobCandidateInput } from "@/lib/db/types";

const EMAIL_IMPORT_DIR = path.join(process.cwd(), "data", "email-job-alert-imports");
const MAX_JOBS_PER_EMAIL = 50;
const MIN_DESCRIPTION_LENGTH = 100;
const GENERIC_LINK_RE = /(unsubscribe|preferences|settings|privacy|terms|login|signin|sign-in|account|notification|view.?email|manage.?alert|tracking|pixel)/i;
const NON_JOB_TITLE_RE = /\b(job alert|jobs?\s+(?:since|for|matching|near|in|from|you may like)|saved search|recommended jobs?|new jobs?)\b/i;
const ROLE_RE = /\b(ux|ui|user experience|product|design|designer|director|head|lead|principal|staff|senior|manager|research|scientist|engineer|architect|strategy|strategic|operations|program)\b/i;
const LOCATION_RE = /\b(remote|united states|usa|u\.s\.|nashville|new york|san francisco|austin|chicago|seattle|boston|los angeles|denver|atlanta|dallas|tn|ca|ny|tx|il|wa|ma|co|ga)\b/i;

export type ParsedEmailJobCandidate = {
  id: string;
  company: string;
  position: string;
  location: string;
  jobDescription: string;
  sourceUrl: string;
  originalPostingUrl: string;
  url: string;
  discoveredAt: string;
  salaryNotes: string;
  postingResolutionStatus: "resolved" | "needs_resolution";
  postingSearchQuery: string;
  candidateLinks: string[];
  snippet: string;
  confidence: "high" | "medium" | "low";
  extractionNotes: string;
};

export type ParsedEmailJobAlert = {
  metadata: {
    subject: string;
    from: string;
    date: string;
    sourceFilename: string;
  };
  candidates: ParsedEmailJobCandidate[];
  skippedByNegativeFilter: number;
};

type EmailParts = {
  subject: string;
  from: string;
  date: string;
  text: string;
  html: string;
};

export function getEmailJobAlertImportDirectory(): string {
  return EMAIL_IMPORT_DIR;
}

export function getApprovedEmailJobImportDirectory(): string {
  return path.join(EMAIL_IMPORT_DIR, "approved-imports");
}

export function ensureEmailJobAlertImportDirectory(): void {
  if (!existsSync(EMAIL_IMPORT_DIR)) mkdirSync(EMAIL_IMPORT_DIR, { recursive: true });
}

export async function importEmailJobAlertFile(filePath: string): Promise<{ pending: number; skipped: number }> {
  const titleFilters = getTitleFilters();
  const profile = getUserProfile();
  const parsed = parseEmailJobAlertFile(filePath, titleFilters.negative);
  const filename = path.basename(filePath);

  if (parsed.candidates.length === 0) {
    archiveEmailSourceFile(filePath);
    logActivity("email-job-alert-import", filename, "Email job alert had no importable candidates after filters", {
      skippedByNegativeFilter: parsed.skippedByNegativeFilter,
      subject: parsed.metadata.subject,
    });
    return { pending: 0, skipped: parsed.skippedByNegativeFilter };
  }

  const batchId = `email-batch-${createHash("sha1").update(`${filename}:${parsed.metadata.date}`).digest("hex").slice(0, 16)}`;
  const pendingCandidates: PendingEmailJobCandidateInput[] = parsed.candidates.map((candidate) => ({
    ...candidate,
    batchId,
    emailSubject: parsed.metadata.subject,
    emailFrom: parsed.metadata.from,
    emailDate: parsed.metadata.date,
    sourceFilename: filename,
    jobDescription: candidate.jobDescription,
    titleMatch: scoreTitleMatch(candidate.position, profile.targetRoles, titleFilters.positive),
  }));

  savePendingEmailCandidates(pendingCandidates);
  archiveEmailSourceFile(filePath);
  logActivity("email-job-alert-import", filename, `Queued ${pendingCandidates.length} candidates for approval`, {
    skippedByNegativeFilter: parsed.skippedByNegativeFilter,
    subject: parsed.metadata.subject,
    batchId,
  });

  return { pending: pendingCandidates.length, skipped: parsed.skippedByNegativeFilter };
}

export async function importApprovedEmailCandidates(candidates: PendingEmailJobCandidate[]): Promise<ImportResult> {
  if (candidates.length === 0) {
    return {
      success: true,
      imported: 0,
      duplicates: 0,
      fresh: 0,
      unknownDate: 0,
      staleFiltered: 0,
      errors: [],
      summary: "No candidates to import.",
      jobIds: [],
      importedJobs: [],
      scanRunId: `email-${randomUUID()}`,
    };
  }

  const jsonPath = writeApprovedCandidatesJson(candidates);
  const result = await importBrowserBoardJobs(jsonPath);
  const importedIds = new Set(result.jobIds);

  const evidence = candidates
    .filter((c) => importedIds.has(c.id))
    .map((c): EmailImportEvidenceInput => ({
      id: `email-evidence-${createHash("sha1").update(`${c.id}:${c.sourceFilename}`).digest("hex").slice(0, 16)}`,
      jobId: c.id,
      sourceFilename: c.sourceFilename,
      emailSubject: c.emailSubject,
      emailFrom: c.emailFrom,
      emailDate: c.emailDate,
      extractedSnippet: c.snippet,
      candidateLinks: c.candidateLinks,
      confidence: c.confidence,
      extractionNotes: c.extractionNotes,
    }));
  saveEmailImportEvidence(evidence);

  return result;
}

function scoreTitleMatch(position: string, targetRoles: string[], positiveFilters: string[]): "good" | "weak" | "unknown" {
  if (targetRoles.length === 0 && positiveFilters.length === 0) return "unknown";
  const normalized = position.toLowerCase();
  const matchesTarget = targetRoles.some((role) => {
    const r = role.toLowerCase();
    return normalized.includes(r) || r.includes(normalized.split(/\s+/).slice(0, 3).join(" "));
  });
  if (matchesTarget) return "good";
  const matchesPositive = positiveFilters.some((f) => f && normalized.includes(f.toLowerCase()));
  if (matchesPositive) return "good";
  return "weak";
}

function writeApprovedCandidatesJson(candidates: PendingEmailJobCandidate[]): string {
  const ts = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "Z");
  const filename = `email-jobs-${ts}.json`;
  const dir = getApprovedEmailJobImportDirectory();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `${filename}.tmp`);
  const finalPath = path.join(dir, filename);

  const payload: BrowserBoardScanFile = {
    metadata: {
      source: "email",
      scanTimestamp: new Date().toISOString(),
      scanDurationSeconds: 1,
      totalJobsDiscovered: candidates.length,
      totalJobsValid: candidates.length,
      totalJobsSkipped: 0,
      searchCriteria: {
        emailSubject: candidates[0]?.emailSubject ?? "",
        emailFrom: candidates[0]?.emailFrom ?? "",
      },
      generatedBy: "Email Job Alert Importer v1.0",
    },
    jobs: candidates.map((c) => ({
      id: c.id,
      company: c.company,
      position: c.position,
      jobDescription: c.jobDescription,
      url: c.url,
      sourceUrl: c.sourceUrl,
      originalPostingUrl: c.originalPostingUrl,
      discoveredAt: c.discoveredAt,
      location: c.location,
      salaryNotes: c.salaryNotes,
      postingResolutionStatus: c.postingResolutionStatus,
      postingSearchQuery: c.postingSearchQuery,
      dataQuality: {
        hasCompany: Boolean(c.company),
        hasPosition: Boolean(c.position),
        hasDescription: c.jobDescription.length >= 100,
        hasUrl: c.postingResolutionStatus === "resolved",
        descriptionLength: c.jobDescription.length,
        warnings: c.extractionNotes ? [c.extractionNotes] : [],
      },
    })),
  };

  writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  renameSync(tmpPath, finalPath);
  return finalPath;
}

export function parseEmailJobAlertFile(filePath: string, negativeTitleFilters: string[] = []): ParsedEmailJobAlert {
  const raw = readFileSync(filePath, "utf-8");
  const ext = path.extname(filePath).toLowerCase();
  const parts =
    ext === ".eml"
      ? parseEml(raw)
      : {
        subject: path.basename(filePath),
        from: "",
        date: "",
        text: ext === ".html" || /<html|<body|<a\s/i.test(raw) ? "" : raw,
        html: ext === ".html" || /<html|<body|<a\s/i.test(raw) ? raw : "",
      };

  const bodyText = normalizeText(parts.text || htmlToText(parts.html));
  const htmlLinks = extractHtmlLinks(parts.html);
  const textLinks = extractUrls(bodyText);
  const links = unique([...htmlLinks, ...textLinks].map(unwrapRedirectUrl).filter(isRelevantEmailJobLink));
  const lines = normalizeLines([parts.subject, bodyText].filter(Boolean).join("\n"));
  const candidates = extractCandidates({
    lines,
    links,
    receivedAt: parseDateOrNow(parts.date),
    negativeTitleFilters,
  });

  return {
    metadata: {
      subject: decodeMimeWords(parts.subject),
      from: parts.from,
      date: parts.date,
      sourceFilename: path.basename(filePath),
    },
    candidates,
    skippedByNegativeFilter: candidatesSkippedByNegativeFilter(lines, negativeTitleFilters),
  };
}

function archiveEmailSourceFile(filePath: string): void {
  const today = localDateString();
  const archiveDir = path.join(path.dirname(filePath), "archive", today);
  mkdirSync(archiveDir, { recursive: true });
  const dest = uniqueArchivePath(path.join(archiveDir, path.basename(filePath)));
  try {
    renameSync(filePath, dest);
  } catch {
    copyFileSync(filePath, dest);
    unlinkSync(filePath);
  }
}

function uniqueArchivePath(dest: string): string {
  if (!existsSync(dest)) return dest;
  const parsed = path.parse(dest);
  for (let i = 1; i < 1000; i++) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${i}${parsed.ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  return path.join(parsed.dir, `${parsed.name}-${Date.now()}${parsed.ext}`);
}

function extractCandidates(input: {
  lines: string[];
  links: string[];
  receivedAt: string;
  negativeTitleFilters: string[];
}): ParsedEmailJobCandidate[] {
  const candidates: ParsedEmailJobCandidate[] = [];
  const usedKeys = new Set<string>();
  const linkQueue = [...input.links];

  const pushCandidate = (raw: { title: string; company: string; location?: string; snippet: string; link?: string }) => {
    const title = cleanTitle(raw.title);
    const company = cleanCompany(raw.company);
    if (!title || !company || title.length < 3 || company.length < 2) return;
    if (!ROLE_RE.test(title)) return;
    if (isNonJobTitle(title)) return;
    if (matchesNegativeFilter(title, input.negativeTitleFilters)) return;
    const key = `${title.toLowerCase()}::${company.toLowerCase()}::${(raw.location ?? "").toLowerCase()}`;
    if (usedKeys.has(key)) return;
    usedKeys.add(key);

    const directLink = raw.link && isActualJobPostingUrl(raw.link) ? raw.link : linkQueue.find(isActualJobPostingUrl) ?? "";
    if (directLink) {
      const index = linkQueue.indexOf(directLink);
      if (index >= 0) linkQueue.splice(index, 1);
    }
    const unresolvedId = createHash("sha1").update(`${company}:${title}:${raw.location ?? ""}:${raw.snippet}`).digest("hex").slice(0, 16);
    const localUrl = `email-alert://job/${unresolvedId}`;
    const status = directLink ? "resolved" : "needs_resolution";
    const sourceUrl = directLink || localUrl;
    const id = stableEmailJobId(sourceUrl);
    const location = cleanLocation(raw.location || inferLocation(raw.snippet) || "Not specified");
    const snippet = trimSnippet(raw.snippet);
    const searchQuery = [company, title, location, "job"].filter(Boolean).join(" ");

    candidates.push({
      id,
      company,
      position: title,
      location,
      jobDescription: snippet.length >= MIN_DESCRIPTION_LENGTH ? snippet : "",
      sourceUrl,
      originalPostingUrl: directLink,
      url: directLink || localUrl,
      discoveredAt: input.receivedAt,
      salaryNotes: extractSalary(raw.snippet),
      postingResolutionStatus: status,
      postingSearchQuery: searchQuery,
      candidateLinks: directLink ? unique([directLink, ...input.links].slice(0, 10)) : input.links.slice(0, 10),
      snippet,
      confidence: directLink ? "high" : "low",
      extractionNotes: directLink ? "Direct posting link extracted from email." : "Email mentioned a role but no direct posting URL was found.",
    });
  };

  for (let i = 0; i < input.lines.length && candidates.length < MAX_JOBS_PER_EMAIL; i++) {
    const line = input.lines[i];
    const next = input.lines[i + 1] ?? "";
    const third = input.lines[i + 2] ?? "";
    const link = [...extractUrls(line), ...extractUrls(next)].map(unwrapRedirectUrl).find(isActualJobPostingUrl);

    const atMatch = line.match(/^(.+?)\s+(?:at|@)\s+([^|,;]+)(?:[,|;-]\s*(.+))?$/i);
    if (atMatch) {
      pushCandidate({
        title: atMatch[1],
        company: atMatch[2],
        location: atMatch[3],
        snippet: [line, next, third].filter(Boolean).join("\n"),
        link,
      });
      continue;
    }

    const hasJobMatch = line.match(/^(.+?)\s+has\s+(.+?)\s+job\s+in\s+(.+)$/i);
    if (hasJobMatch) {
      pushCandidate({
        title: hasJobMatch[2],
        company: hasJobMatch[1],
        location: hasJobMatch[3],
        snippet: [line, next, third].filter(Boolean).join("\n"),
        link,
      });
      continue;
    }

    if (looksLikeTitle(line) && looksLikeCompany(next)) {
      const location = LOCATION_RE.test(third) ? third : "";
      pushCandidate({
        title: line,
        company: next,
        location,
        snippet: [line, next, third, input.lines[i + 3] ?? ""].filter(Boolean).join("\n"),
        link,
      });
    }
  }

  return candidates;
}

function parseEml(raw: string): EmailParts {
  const normalized = raw.replace(/\r\n/g, "\n");
  const splitIndex = normalized.search(/\n\n/);
  const headerText = splitIndex >= 0 ? normalized.slice(0, splitIndex) : "";
  const body = splitIndex >= 0 ? normalized.slice(splitIndex + 2) : normalized;
  const headers = parseHeaders(headerText);
  const contentType = headers.get("content-type") ?? "";
  const boundary = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  const bodyParts = boundary ? parseMultipartBody(body, boundary) : [{ headers: new Map<string, string>(), body }];
  let text = "";
  let html = "";

  for (const part of bodyParts) {
    const type = part.headers.get("content-type") ?? "";
    const decoded = decodeTransfer(part.body, part.headers.get("content-transfer-encoding") ?? "");
    if (/text\/html/i.test(type)) html += `\n${decoded}`;
    else if (/text\/plain/i.test(type) || !type) text += `\n${decoded}`;
  }

  return {
    subject: decodeMimeWords(headers.get("subject") ?? ""),
    from: headers.get("from") ?? "",
    date: headers.get("date") ?? "",
    text,
    html,
  };
}

function parseMultipartBody(body: string, boundary: string): Array<{ headers: Map<string, string>; body: string }> {
  const marker = `--${boundary}`;
  const parts = body.split(marker).filter((part) => part.trim() && !part.trim().startsWith("--"));
  return parts.flatMap((part) => {
    const trimmed = part.replace(/^\n/, "").replace(/\n$/, "");
    const splitIndex = trimmed.search(/\n\n/);
    if (splitIndex < 0) return [{ headers: new Map<string, string>(), body: trimmed }];
    const headers = parseHeaders(trimmed.slice(0, splitIndex));
    const nestedBoundary = headers.get("content-type")?.match(/boundary="?([^";]+)"?/i)?.[1];
    const nestedBody = trimmed.slice(splitIndex + 2);
    return nestedBoundary ? parseMultipartBody(nestedBody, nestedBoundary) : [{ headers, body: nestedBody }];
  });
}

function parseHeaders(headerText: string): Map<string, string> {
  const headers = new Map<string, string>();
  let current = "";
  for (const line of headerText.split("\n")) {
    if (/^\s/.test(line) && current) {
      current += ` ${line.trim()}`;
      continue;
    }
    if (current) addHeader(headers, current);
    current = line;
  }
  if (current) addHeader(headers, current);
  return headers;
}

function addHeader(headers: Map<string, string>, line: string): void {
  const index = line.indexOf(":");
  if (index < 0) return;
  headers.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
}

function decodeTransfer(body: string, encoding: string): string {
  const normalized = encoding.toLowerCase();
  try {
    if (normalized.includes("base64")) return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf-8");
    if (normalized.includes("quoted-printable")) return decodeQuotedPrintable(body);
  } catch {
    return body;
  }
  return body;
}

function decodeQuotedPrintable(value: string): string {
  const softBreaksRemoved = value.replace(/=\n/g, "");
  return softBreaksRemoved.replace(/=([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeMimeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (_, charset: string, enc: string, payload: string) => {
    try {
      const buffer = enc.toLowerCase() === "b"
        ? Buffer.from(payload, "base64")
        : Buffer.from(payload.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_m: string, hex: string) => String.fromCharCode(parseInt(hex, 16))), "binary");
      return buffer.toString(charset.toLowerCase().includes("utf") ? "utf-8" : "latin1");
    } catch {
      return payload;
    }
  }).trim();
}

function htmlToText(html: string): string {
  return html
    .replace(/<a\b[^>]*href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => `${stripTags(text)} ${href}`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeLines(value: string): string[] {
  return normalizeText(value)
    .split("\n")
    .map((line) => line.trim().replace(/\s{2,}/g, " "))
    .filter((line) => line.length > 0 && line.length < 260 && !GENERIC_LINK_RE.test(line));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(parseInt(n, 10)));
}

function extractHtmlLinks(html: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/href=["']?([^"'\s>]+)["']?/gi)) {
    links.push(decodeHtmlEntities(match[1]));
  }
  return links;
}

function extractUrls(value: string): string[] {
  return [...value.matchAll(/https?:\/\/[^\s<>"')]+/gi)].map((match) => match[0].replace(/[.,;]+$/, ""));
}

function unwrapRedirectUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of ["url", "u", "redirect", "redirect_url", "target", "destination", "dest", "link", "continue"]) {
      const value = url.searchParams.get(key);
      if (value && /^https?:\/\//i.test(value)) return decodeURIComponent(value);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function isRelevantEmailJobLink(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const haystack = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
    if (GENERIC_LINK_RE.test(haystack)) return false;
    return /(job|career|greenhouse|lever|ashby|workday|linkedin|indeed|monster|wellfound|smartrecruiters|icims|apply|posting|requisition)/i.test(haystack);
  } catch {
    return false;
  }
}

function isActualJobPostingUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const haystack = `${host}${path}${url.search}`.toLowerCase();
    if (GENERIC_LINK_RE.test(haystack)) return false;
    if (/\b(search|savedsearch|job-alert|jobalert|recommended|recommendations)\b/i.test(path)) return false;

    if (host.includes("linkedin.com")) {
      return /\/jobs\/view\/\d+/i.test(path) || Boolean(url.searchParams.get("currentJobId"));
    }
    if (host.includes("indeed.")) {
      return Boolean(url.searchParams.get("jk") || url.searchParams.get("vjk")) || /\/viewjob\b/i.test(path);
    }
    if (host.includes("monster.")) {
      return /\/job-openings\//i.test(path) || /\/jobs\/[^/]+/i.test(path);
    }
    if (host.includes("wellfound.com")) {
      return /\/jobs\/[^/]+/i.test(path);
    }

    if (host.includes("greenhouse.io") || host === "jobs.lever.co" || host === "jobs.ashbyhq.com") return true;
    if (host.includes("workdayjobs.com") || host.includes("smartrecruiters.com") || host.includes("icims.com")) return true;
    return /(job|career|apply|posting|requisition)/i.test(haystack) && /\d|[0-9a-f]{8}-[0-9a-f-]{8,}/i.test(haystack);
  } catch {
    return false;
  }
}

function looksLikeTitle(line: string): boolean {
  if (!ROLE_RE.test(line)) return false;
  if (isNonJobTitle(line)) return false;
  if (/^(apply|view|see|new jobs|recommended|because|saved search|alert)/i.test(line)) return false;
  return line.split(/\s+/).length <= 14;
}

function isNonJobTitle(line: string): boolean {
  return NON_JOB_TITLE_RE.test(line.replace(/&quot;|["']/g, ""));
}

function looksLikeCompany(line: string): boolean {
  if (!line || line.length > 80) return false;
  if (ROLE_RE.test(line) && line.split(/\s+/).length > 2) return false;
  if (/^(remote|apply|view|posted|salary|full-time|contract|job alert)/i.test(line)) return false;
  return /[a-zA-Z]/.test(line);
}

function cleanTitle(value: string): string {
  return value
    .replace(/^new\s+/i, "")
    .replace(/\s+and\s+\d+\s+more\s+jobs?.*$/i, "")
    .replace(/\s+apply now\.?$/i, "")
    .trim()
    .replace(/[.]+$/, "");
}

function cleanCompany(value: string): string {
  return value
    .replace(/\s+and\s+\d+\s+more\s+jobs?.*$/i, "")
    .replace(/\s+could be a great match.*$/i, "")
    .trim()
    .replace(/[.]+$/, "");
}

function cleanLocation(value: string): string {
  return value.replace(/\s+for you.*$/i, "").replace(/\s+apply now.*$/i, "").trim() || "Not specified";
}

function inferLocation(snippet: string): string {
  const match = snippet.match(/\b(?:in|for)\s+([A-Z][A-Za-z .,-]*(?:Remote|United States|US|USA|TN|CA|NY|TX|IL|WA|MA|CO|GA)[A-Za-z .,-]*)/);
  return match?.[1]?.trim() ?? "";
}

function extractSalary(value: string): string {
  const match = value.match(/\$[\d,.]+[kKmM]?(?:\s*[-–]\s*\$?[\d,.]+[kKmM]?)?(?:\s*\/?\s*(?:yr|year|hour|hr))?/);
  return match?.[0] ?? "";
}

function trimSnippet(value: string): string {
  return value.replace(/\s{2,}/g, " ").trim().slice(0, 1200);
}

function parseDateOrNow(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date().toISOString();
}

function matchesNegativeFilter(title: string, filters: string[]): boolean {
  const normalized = title.toLowerCase();
  return filters.some((filter) => filter && normalized.includes(filter.toLowerCase()));
}

function candidatesSkippedByNegativeFilter(lines: string[], filters: string[]): number {
  if (filters.length === 0) return 0;
  return lines.filter((line) => ROLE_RE.test(line) && matchesNegativeFilter(line, filters)).length;
}

function stableEmailJobId(sourceUrl: string): string {
  return `em-${createHash("sha1").update(`email:${sourceUrl}`).digest("hex").slice(0, 16)}`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
