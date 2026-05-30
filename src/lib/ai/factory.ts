import { getAISettings } from "@/lib/db/queries";
import type { AISettingsRecord, AIProviderName } from "@/lib/db/types";
import { AnthropicProvider } from "./anthropic";
import { FallbackProvider } from "./fallback-provider";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import type { AIProvider, AIProviderConfig } from "./provider";

export const FALLBACK_ORDER: AIProviderName[] = ["openai", "anthropic", "gemini"];

export function createProvider(name: AIProviderName, config: AIProviderConfig): AIProvider {
  switch (name) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "openai":
      return new OpenAIProvider(config);
  }
}

function providerKey(settings: AISettingsRecord, name: AIProviderName): string {
  if (name === "anthropic") return settings.anthropicApiKey;
  if (name === "gemini") return settings.geminiApiKey;
  return settings.openaiApiKey;
}

function providerModel(settings: AISettingsRecord, name: AIProviderName): string {
  if (name === "anthropic") return settings.anthropicModel;
  if (name === "gemini") return settings.geminiModel;
  return settings.openaiModel;
}

/**
 * Resolves the ordered list of providers with a configured API key: active
 * provider first, then the explicit fallback, then the remaining defaults.
 */
function resolveCandidates(settings: AISettingsRecord): AIProviderName[] {
  const candidates: AIProviderName[] = [];
  if (providerKey(settings, settings.activeProvider)) {
    candidates.push(settings.activeProvider);
  }
  if (settings.fallbackProvider && settings.fallbackProvider !== settings.activeProvider) {
    const fb = settings.fallbackProvider as AIProviderName;
    if (providerKey(settings, fb)) candidates.push(fb);
  }
  for (const name of FALLBACK_ORDER) {
    if (!candidates.includes(name) && providerKey(settings, name)) {
      candidates.push(name);
    }
  }
  return candidates;
}

function buildProvider(settings: AISettingsRecord, candidates: AIProviderName[]): AIProvider | null {
  if (candidates.length === 0) return null;
  const providers = candidates.map((name) =>
    createProvider(name, { apiKey: providerKey(settings, name), model: providerModel(settings, name) })
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

/** Same resolution as {@link getActiveProvider}, but returns null when no API key is configured. */
export function tryGetActiveProvider(): AIProvider | null {
  const settings = getAISettings();
  return buildProvider(settings, resolveCandidates(settings));
}
