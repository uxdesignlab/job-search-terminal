"use server";

import { revalidatePath } from "next/cache";
import {
  createResumeLane,
  getUserProfile,
  saveAISettings,
  saveTitleFilters,
  setOnboardingPreferencesConfirmed,
  saveScanSchedule,
  updateUserProfile,
} from "@/lib/db/queries";
import { splitListValue } from "@/lib/profile/intelligence";
import { normalizePreferredLocations, splitLocationLines } from "@/lib/profile/locations";
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

/** Roles and title keywords. Work arrangement and locations belong to the Locations
 *  step — they are a different question and were crowding this one. */
export async function saveOnboardingPreferencesAction(formData: FormData) {
  const previous = getUserProfile();
  const targetRoles = mergeUnique(splitListValue(formData.get("targetRoles")));
  const positive = normalizeTitleKeywords(splitListValue(formData.get("titlePositive")));
  const negative = normalizeTitleKeywords(splitListValue(formData.get("titleNegative")));

  updateUserProfile({ ...previous, targetRoles });
  saveTitleFilters(positive, negative);
  setOnboardingPreferencesConfirmed(true);

  revalidateOnboardingSurfaces();
}

/**
 * Work arrangement plus the places each arrangement applies to. Scanning needs both:
 * the on-site/hybrid list becomes the board's location parameter, and the remote list
 * decides whether a region-restricted remote posting is in scope. An empty remote list
 * deliberately means "anywhere" rather than "nowhere".
 */
export async function saveOnboardingLocationsAction(formData: FormData) {
  const previous = getUserProfile();
  const workModes = splitWorkModes(formData);
  const preferredLocations = normalizePreferredLocations(splitLocationLines(formData.get("preferredLocations")));
  const remoteLocations = splitLocationLines(formData.get("remoteLocations"));

  updateUserProfile({
    ...previous,
    workModes,
    hasExplicitWorkModes: workModes.length > 0,
    remotePreference: remotePreferenceFromWorkModes(workModes),
    preferredLocations,
    remoteLocations,
  });

  revalidateOnboardingSurfaces();
}

export async function createOnboardingResumeLaneAction() {
  createResumeLane("New Resume");
  revalidateOnboardingSurfaces();
}

export async function saveOnboardingIntegrationsAction(formData: FormData) {
  const adzunaAppId = String(formData.get("adzunaAppId") ?? "").trim();
  const adzunaApiKey = String(formData.get("adzunaApiKey") ?? "").trim();
  const braveSearchApiKey = String(formData.get("braveSearchApiKey") ?? "").trim();
  // Blank means "leave the saved key alone", and everything this step does not name
  // keeps its stored value.
  saveAISettings({
    adzunaAppId: adzunaAppId || undefined,
    adzunaApiKey: adzunaApiKey || undefined,
    braveSearchApiKey: braveSearchApiKey || undefined,
  });
  revalidateOnboardingSurfaces();
}

export async function dismissOnboardingAction() {
  saveAISettings({ onboardingDismissed: true });
  revalidatePath("/dashboard");
}

/** Puts the first-run wizard back on the dashboard. Dismissal used to be a one-way
 *  door: nothing in the UI cleared the flag, so the only way back was a side effect of
 *  re-uploading a resume. */
export async function reopenOnboardingAction() {
  saveAISettings({ onboardingDismissed: false });
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}

export async function saveOnboardingScheduleAction(enabled: boolean) {
  saveScanSchedule({ enabled, intervalHours: 6, freshnessWindowHours: 72 });
  revalidateOnboardingSurfaces();
}
