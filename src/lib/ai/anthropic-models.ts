import type Anthropic from "@anthropic-ai/sdk";

/**
 * "Latest" resolution for Claude, mirroring `openai-models.ts`.
 *
 * Anthropic expresses tier in the model name — opus, sonnet, haiku — rather than
 * in a suffix, so there is one sentinel per tier instead of a single "flagship"
 * rule. Auto-selecting across tiers would silently change both the price and the
 * capability of every run, which is the user's decision, not ours.
 */

export const ANTHROPIC_LATEST_SENTINELS = {
  "latest-sonnet": "sonnet",
  "latest-opus": "opus",
  "latest-haiku": "haiku",
} as const;

export type ClaudeFamily = (typeof ANTHROPIC_LATEST_SENTINELS)[keyof typeof ANTHROPIC_LATEST_SENTINELS];

/** Used when a sentinel cannot be resolved (offline, bad key, unexpected list shape). */
export const ANTHROPIC_FALLBACK_MODELS: Record<ClaudeFamily, string> = {
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-5",
  haiku: "claude-haiku-4-5",
};

/** Curated options offered in Settings alongside the live list from /v1/models. */
export const ANTHROPIC_MODEL_OPTIONS = [
  "latest-sonnet",
  "latest-opus",
  "latest-haiku",
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
];

/** The family a sentinel selects, or null when the value is a concrete model id. */
export function anthropicSentinelFamily(model: string | undefined | null): ClaudeFamily | null {
  const key = (model ?? "").trim().toLowerCase();
  return (ANTHROPIC_LATEST_SENTINELS as Record<string, ClaudeFamily>)[key] ?? null;
}

export type ClaudeModelListing = { id: string; createdAt?: string };

/**
 * Current ids are `claude-<family>-<major>[-<minor>]` (`claude-opus-5`,
 * `claude-sonnet-4-6`). Ids from the 3.x era put the version first
 * (`claude-3-5-sonnet-20241022`). Both are matched so an account still listing
 * the old generation ranks it correctly rather than ignoring it.
 */
const CURRENT_ID = /^claude-([a-z]+)-(\d+)(?:-(\d+))?(?:-(\d{8}))?$/;
const LEGACY_ID = /^claude-(\d+)(?:-(\d+))?-([a-z]+)(?:-(\d{8}|latest))?$/;

type Parsed = { family: string; rank: number; dated: boolean };

export function parseClaudeModelId(id: string): Parsed | null {
  const current = CURRENT_ID.exec(id);
  if (current) {
    return {
      family: current[1],
      rank: Number(current[2]) * 1000 + (current[3] ? Number(current[3]) : 0),
      dated: Boolean(current[4]),
    };
  }
  const legacy = LEGACY_ID.exec(id);
  if (legacy) {
    return {
      family: legacy[3],
      rank: Number(legacy[1]) * 1000 + (legacy[2] ? Number(legacy[2]) : 0),
      dated: Boolean(legacy[4]),
    };
  }
  return null;
}

/**
 * Newest model within one family. Version wins over release date, because a
 * patch release of an older generation can be published after a newer one; the
 * undated alias wins over a dated snapshot of the same version, because the
 * alias keeps following Anthropic's own pointer.
 */
export function pickLatestClaude(models: readonly ClaudeModelListing[], family: ClaudeFamily): string | null {
  const candidates = models
    .map((model) => ({ ...model, parsed: parseClaudeModelId(model.id) }))
    .filter((model) => model.parsed?.family === family);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.parsed!.rank !== b.parsed!.rank) return b.parsed!.rank - a.parsed!.rank;
    if (a.parsed!.dated !== b.parsed!.dated) return a.parsed!.dated ? 1 : -1;
    return Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "") || 0;
  });

  return candidates[0].id;
}

/**
 * Which server-side web-search tool a model accepts.
 *
 * `web_search_20260209` (dynamic filtering) is the current variant, supported from
 * Opus 4.6 and Sonnet 4.6 onward; older models — including Haiku 4.5 — only take the
 * basic `web_search_20250305`. The tool type therefore has to be chosen per resolved
 * model rather than hard-coded, now that an auto option can change which model runs
 * without anyone touching the setting. Anything unrecognised gets the basic variant,
 * which every model accepts.
 */
export const WEB_SEARCH_TOOL_CURRENT = "web_search_20260209";
export const WEB_SEARCH_TOOL_BASIC = "web_search_20250305";

/** Families whose 4.6-and-later releases take the current tool. */
const DYNAMIC_FILTERING_FROM: Record<string, number> = {
  opus: 4006,
  sonnet: 4006,
  fable: 5000,
  mythos: 5000,
};

export function webSearchToolType(modelId: string): string {
  const parsed = parseClaudeModelId(modelId);
  if (!parsed) return WEB_SEARCH_TOOL_BASIC;
  const minimum = DYNAMIC_FILTERING_FROM[parsed.family];
  return minimum !== undefined && parsed.rank >= minimum ? WEB_SEARCH_TOOL_CURRENT : WEB_SEARCH_TOOL_BASIC;
}

type CacheEntry = { model: string; expiresAt: number };
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(apiKey: string, family: ClaudeFamily): string {
  return `${family}:${apiKey.slice(-8)}`;
}

/** Turn a sentinel into a concrete model id, caching for an hour so a chatty
 *  feature does not hit /v1/models on every generation. */
export async function resolveLatestAnthropicModel(
  client: Anthropic,
  apiKey: string,
  family: ClaudeFamily
): Promise<string> {
  const key = cacheKey(apiKey, family);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.model;

  try {
    const page = await client.models.list({ limit: 100 });
    const listings = page.data.map((m) => ({ id: m.id, createdAt: m.created_at }));
    const model = pickLatestClaude(listings, family) ?? ANTHROPIC_FALLBACK_MODELS[family];
    cache.set(key, { model, expiresAt: Date.now() + CACHE_TTL_MS });
    return model;
  } catch {
    // Never fail a generation because model discovery failed — fall back, and do
    // not cache, so the next call retries.
    return ANTHROPIC_FALLBACK_MODELS[family];
  }
}

/** Test hook — the resolution cache is process-global. */
export function clearAnthropicModelCache() {
  cache.clear();
}
