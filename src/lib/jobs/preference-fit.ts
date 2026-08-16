import type { UserProfileRecord } from "../db/types";

export type JobPreferenceProfile = Pick<
  UserProfileRecord,
  | "location"
  | "preferredLocations"
  | "remoteLocations"
  | "remotePreference"
  | "workPreferences"
  | "workModes"
  | "constraints"
  | "dealBreakers"
>;

export type PreferenceCheckJob = {
  title: string;
  location: string;
};

export type JobPreferenceDecision = {
  accepted: boolean;
  reason?: string;
  /** The board never reported a location, so no location judgement was made. */
  locationUnknown?: boolean;
};

export const OUTSIDE_PREFERENCES_LABEL = "Out of scope";
export const UNKNOWN_LOCATION_LABEL = "No location";

/** Placeholders boards and importers use when a posting carries no location. */
const UNREPORTED_LOCATION_VALUES = new Set(["", "not specified", "unspecified", "unknown", "n a", "tbd"]);

/**
 * A missing location is missing *data*, not a location mismatch.
 *
 * Judging it would reject every posting a board declined to geocode — the same
 * "never discard a role for want of parseable input" rule that keeps an
 * unrecognised remote restriction in scope.
 */
export function isLocationReported(rawLocation: string | null | undefined): boolean {
  return !UNREPORTED_LOCATION_VALUES.has(normalizeText(rawLocation ?? ""));
}

export function buildJobPreferenceFilter(profile?: JobPreferenceProfile) {
  if (!profile) {
    return (): JobPreferenceDecision => ({ accepted: true });
  }

  // Two independent lists. `preferredLocations` is where the user would physically
  // work, so it governs hybrid and on-site postings. `remoteLocations` is which
  // countries' remote roles they can accept, so it governs region-restricted remote
  // postings. Sharing one list made these inseparable: widening it to catch remote
  // roles in another country also pulled in that country's on-site offices.
  const locationMatchers = buildLocationMatchers(profile.preferredLocations, profile.location);
  const hasLocationPreferences = locationMatchers.length > 0;
  const onsiteCountries = derivePreferredCountries(profile.preferredLocations);
  const remoteCountries = derivePreferredCountries(profile.remoteLocations);
  const hasRemoteRegionPreferences = remoteCountries.size > 0;
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
    /** Commutable match — reads `preferredLocations` only. */
    const matchesOnsiteLocation =
      (hasLocationPreferences && locationMatchers.some((matcher) => matcher(location))) ||
      (countryWide !== null && onsiteCountries.has(countryWide));
    // An explicit "world wide" / "anywhere" outranks any place names beside it.
    // Postings routinely say "remotely world wide, joining us from offices in
    // San Francisco, Germany, Austria" — those are the company's offices, not a
    // restriction, and reading them as one discards a globally open role.
    const restrictedRemote = isRemote && !isGloballyOpen(location) && remoteRemainder.length > 0;

    /** The remote posting's region is one of the countries in `remoteLocations`. */
    const remoteRegionInScope = countryWide !== null && remoteCountries.has(countryWide);

    /**
     * A remote role tied to a region the user cannot work in — reads
     * `remoteLocations` only, so it is independent of where the user would commute.
     *
     * Deliberately permissive: this is only true when the restriction *names a
     * recognised region* and none of the named regions are in scope. An
     * unrecognised remainder ("Anywhere in the World", "27 Locations") is treated
     * as unrestricted, because guessing wrong here silently discards good roles —
     * the exact failure this filter has already caused once. An empty
     * `remoteLocations` likewise means "remote from anywhere is fine".
     */
    const remoteRegionOutOfScope =
      restrictedRemote &&
      hasRemoteRegionPreferences &&
      !remoteRegionInScope &&
      (() => {
        const regions = regionsMentionedIn(remoteRemainder);
        if (regions.length === 0) return false;
        return !regions.some((region) => {
          const group = countryWideLocationGroup(region);
          if (group && remoteCountries.has(group)) return true;
          return isRegionInScope(region, remoteCountries);
        });
      })();

    if (selectedWorkModes) {
      if (isRemote) {
        if (!selectedWorkModes.has("remote")) {
          return { accepted: false, reason: "remote not selected" };
        }
        // This branch used to accept any remote posting regardless of region,
        // which imported EU-only roles the user cannot take.
        if (remoteRegionOutOfScope) {
          return { accepted: false, reason: "remote location outside preferences" };
        }
        return { accepted: true };
      }

      if (isHybrid) {
        if (!selectedWorkModes.has("hybrid")) {
          return { accepted: false, reason: "hybrid not selected" };
        }
        return hasLocationPreferences && !matchesOnsiteLocation
          ? { accepted: false, reason: "hybrid location outside preferences" }
          : { accepted: true };
      }

      if (!selectedWorkModes.has("onsite")) {
        return { accepted: false, reason: "on-site not selected" };
      }
      return hasLocationPreferences && !matchesOnsiteLocation
        ? { accepted: false, reason: "on-site location outside preferences" }
        : { accepted: true };
    }

    if (hardRemoteOnly) {
      if (!isRemote) {
        return { accepted: false, reason: "remote-only preference" };
      }
      if (remoteRegionOutOfScope) {
        return { accepted: false, reason: "remote location outside preferences" };
      }
      return { accepted: true };
    }

    if (hardLocalOrRemote && hasLocationPreferences) {
      if (isRemote) {
        return remoteRegionOutOfScope
          ? { accepted: false, reason: "remote location outside preferences" }
          : { accepted: true };
      }
      return matchesOnsiteLocation
        ? { accepted: true }
        : { accepted: false, reason: "outside preferred locations" };
    }

    if ((avoidsOnsiteOnly || hasRemotePreferenceText) && !isRemote && !isHybrid) {
      return { accepted: false, reason: "onsite-only deal breaker" };
    }

    if (remoteRegionOutOfScope) {
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

    if (!isLocationReported(job.location)) {
      return { accepted: true, locationUnknown: true };
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

const REGION_DISPLAY_NAMES: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    /* Intl.DisplayNames unavailable — callers fall back to the static lists. */
    return null;
  }
})();

