// Availability evidence must identify a posting, not merely a working web page.
import { readFileSync } from "node:fs";
import path from "node:path";

import { safeFetch } from "../safe-fetch";

export type LivenessStatus = "active" | "expired" | "uncertain";
export type LivenessResult = { status: LivenessStatus; reason: string; checkedAt: string; evidenceUrl?: string };
export type PostingIdentity = { title: string; company: string };

const CLOSED = [
  /no longer accepting applications/i,
  /this (?:job|position|role|posting) is (?:no longer|not) (?:available|active|open)/i,
  /(?:this |that )?(?:job|position|role|posting) (?:has been |is )?(?:filled|closed|removed|expired)/i,
  /application deadline (?:has )?passed/i,
  /this posting has (?:expired|been removed|been filled|been closed)/i,
];
const CHALLENGE = /verify (?:you are|you're) human|checking your browser|access denied|captcha|just a moment|sign in to (?:view|continue)|log in to (?:view|continue)/i;
const APPLY = /apply (?:now|for this (?:job|role|position))|submit (?:your |an )?application/i;
const BOARD_HOSTS = ["himalayas.app", "adzuna.com", "adzuna.co.uk", "adzuna.ca", "adzuna.com.au", "linkedin.com", "indeed.com", "glassdoor.com", "monster.com", "dice.com", "wellfound.com", "remoterocketship.com", "jobgether.com", "jooble.org", "jobrapido.com", "lensa.com", "talent.com", "ziprecruiter.com"];

function hostIs(url: string, hosts: string[]) {
  try { const host = new URL(url).hostname.toLowerCase(); return hosts.some((h) => host === h || host.endsWith(`.${h}`)); } catch { return false; }
}
export function isAggregatorPosting(url: string) { return hostIs(url, BOARD_HOSTS); }
function sessionGated(url: string) {
  let local: string[] = [];
  try {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), "config/liveness-hosts.local.json"), "utf8"));
    if (Array.isArray(config.sessionGated)) local = config.sessionGated.filter((v: unknown): v is string => typeof v === "string");
  } catch { /* optional local preferences */ }
  return hostIs(url, ["linkedin.com", ...local]);
}
function text(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
function normalized(value: string) { return text(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
function matching(value: unknown, expected: string) { return typeof value === "string" && Boolean(expected.trim()) && normalized(value) === normalized(expected); }
function specificUrl(raw: string) {
  try {
    const url = new URL(raw);
    return Boolean(url.searchParams.get("gh_jid") || url.searchParams.get("jobId") || url.searchParams.get("jk")) || !/^\/?(?:careers?|jobs?|positions?|openings?|search|login|signin|auth)?\/?$/i.test(url.pathname);
  } catch { return false; }
}
function jobSchemas(html: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (item["@type"] === "JobPosting" || (Array.isArray(item["@type"]) && item["@type"].includes("JobPosting"))) results.push(item);
    if (item["@graph"]) visit(item["@graph"]);
  }
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* malformed structured data is not evidence */ }
  }
  return results;
}

export async function checkJobLiveness(url: string, identity?: PostingIdentity, signal?: AbortSignal): Promise<LivenessResult> {
  const checkedAt = new Date().toISOString();
  let evidenceUrl = url;
  const result = (status: LivenessStatus, reason: string): LivenessResult => ({ status, reason, checkedAt, evidenceUrl });
  if (!url) return result("uncertain", "No posting link saved");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await safeFetch(url, {
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; job-search-bot/1.0)" }, redirect: "follow", cache: "no-store",
    });
    evidenceUrl = res.url || url;
    if (!specificUrl(evidenceUrl)) return result("uncertain", "The link leads to a general page, not this posting");
    if (res.status === 404 || res.status === 410) return result("expired", `Job-specific posting unavailable (HTTP ${res.status})`);
    if (res.status >= 400) return result("uncertain", `Posting could not be checked (HTTP ${res.status})`);
    if (sessionGated(url) || sessionGated(evidenceUrl)) return result("uncertain", "A signed-in session is needed to verify this posting");
    const html = (await res.text()).slice(0, 512_000);
    const visible = text(html);
    if (CHALLENGE.test(visible)) return result("uncertain", "The site returned a login or browser-check page");
    const schemas = jobSchemas(html);
    const matched = identity && schemas.find((schema) => {
      const org = schema.hiringOrganization as { name?: unknown } | undefined;
      return matching(schema.title, identity.title) && matching(org?.name, identity.company);
    });
    const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => text(m[1]));
    const heading = headings.some((value) => identity && matching(value, identity.title));
    const identityMatches = Boolean(matched || (identity && heading && normalized(visible).includes(normalized(identity.company))));
    // Closure copy must describe this posting, not a recommendation card or embedded script.
    const primary = text(html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html)
      .split(/related jobs|similar jobs|recommended jobs/i)[0];
    if (CLOSED.some((pattern) => pattern.test(primary)) && (identityMatches || headings.some((value) => CLOSED.some((pattern) => pattern.test(value))))) return result("expired", "The posting says the role is closed or no longer available");
    if (matched && typeof matched.validThrough === "string" && Date.parse(matched.validThrough) < Date.now()) return result("expired", "The matching posting's application deadline has passed");
    if (isAggregatorPosting(evidenceUrl)) return result("uncertain", "The listing is still on a job board; employer availability is unverified");
    if (identityMatches && APPLY.test(primary)) return result("active", "Matching employer posting with an application invitation");
    return result("uncertain", "The page loaded, but availability of this role could not be confirmed");
  } catch (err) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Stopped", "AbortError");
    return result("uncertain", controller.signal.aborted ? "The posting check timed out" : `Could not reach the posting: ${err instanceof Error ? err.message : String(err)}`);
  } finally { clearTimeout(timeout); }
}

/** Always try saved alternatives; a working employer role overrides a stale board copy. */
export async function verifyJobPosting(job: PostingIdentity & { url: string; originalPostingUrl: string; sourceUrl: string }, signal?: AbortSignal) {
  const urls = [...new Set([job.originalPostingUrl, job.url, job.sourceUrl].filter(Boolean))]
    .sort((a, b) => Number(isAggregatorPosting(a)) - Number(isAggregatorPosting(b)));
  let best: LivenessResult | undefined;
  for (const url of urls) {
    signal?.throwIfAborted();
    const verdict = await checkJobLiveness(url, job, signal);
    if (verdict.status === "active") return verdict;
    if (!best || (verdict.status === "expired" && best.status !== "expired")) best = verdict;
  }
  return best ?? { status: "uncertain" as const, reason: "No posting link saved", checkedAt: new Date().toISOString(), evidenceUrl: "" };
}
