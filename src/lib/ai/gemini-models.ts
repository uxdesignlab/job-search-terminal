/**
 * "Latest" resolution for Gemini, mirroring `openai-models.ts`.
 *
 * Like Claude, Gemini names its tier in the id — pro, flash, flash-lite — so
 * there is one sentinel per tier. The `@google/generative-ai` SDK exposes no
 * model-listing call, so the REST endpoint is used directly.
 */

export const GEMINI_LATEST_SENTINELS = {
  "latest-flash": "flash",
  "latest-pro": "pro",
  "latest-flash-lite": "flash-lite",
} as const;

export type GeminiFamily = (typeof GEMINI_LATEST_SENTINELS)[keyof typeof GEMINI_LATEST_SENTINELS];

/** Used when a sentinel cannot be resolved (offline, bad key, unexpected list shape). */
export const GEMINI_FALLBACK_MODELS: Record<GeminiFamily, string> = {
  flash: "gemini-2.5-flash",
  pro: "gemini-2.5-pro",
  "flash-lite": "gemini-2.5-flash-lite",
};

/** Curated options offered in Settings alongside the live list from the API. */
export const GEMINI_MODEL_OPTIONS = [
  "latest-flash",
  "latest-pro",
  "latest-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

/** The family a sentinel selects, or null when the value is a concrete model id. */
export function geminiSentinelFamily(model: string | undefined | null): GeminiFamily | null {
  const key = (model ?? "").trim().toLowerCase();
  return (GEMINI_LATEST_SENTINELS as Record<string, GeminiFamily>)[key] ?? null;
}

/** `gemini-2.5-flash`, `gemini-3-pro`, `gemini-2.5-flash-lite`. */
const STABLE_ID = /^gemini-(\d+)(?:\.(\d+))?-(pro|flash-lite|flash)$/;

/** `gemini-3.1-pro-preview`, `gemini-3-flash-preview`. Image, TTS and custom-tool
 *  builds carry extra segments and deliberately do not match — they are different
 *  products, not a newer version of this one. */
const PREVIEW_ID = /^gemini-(\d+)(?:\.(\d+))?-(pro|flash-lite|flash)-(?:preview|exp)(?:-\d{2}-\d{2})?$/;

type ParsedGemini = { family: GeminiFamily; rank: number; stable: boolean };

function parse(id: string, pattern: RegExp, stable: boolean): ParsedGemini | null {
  const match = pattern.exec(id);
  if (!match) return null;
  return {
    family: match[3] as GeminiFamily,
    rank: Number(match[1]) * 1000 + (match[2] ? Number(match[2]) : 0),
    stable,
  };
}

/**
 * Stable ids only. Thinking variants, dated builds (`-001`) and the provider's own
 * `-latest` aliases never match: an auto setting must not move the app onto a model
 * that can be withdrawn or rate-limited without notice.
 */
export function parseGeminiModelId(id: string): { family: GeminiFamily; rank: number } | null {
  const parsed = parse(id, STABLE_ID, true);
  return parsed ? { family: parsed.family, rank: parsed.rank } : null;
}

export function parseGeminiPreviewId(id: string): { family: GeminiFamily; rank: number } | null {
  const parsed = parse(id, PREVIEW_ID, false);
  return parsed ? { family: parsed.family, rank: parsed.rank } : null;
}

/**
 * Newest model in one tier, preferring stable releases.
 *
 * A preview is used only when the tier has fallen a whole generation behind the
 * newest stable generation the key can see — which is what Google does to a tier
 * it is mid-transition on: `gemini-2.5-pro` stays listed long after it stops
 * serving new keys, while the current Pro exists only as `gemini-3.1-pro-preview`.
 * Running a preview is worse than running a current stable model, but better than
 * running one that 404s. A tier whose stable release is current never gets moved
 * onto a preview, however new that preview is.
 */
export function pickLatestGemini(modelIds: readonly string[], family: GeminiFamily): string | null {
  const parsed = modelIds
    .map((id) => ({ id, info: parse(id, STABLE_ID, true) ?? parse(id, PREVIEW_ID, false) }))
    .filter((entry): entry is { id: string; info: ParsedGemini } => entry.info !== null);

  const newest = (predicate: (entry: { info: ParsedGemini }) => boolean) =>
    parsed.filter(predicate).sort((a, b) => b.info.rank - a.info.rank)[0] ?? null;

  const bestStable = newest((e) => e.info.stable && e.info.family === family);
  const currentGeneration = Math.max(
    0,
    ...parsed.filter((e) => e.info.stable).map((e) => Math.floor(e.info.rank / 1000))
  );

  const tierIsBehind = !bestStable || Math.floor(bestStable.info.rank / 1000) < currentGeneration;
  if (tierIsBehind) {
    const bestPreview = newest((e) => !e.info.stable && e.info.family === family);
    if (bestPreview && (!bestStable || bestPreview.info.rank > bestStable.info.rank)) {
      return bestPreview.id;
    }
  }

  return bestStable?.id ?? null;
}

type GeminiListResponse = {
  models?: { name?: string; supportedGenerationMethods?: string[] }[];
};

/** Ids the key can reach that can actually serve a generation, `models/` prefix
 *  stripped. Throws on transport or auth failure so callers can report it. */
export async function listGeminiModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`,
    { signal }
  );
  if (!res.ok) {
    throw new Error(`Gemini model list failed (HTTP ${res.status}).`);
  }
  const body = (await res.json()) as GeminiListResponse;
  return (body.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => (m.name ?? "").replace(/^models\//, ""))
    .filter(Boolean);
}

type CacheEntry = { model: string; expiresAt: number };
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(apiKey: string, family: GeminiFamily): string {
  return `${family}:${apiKey.slice(-8)}`;
}

/** Turn a sentinel into a concrete model id, cached for an hour. */
export async function resolveLatestGeminiModel(apiKey: string, family: GeminiFamily): Promise<string> {
  const key = cacheKey(apiKey, family);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.model;

  try {
    const ids = await listGeminiModels(apiKey);
    const model = pickLatestGemini(ids, family) ?? GEMINI_FALLBACK_MODELS[family];
    cache.set(key, { model, expiresAt: Date.now() + CACHE_TTL_MS });
    return model;
  } catch {
    // Never fail a generation because model discovery failed.
    return GEMINI_FALLBACK_MODELS[family];
  }
}

/** Test hook — the resolution cache is process-global. */
export function clearGeminiModelCache() {
  cache.clear();
}
