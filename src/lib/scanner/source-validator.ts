import { safeFetch } from "../safe-fetch";
import { buildApiUrl, type AtsProvider } from "./source-discovery";

/** Same order of magnitude as CareerOps job-list fetch — validation reads the full JSON body. */
const VALIDATE_TIMEOUT_MS = 45_000;
/** Fewer parallel calls reduces Ashby / CDN 429s when validating hundreds of boards. */
const VALIDATE_CONCURRENCY = 5;
const INTER_BATCH_DELAY_MS = 900;

const VALIDATION_ATTEMPTS = 3;
const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522]);

export type SourceValidationStatus = "valid" | "dead" | "unknown";

export type SourceValidationResult = {
  name: string;
  status: SourceValidationStatus;
  jobCount: number | null;
  checkedAt: string;
  error?: string;
};

type SourceInput = {
  name: string;
  careersUrl: string;
  apiType: "greenhouse" | "ashby" | "lever" | null;
};

function getApiUrl(source: SourceInput): string | null {
  if (!source.apiType) return null;
  const url = source.careersUrl;
  let slug: string | null = null;
  if (source.apiType === "greenhouse") {
    const m = url.match(/(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/);
    slug = m?.[1] ?? null;
  } else if (source.apiType === "lever") {
    const m = url.match(/jobs\.lever\.co\/([^/?#]+)/);
    slug = m?.[1] ?? null;
  } else if (source.apiType === "ashby") {
    const m = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
    slug = m?.[1] ?? null;
  }
  if (!slug) return null;
  return buildApiUrl(slug, source.apiType as AtsProvider);
}

function countJobs(json: unknown, apiType: "greenhouse" | "ashby" | "lever"): number | null {
  if (!json || typeof json !== "object") return null;
  if (apiType === "lever") return Array.isArray(json) ? json.length : null;
  const rec = json as Record<string, unknown>;
  return Array.isArray(rec.jobs) ? (rec.jobs as unknown[]).length : null;
}

function isRetriableNetworkError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("abort") ||
    m.includes("aborted") ||
    m.includes("timeout") ||
    m.includes("etimedout") ||
    m.includes("econnreset") ||
    m.includes("enotfound") ||
    m.includes("socket") ||
    m.includes("fetch failed") ||
    m.includes("network")
  );
}

async function validateSource(source: SourceInput): Promise<SourceValidationResult> {
  const checkedAt = new Date().toISOString();
  const apiUrl = getApiUrl(source);
  if (!apiUrl) {
    return { name: source.name, status: "unknown", jobCount: null, checkedAt, error: "Cannot determine API URL" };
  }

  let lastResult: SourceValidationResult = {
    name: source.name,
    status: "unknown",
    jobCount: null,
    checkedAt,
    error: "Validation failed",
  };

  for (let attempt = 0; attempt < VALIDATION_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 350 * (1 << attempt)));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);

    try {
      const res = await safeFetch(apiUrl, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; JobSearchTerminal/1.0; careers-board-validate)",
        },
      });
      const text = await res.text();

      if (!res.ok) {
        if (res.status === 404) {
          return { name: source.name, status: "dead", jobCount: null, checkedAt };
        }
        lastResult = {
          name: source.name,
          status: "unknown",
          jobCount: null,
          checkedAt,
          error: `HTTP ${res.status}`,
        };
        const canRetry = attempt < VALIDATION_ATTEMPTS - 1 && TRANSIENT_HTTP.has(res.status);
        if (canRetry) continue;
        return lastResult;
      }

      let jobCount: number | null = null;
      try {
        jobCount = source.apiType ? countJobs(JSON.parse(text) as unknown, source.apiType) : null;
      } catch {
        /* non-JSON */
      }
      return { name: source.name, status: "valid", jobCount, checkedAt };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastResult = {
        name: source.name,
        status: "unknown",
        jobCount: null,
        checkedAt,
        error: msg,
      };
      const canRetry = attempt < VALIDATION_ATTEMPTS - 1 && isRetriableNetworkError(msg);
      if (canRetry) continue;
      return lastResult;
    } finally {
      clearTimeout(timer);
    }
  }

  return lastResult;
}

export async function validateAllSources(
  sources: SourceInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<SourceValidationResult[]> {
  const results: SourceValidationResult[] = [];
  for (let i = 0; i < sources.length; i += VALIDATE_CONCURRENCY) {
    const batch = sources.slice(i, i + VALIDATE_CONCURRENCY);
    const validated = await Promise.all(batch.map(validateSource));
    results.push(...validated);
    onProgress?.(Math.min(i + VALIDATE_CONCURRENCY, sources.length), sources.length);
    if (i + VALIDATE_CONCURRENCY < sources.length) {
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }
  return results;
}
