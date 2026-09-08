import type { JobRecord } from "../db/types";
import { getCustomScanSources } from "../db/queries";
import { safeFetch } from "../safe-fetch";
import { hasResolvedPosting } from "../jobs/posting-resolution";
import { loadScanConfig, mergeTrackedCompanies } from "./careerops-scanner";

const FETCH_TIMEOUT_MS = 12_000;

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await safeFetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    // Ampersand last: decoding it first would turn "&amp;lt;" into "<".
    .replace(/&amp;/g, "&");
}

/**
 * Greenhouse returns its `content` field with the markup entity-escaped — the body
 * arrives as `&lt;p&gt;…` rather than `<p>…`. Tag-stripping therefore has nothing to
 * strip, and decoding afterwards left the tags sitting in the saved text as literal
 * characters. Decode first when the payload looks escaped, so the tags exist by the
 * time they are removed.
 */
export function htmlToText(html: string): string {
  const source = html.includes("&lt;") ? decodeEntities(html) : html;
  return decodeEntities(
    source
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * The numeric Greenhouse posting id. Board-hosted URLs carry it in the path; the
 * employer-branded URLs Greenhouse returns as `absolute_url` carry it as `gh_jid`.
 */
export function greenhouseJobId(jobUrl: string): string | null {
  const fromQuery = jobUrl.match(/[?&]gh_jid=(\d+)/);
  if (fromQuery) return fromQuery[1];
  const fromPath = jobUrl.match(/\/jobs\/(\d+)/) ?? jobUrl.match(/\/(\d+)(?:[/?#]|$)/);
  return fromPath ? fromPath[1] : null;
}

/** The board token in a Greenhouse-hosted URL, e.g. `samsara` in job-boards.greenhouse.io/samsara/... */
export function greenhouseBoardTokenFromUrl(url: string): string | null {
  const board = url.match(/greenhouse\.io\/(?:embed\/job_board\?for=)?([^/?#&]+)/);
  if (board && !/^(embed|v1|boards)$/.test(board[1])) return board[1];
  const api = url.match(/boards-api(?:\.eu)?\.greenhouse\.io\/v1\/boards\/([^/?#]+)/);
  return api ? api[1] : null;
}

/**
 * Jobs discovered through the Greenhouse board API are stored under the employer's own
 * careers URL — `samsara.com/company/careers/roles/7839138?gh_jid=7839138` — because that
 * is the `absolute_url` Greenhouse hands back. Those URLs name no board, so the token has
 * to come from the scan source the job was found through, matched on company name.
 */
function greenhouseBoardToken(job: JobRecord): string | null {
  const fromUrl = greenhouseBoardTokenFromUrl(job.url) ?? greenhouseBoardTokenFromUrl(job.sourceUrl ?? "");
  if (fromUrl) return fromUrl;

  const company = job.company?.trim().toLowerCase();
  if (!company) return null;
  try {
    const sources = mergeTrackedCompanies(loadScanConfig().tracked_companies ?? [], getCustomScanSources());
    const source = sources.find((c) => c.name.trim().toLowerCase() === company);
    if (!source) return null;
    return greenhouseBoardTokenFromUrl(source.api ?? "") ?? greenhouseBoardTokenFromUrl(source.careers_url ?? "");
  } catch {
    // No scanner config, or the database is unavailable — treat the board as unknown.
    return null;
  }
}

async function fetchGreenhouse(job: JobRecord): Promise<string | null> {
  const board = greenhouseBoardToken(job);
  const jobId = greenhouseJobId(job.url);
  if (!board || !jobId) return null;
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}`) as Record<string, unknown>;
  const html = str(data.content);
  return html ? htmlToText(html) : null;
}

async function fetchAshby(jobUrl: string): Promise<string | null> {
  // The Ashby posting API requires auth — scrape the public HTML page instead.
  // Each job page embeds application/ld+json with a full description field.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    const res = await safeFetch(jobUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JobSearchApp/1.0)" }
    });
    if (!res.ok) return null;
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  // Extract application/ld+json schema (most reliable — purpose-built structured data)
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ldMatch) {
    try {
      const schema = JSON.parse(ldMatch[1]) as Record<string, unknown>;
      if (str(schema.description)) return htmlToText(str(schema.description)!);
    } catch { /* malformed JSON — fall through */ }
  }

  return null;
}

async function fetchLever(jobUrl: string): Promise<string | null> {
  // https://jobs.lever.co/{company}/{uuid}
  const match = jobUrl.match(/lever\.co\/([^/?#]+)\/([a-f0-9-]{36})/i);
  if (!match) return null;
  const [, company, jobId] = match;
  const data = await fetchJson(`https://api.lever.co/v0/postings/${company}/${jobId}`) as Record<string, unknown>;
  const plain = str(data.descriptionPlain);
  if (plain) return plain.trim();
  const html = str(data.description);
  return html ? htmlToText(html) : null;
}

/**
 * Why a fetch produced no text. The UI needs the distinction: "we cannot read this
 * board" and "the board is down right now" call for different things from the user,
 * and reporting either as success is how a failed fetch used to look like a saved one.
 */
export type FetchDescriptionOutcome =
  | { status: "fetched"; text: string }
  | { status: "unsupported" }
  | { status: "empty" }
  | { status: "unreachable" };

export async function fetchJobDescriptionOutcome(job: JobRecord): Promise<FetchDescriptionOutcome> {
  if (!hasResolvedPosting(job)) return { status: "unsupported" };
  const source = job.source ?? "";
  const url = job.url;

  const reader =
    source.includes("greenhouse") || url.includes("greenhouse.io")
      ? () => fetchGreenhouse(job)
      : source.includes("ashby") || url.includes("ashbyhq.com")
        ? () => fetchAshby(url)
        : source.includes("lever") || url.includes("lever.co")
          ? () => fetchLever(url)
          : null;

  if (!reader) return { status: "unsupported" };

  try {
    const text = await reader();
    return text ? { status: "fetched", text } : { status: "empty" };
  } catch {
    // A timeout, a refused connection, an HTTP error, or a payload we could not parse.
    return { status: "unreachable" };
  }
}

export async function fetchJobDescription(job: JobRecord): Promise<string | null> {
  const outcome = await fetchJobDescriptionOutcome(job);
  return outcome.status === "fetched" ? outcome.text : null;
}
