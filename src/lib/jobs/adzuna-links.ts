/**
 * Adzuna links.
 *
 * Adzuna's API returns only a `redirect_url`, which is a click tracker. For
 * sponsored results (`/land/ad/<id>?se=…&v=…`) Adzuna resells that click to
 * programmatic job-ad networks (Resume-Library, jobg8, healthcarejobsite, …),
 * which forward it wherever they like: a JPMorgan design role was seen landing
 * on a UPS driver job, others on a click-captcha or a course ad. Adzuna's own
 * listing page, `/details/<id>`, shows the job that was actually returned, and
 * answers 404 once Adzuna drops it, which gives the liveness check a real signal.
 */

const ADZUNA_HOST = /(^|\.)adzuna\.[a-z.]+$/i;
const DEFAULT_ORIGIN = "https://www.adzuna.com";

export function isAdzunaUrl(url: string): boolean {
  try {
    return ADZUNA_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Adzuna's listing page for an ID, on the same country site as `sampleUrl` when it is an Adzuna URL. */
export function adzunaListingUrl(sampleUrl: string, adzunaId: string): string {
  let origin = DEFAULT_ORIGIN;
  try {
    const host = new URL(sampleUrl).hostname.toLowerCase();
    if (ADZUNA_HOST.test(host)) origin = `https://${host}`;
  } catch {
    // Keep the default host.
  }
  return `${origin}/details/${encodeURIComponent(adzunaId)}`;
}

/** The listing page for a saved `/land/ad/<id>` tracker link, or null for anything else. */
export function adzunaListingUrlForTracker(url: string): string | null {
  if (!isAdzunaUrl(url)) return null;
  const match = new URL(url).pathname.match(/^\/land\/ad\/(\d+)\/?$/);
  return match ? adzunaListingUrl(url, match[1]) : null;
}

type JobLinks = { source: string; url: string; sourceUrl: string; originalPostingUrl: string };

/**
 * How an Adzuna job's links are presented, without touching what is stored.
 *
 * Jobs saved before 0.21.0 hold the tracker in `url`, `source_url`, and
 * `original_posting_url`. `DATA_CONTRACT.md` keeps schema migrations additive,
 * so those rows are corrected here, when they are read: a tracker becomes the
 * listing page, and an Adzuna URL is never presented as the employer's own
 * posting. Every screen, Find posting, and the liveness check read jobs
 * through this, so none of them follow the tracker. A link the user replaced
 * with the employer's posting is not an Adzuna URL and passes through.
 */
export function presentAdzunaLinks<T extends JobLinks>(job: T): T {
  if (job.source !== "adzuna-api-scan") return job;
  const url = adzunaListingUrlForTracker(job.url) ?? job.url;
  const sourceUrl = adzunaListingUrlForTracker(job.sourceUrl) ?? job.sourceUrl;
  const originalPostingUrl = isAdzunaUrl(job.originalPostingUrl) ? "" : job.originalPostingUrl;
  if (url === job.url && sourceUrl === job.sourceUrl && originalPostingUrl === job.originalPostingUrl) return job;
  return { ...job, url, sourceUrl, originalPostingUrl };
}
