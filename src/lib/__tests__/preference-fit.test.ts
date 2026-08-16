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
  // Matches what migration 0058 seeds, so these cases keep their original meaning.
  remoteLocations: ["Tennessee, United States"],
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

describe("buildJobPreferenceFilter — region-restricted remote roles", () => {
  it("rejects remote roles tied to a country the user cannot work in", () => {
    expect(accepts(NASHVILLE, "Germany (Remote)")).toBe(false);
    expect(accepts(NASHVILLE, "Remote - Europe")).toBe(false);
    expect(accepts(NASHVILLE, "UK - Remote")).toBe(false);
    expect(accepts(NASHVILLE, "Remote (Philippines)")).toBe(false);
  });

  it("accepts remote roles open to the user's country", () => {
    expect(accepts(NASHVILLE, "United States (Remote)")).toBe(true);
    expect(accepts(NASHVILLE, "Remote, US")).toBe(true);
    expect(accepts(NASHVILLE, "U.S Remote")).toBe(true);
  });

  it("reads 'remotely' and the spaced 'world wide' as unrestricted remote", () => {
    // Verbatim from a real Planet posting. Neither token was recognised, so the
    // office cities beside them read as a region restriction and the role was
    // discarded despite being open world wide.
    expect(
      accepts(
        NASHVILLE,
        "remotely world wide and joining us from offices in San Francisco, Washington DC, Germany, Austria, Slovenia",
      ),
    ).toBe(true);
    expect(accepts(NASHVILLE, "Remotely, Germany")).toBe(false);
  });

  it("treats an unrecognised remainder as unrestricted rather than guessing", () => {
    // Rejecting these is the failure mode this filter has already caused once;
    // an unparseable location must never silently discard a role.
    expect(accepts(NASHVILLE, "Anywhere in the World")).toBe(true);
    expect(accepts(NASHVILLE, "27 Locations, Remote")).toBe(true);
    expect(accepts(NASHVILLE, "Remote - Distributed Team")).toBe(true);
  });

  it("accepts a US state named as the remote restriction", () => {
    // "Georgia" is both a country and a US state; the in-country reading wins
    // for a US-based preference.
    expect(accepts(NASHVILLE, "Remote (California)")).toBe(true);
    expect(accepts(NASHVILLE, "Georgia (Remote)")).toBe(true);
  });

  it("accepts a multi-region role when any region is in scope", () => {
    expect(accepts(NASHVILLE, "Germany (Remote); United States (Remote)")).toBe(true);
  });

  it("leaves on-site handling untouched", () => {
    expect(accepts(NASHVILLE, "Berlin, Germany")).toBe(false);
    expect(accepts(NASHVILLE, "Nashville, TN")).toBe(true);
  });
});

/**
 * The reason the two lists exist. Sharing one list made "I'll commute only in
 * Nashville, but I'd take a remote role anywhere in the US or Canada"
 * inexpressible: adding Canada to reach remote-Canada roles also admitted
 * on-site Toronto offices, and omitting it rejected the remote roles.
 */
describe("buildJobPreferenceFilter — remote regions separate from commute locations", () => {
  const split: JobPreferenceProfile = {
    ...NASHVILLE,
    preferredLocations: ["Nashville, Tennessee, United States"],
    remoteLocations: ["United States", "Canada"],
  };

  it("accepts remote roles in a country it would not commute to", () => {
    expect(accepts(split, "Remote, Canada")).toBe(true);
    expect(accepts(split, "Canada (Remote)")).toBe(true);
  });

  it("rejects on-site roles in that same country", () => {
    expect(accepts(split, "Toronto, Ontario, Canada")).toBe(false);
    expect(accepts(split, "Hybrid - Vancouver, British Columbia, Canada")).toBe(false);
  });

  it("still rejects remote roles outside every accepted region", () => {
    expect(accepts(split, "Remote - Europe")).toBe(false);
    expect(accepts(split, "Germany (Remote)")).toBe(false);
    expect(accepts(split, "Remote (Philippines)")).toBe(false);
  });

  it("keeps commute matching scoped to the on-site list", () => {
    expect(accepts(split, "Hybrid - Nashville, TN")).toBe(true);
    // Memphis rides along because a "City, State, Country" preference also
    // registers its state — existing buildLocationMatchers behaviour, untouched here.
    expect(accepts(split, "Memphis, TN")).toBe(true);
    expect(accepts(split, "Hybrid - Austin, TX")).toBe(false);
    expect(accepts(split, "Seattle, Washington, United States")).toBe(false);
  });

  it("treats an empty remote list as no region restriction", () => {
    const anywhereRemote: JobPreferenceProfile = { ...split, remoteLocations: [] };
    expect(accepts(anywhereRemote, "Remote - Europe")).toBe(true);
    expect(accepts(anywhereRemote, "Germany (Remote)")).toBe(true);
    // On-site is unaffected by the remote list being empty.
    expect(accepts(anywhereRemote, "Berlin, Germany")).toBe(false);
  });

  it("still accepts remote roles with no stated region", () => {
    expect(accepts(split, "Remote")).toBe(true);
    expect(accepts(split, "Anywhere in the World")).toBe(true);
    expect(accepts(split, "27 Locations, Remote")).toBe(true);
  });

  it("keeps a job whose location the board never reported", () => {
    // Missing data, not a mismatch — the same rule the importer applies.
    const unknown = buildJobPreferenceFilter(split)({ title: "Product Designer", location: "Not specified" });
    expect(unknown.accepted).toBe(true);
    expect(unknown.locationUnknown).toBe(true);
    expect(buildJobPreferenceFilter(split)({ title: "Product Designer", location: "" }).accepted).toBe(true);
    // A real location is still judged, and carries no unknown flag.
    const known = buildJobPreferenceFilter(split)({ title: "Product Designer", location: "Berlin, Germany" });
    expect(known.accepted).toBe(false);
    expect(known.locationUnknown).toBeUndefined();
  });

  it("narrows remote regions without touching the commute list", () => {
    // Same commute list, remote narrowed to the US alone: Canada now drops out.
    const usRemoteOnly: JobPreferenceProfile = { ...split, remoteLocations: ["United States"] };
    expect(accepts(usRemoteOnly, "Remote, Canada")).toBe(false);
    expect(accepts(usRemoteOnly, "United States - Remote")).toBe(true);
    expect(accepts(usRemoteOnly, "Hybrid - Nashville, TN")).toBe(true);
  });
});

