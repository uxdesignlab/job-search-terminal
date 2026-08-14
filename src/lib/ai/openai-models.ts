import OpenAI from "openai";

/** Sentinel stored in ai_settings.openai_model meaning "whatever OpenAI's newest
 *  flagship alias is right now". Resolved at request time against /v1/models so the
 *  user never has to edit this setting when OpenAI ships a new generation. */
export const OPENAI_LATEST_SENTINEL = "latest";

/** Used when the sentinel cannot be resolved (offline, bad key, unexpected list shape). */
export const OPENAI_FALLBACK_MODEL = "gpt-5.6";

/** Curated options offered in Settings alongside the live list from /v1/models. */
export const OPENAI_MODEL_OPTIONS = [
  OPENAI_LATEST_SENTINEL,
  "gpt-5.6",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano"
];

export function isLatestSentinel(model: string | undefined | null): boolean {
  return (model ?? "").trim().toLowerCase() === OPENAI_LATEST_SENTINEL;
}

/** Any `gpt-<major>[.<minor>]` id, with whatever variant suffix follows. */
const GENERATION_MODEL = /^gpt-(\d+)(?:\.(\d+))?(-[a-z0-9.-]+)?$/;

/** Within one generation, the ids that count as its flagship, best first. The bare
 *  generation alias is preferred (`gpt-5.6` routes to `gpt-5.6-sol`); `-sol` is the
 *  explicit flagship when the alias is not exposed on the account's model list.
 *  `-mini`, `-nano`, `-terra`, `-luna` (cheaper) and `-pro`, `-codex`, `-chat-latest`
 *  (different product) are never auto-selected: "latest" must not silently change
 *  the tier of model the app runs on, only its generation. */
const FLAGSHIP_SUFFIXES = [null, "-sol"];

export function pickLatestFlagship(modelIds: readonly string[]): string | null {
  const byGeneration = new Map<number, Set<string>>();
  for (const id of modelIds) {
    const match = GENERATION_MODEL.exec(id);
    if (!match) continue;
    const rank = Number(match[1]) * 1000 + (match[2] ? Number(match[2]) : 0);
    const existing = byGeneration.get(rank) ?? new Set<string>();
    existing.add(id);
    byGeneration.set(rank, existing);
  }

  // Newest generation first; skip any that exposes only non-flagship variants.
  for (const rank of [...byGeneration.keys()].sort((a, b) => b - a)) {
    const ids = byGeneration.get(rank)!;
    const major = Math.floor(rank / 1000);
    const minor = rank % 1000;
    const base = minor === 0 ? `gpt-${major}` : `gpt-${major}.${minor}`;
    for (const suffix of FLAGSHIP_SUFFIXES) {
      const candidate = suffix ? `${base}${suffix}` : base;
      if (ids.has(candidate)) return candidate;
    }
  }
  return null;
}

type CacheEntry = { model: string; expiresAt: number };
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(apiKey: string): string {
  return apiKey.slice(-8);
}

/** Resolve the "latest" sentinel to a concrete model id, caching for an hour so a
 *  chatty feature does not hit /v1/models on every generation. */
export async function resolveLatestOpenAIModel(client: OpenAI, apiKey: string): Promise<string> {
  const key = cacheKey(apiKey);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.model;

  try {
    const page = await client.models.list();
    const ids = page.data.map((m) => m.id);
    const model = pickLatestFlagship(ids) ?? OPENAI_FALLBACK_MODEL;
    cache.set(key, { model, expiresAt: Date.now() + CACHE_TTL_MS });
    return model;
  } catch {
    // Never fail a generation just because model discovery failed — fall back, and
    // do not cache, so the next call retries.
    return OPENAI_FALLBACK_MODEL;
  }
}

/** Test hook — the resolution cache is process-global. */
export function clearOpenAIModelCache() {
  cache.clear();
}
