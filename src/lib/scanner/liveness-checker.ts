// Checks whether a job posting URL is still active.
// Returns "active" | "expired" | "uncertain".
// No browser — just HTTP + text heuristics (fast, no Playwright dependency).

import { readFileSync } from "node:fs";
import path from "node:path";
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
  // Bounded on purpose. Unanchored `.*` matched any page that happened to contain
  // both words anywhere inside the 30 KB sample, which made long career pages and
  // bot-challenge interstitials read as expired.
  /requisition[^.<>]{0,40}closed/i,
  /opening[^.<>]{0,40}closed/i,
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

// Hosts that gate postings behind a signed-in session. Without one they serve login
// walls, bot challenges, or generic "no longer accepting applications" copy for roles
// that are still open — so no unauthenticated verdict from them is trustworthy, not
// even an explicit expiry match. Only a hard 404/410 is believed. Anything else is
// "uncertain", which keeps the job in the pipeline instead of flagging it expired.
const SESSION_GATED_HOSTS = [
  "linkedin.com",
];

/**
 * Extra hosts from `config/liveness-hosts.local.json`, which is gitignored so a local
 * setup can list boards it scans without publishing them. Shape:
 * `{ "sessionGated": ["example.com"], "uncertainOnAmbiguous": ["example.org"] }`
 * Mirrors the `portals.yml` / `portals.example.yml` fallback in careerops-scanner.
 */
let localHostOverrides: { sessionGated: string[]; uncertainOnAmbiguous: string[] } | null = null;

function getLocalHostOverrides() {
  if (localHostOverrides) return localHostOverrides;
  localHostOverrides = { sessionGated: [], uncertainOnAmbiguous: [] };
  try {
    const configPath = path.join(process.cwd(), "config", "liveness-hosts.local.json");
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    if (parsed && typeof parsed === "object") {
      const raw = parsed as Record<string, unknown>;
      const list = (value: unknown) =>
        Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
      localHostOverrides = {
        sessionGated: list(raw.sessionGated),
        uncertainOnAmbiguous: list(raw.uncertainOnAmbiguous),
      };
    }
  } catch {
    /* the local override file is optional */
  }
  return localHostOverrides;
}

function hostMatches(url: string, hosts: string[]): boolean {
  if (hosts.length === 0) return false;
  try {
    const { hostname } = new URL(url);
    return hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function isUncertainOnAmbiguous(url: string): boolean {
  return hostMatches(url, [...UNCERTAIN_ON_AMBIGUOUS_HOSTS, ...getLocalHostOverrides().uncertainOnAmbiguous]);
}

function isSessionGated(url: string): boolean {
  return hostMatches(url, [...SESSION_GATED_HOSTS, ...getLocalHostOverrides().sessionGated]);
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

  // Past this point every verdict comes from page text. On session-gated hosts that
  // text describes the login wall, not the posting, so stop here rather than trust it.
  if (isSessionGated(url)) {
    return {
      status: "uncertain",
      reason: "Host requires a signed-in session — cannot verify without one",
      checkedAt,
    };
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
