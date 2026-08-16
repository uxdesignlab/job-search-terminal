import { describe, expect, it } from "vitest";
import { cleanLocationList, normalizePreferredLocations, splitLocationLines } from "@/lib/profile/locations";

describe("splitLocationLines", () => {
  it("splits on newlines only, keeping each location intact", () => {
    expect(splitLocationLines("Tennessee, United States\nCanada")).toEqual([
      "Tennessee, United States",
      "Canada",
    ]);
  });

  it("ignores blank lines and surrounding whitespace", () => {
    expect(splitLocationLines("  Nashville, TN  \n\n Canada \n")).toEqual(["Nashville, TN", "Canada"]);
  });

  it("returns nothing for an absent field", () => {
    expect(splitLocationLines(null)).toEqual([]);
    expect(splitLocationLines("")).toEqual([]);
  });

  /**
   * The regression this function exists for. Splitting on commas as well —
   * what the generic list parser does — destroys the entry boundaries, and the
   * normalizer then re-joins across them whenever one entry ends in a country
   * name and the next begins immediately after.
   */
  it("does not let a following country get absorbed into the previous entry", () => {
    const commaSplit = "Tennessee, United States\nCanada".split(/\n|,/).map((s) => s.trim());
    expect(normalizePreferredLocations(commaSplit)).toEqual(["Tennessee, United States, Canada"]);

    expect(normalizePreferredLocations(splitLocationLines("Tennessee, United States\nCanada"))).toEqual([
      "Tennessee, United States",
      "Canada",
    ]);
  });
});

describe("normalizePreferredLocations", () => {
  it("rejoins legacy values stored as separate parts", () => {
    expect(normalizePreferredLocations(["Nashville", "Tennessee", "United States"])).toEqual([
      "Nashville, Tennessee, United States",
    ]);
    expect(normalizePreferredLocations(["Nashville", "TN", "Minsk", "Belarus"])).toEqual([
      "Nashville, TN",
      "Minsk, Belarus",
    ]);
  });

  it("leaves already-composed entries alone", () => {
    expect(normalizePreferredLocations(["Tennessee, United States", "Canada"])).toEqual([
      "Tennessee, United States",
      "Canada",
    ]);
  });

  it("drops blanks and duplicates", () => {
    expect(normalizePreferredLocations(["Canada", "  "])).toEqual(["Canada"]);
    expect(normalizePreferredLocations(["Tennessee, United States", "Tennessee, United States"]))
      .toEqual(["Tennessee, United States"]);
  });

  it("still re-joins adjacent bare country tokens, which is the legacy repair", () => {
    // Two separate bare countries are indistinguishable from one legacy value
    // that was split apart, so they merge. Composed entries (the only thing the
    // tag input now submits) are unaffected — see the case above.
    expect(normalizePreferredLocations(["Canada", "Canada"])).toEqual(["Canada, Canada"]);
    expect(normalizePreferredLocations(["United States", "Canada"])).toEqual(["United States, Canada"]);
  });
});

/**
 * Why the remote regions list is never run through `normalizePreferredLocations`:
 * that list is bare country names by design, which is precisely the shape the
 * legacy repair above collapses.
 */
describe("cleanLocationList", () => {
  it("keeps adjacent bare countries as separate entries", () => {
    expect(cleanLocationList(["United States", "Canada"])).toEqual(["United States", "Canada"]);
  });

  it("trims, drops blanks, and de-duplicates", () => {
    expect(cleanLocationList([" Canada ", "", "  ", "Canada", "Mexico"])).toEqual(["Canada", "Mexico"]);
  });
});
