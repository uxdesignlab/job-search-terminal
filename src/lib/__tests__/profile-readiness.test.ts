import { describe, expect, it } from "vitest";
import { getProfileReadiness } from "@/lib/profile/readiness";

const COMPLETE_PROFILE = {
  hasConfiguredAIProvider: true,
  hasUploadedResume: true,
  hasTargetRoles: true,
  hasPositiveTitleFilters: true,
  hasExplicitWorkModes: true,
  hasPreferredLocations: true,
};

describe("getProfileReadiness", () => {
  it("derives readiness from actual setup data", () => {
    const readiness = getProfileReadiness(COMPLETE_PROFILE);

    expect(readiness.isReady).toBe(true);
    expect(readiness.missingItems).toEqual([]);
    expect(readiness.hasPreferences).toBe(true);
  });

  it("names each missing setup item", () => {
    const readiness = getProfileReadiness({
      hasConfiguredAIProvider: false,
      hasUploadedResume: false,
      hasTargetRoles: false,
      hasPositiveTitleFilters: false,
      hasExplicitWorkModes: false,
      hasPreferredLocations: false,
    });

    expect(readiness.missingItems.map((item) => item.id)).toEqual([
      "ai-provider",
      "resume",
      "target-roles",
      "title-filters",
      "work-modes",
      "preferred-locations",
    ]);
  });

  it("keeps role and location readiness independent", () => {
    const readiness = getProfileReadiness({
      ...COMPLETE_PROFILE,
      hasPositiveTitleFilters: false,
    });

    expect(readiness.isReady).toBe(false);
    expect(readiness.hasRolePreferences).toBe(false);
    expect(readiness.hasLocationPreferences).toBe(true);
    expect(readiness.missingItems.map((item) => item.label)).toEqual(["Included title filters"]);
    expect(readiness.missingItems[0]?.href).toBe("/settings?tab=preferences");
  });

  it("requires an explicit work-mode selection", () => {
    const readiness = getProfileReadiness({
      ...COMPLETE_PROFILE,
      hasExplicitWorkModes: false,
    });

    expect(readiness.isReady).toBe(false);
    expect(readiness.hasLocationPreferences).toBe(false);
    expect(readiness.missingItems.map((item) => item.id)).toEqual(["work-modes"]);
  });

  it("asks for a place to work only when on-site or hybrid is selected", () => {
    const readiness = getProfileReadiness({
      ...COMPLETE_PROFILE,
      hasPreferredLocations: false,
    });

    expect(readiness.isReady).toBe(false);
    expect(readiness.hasLocationPreferences).toBe(false);
    expect(readiness.missingItems.map((item) => item.id)).toEqual(["preferred-locations"]);
  });
});
