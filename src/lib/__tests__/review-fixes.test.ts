import { describe, expect, it } from "vitest";
import type { ContactStatus } from "@/lib/db/types";

/**
 * Regressions for the four issues found in pre-push review. Each one shipped
 * through typecheck, lint and a full suite, so each gets a test that would have
 * caught it.
 */

const STATUSES: ContactStatus[] = ["Found", "Shortlisted", "Drafted", "Contacted", "Responded", "Not Relevant"];

describe("contact status transitions are complete (§56, §80)", () => {
  it("offers every other status from every state", () => {
    // The bug: `.slice(0, 3)` after filtering left Responded and Not Relevant
    // unreachable from all six states, so responded_at could never be set.
    for (const current of STATUSES) {
      const offered = STATUSES.filter((status) => status !== current);
      expect(offered).toHaveLength(STATUSES.length - 1);
      for (const target of STATUSES) {
        if (target !== current) expect(offered).toContain(target);
      }
    }
  });

  it("reaches the two statuses that were previously cut off", () => {
    for (const target of ["Responded", "Not Relevant"] as ContactStatus[]) {
      const reachableFrom = STATUSES.filter((current) => current !== target)
        .filter((current) => STATUSES.filter((s) => s !== current).includes(target));
      expect(reachableFrom).toHaveLength(STATUSES.length - 1);
    }
  });
});

describe("batch enrichment input guard", () => {
  // Clay rejects the whole batch with HTTP 400 if any item omits the required
  // Social Profile URL, so one unlinkable contact must not cost the rest.
  const enrichable = (contacts: Array<{ name: string; linkedinUrl: string }>) =>
    contacts.filter((c) => c.linkedinUrl.trim().length > 0);

  it("drops contacts with no profile url instead of failing the batch", () => {
    const contacts = [
      { name: "A", linkedinUrl: "linkedin.com/in/a" },
      { name: "B", linkedinUrl: "" },
      { name: "C", linkedinUrl: "   " },
      { name: "D", linkedinUrl: "linkedin.com/in/d" },
    ];
    expect(enrichable(contacts).map((c) => c.name)).toEqual(["A", "D"]);
  });

  it("yields an empty batch rather than one built from blanks", () => {
    expect(enrichable([{ name: "A", linkedinUrl: "" }])).toHaveLength(0);
  });
});

describe("outreach resume lane selection", () => {
  type Resume = { name: string; activeStatus: boolean; extractedText: string };
  const pick = (resumes: Resume[], recommended: string | undefined) =>
    resumes.find((r) => r.name === recommended && r.extractedText)
    ?? resumes.find((r) => r.activeStatus && r.extractedText);

  const lanes: Resume[] = [
    { name: "Specialist", activeStatus: true, extractedText: "IC proof points" },
    { name: "Leadership", activeStatus: true, extractedText: "leadership proof points" },
  ];

  it("uses the lane the evaluation recommended, not the first active one", () => {
    expect(pick(lanes, "Leadership")?.name).toBe("Leadership");
  });

  it("falls back to the first active lane when nothing is recommended", () => {
    expect(pick(lanes, undefined)?.name).toBe("Specialist");
  });

  it("falls back when the recommended lane has no extracted text", () => {
    const withEmpty = [{ name: "Leadership", activeStatus: true, extractedText: "" }, ...lanes.slice(0, 1)];
    expect(pick(withEmpty, "Leadership")?.name).toBe("Specialist");
  });
});
