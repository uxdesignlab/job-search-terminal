/**
 * Shared job-title matching for every scan lane.
 *
 * This logic previously existed as four near-identical copies (CareerOps, Dice,
 * Adzuna, Himalayas), so a fix had to be applied in four places or the lanes
 * would disagree about what counts as a match.
 */

export type TitleFilterLists = {
  positive?: string[];
  negative?: string[];
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Positive keywords must begin at a word boundary.
 *
 * Plain substring matching made short keywords catastrophically greedy: `ux`
 * matched "Lin**ux**", "BENEL**UX**", and "L**ux**embourg", which in one live
 * Himalayas import accounted for 3 of 11 results — a Linux graphics engineer, a
 * Linux support engineer, and a Benelux sales rep.
 *
 * Only the *start* is anchored. The end deliberately stays open so a keyword
 * still matches longer forms of the same word — `product design` must keep
 * matching "Product Designer", and `ux research` must keep matching
 * "UX Researcher". Anchoring both ends would break that.
 */
function positiveMatcher(keyword: string): (title: string) => boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}`, "i");
  return (title: string) => pattern.test(title);
}

/**
 * Builds a predicate that accepts a job title.
 *
 * Negative keywords intentionally keep plain substring semantics. They are meant
 * to be greedy — `intern` should also catch "Internship" — and a check over
 * 2,629 real titles found zero cases where that greediness rejected a wanted
 * role, so there is nothing to fix and a boundary rule would only weaken them.
 */
export function buildTitleFilter(filter: TitleFilterLists | undefined) {
  const positive = (filter?.positive ?? []).map((k) => k.toLowerCase()).filter(Boolean);
  const negative = (filter?.negative ?? []).map((k) => k.toLowerCase()).filter(Boolean);
  const positiveMatchers = positive.map(positiveMatcher);

  return (title: string) => {
    const normalized = title.toLowerCase();
    const hasPositive = positiveMatchers.length === 0 || positiveMatchers.some((m) => m(normalized));
    const hasNegative = negative.some((keyword) => normalized.includes(keyword));
    return hasPositive && !hasNegative;
  };
}
