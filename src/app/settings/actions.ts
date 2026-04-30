"use server";

import { revalidatePath } from "next/cache";
import { saveAISettings } from "@/lib/db/queries";
import type { AIProviderName } from "@/lib/db/types";

export async function saveAISettingsAction(formData: FormData) {
  const activeProvider = formData.get("activeProvider") as AIProviderName;
  const anthropicApiKey = (formData.get("anthropicApiKey") as string) ?? "";
  const geminiApiKey = (formData.get("geminiApiKey") as string) ?? "";
  const openaiApiKey = (formData.get("openaiApiKey") as string) ?? "";
  const anthropicModel = (formData.get("anthropicModel") as string) || "claude-sonnet-4-6";
  const geminiModel = (formData.get("geminiModel") as string) || "gemini-2.0-flash";
  const openaiModel = (formData.get("openaiModel") as string) || "gpt-4o";
  const fallbackProvider = (formData.get("fallbackProvider") as string) ?? "";

  const validProviders: AIProviderName[] = ["anthropic", "gemini", "openai"];
  if (!validProviders.includes(activeProvider)) {
    throw new Error("Invalid provider selection.");
  }

  saveAISettings({
    activeProvider,
    anthropicApiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicModel,
    geminiModel,
    openaiModel,
    fallbackProvider
  });

  revalidatePath("/settings");
}
