import type { UserProfileRecord } from "@/lib/db/types";

/**
 * Whether the profile names somewhere to work on site.
 *
 * Only required when an on-site or hybrid arrangement is selected: a remote-only search
 * has no city to give a job board, and an empty remote-region list already means
 * "anywhere", which is a real answer rather than a gap.
 */
export function hasPreferredLocations(
  profile: Pick<UserProfileRecord, "workModes" | "preferredLocations">
): boolean {
  const needsPlace = profile.workModes.includes("onsite") || profile.workModes.includes("hybrid");
  return !needsPlace || profile.preferredLocations.length > 0;
}
