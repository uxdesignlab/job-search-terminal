import { describe, expect, it } from "vitest";
import { buildTitleFilter } from "@/lib/jobs/title-filter";

/** The user's real filter lists. */
const POSITIVE = [
  "director of user experience", "head of product design", "ux", "product design",
  "designops", "design operations", "product designer", "user experience",
  "fractional", "director, ux", "ux research", "ux researcher",
];
const NEGATIVE = ["junior", "intern", "graphic designer", "visual designer", "marketing designer"];

const matches = buildTitleFilter({ positive: POSITIVE, negative: NEGATIVE });

describe("buildTitleFilter — positive keywords require a word boundary", () => {
  it("no longer matches ux inside unrelated words", () => {
    // All three were imported for real before this fix.
    expect(matches("Senior Linux Graphics Engineer")).toBe(false);
    expect(matches("Linux Support Engineer")).toBe(false);
    expect(matches("Sales Development Representative (SDR) - BENELUX")).toBe(false);
    expect(matches("Strategic Account Executive - Belgium & Luxembourg")).toBe(false);
  });

  it("still matches ux as a word, including inside punctuated titles", () => {
    expect(matches("UX Designer")).toBe(true);
    expect(matches("Senior UX Designer")).toBe(true);
    expect(matches("UI/UX Designer")).toBe(true);
    expect(matches("Sr. UI/UX Designer")).toBe(true);
    expect(matches("Lead UX/Product Designer")).toBe(true);
  });

  it("keeps prefix matching, so a keyword still matches longer forms", () => {
    // The end is intentionally unanchored.
    expect(matches("Product Designer")).toBe(true);
    expect(matches("Senior Product Designers")).toBe(true);
    expect(matches("UX Researcher")).toBe(true);
    expect(matches("DesignOps Manager")).toBe(true);
    expect(matches("Head of Product Design, Platform")).toBe(true);
  });

  it("accepts everything when no positive list is configured", () => {
    expect(buildTitleFilter({ positive: [], negative: [] })("Anything At All")).toBe(true);
    expect(buildTitleFilter(undefined)("Anything At All")).toBe(true);
  });
});

describe("buildTitleFilter — negative keywords stay greedy", () => {
  it("excludes the roles the negative list targets", () => {
    expect(matches("Junior UX Designer")).toBe(false);
    expect(matches("UX Design Intern")).toBe(false);
    expect(matches("UX Design Internship")).toBe(false);
    expect(matches("Visual Designer, Product Design")).toBe(false);
  });

  it("a negative keyword outweighs a positive match", () => {
    expect(matches("Graphic Designer with UX experience")).toBe(false);
  });
});
