/**
 * The posting's own requirements, as a readable list.
 *
 * Two sources, in order of trust. An evaluation already extracts the requirements
 * it scored against, so that list is preferred — it is what the fit score was
 * actually computed from, and showing anything else beside the score would invite
 * the user to reconcile two lists that were never the same list. Only when no
 * evaluation carries them is the saved description parsed directly, which is a
 * best-effort read of someone else's formatting and is labelled as such.
 */

export type RequirementStatus = "supported" | "partial" | "unknown";

export type PostingRequirement = {
  text: string;
  /** Absent when the requirement came from the description rather than a scored run. */
  status?: RequirementStatus;
};

const STATUS_WORDS: RequirementStatus[] = ["supported", "partial", "unknown"];

/**
 * Legacy `requirementMatch` rows are one string carrying requirement, status and
 * evidence: `Lead end-to-end briefs. — supported (Pavel's 15 years …)`. The
 * evidence half belongs in the evaluation card, not in a requirements list.
 */
export function splitRequirementLine(line: string): PostingRequirement {
  const match = /^(.*?)\s+[—–-]\s+(supported|partial|unknown)\b/i.exec(line);
  if (!match) return { text: line.trim() };
  const status = match[2].toLowerCase() as RequirementStatus;
  return { text: match[1].trim(), status: STATUS_WORDS.includes(status) ? status : undefined };
}

/**
 * Whether a set of merged requirement strings really is a scored requirement list.
 *
 * The oldest evaluations wrote free-form "X aligns with Y" notes into the same
 * field. Those are not the posting's requirements, and showing them under that
 * heading would put words in the posting's mouth — so a majority has to carry a
 * status word before the list is treated as scored requirements.
 */
export function looksScored(items: readonly PostingRequirement[]): boolean {
  return items.length > 0 && items.filter((item) => item.status).length * 2 >= items.length;
}

/** Headings that introduce a list of requirements rather than perks or process. */
const REQUIREMENT_HEADING =
  /^\s*(?:what you|who you|you (?:will|'ll) (?:need|bring)|requirement|qualification|minimum|basic qualification|preferred|must have|nice to have|about you|skills|experience|responsibilit)/i;

/** Headings that end one — everything after is compensation, culture or process. */
const CLOSING_HEADING =
  /^\s*(?:benefit|perk|compensation|salary|pay|equal opportunity|eeo|about (?:us|the company|instacart)|our (?:team|values)|how to apply|apply|interview process|what we offer)/i;

const BULLET = /^\s*(?:[-–—*•·▪◦]|\d+[.)])\s+/;

function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return false;
  return trimmed.endsWith(":") || REQUIREMENT_HEADING.test(trimmed) || CLOSING_HEADING.test(trimmed);
}

function clean(line: string): string {
  return line.replace(BULLET, "").replace(/\s+/g, " ").trim();
}

const MIN_LENGTH = 12;
const MAX_LENGTH = 300;
const MAX_ITEMS = 24;

/**
 * Best-effort read of a description's requirement bullets. Bullets inside a
 * requirements section win; when the posting has no such heading, every bullet is
 * taken, because a description written as one flat list is common and dropping it
 * would leave the panel empty on exactly the postings that need it most.
 */
export function extractPostingRequirements(description: string | null | undefined): string[] {
  const lines = (description ?? "").split(/\r?\n/);
  if (lines.length === 0) return [];

  const inSection: string[] = [];
  const everyBullet: string[] = [];
  let collecting = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (looksLikeHeading(trimmed) && !BULLET.test(line)) {
      // A closing heading ends collection even when it also reads as a requirement
      // heading ("Preferred qualifications" continues, "Benefits" does not).
      collecting = REQUIREMENT_HEADING.test(trimmed) && !CLOSING_HEADING.test(trimmed);
      continue;
    }

    if (!BULLET.test(line)) continue;

    const text = clean(line);
    if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) continue;
    everyBullet.push(text);
    if (collecting) inSection.push(text);
  }

  const chosen = inSection.length > 0 ? inSection : everyBullet;
  return Array.from(new Set(chosen)).slice(0, MAX_ITEMS);
}
