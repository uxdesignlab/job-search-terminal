import { describe, expect, it } from "vitest";
import { extractTitleKeywords, looksLikeFullTitle } from "@/lib/jobs/title-keywords";
import { buildTitleFilter } from "@/lib/jobs/title-filter";

describe("extractTitleKeywords", () => {
  /**
   * The behaviour this replaces: resume upload wrote whole parsed titles into the
   * include list. A positive keyword matches from a word boundary with the end left
   * open, so `senior hci engineer / principal ux designer` only matched a title
   * starting with that entire phrase — a filter that narrowed the search to nothing.
   */
  it("turns pasted-looking titles into keywords that actually match jobs", () => {
    const keywords = extractTitleKeywords([
      "Senior HCI Engineer / Principal UX Designer",
      "Head of Product",
      "Product Leader",
      "Head of Design Strategy",
    ]);

    expect(keywords).toContain("ux");
    const matches = buildTitleFilter({ positive: keywords, negative: [] });
    expect(matches("Senior UX Designer")).toBe(true);
    expect(matches("UX Researcher")).toBe(true);
    expect(matches("UI/UX Designer")).toBe(true);

    // The original full title matched none of those.
    const old = buildTitleFilter({ positive: ["senior hci engineer / principal ux designer"], negative: [] });
    expect(old("Senior UX Designer")).toBe(false);
  });

  it("keeps the list short and free of entries another entry already covers", () => {
    const keywords = extractTitleKeywords(["Design System Lead", "Product Designer", "UX Researcher"]);

    expect(keywords.length).toBeLessThanOrEqual(8);
    // `design` covers `design system`, so both would be noise.
    expect(keywords).toContain("design");
    expect(keywords).not.toContain("design system");
  });

  it("does not emit keywords that match unrelated fields", () => {
    const keywords = extractTitleKeywords(["Head of Product", "Product Manager"]);
    // Bare `product` would match "Production Support Engineer", because matching is
    // open-ended at the end.
    expect(keywords).not.toContain("product");
    const matches = buildTitleFilter({ positive: keywords, negative: [] });
    expect(matches("Production Support Engineer")).toBe(false);
  });

  it("falls back to repeated title words for a field the vocabulary misses", () => {
    // The old extractor matched a fixed design/product/eng term list, so these
    // produced nothing at all and wiped the user's filters.
    expect(extractTitleKeywords(["Registered Nurse", "Senior Staff Nurse"])).toContain("nurse");
    expect(extractTitleKeywords(["Senior Paralegal", "Lead Paralegal"])).toContain("paralegal");
  });

  it("returns nothing rather than guessing when there is nothing to go on", () => {
    expect(extractTitleKeywords([])).toEqual([]);
    expect(extractTitleKeywords(["   "])).toEqual([]);
  });
});

describe("looksLikeFullTitle", () => {
  it("spots entries written by the old upload behaviour", () => {
    expect(looksLikeFullTitle("senior hci engineer / principal ux designer")).toBe(true);
    expect(looksLikeFullTitle("vp, user experience and web management")).toBe(true);
    expect(looksLikeFullTitle("head of product")).toBe(true);
  });

  it("leaves real keywords alone", () => {
    expect(looksLikeFullTitle("ux")).toBe(false);
    expect(looksLikeFullTitle("product manager")).toBe(false);
    expect(looksLikeFullTitle("user experience")).toBe(false);
  });
});
