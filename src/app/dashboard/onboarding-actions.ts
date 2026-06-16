"use server";

import { revalidatePath } from "next/cache";
import {
  createResumeLane,
  getAISettings,
  getUserProfile,
  saveAISettings,
  saveTitleFilters,
  setOnboardingPreferencesConfirmed,
  saveScanSchedule,
  updateUserProfile,
} from "@/lib/db/queries";
import { splitListValue } from "@/lib/profile/intelligence";
import type { WorkMode } from "@/lib/db/types";

const WORK_MODE_VALUES = new Set<WorkMode>(["remote", "hybrid", "onsite"]);

function splitWorkModes(formData: FormData): WorkMode[] {
  return formData.getAll("workModes").filter((value): value is WorkMode => WORK_MODE_VALUES.has(value as WorkMode));
}

function remotePreferenceFromWorkModes(workModes: WorkMode[]): "remote-only" | "local-or-remote" | "all" {
  if (workModes.length === 1 && workModes[0] === "remote") return "remote-only";
  if (workModes.includes("remote") && workModes.length < 3) return "local-or-remote";
  return "all";
}

function normalizeTitleKeywords(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

function mergeUnique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function revalidateOnboardingSurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/profile");
  revalidatePath("/settings");
  revalidatePath("/jobs");
}

export async function saveOnboardingPreferencesAction(formData: FormData) {
  const previous = getUserProfile();
  const targetRoles = mergeUnique(splitListValue(formData.get("targetRoles")));
  const positive = normalizeTitleKeywords(splitListValue(formData.get("titlePositive")));
  const negative = normalizeTitleKeywords(splitListValue(formData.get("titleNegative")));
  const workModes = splitWorkModes(formData);

  updateUserProfile({
    ...previous,
    targetRoles,
    workModes,
    remotePreference: remotePreferenceFromWorkModes(workModes),
  });
  saveTitleFilters(positive, negative);
  setOnboardingPreferencesConfirmed(true);

  revalidateOnboardingSurfaces();
}

export async function createOnboardingResumeLaneAction() {
  createResumeLane("New Resume");
  revalidateOnboardingSurfaces();
}

export async function saveOnboardingIntegrationsAction(formData: FormData) {
  const existing = getAISettings();
  const adzunaAppId = String(formData.get("adzunaAppId") ?? "").trim();
  const adzunaApiKey = String(formData.get("adzunaApiKey") ?? "").trim();
  const braveSearchApiKey = String(formData.get("braveSearchApiKey") ?? "").trim();
  saveAISettings({
    activeProvider: existing.activeProvider,
    anthropicApiKey: existing.anthropicApiKey,
    geminiApiKey: existing.geminiApiKey,
    openaiApiKey: existing.openaiApiKey,
    anthropicModel: existing.anthropicModel,
    geminiModel: existing.geminiModel,
    openaiModel: existing.openaiModel,
    ollamaBaseUrl: existing.ollamaBaseUrl,
    ollamaModel: existing.ollamaModel,
    fallbackProvider: existing.fallbackProvider,
    providerOrderJson: existing.providerOrderJson,
    adzunaAppId: adzunaAppId || undefined,
    adzunaApiKey: adzunaApiKey || undefined,
    braveSearchApiKey: braveSearchApiKey || undefined,
  });
  revalidateOnboardingSurfaces();
}

export async function dismissOnboardingAction() {
  const settings = getAISettings();
  saveAISettings({
    activeProvider: settings.activeProvider,
    anthropicApiKey: settings.anthropicApiKey,
    geminiApiKey: settings.geminiApiKey,
    openaiApiKey: settings.openaiApiKey,
    anthropicModel: settings.anthropicModel,
    geminiModel: settings.geminiModel,
    openaiModel: settings.openaiModel,
    ollamaBaseUrl: settings.ollamaBaseUrl,
    ollamaModel: settings.ollamaModel,
    fallbackProvider: settings.fallbackProvider,
    providerOrderJson: settings.providerOrderJson,
    onboardingDismissed: true,
    onboardingPreferencesConfirmed: settings.onboardingPreferencesConfirmed,
  });
  revalidatePath("/dashboard");
}

export async function saveOnboardingScheduleAction(enabled: boolean) {
  saveScanSchedule({ enabled, intervalHours: 6, freshnessWindowHours: 72 });
  revalidateOnboardingSurfaces();
}
