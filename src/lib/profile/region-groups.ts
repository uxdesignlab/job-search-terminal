/**
 * The supra-national regions a user can name in their location preferences.
 *
 * One catalogue, two consumers that used to drift apart:
 *
 * - `preference-fit` expands a selected group into its member countries, so
 *   choosing "Europe" accepts a role posted as "Germany (Remote)".
 * - The location picker offers these groups as suggestions. It has to, because
 *   the geocoder behind the picker has never heard of them: OpenStreetMap
 *   answers "EU" with the French commune of Eu and "APAC" with Apac, Uganda.
 *   Without this list the only way to record "Europe" was to type it and find
 *   an "Add typed location" button that the geocoder's own suggestions were
 *   sitting on top of.
 *
 * Aliases are normalized the way `preference-fit` normalizes text — lower case,
 * non-alphanumerics collapsed to single spaces — so they can be compared to a
 * posting's region name directly.
 */
export type RegionGroup = {
  /** Normalized key, and the value matched against a posting's region name. */
  key: string;
  /** How the group is written into a preference list and shown as a chip. */
  label: string;
  /** Every spelling that means this group. Must include `key`. */
  aliases: string[];
  /** ISO 3166-1 alpha-2 members, space separated. */
  memberCodes: string;
  /** What the group covers, in one line, shown beside it in the picker. */
  covers: string;
};

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

/**
 * Order matters: `preference-fit` resolves a posting's region to the *first*
 * group whose aliases match it, and spreads this list into its own alias table
 * after the plain-country entries.
 *
 * `europe` and `european union` are deliberately separate groups. A posting that
 * says "EU work authorization required" genuinely excludes the UK, Switzerland
 * and Norway, so folding them together would accept roles the user cannot take.
 */
export const REGION_GROUPS: readonly RegionGroup[] = [
  {
    key: "european union",
    label: "European Union",
    aliases: ["european union", "eu"],
    memberCodes: EU_CODES,
    covers: "The 27 member states. Does not include the UK, Switzerland or Norway."
  },
  {
    key: "europe",
    label: "Europe",
    aliases: ["europe"],
    memberCodes: EUROPE_CODES,
    covers: "All of geographic Europe, including the UK, Switzerland and Norway."
  },
  {
    key: "emea",
    label: "EMEA",
    aliases: ["emea"],
    memberCodes: `${EUROPE_CODES} ${MIDDLE_EAST_CODES} ${AFRICA_CODES}`,
    covers: "Europe, the Middle East and Africa."
  },
  {
    key: "asia",
    label: "Asia",
    aliases: ["asia"],
    memberCodes: ASIA_CODES,
    covers: "Every country in Asia."
  },
  {
    key: "apac",
    label: "APAC",
    aliases: ["apac", "asia pacific"],
    memberCodes: `${ASIA_CODES} ${OCEANIA_CODES}`,
    covers: "Asia and Oceania."
  },
  {
    key: "africa",
    label: "Africa",
    aliases: ["africa"],
    memberCodes: AFRICA_CODES,
    covers: "Every country in Africa."
  },
  {
    key: "middle east",
    label: "Middle East",
    aliases: ["middle east"],
    memberCodes: MIDDLE_EAST_CODES,
    covers: "The Gulf states, the Levant, Israel, Iran and Turkey."
  },
  {
    key: "oceania",
    label: "Oceania",
    aliases: ["oceania"],
    memberCodes: OCEANIA_CODES,
    covers: "Australia, New Zealand and the Pacific islands."
  },
  {
    key: "north america",
    label: "North America",
    aliases: ["north america"],
    memberCodes: NORTH_AMERICA_CODES,
    covers: "The United States, Canada and Mexico."
  },
  {
    key: "south america",
    label: "South America",
    aliases: ["south america"],
    memberCodes: SOUTH_AMERICA_CODES,
    covers: "Every country on the South American continent."
  },
  {
    key: "latin america",
    label: "Latin America",
    aliases: ["latin america", "latam"],
    memberCodes: `MX ${CENTRAL_AMERICA_CODES} ${CARIBBEAN_CODES} ${SOUTH_AMERICA_CODES}`,
    covers: "Mexico, Central America, the Caribbean and South America."
  },
  {
    key: "americas",
    label: "Americas",
    aliases: ["americas"],
    memberCodes: `${NORTH_AMERICA_CODES} ${CENTRAL_AMERICA_CODES} ${CARIBBEAN_CODES} ${SOUTH_AMERICA_CODES}`,
    covers: "North, Central and South America, and the Caribbean."
  },
  {
    key: "nordics",
    label: "Nordics",
    aliases: ["nordics", "nordic"],
    memberCodes: "DK FI IS NO SE",
    covers: "Denmark, Finland, Iceland, Norway and Sweden."
  },
  {
    key: "scandinavia",
    label: "Scandinavia",
    aliases: ["scandinavia"],
    memberCodes: "DK NO SE",
    covers: "Denmark, Norway and Sweden."
  },
  {
    key: "benelux",
    label: "Benelux",
    aliases: ["benelux"],
    memberCodes: "BE NL LU",
    covers: "Belgium, the Netherlands and Luxembourg."
  }
];

/** Group key → its aliases, in catalogue order. */
export const REGION_GROUP_ALIASES: Record<string, string[]> = Object.fromEntries(
  REGION_GROUPS.map((group) => [group.key, group.aliases])
);

/** Group key → its member ISO 3166-1 alpha-2 codes, in catalogue order. */
export const REGION_GROUP_MEMBER_CODES: Record<string, string> = Object.fromEntries(
  REGION_GROUPS.map((group) => [group.key, group.memberCodes])
);

/** Every spelling of every group, for vocabularies that need the region names. */
export const REGION_GROUP_ALIAS_LIST: readonly string[] = REGION_GROUPS.flatMap(
  (group) => group.aliases
);

function normalizeQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Groups worth offering for what the user has typed so far.
 *
 * Substring rather than prefix matching, because the useful reading of a partial
 * entry is often in the middle of the name: "america" should reach North, South
 * and Latin America, not only "Americas". Prefix matches still sort first, so
 * typing "eu" leads with the European Union rather than burying it.
 */
export function matchRegionGroups(query: string, limit = 6): RegionGroup[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const scored: Array<{ group: RegionGroup; rank: number }> = [];

  for (const group of REGION_GROUPS) {
    let rank = Number.POSITIVE_INFINITY;
    for (const alias of group.aliases) {
      if (alias === normalized) rank = Math.min(rank, 0);
      else if (alias.startsWith(normalized)) rank = Math.min(rank, 1);
      else if (alias.includes(normalized)) rank = Math.min(rank, 2);
    }
    if (Number.isFinite(rank)) scored.push({ group, rank });
  }

  return scored
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((entry) => entry.group);
}

/** The group a stored preference names, if it names one at all. */
export function regionGroupForLabel(value: string): RegionGroup | null {
  const normalized = normalizeQuery(value);
  return REGION_GROUPS.find((group) => group.aliases.includes(normalized)) ?? null;
}
