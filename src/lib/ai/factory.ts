import { getAISettings } from "@/lib/db/queries";
import type { AIProviderName } from "@/lib/db/types";
import { AnthropicProvider } from "./anthropic";
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

export function getActiveProvider(): AIProvider {
  const settings = getAISettings();

  const providerKey = (name: AIProviderName): string => {
    if (name === "anthropic") return settings.anthropicApiKey;
    if (name === "gemini") return settings.geminiApiKey;
    return settings.openaiApiKey;
  };

  const providerModel = (name: AIProviderName): string => {
    if (name === "anthropic") return settings.anthropicModel;
    if (name === "gemini") return settings.geminiModel;
    return settings.openaiModel;
  };

  const candidates: AIProviderName[] = [];
  if (providerKey(settings.activeProvider)) {
    candidates.push(settings.activeProvider);
  }
  if (settings.fallbackProvider && settings.fallbackProvider !== settings.activeProvider) {
    const fb = settings.fallbackProvider as AIProviderName;
    if (providerKey(fb)) candidates.push(fb);
  }
  for (const name of FALLBACK_ORDER) {
    if (!candidates.includes(name) && providerKey(name)) {
      candidates.push(name);
    }
  }

  const chosen = candidates[0];
  if (!chosen) {
    throw new Error(
      "No AI provider configured. Add an API key in Settings → AI Provider."
    );
  }

  return createProvider(chosen, {
    apiKey: providerKey(chosen),
    model: providerModel(chosen)
  });
}

/** Same resolution as {@link getActiveProvider}, but returns null when no API key is configured. */
export function tryGetActiveProvider(): AIProvider | null {
  const settings = getAISettings();

  const providerKey = (name: AIProviderName): string => {
    if (name === "anthropic") return settings.anthropicApiKey;
    if (name === "gemini") return settings.geminiApiKey;
    return settings.openaiApiKey;
  };

  const providerModel = (name: AIProviderName): string => {
    if (name === "anthropic") return settings.anthropicModel;
    if (name === "gemini") return settings.geminiModel;
    return settings.openaiModel;
  };

  const candidates: AIProviderName[] = [];
  if (providerKey(settings.activeProvider)) {
    candidates.push(settings.activeProvider);
  }
  if (settings.fallbackProvider && settings.fallbackProvider !== settings.activeProvider) {
    const fb = settings.fallbackProvider as AIProviderName;
    if (providerKey(fb)) candidates.push(fb);
  }
  for (const name of FALLBACK_ORDER) {
    if (!candidates.includes(name) && providerKey(name)) {
      candidates.push(name);
    }
  }

  const chosen = candidates[0];
  if (!chosen) return null;

  return createProvider(chosen, {
    apiKey: providerKey(chosen),
    model: providerModel(chosen)
  });
}
