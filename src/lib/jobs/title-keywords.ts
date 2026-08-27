import { buildTitleFilter } from "./title-filter";

/**
 * Turns job titles into the short, broad keywords a positive title filter wants.
 *
 * Resume upload used to write whole parsed titles into the include list — entries like
 * `senior hci engineer / principal ux designer`. A positive keyword is matched from a
 * word boundary with the end left open, so such an entry only matches a title that
 * *starts* with that whole phrase: effectively a dead filter that narrows a search to
 * nothing. `ux` matches "Senior UX Designer", "UX Researcher" and "UI/UX Designer";
 * the full title matches none of them.
 */

/**
 * Domain keywords, each usable as a filter on its own. Deliberately excludes bare role
 * suffixes ("manager", "lead", "specialist") — they match every posting in every field
 * and narrow nothing — and bare `product`, which would match "Production Engineer"
 * because matching is open-ended.
 */
const KEYWORD_VOCABULARY = [
  // Design and research
  "ux", "ui", "design", "research", "user experience", "user interface",
  "product design", "interaction design", "service design", "visual design",
  "content design", "design system", "design operations", "designops",
  "design strategy", "information architecture", "creative director", "art director",
  // Product
  "product manager", "product management", "product owner", "product marketing",
  "product lead", "head of product", "program manager", "project manager",
  // Engineering and data
  "engineer", "developer", "architect", "front end", "frontend", "back end", "backend",
  "full stack", "fullstack", "software engineer", "solutions architect",
  "data science", "data scientist", "data analyst", "machine learning", "devops",
  "site reliability", "security engineer", "qa engineer", "test engineer",
  // Other common domains, so a non-tech resume is not left with nothing
  "marketing", "sales", "recruiter", "recruiting", "talent acquisition",
  "customer success", "account executive", "business analyst", "operations",
  "finance", "accountant", "accounting", "controller", "counsel", "paralegal",
  "nurse", "nursing", "physician", "therapist", "pharmacist", "teacher", "educator",
  "technical writer", "copywriter", "editor", "consultant", "analyst", "scientist",
];

/** Words that describe rank or org position rather than the kind of work. */
const RANK_WORDS = new Set([
  "senior", "sr", "junior", "jr", "lead", "leader", "principal", "staff", "chief",
  "head", "vp", "vice", "president", "director", "manager", "management", "officer",
  "executive", "associate", "assistant", "intern", "fellow", "apprentice",
  "i", "ii", "iii", "iv", "of", "and", "the", "for", "at", "in", "to", "a", "an",
  "global", "regional", "group", "team", "corporate", "enterprise",
]);

/** Whether `keyword` would match `title` under the real scan-time rules. */
function keywordMatches(keyword: string, title: string): boolean {
  return buildTitleFilter({ positive: [keyword], negative: [] })(title);
}

/**
 * Drops any keyword another kept keyword already covers. `design` matches everything
 * `design system` matches, so keeping both only adds noise to the list the user reads.
 */
function dropCovered(keywords: string[]): string[] {
  return keywords.filter(
    (keyword) => !keywords.some((other) => other !== keyword && keywordMatches(other, keyword))
  );
}

/**
 * Last resort for a resume whose field the vocabulary does not cover — a nurse, a
 * paralegal, a machinist. Takes the words the titles actually repeat, minus rank words,
 * so "Registered Nurse" and "Senior Staff Nurse" yield `nurse` rather than nothing.
 */
function frequentTitleWords(titles: string[]): string[] {
  const counts = new Map<string, number>();
  for (const title of titles) {
    const seen = new Set<string>();
    for (const raw of title.toLowerCase().split(/[^a-z0-9+#]+/)) {
      const word = raw.trim();
      if (word.length < 3 || RANK_WORDS.has(word) || seen.has(word)) continue;
      seen.add(word);
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);
}

export const MAX_TITLE_KEYWORDS = 8;

/**
 * Broad, lowercase keywords derived from job titles. Empty when the titles carry
 * nothing usable — callers merge rather than replace, so an empty result changes
 * nothing rather than clearing what the user already set.
 */
export function extractTitleKeywords(titles: string[]): string[] {
  const usable = titles.map((title) => title.trim()).filter(Boolean);
  if (usable.length === 0) return [];

  const matched = KEYWORD_VOCABULARY.filter((keyword) =>
    usable.some((title) => keywordMatches(keyword, title))
  );

  const keywords = matched.length > 0 ? dropCovered(matched) : dropCovered(frequentTitleWords(usable));

  // Shortest first: a shorter keyword is a broader one, and breadth is the point.
  return keywords
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, MAX_TITLE_KEYWORDS);
}

/**
 * Whether a saved filter entry looks like a pasted job title rather than a keyword.
 * Used to prompt a one-click cleanup for lists written by the old upload behaviour.
 */
export function looksLikeFullTitle(entry: string): boolean {
  const words = entry.trim().toLowerCase().split(/\s+/);
  if (words.length >= 4 || /[/,|]/.test(entry)) return true;
  // Only a *leading* rank word marks a pasted title. Checking anywhere would flag
  // "product manager", which is exactly the shape of keyword this is meant to keep.
  return RANK_WORDS.has(words[0] ?? "");
}
