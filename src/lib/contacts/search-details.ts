const LEVEL_WORDS = new Set([
  "senior", "sr", "staff", "principal", "lead", "manager", "director", "head",
  "chief", "vp", "svp", "evp", "vice", "president", "leadership", "i", "ii", "iii",
]);

const JOINING_WORDS = new Set(["of", "the"]);

export const PEOPLE_SHORTLIST_LIMIT = 5;

export type PeopleSearchLaneId = "hiring_leader" | "team_leader" | "recruiter";

export type PeopleSearchLane = {
  id: PeopleSearchLaneId;
  label: string;
  description: string;
  titleKeywords: string[];
  limit: number;
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizedWords(value: string): string[] {
  return value
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function functionalPhrase(value: string): string {
  const words = normalizedWords(value).filter(
    (word) => !LEVEL_WORDS.has(word) && !JOINING_WORDS.has(word),
  );
  return words.slice(0, 4).join(" ");
}

function normalizeTitle(value: string): string {
  return normalizedWords(value).join(" ").slice(0, 100);
}

function addRoleAliases(values: string[]): string[] {
  const joined = values.join(" ");
  if (/\b(user experience|ux)\b/.test(joined)) {
    return unique(["user experience", "product design", ...values.filter((value) => value !== "design")]);
  }
  if (/\bproduct design\b/.test(joined)) {
    return unique(["product design", "user experience", ...values.filter((value) => value !== "design")]);
  }
  return unique(values);
}

/** A short, editable description of the function this job belongs to. */
export function titleKeywordsForPeopleSearch(jobTitle: string, roleArchetype = ""): string[] {
  const titleFocus = functionalPhrase(jobTitle);
  const archetypeFocus = functionalPhrase(roleArchetype);
  return addRoleAliases(unique([titleFocus, archetypeFocus])).slice(0, 2);
}

/** User edits are comma-separated in the form and bounded before search planning. */
export function parsePeopleSearchKeywords(value: string): string[] {
  return unique(value.split(",").map(functionalPhrase)).slice(0, 4);
}

/** Pull the most useful hiring clue from a JD without sending the JD to Clay. */
export function reportsToTitleFromDescription(description: string): string {
  const match = description.match(/\breport(?:s|ing)?\s+to\s*:\s*([^\n|.;]{3,100})/i);
  return match ? normalizeTitle(match[1]) : "";
}

/**
 * Build a five-slot outreach search instead of asking Clay for its first five broad matches.
 * The JD remains local; Clay receives only these visible title phrases and the company id.
 */
export function buildPeopleSearchPlan(input: {
  jobTitle: string;
  reportsToTitle?: string;
  roleKeywords: string[];
}): PeopleSearchLane[] {
  const focus = addRoleAliases(unique([
    ...titleKeywordsForPeopleSearch(input.jobTitle),
    ...input.roleKeywords.map(functionalPhrase),
  ])).slice(0, 2);
  const primary = focus[0] || "operations";
  const leadershipRole = /\b(chief|vp|vice president|head|director)\b/i.test(input.jobTitle);

  const leaderPrefixes = leadershipRole
    ? ["vp", "vice president", "head of"]
    : ["manager", "director", "head of"];
  const teamPrefixes = leadershipRole
    ? ["director", "manager", "lead"]
    : ["manager", "lead", "senior"];

  const leaderKeywords = unique([
    normalizeTitle(input.reportsToTitle ?? ""),
    ...focus.flatMap((term) => leaderPrefixes.map((prefix) => `${prefix} ${term}`)),
  ]).slice(0, 7);
  const teamKeywords = unique(
    focus.flatMap((term) => teamPrefixes.map((prefix) => `${prefix} ${term}`)),
  ).slice(0, 6);
  const recruiterKeywords = unique([
    `talent acquisition partner ${primary}`,
    `${primary} recruiter`,
    leadershipRole ? "executive recruiter" : "talent acquisition partner",
    "recruiter product and engineering",
  ]).slice(0, 4);

  return [
    {
      id: "hiring_leader",
      label: "Likely hiring leaders",
      description: "People likely to own or sponsor this position",
      titleKeywords: leaderKeywords,
      limit: 2,
    },
    {
      id: "team_leader",
      label: "Relevant team leaders",
      description: "People close enough to explain the role and team",
      titleKeywords: teamKeywords,
      limit: 2,
    },
    {
      id: "recruiter",
      label: "Role-relevant recruiter",
      description: "A recruiter whose title is closest to this function",
      titleKeywords: recruiterKeywords,
      limit: 1,
    },
  ];
}

/** Keep a broad provider match only when its title fits the promised shortlist slot. */
export function candidateFitsSearchLane(lane: PeopleSearchLaneId, title: string): boolean {
  const normalized = normalizeTitle(title);
  const recruiter = /\b(recruit|recruiter|talent acquisition|sourcer)\b/.test(normalized);
  if (lane === "recruiter") return recruiter;
  if (recruiter) return false;
  if (lane === "hiring_leader") {
    return /\b(chief|vp|svp|evp|vice president|head|director)\b/.test(normalized);
  }
  return /\b(director|manager|lead|principal|staff|senior)\b/.test(normalized);
}
