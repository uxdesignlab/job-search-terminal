import { getAISettings } from "@/lib/db/queries";
import type { AISettingsRecord, AIProviderName } from "@/lib/db/types";
import { AnthropicProvider } from "./anthropic";
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

function buildProvider(settings: AISettingsRecord, candidates: AIProviderName[]): AIProvider | null {
  if (candidates.length === 0) return null;
  const providers = candidates.map((name) =>
    createProvider(name, {
      apiKey: providerKey(settings, name),
      model: providerModel(settings, name),
      baseUrl: name === "ollama" ? settings.ollamaBaseUrl : undefined
    })
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
