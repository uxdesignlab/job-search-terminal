/**
 * Scan sources that are not career-site entries.
 *
 * Their errors are reported under these names in the same list as company
 * career pages, but `scan_source_overrides` — what **Disable** writes — only
 * governs career pages. Offering Disable on one of these did nothing, while the
 * UI then claimed the source would be skipped. Himalayas was switched off that
 * way by accident, so these rows get no Disable control at all.
 */
export const SCAN_LANE_NAMES = new Set(["Adzuna", "Dice", "Himalayas"]);

export function isScanLane(name: string): boolean {
  return SCAN_LANE_NAMES.has(name);
}

/** What the user can do about a lane instead of disabling it. */
export function scanLaneHint(name: string): string | null {
  if (name === "Adzuna") return "Adjust Adzuna under Settings → AI Provider → Discovery & Aggregators.";
  if (name === "Dice" || name === "Himalayas") {
    return `${name} is part of every scan, so there is nothing to disable here.`;
  }
  return null;
}
