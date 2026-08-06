import { describe, expect, it } from "vitest";
import {
  buildJobPreferenceFilter,
  splitLocationCandidates,
  type JobPreferenceProfile,
} from "@/lib/jobs/preference-fit";

/** Mirrors the real profile that exposed these bugs: Nashville-based, all work modes selected. */
const NASHVILLE: JobPreferenceProfile = {
  location: "Nashville, TN",
  preferredLocations: ["Tennessee, United States"],
  remotePreference: "all",
  workPreferences: [],
  workModes: ["remote", "hybrid", "onsite"],
  constraints: [],
  dealBreakers: [],
};

const accepts = (profile: JobPreferenceProfile, location: string, title = "Product Designer") =>
  buildJobPreferenceFilter(profile)({ title, location }).accepted;

describe("splitLocationCandidates", () => {
  it("splits on bullet separators", () => {
    expect(splitLocationCandidates("San Francisco, CA • New York, NY • United States")).toEqual([
      "San Francisco, CA",
      "New York, NY",
      "United States",
    ]);
  });

  it("splits on pipes and semicolons", () => {
    expect(splitLocationCandidates("San Francisco, CA | Seattle, WA")).toEqual(["San Francisco, CA", "Seattle, WA"]);
    expect(splitLocationCandidates("Remote, Canada; Remote, US")).toEqual(["Remote, Canada", "Remote, US"]);
  });

  it("does not split on commas, which are intra-location", () => {
    expect(splitLocationCandidates("San Francisco, CA")).toEqual(["San Francisco, CA"]);
  });

  it("returns the original value when there is nothing to split", () => {
    expect(splitLocationCandidates("Remote")).toEqual(["Remote"]);
    expect(splitLocationCandidates("")).toEqual([""]);
  });
});

describe("buildJobPreferenceFilter — country-wide locations", () => {
  it("accepts a bare country location inside the preferred country", () => {
    expect(accepts(NASHVILLE, "United States")).toBe(true);
    expect(accepts(NASHVILLE, "USA")).toBe(true);
    expect(accepts(NASHVILLE, "US")).toBe(true);
  });

  it("rejects a bare country location outside the preferred country", () => {
    expect(accepts(NASHVILLE, "United Kingdom")).toBe(false);
    expect(accepts(NASHVILLE, "Canada")).toBe(false);
  });

  it("does not treat a state as country-wide", () => {
    expect(accepts(NASHVILLE, "Ohio")).toBe(false);
    expect(accepts(NASHVILLE, "Seattle, Washington, USA")).toBe(false);
  });
});

describe("buildJobPreferenceFilter — home metro", () => {
  it("accepts the user's own metro area against a state-level preference", () => {
    expect(accepts(NASHVILLE, "Nashville Metropolitan Area")).toBe(true);
    expect(accepts(NASHVILLE, "Nashville, TN")).toBe(true);
  });

  it("still accepts the state itself", () => {
    expect(accepts(NASHVILLE, "Memphis, TN")).toBe(true);
  });

  it("does not seed the home city when it falls outside the preferred region", () => {
    const relocating: JobPreferenceProfile = {
      ...NASHVILLE,
      preferredLocations: ["California, United States"],
    };
    expect(accepts(relocating, "Nashville Metropolitan Area")).toBe(false);
    expect(accepts(relocating, "San Jose, CA")).toBe(true);
  });
});

describe("buildJobPreferenceFilter — multi-location postings", () => {
  it("accepts when any listed location qualifies", () => {
    expect(accepts(NASHVILLE, "San Francisco, CA • New York, NY • United States")).toBe(true);
  });

  it("accepts a long multi-city list containing a remote option", () => {
    // Verbatim from a real Greenhouse posting.
    const listed =
      "Boston, MA; Chicago, Illinois, United States; Los Angeles, California, United States; " +
      "New York, New York, United States; Remote; Vancouver, British Columbia, Canada; " +
      "Vancouver, Washington, United States";
    expect(accepts(NASHVILLE, listed)).toBe(true);
  });

  it("rejects a multi-city list of on-site offices with no qualifying entry", () => {
    // A trailing ", United States" is a country suffix on a city, not country-wide availability.
    expect(accepts(NASHVILLE, "Boston, MA; Chicago, Illinois, United States")).toBe(false);
    expect(accepts(NASHVILLE, "San Francisco, CA | Seattle, WA | Tel Aviv, Israel")).toBe(false);
  });
});

