import { safeFetch } from "@/lib/safe-fetch";
import { buildApiUrl, type AtsProvider } from "./source-discovery";

const VALIDATE_TIMEOUT_MS = 10_000;
const VALIDATE_CONCURRENCY = 8;
const INTER_BATCH_DELAY_MS = 300;

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

async function validateSource(source: SourceInput): Promise<SourceValidationResult> {
  const checkedAt = new Date().toISOString();
  const apiUrl = getApiUrl(source);
  if (!apiUrl) {
    return { name: source.name, status: "unknown", jobCount: null, checkedAt, error: "Cannot determine API URL" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  try {
    const res = await safeFetch(apiUrl, { signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      return { name: source.name, status: res.status === 404 ? "dead" : "unknown", jobCount: null, checkedAt };
    }
    let jobCount: number | null = null;
    try {
      jobCount = source.apiType ? countJobs(JSON.parse(text) as unknown, source.apiType) : null;
    } catch { /* non-JSON */ }
    return { name: source.name, status: "valid", jobCount, checkedAt };
  } catch (err) {
    return { name: source.name, status: "unknown", jobCount: null, checkedAt, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
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
