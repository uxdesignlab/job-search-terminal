import { describe, expect, it } from "vitest";
import { interpretComparison } from "@/lib/version/update-check";

const CHECKED_AT = "2026-08-29T10:00:00.000Z";
const FALLBACK = "https://github.com/uxdesignlab/job-search-terminal/compare/abc...main";

/**
 * Every payload here is the shape GitHub actually returns for the request this
 * module makes — `compare/{ourCommit}...{main}`, so main is the *head* side and
 * both counts are reported from main's point of view. The earlier version of
 * this file invented payloads that matched the code's assumption instead of the
 * API's behaviour, which is how it passed while the feature could not work.
 */
describe("interpretComparison", () => {
  it("reports a checkout level with the branch as current", () => {
    // Verified against the API: base === main returns status "identical".
    expect(interpretComparison({ status: "identical", ahead_by: 0, behind_by: 0 }, CHECKED_AT, FALLBACK))
      .toEqual({ state: "current", checkedAt: CHECKED_AT });
  });

  it("reports a stale checkout, which GitHub describes as main being AHEAD of it", () => {
    // Verified against the live API with a checkout 94 commits old:
    //   {status: "ahead", ahead_by: 94, behind_by: 0}
    // Reading behind_by here returned 0 and reported "up to date" forever.
    const status = interpretComparison(
      { status: "ahead", ahead_by: 94, behind_by: 0, html_url: "https://github.com/o/r/compare/a...main" },
      CHECKED_AT,
      FALLBACK
    );
    expect(status).toEqual({
      state: "behind",
      behindBy: 94,
      checkedAt: CHECKED_AT,
      compareUrl: "https://github.com/o/r/compare/a...main",
    });
  });

  it("does not count the user's own unpushed commits as available updates", () => {
    // Verified against the live API from a branch two commits ahead of main:
    //   {status: "behind", ahead_by: 0, behind_by: 2}
    // Reading behind_by announced "2 commits behind" for the user's own work.
    expect(interpretComparison({ status: "behind", ahead_by: 0, behind_by: 2 }, CHECKED_AT, FALLBACK))
      .toEqual({ state: "current", checkedAt: CHECKED_AT });
  });

  it("counts only the upstream side of a diverged history", () => {
    // ahead_by is what `git pull` would bring; behind_by is the local commits.
    const status = interpretComparison(
      { status: "diverged", ahead_by: 7, behind_by: 3 },
      CHECKED_AT,
      FALLBACK
    );
    expect(status).toMatchObject({ state: "behind", behindBy: 7, compareUrl: FALLBACK });
  });

  it("treats a missing ahead_by as current rather than inventing a count", () => {
    expect(interpretComparison({}, CHECKED_AT, FALLBACK)).toEqual({ state: "current", checkedAt: CHECKED_AT });
  });
});