/** Normalized English name for an ISO 3166 alpha-2 code, or `null` if unknown. */
function regionDisplayName(code: string): string | null {
  if (!REGION_DISPLAY_NAMES) return null;
  try {
    const name = REGION_DISPLAY_NAMES.of(code);
    return name && name !== code ? normalizeText(name) : null;
  } catch {
    return null;
  }
}

/**
 * ISO 3166-1 alpha-2 members of each supra-national region, so selecting
 * "Europe" accepts a role posted as "Germany (Remote)". Codes rather than names
 * because the names are resolved through the same `Intl.DisplayNames` data that
 * `WORLD_REGION_NAMES` uses — the two vocabularies therefore always agree.
 */
const EU_CODES = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE";
/** Geographic Europe: the EU plus the non-member states, incl. transcontinental ones. */
const EUROPE_CODES = `${EU_CODES} AL AD AM BA BY CH FO GE GI GG IS IM JE XK LI MC MD ME MK NO RS RU SM UA GB VA`;
const MIDDLE_EAST_CODES = "AE BH CY IL IQ IR JO KW LB OM PS QA SA SY TR YE";
const AFRICA_CODES =
  "DZ AO BJ BW BF BI CM CV CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML " +
  "MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW";
const ASIA_CODES =
  "AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS " +
  "PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE";
const OCEANIA_CODES = "AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU";
const NORTH_AMERICA_CODES = "US CA MX";
const CENTRAL_AMERICA_CODES = "BZ CR SV GT HN NI PA";
const CARIBBEAN_CODES = "CU DO HT JM TT BS BB PR";
const SOUTH_AMERICA_CODES = "AR BO BR CL CO EC GY PY PE SR UY VE";

