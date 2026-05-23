// Checks whether a job posting URL is still active.
// Returns "active" | "expired" | "uncertain".
// No browser — just HTTP + text heuristics (fast, no Playwright dependency).

import { safeFetch } from "../safe-fetch";

const EXPIRED_PATTERNS = [
  /no longer accepting applications/i,
  /this (job|position|role|posting) (is )?(no longer |has been )?(available|active|open|accepting)/i,
  /position (has been )?(filled|closed|removed)/i,
  /job (has been )?(filled|closed|removed|expired)/i,
  /this posting has (expired|been removed|been filled|been closed)/i,
  /we('re| are) not (currently )?hiring/i,
  /sorry[,.]? this (job|role|position) is no longer/i,
  /sorry[,.]?\s*that job has expired/i,
  /application deadline (has )?passed/i,
  /requisition.*closed/i,
  /opening.*closed/i,
  /listing.*no longer active/i,
];

const ACTIVE_PATTERNS = [
  /apply now/i,
  /submit (your )?application/i,
  /we('re| are) hiring/i,
];

export type LivenessStatus = "active" | "expired" | "uncertain";

export type LivenessResult = {
  status: LivenessStatus;
  reason: string;
  checkedAt: string;
};

// Hosts whose bot-detection or CDN can return HTTP 200 with page content that
// contains no expiry or active signals (e.g. a Cloudflare challenge or error page).
// For these hosts a pattern-free 200 falls back to "uncertain" rather than "active"
// so that challenge pages are never misclassified as live job postings.
// Explicit expiry or active pattern matches are still trusted.
const UNCERTAIN_ON_AMBIGUOUS_HOSTS = [
  "monster.com",
];

function isUncertainOnAmbiguous(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return UNCERTAIN_ON_AMBIGUOUS_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export async function checkJobLiveness(url: string): Promise<LivenessResult> {
  const checkedAt = new Date().toISOString();

  if (!url) {
    return { status: "uncertain", reason: "No URL on file", checkedAt };
  }

  const uncertainOnAmbiguous = isUncertainOnAmbiguous(url);

  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    res = await safeFetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; job-search-bot/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timeout);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "uncertain", reason: `Fetch error: ${msg}`, checkedAt };
  }

  if (res.status === 404 || res.status === 410) {
    return { status: "expired", reason: `HTTP ${res.status}`, checkedAt };
  }

  if (res.status >= 400) {
    return { status: "uncertain", reason: `HTTP ${res.status}`, checkedAt };
  }

  // Sample up to 30 KB of text — enough to catch banners without huge parse cost
  let body = "";
  try {
    const raw = await res.text();
    body = raw.slice(0, 30_000);
  } catch {
    return { status: "uncertain", reason: "Could not read response body", checkedAt };
  }

  for (const pattern of EXPIRED_PATTERNS) {
    if (pattern.test(body)) {
      return { status: "expired", reason: `Matched pattern: ${pattern.source.slice(0, 60)}`, checkedAt };
    }
  }

  for (const pattern of ACTIVE_PATTERNS) {
    if (pattern.test(body)) {
      return { status: "active", reason: "Active posting signals found", checkedAt };
    }
  }

  // HTTP 200 with no clear signal
  if (uncertainOnAmbiguous) {
    return { status: "uncertain", reason: "HTTP 200 — no signals; host unreliable without real browser", checkedAt };
  }
  return { status: "active", reason: "HTTP 200 — no expiry signals detected", checkedAt };
}