describe("buildJobPreferenceFilter — regressions", () => {
  it("still rejects genuinely out-of-scope on-site roles", () => {
    expect(accepts(NASHVILLE, "Prague, Czechia")).toBe(false);
    expect(accepts(NASHVILLE, "Tel Aviv, Israel")).toBe(false);
    expect(accepts(NASHVILLE, "SF Office")).toBe(false);
    expect(accepts(NASHVILLE, "US-NC-Cary")).toBe(false);
  });

  it("still accepts remote roles regardless of geography", () => {
    expect(accepts(NASHVILLE, "Remote")).toBe(true);
    expect(accepts(NASHVILLE, "United States - Remote")).toBe(true);
    expect(accepts(NASHVILLE, "Anywhere in the World")).toBe(true);
  });

  it("still honours work-mode opt-outs", () => {
    const remoteOnly: JobPreferenceProfile = { ...NASHVILLE, workModes: ["remote"] };
    expect(accepts(remoteOnly, "United States")).toBe(false);
    expect(accepts(remoteOnly, "Nashville Metropolitan Area")).toBe(false);
    expect(accepts(remoteOnly, "United States - Remote")).toBe(true);
  });

  it("still honours the junior deal breaker across split locations", () => {
    const noJuniors: JobPreferenceProfile = { ...NASHVILLE, dealBreakers: ["No junior roles"] };
    expect(accepts(noJuniors, "United States", "Junior Product Designer")).toBe(false);
    expect(accepts(noJuniors, "United States", "Senior Product Designer")).toBe(true);
  });

  it("accepts everything when no profile is supplied", () => {
    expect(buildJobPreferenceFilter()({ title: "Anything", location: "Anywhere" }).accepted).toBe(true);
  });
});

/**
 * These branches are only reachable when `workModes` is empty — every other
 * fixture in this file sets it, so they were previously never executed. Location
 * splitting changed their behaviour, since `restrictedRemote` is now evaluated
 * per listed location rather than against the concatenated string.
 */
describe("buildJobPreferenceFilter — remote-only preference (no work modes)", () => {
  const remoteOnly: JobPreferenceProfile = {
    ...NASHVILLE,
    workModes: [],
    remotePreference: "remote-only",
  };

  it("rejects anything not remote", () => {
    expect(accepts(remoteOnly, "San Francisco, CA")).toBe(false);
    expect(accepts(remoteOnly, "Nashville, TN")).toBe(false);
  });

  it("accepts unrestricted remote", () => {
    expect(accepts(remoteOnly, "Remote")).toBe(true);
  });

  it("accepts US-wide remote against a US preference", () => {
    expect(accepts(remoteOnly, "United States - Remote")).toBe(true);
    expect(accepts(remoteOnly, "Remote (USA)")).toBe(true);
  });

  it("rejects remote restricted to a region outside preferences", () => {
    expect(accepts(remoteOnly, "Remote - Europe")).toBe(false);
    expect(accepts(remoteOnly, "UK - Remote")).toBe(false);
  });

  it("accepts a multi-location posting that offers an in-scope remote option", () => {
    // Splitting matters here: evaluated as one string the trailing offices made
    // this a restricted remote outside preferences.
    expect(accepts(remoteOnly, "Remote; New York, NY")).toBe(true);
    expect(accepts(remoteOnly, "Remote, Canada; Remote, US")).toBe(true);
  });

  it("still rejects when every listed remote option is out of region", () => {
    expect(accepts(remoteOnly, "Remote - Europe; UK - Remote")).toBe(false);
  });
});

describe("buildJobPreferenceFilter — local-or-remote preference (no work modes)", () => {
  const localOrRemote: JobPreferenceProfile = {
    ...NASHVILLE,
    workModes: [],
    remotePreference: "local-or-remote",
  };

  it("accepts in-region on-site roles", () => {
    expect(accepts(localOrRemote, "Nashville, TN")).toBe(true);
    expect(accepts(localOrRemote, "Nashville Metropolitan Area")).toBe(true);
  });

  it("rejects out-of-region on-site roles", () => {
    expect(accepts(localOrRemote, "San Francisco, CA")).toBe(false);
    expect(accepts(localOrRemote, "Prague, Czechia")).toBe(false);
  });

  it("accepts unrestricted and US-wide remote", () => {
    expect(accepts(localOrRemote, "Remote")).toBe(true);
    expect(accepts(localOrRemote, "United States - Remote")).toBe(true);
  });

  it("rejects remote restricted outside the preferred region", () => {
    expect(accepts(localOrRemote, "Remote - Europe")).toBe(false);
  });

  it("accepts a multi-location posting when any listed option qualifies", () => {
    expect(accepts(localOrRemote, "Berlin, Germany; Nashville, TN")).toBe(true);
    expect(accepts(localOrRemote, "Berlin, Germany | Remote")).toBe(true);
  });
});
