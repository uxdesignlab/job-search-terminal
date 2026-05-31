import type { FreshnessWindowHours } from "@/lib/db/types";

export const DEFAULT_FRESHNESS_WINDOW_HOURS: FreshnessWindowHours = 72;
export const FRESHNESS_WINDOW_OPTIONS: FreshnessWindowHours[] = [24, 72, 168];

export type FreshnessClassification = "fresh" | "unknown-date" | "stale";

export function classifyFreshness(
  datePosted: string | null | undefined,
  windowHours: FreshnessWindowHours = DEFAULT_FRESHNESS_WINDOW_HOURS,
  now = new Date()
): FreshnessClassification {
  if (!datePosted) return "unknown-date";
  const postedAt = Date.parse(datePosted);
  if (!Number.isFinite(postedAt)) return "unknown-date";
  return postedAt >= now.getTime() - windowHours * 60 * 60 * 1000 ? "fresh" : "stale";
}

export function freshnessLabelFor(datePosted: string | null | undefined, now = new Date()): string {
  const classification = classifyFreshness(datePosted, 72, now);
  if (classification === "unknown-date") return "Recently discovered - date unknown";
  if (classification === "stale") return "Older posting";
  const hours = Math.max(0, Math.floor((now.getTime() - Date.parse(datePosted!)) / (60 * 60 * 1000)));
  return hours < 24 ? "Posted in the last 24h" : "Posted in the last 72h";
}
