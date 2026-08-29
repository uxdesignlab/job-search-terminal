import { describe, expect, it } from "vitest";
import { interpretComparison } from "@/lib/version/update-check";

const CHECKED_AT = "2026-08-29T10:00:00.000Z";
const FALLBACK = "https://github.com/uxdesignlab/job-search-terminal/compare/abc...main";

describe("interpretComparison", () => {
  it("reports an identical checkout as current", () => {
    expect(interpretComparison({ status: "identical", behind_by: 0, ahead_by: 0 }, CHECKED_AT, FALLBACK))
      .toEqual({ state: "current", checkedAt: CHECKED_AT });
  });

  it("reports a behind checkout with the exact commit count", () => {
    const status = interpretComparison(
      { status: "behind", behind_by: 12, html_url: "https://github.com/o/r/compare/a...main" },
      CHECKED_AT,
      FALLBACK
    );
    expect(status).toEqual({
      state: "behind",
      behindBy: 12,
      checkedAt: CHECKED_AT,
      compareUrl: "https://github.com/o/r/compare/a...main",
    });
  });

  it("still reports an update when the checkout has diverged", () => {
    // A checkout carrying local commits reports "diverged", not "behind" — but
    // upstream work is still missing, so the user still needs to pull.
    const status = interpretComparison({ status: "diverged", behind_by: 3 }, CHECKED_AT, FALLBACK);
    expect(status).toMatchObject({ state: "behind", behindBy: 3, compareUrl: FALLBACK });
  });

  it("treats a checkout that is only ahead as current", () => {
    expect(interpretComparison({ status: "ahead", behind_by: 0, ahead_by: 4 }, CHECKED_AT, FALLBACK))
      .toEqual({ state: "current", checkedAt: CHECKED_AT });
  });

  it("treats a missing behind_by as current rather than inventing a count", () => {
    expect(interpretComparison({}, CHECKED_AT, FALLBACK)).toEqual({ state: "current", checkedAt: CHECKED_AT });
  });
});
