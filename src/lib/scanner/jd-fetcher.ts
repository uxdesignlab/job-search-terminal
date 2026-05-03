import type { JobRecord } from "../db/types";
import { safeFetch } from "../safe-fetch";

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

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

async function fetchGreenhouse(jobUrl: string): Promise<string | null> {
  // https://job-boards.greenhouse.io/{company}/jobs/{jobId}
  // https://job-boards.eu.greenhouse.io/{company}/jobs/{jobId}
  const match = jobUrl.match(/greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/);
  if (!match) return null;
  const [, company, jobId] = match;
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}`) as Record<string, unknown>;
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

export async function fetchJobDescription(job: JobRecord): Promise<string | null> {
  if (!job.url) return null;
  const source = job.source ?? "";
  const url = job.url;

  try {
    if (source.includes("greenhouse") || url.includes("greenhouse.io")) {
      return await fetchGreenhouse(url);
    }
    if (source.includes("ashby") || url.includes("ashbyhq.com")) {
      return await fetchAshby(url);
    }
    if (source.includes("lever") || url.includes("lever.co")) {
      return await fetchLever(url);
    }
  } catch {
    // Network errors or unexpected API shapes — caller decides what to do
  }
  return null;
}