const REGION_MEMBER_CODES: Record<string, string> = {
  "european union": EU_CODES,
  europe: EUROPE_CODES,
  emea: `${EUROPE_CODES} ${MIDDLE_EAST_CODES} ${AFRICA_CODES}`,
  asia: ASIA_CODES,
  apac: `${ASIA_CODES} ${OCEANIA_CODES}`,
  africa: AFRICA_CODES,
  "middle east": MIDDLE_EAST_CODES,
  oceania: OCEANIA_CODES,
  "north america": NORTH_AMERICA_CODES,
  "south america": SOUTH_AMERICA_CODES,
  "latin america": `MX ${CENTRAL_AMERICA_CODES} ${CARIBBEAN_CODES} ${SOUTH_AMERICA_CODES}`,
  americas: `${NORTH_AMERICA_CODES} ${CENTRAL_AMERICA_CODES} ${CARIBBEAN_CODES} ${SOUTH_AMERICA_CODES}`,
  nordics: "DK FI IS NO SE",
  scandinavia: "DK NO SE",
  benelux: "BE NL LU"
};

/** Region key → the normalized display names of its member countries. */
const REGION_MEMBERS: Record<string, ReadonlySet<string>> = Object.fromEntries(
  Object.entries(REGION_MEMBER_CODES).map(([group, codes]) => [
    group,
    new Set(
      codes
        .split(" ")
        .map((code) => regionDisplayName(code))
        .filter((name): name is string => Boolean(name))
    )
  ])
);

/**
 * `europe` and `european union` are deliberately separate groups. A posting that
 * says "EU work authorization required" genuinely excludes the UK, Switzerland
 * and Norway, so folding them together would accept roles the user cannot take.
 */
const LOCATION_ALIAS_GROUPS: Record<string, string[]> = {
  "united states": ["united states", "united states of america", "usa", "u s a", "us", "u s", "america", ...US_STATE_ALIASES],
  "united kingdom": ["united kingdom", "uk", "u k", "great britain", "britain", "england", "scotland", "wales", "northern ireland"],
  canada: ["canada", "ontario", "british columbia", "quebec", "alberta"],
  "european union": ["european union", "eu"],
  europe: ["europe"],
  emea: ["emea"],
  asia: ["asia"],
  apac: ["apac", "asia pacific"],
  africa: ["africa"],
  "middle east": ["middle east"],
  oceania: ["oceania"],
  "north america": ["north america"],
  "south america": ["south america"],
  "latin america": ["latin america", "latam"],
  americas: ["americas"],
  nordics: ["nordics", "nordic"],
  scandinavia: ["scandinavia"],
  benelux: ["benelux"]
};

/** Country names an accepted group covers; a plain country covers only itself. */
function countriesCoveredBy(group: string): ReadonlySet<string> {
  return REGION_MEMBERS[group] ?? new Set([group]);
}

/** The supra-national group a posting's region name refers to, if any. */
function supranationalGroupFor(region: string): string | null {
  for (const [group, aliases] of Object.entries(LOCATION_ALIAS_GROUPS)) {
    if (REGION_MEMBERS[group] && aliases.includes(region)) return group;
  }
  return null;
}

/**
 * Whether a region named by a posting overlaps the user's accepted regions.
 *
 * Overlap, not containment, in both directions:
 * - The posting names something *inside* an accepted region — "Germany" within
 *   "Europe", or a US state within "United States".
 * - The posting names something *wider* than an accepted region. Someone who can
 *   work in the EU can take a role advertised across Europe, and a US-only
 *   candidate can take one advertised across North America; requiring
 *   containment would discard both.
 */
function isRegionInScope(region: string, acceptedGroups: ReadonlySet<string>) {
  for (const group of acceptedGroups) {
    if (LOCATION_ALIAS_GROUPS[group]?.includes(region)) return true;
    if (REGION_MEMBERS[group]?.has(region)) return true;
  }

  const postingGroup = supranationalGroupFor(region);
  if (!postingGroup) return false;
  const postingCountries = REGION_MEMBERS[postingGroup];
  for (const group of acceptedGroups) {
    for (const country of countriesCoveredBy(group)) {
      if (postingCountries.has(country)) return true;
    }
  }
  return false;
}

