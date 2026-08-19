"use server";

import { revalidatePath } from "next/cache";
import { clearContactSuppressions, disconnectIntegration, getAISettings, getIntegrationCredential, saveAISettings, saveIntegrationCredential,
  saveIntegrationMetadata, saveIntegrationTestResult, upsertCompanyProfile } from "@/lib/db/queries";
import { testClayConnection } from "@/lib/integrations/clay-client";
import type { AIProviderName } from "@/lib/db/types";
import { resolveMaskedKey } from "@/lib/ai/masked-key";

const ALL_PROVIDERS: AIProviderName[] = ["anthropic", "gemini", "openai", "ollama"];

export async function saveAISettingsAction(formData: FormData) {
  const activeProvider = formData.get("activeProvider") as AIProviderName;
  const submittedAnthropicKey = (formData.get("anthropicApiKey") as string) ?? "";
  const submittedGeminiKey = (formData.get("geminiApiKey") as string) ?? "";
  const submittedOpenaiKey = (formData.get("openaiApiKey") as string) ?? "";
  const anthropicModel = (formData.get("anthropicModel") as string) || "claude-sonnet-4-6";
  const geminiModel = (formData.get("geminiModel") as string) || "gemini-2.5-flash";
  const openaiModel = (formData.get("openaiModel") as string) || "latest";
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
  const anthropicApiKey = resolveMaskedKey(submittedAnthropicKey, stored.anthropicApiKey);
  const geminiApiKey = resolveMaskedKey(submittedGeminiKey, stored.geminiApiKey);
  const openaiApiKey = resolveMaskedKey(submittedOpenaiKey, stored.openaiApiKey);
  const braveSearchApiKey = resolveMaskedKey(submittedBraveKey, stored.braveSearchApiKey);
  const adzunaApiKey = resolveMaskedKey(submittedAdzunaKey, stored.adzunaApiKey);

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

export async function saveClayCredentialAction(formData: FormData) {
  const submitted = ((formData.get("clayApiKey") as string) ?? "").trim();
  // resolveMaskedKey runs inside saveIntegrationCredential: the form echoes back
  // ••••last4 when the user did not retype the key, and that means "unchanged".
  saveIntegrationCredential({ provider: "clay", credential: submitted });

  // Saving is not connecting. Test immediately so the badge reflects the key that
  // is actually stored, rather than leaving a stale status from a previous one.
  if (submitted) {
    const result = await testClayConnection(getIntegrationCredential("clay"));
    saveIntegrationTestResult({
      provider: "clay",
      status: result.status,
      accountLabel: result.accountLabel,
      metadata: result.metadata,
    });
  }

  revalidatePath("/settings");
}

export async function testClayConnectionAction() {
  const result = await testClayConnection(getIntegrationCredential("clay"));
  saveIntegrationTestResult({
    provider: "clay",
    status: result.status,
    accountLabel: result.accountLabel,
    metadata: result.metadata,
  });
  revalidatePath("/settings");
}

export async function disconnectClayAction() {
  disconnectIntegration("clay");
  revalidatePath("/settings");
}

export async function clearForgottenContactsAction() {
  clearContactSuppressions();
  revalidatePath("/settings");
}

export async function saveClayRoutineAction(formData: FormData) {
  const routineId = ((formData.get("enrichmentRoutineId") as string) ?? "").trim();
  // An unchecked checkbox submits nothing at all, so absence means off.
  const autoEnrich = formData.get("autoEnrichSearchResults") === "on";
  saveIntegrationMetadata("clay", {
    enrichmentRoutineId: routineId,
    // Auto-enrichment without a routine would silently do nothing.
    autoEnrichSearchResults: routineId ? autoEnrich : false,
  });
  revalidatePath("/settings");
}
