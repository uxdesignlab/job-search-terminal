import type { UserProfileRecord } from "../db/types";

export type JobPreferenceProfile = Pick<
  UserProfileRecord,
  "location" | "preferredLocations" | "remotePreference" | "workPreferences" | "workModes" | "constraints" | "dealBreakers"
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

  const locationMatchers = buildLocationMatchers(profile.preferredLocations, profile.location);
  const hasLocationPreferences = locationMatchers.length > 0;
  const preferredCountries = derivePreferredCountries(profile.preferredLocations);
  const hardRemoteOnly = profile.remotePreference === "remote-only";
  const hardLocalOrRemote = profile.remotePreference === "local-or-remote";
  const avoidsOnsiteOnly = profile.dealBreakers.some((item) => normalizeText(item).includes("onsite only") || normalizeText(item).includes("on site only"));
  const hasRemotePreferenceText = [...profile.workPreferences, ...profile.constraints].some((item) => normalizeText(item).includes("remote"));
  const selectedWorkModes = profile.workModes.length > 0 ? new Set(profile.workModes) : null;

  const evaluateLocation = (rawLocation: string): JobPreferenceDecision => {
    const location = normalizeText(rawLocation);
    const isRemote = isRemoteLocation(location);
    const isHybrid = isHybridLocation(location);
    // A posting whose location is a country ("United States", "USA") is
    // country-wide availability, not an unspecified on-site office. Treat it as
    // matching any preference inside that country.
    //
    // For a remote posting the country may be the *restriction* rather than the
    // whole string ("United States - Remote"), so check the remainder too —
    // otherwise US-wide remote roles are rejected for not being in Tennessee.
    const remoteRemainder = isRemote ? remoteRestrictionRemainder(location) : "";
    const countryWide =
      countryWideLocationGroup(location) ??
      (remoteRemainder ? countryWideLocationGroup(remoteRemainder) : null);
    const matchesPreferredLocation =
      (hasLocationPreferences && locationMatchers.some((matcher) => matcher(location))) ||
      (countryWide !== null && preferredCountries.has(countryWide));
    const restrictedRemote = isRemote && remoteRemainder.length > 0;

    if (selectedWorkModes) {
      if (isRemote) {
        if (!selectedWorkModes.has("remote")) {
          return { accepted: false, reason: "remote not selected" };
        }
        return { accepted: true };
      }

      if (isHybrid) {
        if (!selectedWorkModes.has("hybrid")) {
          return { accepted: false, reason: "hybrid not selected" };
        }
        return hasLocationPreferences && !matchesPreferredLocation
          ? { accepted: false, reason: "hybrid location outside preferences" }
          : { accepted: true };
      }

      if (!selectedWorkModes.has("onsite")) {
        return { accepted: false, reason: "on-site not selected" };
      }
      return hasLocationPreferences && !matchesPreferredLocation
        ? { accepted: false, reason: "on-site location outside preferences" }
        : { accepted: true };
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

  return (job: PreferenceCheckJob): JobPreferenceDecision => {
    // Title-level deal breakers are location-independent, so they short-circuit
    // before any per-location evaluation.
    if (hasJuniorDealBreaker(profile.dealBreakers) && isJuniorTitle(normalizeText(job.title))) {
      return { accepted: false, reason: "junior deal breaker" };
    }

    // Postings routinely list several locations in one field
    // ("San Francisco, CA • New York, NY • United States"). Accept the job when
    // any single listed location is acceptable.
    let rejection: JobPreferenceDecision = { accepted: false, reason: "outside preferred locations" };
    for (const candidate of splitLocationCandidates(job.location)) {
      const decision = evaluateLocation(candidate);
      if (decision.accepted) return decision;
      rejection = decision;
    }
    return rejection;
  };
}

/** Strong separators used by ATS boards to join several locations in one field. */
const LOCATION_SEPARATOR_RE = /[•·|;\n]+/;

export function splitLocationCandidates(rawLocation: string): string[] {
  // Split on the raw string — normalizeText strips these separators.
  const parts = rawLocation
    .split(LOCATION_SEPARATOR_RE)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [rawLocation];
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

/**
 * Country-level tokens only — deliberately NOT reusing LOCATION_ALIAS_GROUPS,
 * whose "united states" entry folds in all 50 state aliases and would classify
 * "Ohio" as country-wide.
 */
const COUNTRY_LEVEL_ALIASES: Record<string, string[]> = {
  "united states": ["united states", "united states of america", "usa", "u s a", "us", "u s", "america"],
  "united kingdom": ["united kingdom", "uk", "u k", "great britain", "britain"],
  canada: ["canada"],
  europe: ["europe", "european union", "eu", "emea"]
};

/** Returns the country group when `location` is exactly a country-level label. */
function countryWideLocationGroup(location: string): string | null {
  if (!location) return null;
  for (const [group, aliases] of Object.entries(COUNTRY_LEVEL_ALIASES)) {
    if (aliases.includes(location)) return group;
  }
  return null;
}

/** Country groups implied by the user's preferred locations (state names included). */
function derivePreferredCountries(preferences: string[]): Set<string> {
  const countries = new Set<string>();
  for (const preference of preferences) {
    const normalized = normalizeText(preference);
    if (!normalized) continue;
    for (const [group, aliases] of Object.entries(LOCATION_ALIAS_GROUPS)) {
      if (aliases.some((alias) => containsLocationToken(normalized, alias))) {
        countries.add(group);
      }
    }
  }
  return countries;
}

function buildLocationMatchers(preferences: string[], homeLocation?: string) {
  const aliases = new Set<string>();

  for (const preference of preferences) {
    const normalized = normalizeText(preference);
    if (!normalized) continue;
    addLocationAlias(aliases, normalized);
    const broadPreference = isBroadLocationPreference(normalized);

    for (const group of Object.values(LOCATION_ALIAS_GROUPS)) {
      if (group.includes(normalized)) {
        group.forEach((alias) => addLocationAlias(aliases, alias));
      }
    }

    if (!broadPreference) {
      const parts = locationLabelParts(preference);
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        const normalizedPart = normalizeText(part);
        const isFinalCompositePart = parts.length > 1 && index === parts.length - 1;
        if (!isFinalCompositePart) {
          addLocationAlias(aliases, normalizedPart);
        }
      }
    }
  }

  // Metro labels ("Nashville Metropolitan Area") do not contain their state, so a
  // state-level preference misses them. When the user's own city already falls
  // inside a preferred region, accept that city name too. Gated on the home
  // location matching first, so someone living outside their target region does
  // not silently pull in local roles.
  if (homeLocation) {
    const normalizedHome = normalizeText(homeLocation);
    const homeIsPreferred = [...aliases].some((alias) => containsLocationToken(normalizedHome, alias));
    if (homeIsPreferred) {
      for (const part of locationLabelParts(homeLocation)) {
        addLocationAlias(aliases, normalizeText(part));
      }
    }
  }

  return [...aliases].map((alias) => (location: string) => containsLocationToken(location, alias));
}

function locationLabelParts(preference: string) {
  return preference.split(",").map((part) => part.trim()).filter(Boolean);
}

function isBroadLocationPreference(value: string) {
  return Object.values(LOCATION_ALIAS_GROUPS).some((group) => group.includes(value));
}

function addLocationAlias(aliases: Set<string>, value: string) {
  if (!value) return;
  aliases.add(value);
  for (const stateAlias of stateAliasesFor(value)) {
    aliases.add(stateAlias);
  }
}

function stateAliasesFor(value: string) {
  for (let index = 0; index < US_STATE_ALIASES.length; index += 2) {
    const state = US_STATE_ALIASES[index];
    const abbreviation = US_STATE_ALIASES[index + 1];
    if (value === state || value === abbreviation) {
      return [state, abbreviation];
    }
  }
  return value === "district of columbia" || value === "dc" ? ["district of columbia", "dc"] : [];
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

const UNRESTRICTED_REMOTE_TERMS = [
  "remote", "anywhere", "distributed", "worldwide", "global", "work from home", "wfh",
];

/**
 * What is left of a location once the remote-ness words are removed.
 *
 * `""` means the posting is remote without a stated region. Anything else is the
 * region the remote role is restricted to — which is the part that actually has
 * to be compared against preferences.
 */
function remoteRestrictionRemainder(location: string) {
  let remainder = location;
  for (const term of UNRESTRICTED_REMOTE_TERMS) {
    remainder = remainder.replace(new RegExp(`(^|\\s)${escapeRegExp(term)}(\\s|$)`, "gi"), " ");
  }
  return remainder.replace(/\s+/g, " ").trim();
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