/**
 * Country-level tokens only — deliberately NOT reusing LOCATION_ALIAS_GROUPS,
 * whose "united states" entry folds in all 50 state aliases and would classify
 * "Ohio" as country-wide.
 */
const COUNTRY_LEVEL_ALIASES: Record<string, string[]> = {
  "united states": ["united states", "united states of america", "usa", "u s a", "us", "u s", "america"],
  "united kingdom": ["united kingdom", "uk", "u k", "great britain", "britain"],
  canada: ["canada"],
  "european union": ["european union", "eu"],
  europe: ["europe"],
  emea: ["emea"]
};

/**
 * Every ISO 3166 region name, taken from the runtime's own CLDR data.
 *
 * Deciding whether a remote posting is restricted to somewhere the user cannot
 * work needs a vocabulary of place names. Hand-maintaining a world list would rot;
 * `Intl.DisplayNames` supplies ~264 names for free and stays current with the
 * platform. Sampled against a live Himalayas feed it recognised every one of the
 * 139 distinct restriction values, while correctly *not* matching non-geographic
 * leftovers such as "in the world" or "27 locations".
 */
const WORLD_REGION_NAMES: ReadonlySet<string> = (() => {
  const names = new Set<string>();
  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const name = regionDisplayName(String.fromCharCode(a) + String.fromCharCode(b));
      if (name) names.add(name);
    }
  }
  // Supra-national regions ISO does not cover but postings routinely use.
  for (const extra of [
    "europe", "european union", "eu", "emea", "apac", "latam", "north america",
    "south america", "latin america", "americas", "asia", "africa", "middle east",
    "oceania", "nordics", "scandinavia", "benelux", "uk",
  ]) {
    names.add(extra);
  }
  return names;
})();

/** Longest region name in words, so n-gram scanning knows how wide to look. */
const MAX_REGION_WORDS = 4;

/** Region names mentioned anywhere in `text`, found via word n-grams. */
function regionsMentionedIn(text: string): string[] {
  const words = text.split(" ").filter(Boolean);
  const found: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    for (let n = Math.min(MAX_REGION_WORDS, words.length - i); n >= 1; n -= 1) {
      const phrase = words.slice(i, i + n).join(" ");
      if (WORLD_REGION_NAMES.has(phrase)) {
        found.push(phrase);
        break;
      }
    }
  }
  return found;
}

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

    for (const [key, group] of Object.entries(LOCATION_ALIAS_GROUPS)) {
      if (!group.includes(normalized)) continue;
      group.forEach((alias) => addLocationAlias(aliases, alias));
      // A supra-national preference should match its member countries, so
      // "Europe" accepts an office in Berlin.
      for (const member of REGION_MEMBERS[key] ?? []) {
        // "Georgia" names both a country and a US state. Seeding it from a
        // continent would make Atlanta match a Europe preference.
        if (US_STATE_ALIASES.includes(member)) continue;
        addLocationAlias(aliases, member);
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
    // "Remotely" is a distinct token from "remote", so it needs naming: a
    // posting reading "remotely world wide" was otherwise read as on-site.
    containsLocationToken(location, "remotely") ||
    containsLocationToken(location, "anywhere") ||
    containsLocationToken(location, "distributed") ||
    containsLocationToken(location, "worldwide") ||
    containsLocationToken(location, "world wide") ||
    containsLocationToken(location, "global");
}

function isHybridLocation(location: string) {
  return containsLocationToken(location, "hybrid");
}

/** Terms that positively assert no geographic restriction, not merely remoteness. */
const GLOBALLY_OPEN_TERMS = ["anywhere", "worldwide", "world wide", "global", "globally", "distributed"];

function isGloballyOpen(location: string) {
  return GLOBALLY_OPEN_TERMS.some((term) => containsLocationToken(location, term));
}

const UNRESTRICTED_REMOTE_TERMS = [
  // "world wide" before "worldwide" is irrelevant (both are matched as whole
  // tokens), but both spellings must be listed or the spaced form survives into
  // the remainder and the office cities beside it read as a region restriction.
  "remote", "remotely", "anywhere", "distributed", "worldwide", "world wide", "global",
  "work from home", "wfh",
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
