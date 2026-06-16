"use server";

import { revalidatePath } from "next/cache";
import { getAISettings, saveAISettings, upsertCompanyProfile } from "@/lib/db/queries";
import type { AIProviderName } from "@/lib/db/types";

/** Keys are masked as ••••XXXX before reaching the client. Compare against the exact
 *  masked representation rather than a prefix so a key that happens to start with ••••
 *  is not mistaken for the sentinel. */
function resolveKey(submitted: string, stored: string): string {
  const masked = stored ? `••••${stored.slice(-4)}` : "";
  if (submitted === masked) return stored;
  return submitted;
}

const ALL_PROVIDERS: AIProviderName[] = ["anthropic", "gemini", "openai", "ollama"];

export async function saveAISettingsAction(formData: FormData) {
  const activeProvider = formData.get("activeProvider") as AIProviderName;
  const submittedAnthropicKey = (formData.get("anthropicApiKey") as string) ?? "";
  const submittedGeminiKey = (formData.get("geminiApiKey") as string) ?? "";
  const submittedOpenaiKey = (formData.get("openaiApiKey") as string) ?? "";
  const anthropicModel = (formData.get("anthropicModel") as string) || "claude-sonnet-4-6";
  const geminiModel = (formData.get("geminiModel") as string) || "gemini-2.5-flash";
  const openaiModel = (formData.get("openaiModel") as string) || "gpt-5.4-mini";
  const ollamaBaseUrl = (formData.get("ollamaBaseUrl") as string) || "http://localhost:11434";
  const ollamaModel = (formData.get("ollamaModel") as string) || "llama3.1:8b";
  const fallbackProvider = (formData.get("fallbackProvider") as string) ?? "";
  const submittedBraveKey = (formData.get("braveSearchApiKey") as string) ?? "";
  const adzunaAppId = (formData.get("adzunaAppId") as string) ?? "";
  const submittedAdzunaKey = (formData.get("adzunaApiKey") as string) ?? "";

  // Parse the ordered provider chain from a JSON string submitted by the form.
  let providerOrderJson: AIProviderName[] = ["openai", "anthropic", "gemini"];
  try {
    const raw = formData.get("providerOrderJson") as string;
    if (raw) {
      const parsed = JSON.parse(raw) as unknown[];
      providerOrderJson = parsed.filter((p): p is AIProviderName => ALL_PROVIDERS.includes(p as AIProviderName));
    }
  } catch {
    // keep default
  }

  if (!ALL_PROVIDERS.includes(activeProvider)) {
    throw new Error("Invalid provider selection.");
  }

  const stored = getAISettings();
  const anthropicApiKey = resolveKey(submittedAnthropicKey, stored.anthropicApiKey);
  const geminiApiKey = resolveKey(submittedGeminiKey, stored.geminiApiKey);
  const openaiApiKey = resolveKey(submittedOpenaiKey, stored.openaiApiKey);
  const braveSearchApiKey = resolveKey(submittedBraveKey, stored.braveSearchApiKey);
  const adzunaApiKey = resolveKey(submittedAdzunaKey, stored.adzunaApiKey);

  saveAISettings({
    activeProvider,
    anthropicApiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicModel,
    geminiModel,
    openaiModel,
    ollamaBaseUrl,
    ollamaModel,
    fallbackProvider,
    providerOrderJson,
    onboardingDismissed: stored.onboardingDismissed,
    onboardingPreferencesConfirmed: stored.onboardingPreferencesConfirmed,
    braveSearchApiKey,
    adzunaAppId,
    adzunaApiKey,
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function saveCompanyIndustryAction(name: string, industry: string) {
  upsertCompanyProfile(name, industry);
  revalidatePath("/settings");
}
