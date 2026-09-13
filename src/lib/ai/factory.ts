import { clearAIProviderStatus, getAIProviderStatuses, getAISettings, markAIProviderCreditsExhausted } from "@/lib/db/queries";
import type { AISettingsRecord, AIProviderName } from "@/lib/db/types";
import { AnthropicProvider } from "./anthropic";
import { trackCredits, type CreditStatusStore } from "./credit-status";
import { FallbackProvider } from "./fallback-provider";
import { GeminiProvider } from "./gemini";
import { OllamaProvider } from "./ollama";
import { OpenAIProvider } from "./openai";
import type { AIProvider, AIProviderConfig } from "./provider";

/** Legacy default order used when no providerOrderJson is stored yet. */
export const FALLBACK_ORDER: AIProviderName[] = ["openai", "anthropic", "gemini"];

export function createProvider(name: AIProviderName, config: AIProviderConfig): AIProvider {
  switch (name) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    case "ollama":
      return new OllamaProvider(config);
  }
}

function providerKey(settings: AISettingsRecord, name: AIProviderName): string {
  if (name === "anthropic") return settings.anthropicApiKey;
  if (name === "gemini") return settings.geminiApiKey;
  if (name === "ollama") return settings.ollamaBaseUrl;
  return settings.openaiApiKey;
}

function providerModel(settings: AISettingsRecord, name: AIProviderName): string {
  if (name === "anthropic") return settings.anthropicModel;
  if (name === "gemini") return settings.geminiModel;
  if (name === "ollama") return settings.ollamaModel;
  return settings.openaiModel;
}

/**
 * Resolves the ordered list of providers to try. Uses the user-configured
 * providerOrderJson when available; falls back to the legacy active/fallback
 * pair for users who haven't saved new settings yet.
 */
function resolveCandidates(settings: AISettingsRecord): AIProviderName[] {
  const order = settings.providerOrderJson.length > 0
    ? settings.providerOrderJson
    : FALLBACK_ORDER;

  // providerEnabledJson is the membership set; null means a row saved before order and
  // membership were split, where the order list carried both meanings. An explicit
  // empty array is a real answer — the user turned everything off — and must not fall
  // through to "try every provider that happens to hold a key", which is what the UI
  // said was not happening.
  const chain = settings.providerEnabledJson === null
    ? order
    : order.filter((name) => settings.providerEnabledJson!.includes(name));

  // Filter to providers that have a credential configured.
  return chain.filter((name) => Boolean(providerKey(settings, name)));
}

export function hasConfiguredAIProvider(settings: AISettingsRecord): boolean {
  return resolveCandidates(settings).length > 0;
}

/** The database behind the credit flags. Read defensively: a missing table must never stop an AI call. */
const creditStore: CreditStatusStore = {
  exhausted() {
    try {
      return new Set(getAIProviderStatuses().map((status) => status.provider));
    } catch {
      return new Set();
    }
  },
  mark: (provider, message) => {
    try {
      markAIProviderCreditsExhausted(provider, message);
    } catch {
      // Recording the state is a courtesy; the failure itself still reaches the caller.
    }
  },
  clear: (provider) => {
    try {
      clearAIProviderStatus(provider);
    } catch {
      // As above.
    }
  },
};

/** Providers currently recorded as out of credits. */
export function exhaustedProviders(): Set<string> {
  return creditStore.exhausted();
}

/**
 * Providers known to be out of credits go to the back of the chain, not out of it.
 *
 * Leading with one costs a failed round-trip on every call before the chain moves on,
 * and each of those failures reads to the user as the thing they were doing breaking.
 * Dropping it instead would leave a user whose only provider ran dry with no chain at
 * all — and would never notice credits coming back, because nothing would ask.
 */
export function orderForCredits(candidates: AIProviderName[], exhausted: Set<string>): AIProviderName[] {
  return [
    ...candidates.filter((name) => !exhausted.has(name)),
    ...candidates.filter((name) => exhausted.has(name)),
  ];
}

/**
 * The chain for writing a resume: the chosen writer first, then everything else the
 * user has enabled, so a failing writer still falls over rather than failing the run.
 *
 * The writer only needs a credential, not a place in the main chain. Choosing a cloud
 * writer while keeping scans and evaluation local is the reason the setting exists, and
 * that user has deliberately left the cloud provider out of the main order.
 */
export function resolveWritingCandidates(settings: AISettingsRecord): AIProviderName[] {
  const chain = resolveCandidates(settings);
  const writer = settings.resumeWriterProvider;
  if (!writer || !providerKey(settings, writer)) return chain;
  // Ollama's "credential" is a base URL that always has a default, so it proves nothing
  // about a local model being there. It writes resumes only when it is switched on in
  // the provider list, where Settings has checked that it answers.
  if (writer === "ollama" && !chain.includes("ollama")) return chain;
  return [writer, ...chain.filter((name) => name !== writer)];
}

function buildProvider(settings: AISettingsRecord, candidates: AIProviderName[]): AIProvider | null {
  if (candidates.length === 0) return null;
  const ordered = orderForCredits(candidates, creditStore.exhausted());
  const providers = ordered.map((name) =>
    trackCredits(
      createProvider(name, {
        apiKey: providerKey(settings, name),
        model: providerModel(settings, name),
        baseUrl: name === "ollama" ? settings.ollamaBaseUrl : undefined
      }),
      creditStore
    )
  );
  return providers.length === 1 ? providers[0] : new FallbackProvider(providers);
}

export function getActiveProvider(): AIProvider {
  const settings = getAISettings();
  const provider = buildProvider(settings, resolveCandidates(settings));
  if (!provider) {
    throw new Error(
      "No AI provider configured. Add an API key in Settings → AI Provider."
    );
  }
  return provider;
}

/** Same resolution as {@link getActiveProvider}, but returns null when no provider is configured. */
export function tryGetActiveProvider(): AIProvider | null {
  const settings = getAISettings();
  return buildProvider(settings, resolveCandidates(settings));
}

/**
 * The provider chain for resume work — Application Preparation, tailoring, and section
 * rewrites. Identical to {@link getActiveProvider} until the user picks a writer.
 */
export function getWritingProvider(): AIProvider {
  const settings = getAISettings();
  const provider = buildProvider(settings, resolveWritingCandidates(settings));
  if (!provider) {
    throw new Error(
      "No AI provider configured. Add an API key in Settings → AI Provider."
    );
  }
  return provider;
}
