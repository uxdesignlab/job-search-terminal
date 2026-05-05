import type { UserProfileRecord } from "../db/types";

export type JobPreferenceProfile = Pick<
  UserProfileRecord,
  "location" | "preferredLocations" | "remotePreference" | "workPreferences" | "constraints" | "dealBreakers"
>;

export type PreferenceCheckJob = {
  title: string;
  location: string;
};

export type JobPreferenceDecision = {
  accepted: boolean;
  reason?: string;
};

export const OUTSIDE_PREFERENCES_LABEL = "Out of scope";

export function buildJobPreferenceFilter(profile?: JobPreferenceProfile) {
  if (!profile) {
    return (): JobPreferenceDecision => ({ accepted: true });
  }

  const locationMatchers = buildLocationMatchers([profile.location, ...profile.preferredLocations]);
  const hasLocationPreferences = locationMatchers.length > 0;
  const hardRemoteOnly = profile.remotePreference === "remote-only";
  const hardLocalOrRemote = profile.remotePreference === "local-or-remote";
  const avoidsOnsiteOnly = profile.dealBreakers.some((item) => normalizeText(item).includes("onsite only") || normalizeText(item).includes("on site only"));
  const hasRemotePreferenceText = [...profile.workPreferences, ...profile.constraints].some((item) => normalizeText(item).includes("remote"));

  return (job: PreferenceCheckJob): JobPreferenceDecision => {
    const title = normalizeText(job.title);
    const location = normalizeText(job.location);
    const isRemote = isRemoteLocation(location);
    const isHybrid = isHybridLocation(location);
    const matchesPreferredLocation = hasLocationPreferences && locationMatchers.some((matcher) => matcher(location));
    const restrictedRemote = isRemote && hasRemoteLocationRestriction(location);

    if (hasJuniorDealBreaker(profile.dealBreakers) && isJuniorTitle(title)) {
      return { accepted: false, reason: "junior deal breaker" };
    }

    if (hardRemoteOnly) {
      if (!isRemote) {
        return { accepted: false, reason: "remote-only preference" };
      }
      if (hasLocationPreferences && restrictedRemote && !matchesPreferredLocation) {
        return { accepted: false, reason: "remote location outside preferences" };
      }
      return { accepted: true };
    }

    if (hardLocalOrRemote && hasLocationPreferences) {
      if (isRemote) {
        return restrictedRemote && !matchesPreferredLocation
          ? { accepted: false, reason: "remote location outside preferences" }
          : { accepted: true };
      }
      return matchesPreferredLocation
        ? { accepted: true }
        : { accepted: false, reason: "outside preferred locations" };
    }

    if ((avoidsOnsiteOnly || hasRemotePreferenceText) && !isRemote && !isHybrid) {
      return { accepted: false, reason: "onsite-only deal breaker" };
    }

    if (hasLocationPreferences && restrictedRemote && !matchesPreferredLocation) {
      return { accepted: false, reason: "remote location outside preferences" };
    }

    return { accepted: true };
  };
}

const US_STATE_ALIASES = [
  "alabama", "al", "alaska", "ak", "arizona", "az", "arkansas", "ar", "california", "ca", "colorado", "co",
  "connecticut", "ct", "delaware", "de", "florida", "fl", "georgia", "ga", "hawaii", "hi", "idaho", "id",
  "illinois", "il", "indiana", "in", "iowa", "ia", "kansas", "ks", "kentucky", "ky", "louisiana", "la",
  "maine", "me", "maryland", "md", "massachusetts", "ma", "michigan", "mi", "minnesota", "mn",
  "mississippi", "ms", "missouri", "mo", "montana", "mt", "nebraska", "ne", "nevada", "nv",
  "new hampshire", "nh", "new jersey", "nj", "new mexico", "nm", "new york", "ny", "north carolina", "nc",
  "north dakota", "nd", "ohio", "oh", "oklahoma", "ok", "oregon", "or", "pennsylvania", "pa",
  "rhode island", "ri", "south carolina", "sc", "south dakota", "sd", "tennessee", "tn", "texas", "tx",
  "utah", "ut", "vermont", "vt", "virginia", "va", "washington", "wa", "west virginia", "wv",
  "wisconsin", "wi", "wyoming", "wy", "district of columbia", "dc"
];

const LOCATION_ALIAS_GROUPS: Record<string, string[]> = {
  "united states": ["united states", "united states of america", "usa", "u s a", "us", "u s", "america", ...US_STATE_ALIASES],
  "united kingdom": ["united kingdom", "uk", "u k", "great britain", "britain", "england", "scotland", "wales", "northern ireland"],
  canada: ["canada", "ontario", "british columbia", "quebec", "alberta"],
  europe: ["europe", "european union", "eu", "emea"]
};

function buildLocationMatchers(preferences: string[]) {
  const aliases = new Set<string>();

  for (const preference of preferences) {
    const normalized = normalizeText(preference);
    if (!normalized) continue;
    aliases.add(normalized);

    for (const group of Object.values(LOCATION_ALIAS_GROUPS)) {
      if (group.includes(normalized)) {
        group.forEach((alias) => aliases.add(alias));
      }
    }

    if (US_STATE_ALIASES.includes(normalized)) {
      LOCATION_ALIAS_GROUPS["united states"].forEach((alias) => aliases.add(alias));
    }
  }

  return [...aliases].map((alias) => (location: string) => containsLocationToken(location, alias));
}

function containsLocationToken(location: string, alias: string) {
  if (!alias) return false;
  return new RegExp(`(^|\\s)${escapeRegExp(alias)}(\\s|$)`, "i").test(location);
}

function isRemoteLocation(location: string) {
  return containsLocationToken(location, "remote") ||
    containsLocationToken(location, "anywhere") ||
    containsLocationToken(location, "distributed") ||
    containsLocationToken(location, "worldwide") ||
    containsLocationToken(location, "global");
}

function isHybridLocation(location: string) {
  return containsLocationToken(location, "hybrid");
}

function hasRemoteLocationRestriction(location: string) {
  const unrestricted = ["remote", "anywhere", "distributed", "worldwide", "global", "work from home", "wfh"];
  let remainder = location;
  for (const term of unrestricted) {
    remainder = remainder.replace(new RegExp(`(^|\\s)${escapeRegExp(term)}(\\s|$)`, "gi"), " ");
  }
  return remainder.trim().length > 0;
}

function hasJuniorDealBreaker(dealBreakers: string[]) {
  return dealBreakers.some((item) => {
    const normalized = normalizeText(item);
    return containsLocationToken(normalized, "junior") ||
      normalized.includes("entry level") ||
      normalized.includes("entry-level") ||
      containsLocationToken(normalized, "intern");
  });
}

function isJuniorTitle(title: string) {
  return containsLocationToken(title, "junior") ||
    title.includes("entry level") ||
    title.includes("entry-level") ||
    containsLocationToken(title, "intern") ||
    containsLocationToken(title, "internship");
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
