import { describe, expect, it } from "vitest";

import { buildJobPreferenceFilter, type JobPreferenceProfile } from "@/lib/jobs/preference-fit";
import {
  REGION_GROUPS,
  matchRegionGroups,
  regionGroupForLabel,
} from "@/lib/profile/region-groups";

const baseProfile: JobPreferenceProfile = {
  location: "Nashville, Tennessee, United States",
  preferredLocations: [],
  remoteLocations: [],
  remotePreference: "remote-only",
  workPreferences: [],
  workModes: ["remote"],
  constraints: [],
  dealBreakers: [],
};

const accepts = (remoteLocations: string[], location: string, title = "Product Designer") =>
  buildJobPreferenceFilter({ ...baseProfile, remoteLocations })({ title, location }).accepted;

describe("matchRegionGroups", () => {
  it("offers the region groups the geocoder cannot resolve", () => {
    // OpenStreetMap answers these with a French commune and a town in Uganda.
    expect(matchRegionGroups("EU").map((group) => group.label)).toContain("European Union");
    expect(matchRegionGroups("APAC").map((group) => group.label)).toContain("APAC");
    expect(matchRegionGroups("Europe").map((group) => group.label)).toContain("Europe");
  });

  it("leads with the exact spelling rather than the longer name that contains it", () => {
    expect(matchRegionGroups("eu")[0]?.label).toBe("European Union");
    expect(matchRegionGroups("europe")[0]?.label).toBe("Europe");
  });

  it("reaches groups whose match falls in the middle of the name", () => {
    const labels = matchRegionGroups("america").map((group) => group.label);
    expect(labels).toEqual(
      expect.arrayContaining(["North America", "South America", "Latin America", "Americas"])
    );
  });

  it("matches case- and punctuation-insensitively", () => {
    expect(matchRegionGroups("  Asia-Pacific ").map((group) => group.label)).toContain("APAC");
    expect(matchRegionGroups("LATAM").map((group) => group.label)).toContain("Latin America");
  });

  it("returns nothing for a blank query or a plain city", () => {
    expect(matchRegionGroups("")).toEqual([]);
    expect(matchRegionGroups("   ")).toEqual([]);
    expect(matchRegionGroups("Nashville")).toEqual([]);
  });
});

describe("regionGroupForLabel", () => {
  it("rewrites a typed alias to the catalogue spelling", () => {
    expect(regionGroupForLabel("eu")?.label).toBe("European Union");
    expect(regionGroupForLabel("LATAM")?.label).toBe("Latin America");
    expect(regionGroupForLabel("Asia Pacific")?.label).toBe("APAC");
  });

  it("leaves a plain place alone", () => {
    expect(regionGroupForLabel("Nashville, Tennessee, United States")).toBeNull();
  });
});

describe("every catalogue label is usable as a saved preference", () => {
  // The picker writes `group.label` into the preference list, so the matcher has
  // to recognise every one of them. A label that drifted out of its own alias
  // list would silently accept nothing.
  it.each(REGION_GROUPS.map((group) => [group.label, group.key] as const))(
    "%s expands to its member countries",
    (label) => {
      expect(regionGroupForLabel(label)).not.toBeNull();
    }
  );

  it("accepts a member country's remote posting once the group is selected", () => {
    expect(accepts(["European Union"], "Germany (Remote)")).toBe(true);
  });

  it("still rejects a country outside the selected group", () => {
    expect(accepts(["European Union"], "Remote - Japan")).toBe(false);
  });

  it("keeps Europe and the European Union apart", () => {
    expect(accepts(["Europe"], "United Kingdom (Remote)")).toBe(true);
    expect(accepts(["European Union"], "United Kingdom (Remote)")).toBe(false);
  });

  it("accepts the alias the picker rewrites, exactly as the label does", () => {
    expect(accepts(["APAC"], "Remote - Singapore")).toBe(true);
    expect(accepts(["Latin America"], "Brazil (Remote)")).toBe(true);
  });
});