/**
 * Selecting a continent or bloc expands to its member countries, so a user does
 * not have to enumerate 27 nations to say "the EU".
 */
describe("buildJobPreferenceFilter — supra-national remote regions", () => {
  const withRemote = (remoteLocations: string[]): JobPreferenceProfile => ({
    ...NASHVILLE,
    preferredLocations: ["Nashville, Tennessee, United States"],
    remoteLocations,
  });

  it("expands Europe to its member countries", () => {
    const europe = withRemote(["Europe"]);
    expect(accepts(europe, "Germany (Remote)")).toBe(true);
    expect(accepts(europe, "Remote - France")).toBe(true);
    expect(accepts(europe, "Poland (Remote)")).toBe(true);
    expect(accepts(europe, "India (Remote)")).toBe(false);
    expect(accepts(europe, "Brazil (Remote)")).toBe(false);
  });

  it("treats the EU as a narrower set than Europe", () => {
    const eu = withRemote(["European Union"]);
    expect(accepts(eu, "Germany (Remote)")).toBe(true);
    expect(accepts(eu, "Spain (Remote)")).toBe(true);
    // The distinction that matters: "EU work authorization" excludes these.
    expect(accepts(eu, "United Kingdom (Remote)")).toBe(false);
    expect(accepts(eu, "Switzerland (Remote)")).toBe(false);
    expect(accepts(eu, "Norway (Remote)")).toBe(false);

    const europe = withRemote(["Europe"]);
    expect(accepts(europe, "United Kingdom (Remote)")).toBe(true);
    expect(accepts(europe, "Switzerland (Remote)")).toBe(true);
    expect(accepts(europe, "Norway (Remote)")).toBe(true);
  });

  it("accepts the EU abbreviation as the bloc, not the continent", () => {
    expect(accepts(withRemote(["EU"]), "Germany (Remote)")).toBe(true);
    expect(accepts(withRemote(["EU"]), "United Kingdom (Remote)")).toBe(false);
  });

  it("accepts a posting open to a wider region than the user's", () => {
    // Containment in the other direction: a role advertised across Europe is
    // takeable by someone authorized only in the EU.
    expect(accepts(withRemote(["European Union"]), "Remote - Europe")).toBe(true);
    expect(accepts(withRemote(["European Union"]), "Remote - EMEA")).toBe(true);
    expect(accepts(withRemote(["United States"]), "Remote - North America")).toBe(true);
    expect(accepts(withRemote(["United States"]), "Remote - Americas")).toBe(true);
    // But a wider region that does not contain the user's is still out.
    expect(accepts(withRemote(["United States"]), "Remote - Europe")).toBe(false);
    expect(accepts(withRemote(["United States"]), "Remote - APAC")).toBe(false);
  });

  it("supports the other regions postings name", () => {
    expect(accepts(withRemote(["APAC"]), "Japan (Remote)")).toBe(true);
    expect(accepts(withRemote(["APAC"]), "Australia (Remote)")).toBe(true);
    expect(accepts(withRemote(["APAC"]), "Germany (Remote)")).toBe(false);
    expect(accepts(withRemote(["Nordics"]), "Sweden (Remote)")).toBe(true);
    expect(accepts(withRemote(["Nordics"]), "Germany (Remote)")).toBe(false);
    expect(accepts(withRemote(["Latin America"]), "Brazil (Remote)")).toBe(true);
    expect(accepts(withRemote(["Latin America"]), "Spain (Remote)")).toBe(false);
  });

  it("expands a supra-national on-site preference to member countries too", () => {
    const europeOnsite: JobPreferenceProfile = {
      ...NASHVILLE,
      preferredLocations: ["Europe"],
      remoteLocations: [],
    };
    expect(accepts(europeOnsite, "Berlin, Germany")).toBe(true);
    expect(accepts(europeOnsite, "Hybrid - Paris, France")).toBe(true);
    expect(accepts(europeOnsite, "Tokyo, Japan")).toBe(false);
    // "Georgia" is a US state as well as a country, so a continent must not
    // drag Atlanta in.
    expect(accepts(europeOnsite, "Atlanta, Georgia")).toBe(false);
  });
});
