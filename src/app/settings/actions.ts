"use server";

import { revalidatePath } from "next/cache";
import { getAISettings, saveAISettings, upsertCompanyProfile } from "@/lib/db/queries";
import type { AIProviderName } from "@/lib/db/types";

/** Keys are masked as ••••XXXX before reaching the client. Detect the sentinel
 *  and keep the stored value intact rather than overwriting with the mask. */
function resolveKey(submitted: string, stored: string): string {
  if (submitted.startsWith("••••")) return stored;
  return submitted;
}

export async function saveAISettingsAction(formData: FormData) {
  const activeProvider = formData.get("activeProvider") as AIProviderName;
  const submittedAnthropicKey = (formData.get("anthropicApiKey") as string) ?? "";
  const submittedGeminiKey = (formData.get("geminiApiKey") as string) ?? "";
  const submittedOpenaiKey = (formData.get("openaiApiKey") as string) ?? "";
  const anthropicModel = (formData.get("anthropicModel") as string) || "claude-sonnet-4-6";
  const geminiModel = (formData.get("geminiModel") as string) || "gemini-2.0-flash";
  const openaiModel = (formData.get("openaiModel") as string) || "gpt-4o";
  const fallbackProvider = (formData.get("fallbackProvider") as string) ?? "";

  const validProviders: AIProviderName[] = ["anthropic", "gemini", "openai"];
  if (!validProviders.includes(activeProvider)) {
    throw new Error("Invalid provider selection.");
  }

  const stored = getAISettings();
  const anthropicApiKey = resolveKey(submittedAnthropicKey, stored.anthropicApiKey);
  const geminiApiKey = resolveKey(submittedGeminiKey, stored.geminiApiKey);
  const openaiApiKey = resolveKey(submittedOpenaiKey, stored.openaiApiKey);

  saveAISettings({
    activeProvider,
    anthropicApiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicModel,
    geminiModel,
    openaiModel,
    fallbackProvider,
    onboardingDismissed: stored.onboardingDismissed,
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function saveCompanyIndustryAction(name: string, industry: string) {
  upsertCompanyProfile(name, industry);
  revalidatePath("/settings");
}
