import { describe, expect, it } from "vitest";
import { detectZeroYieldLanes, isZeroYieldRun, type ScanYieldRun } from "@/lib/scanner/scan-yield";

const run = (over: Partial<ScanYieldRun> = {}): ScanYieldRun => ({
  scanType: "private-page-scan",
  startedAt: "2026-08-05T12:00:00.000Z",
  companiesScanned: 61,
  totalJobsFound: 0,
  ...over,
});

describe("isZeroYieldRun", () => {
  it("flags a run that reached many sources but retrieved nothing", () => {
    expect(isZeroYieldRun(run())).toBe(true);
  });

  it("does not flag a run that retrieved postings", () => {
    expect(isZeroYieldRun(run({ totalJobsFound: 144 }))).toBe(false);
  });

  it("does not flag a small run, which may legitimately be empty", () => {
    expect(isZeroYieldRun(run({ companiesScanned: 1 }))).toBe(false);
  });

  it("does not flag the careerops steady state — many postings, none new", () => {
    expect(isZeroYieldRun(run({ scanType: "careerops", companiesScanned: 469, totalJobsFound: 21124 }))).toBe(false);
  });
});

describe("detectZeroYieldLanes", () => {
  it("reports a lane whose recent runs are all empty", () => {
    const warnings = detectZeroYieldLanes([
      run({ startedAt: "2026-08-05T12:00:00.000Z" }),
      run({ startedAt: "2026-08-04T12:00:00.000Z" }),
      run({ startedAt: "2026-08-03T12:00:00.000Z" }),
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].scanType).toBe("private-page-scan");
    expect(warnings[0].consecutiveRuns).toBe(3);
    expect(warnings[0].since).toBe("2026-08-03T12:00:00.000Z");
    expect(warnings[0].message).toContain("61 sources");
    // No sample size declared, so the caller cannot claim the window was saturated.
    expect(warnings[0].truncated).toBe(false);
    expect(warnings[0].message).toContain("its last 3 runs");
  });

  it("counts only the leading streak, so a recovered lane is not reported", () => {
    expect(
      detectZeroYieldLanes([
        run({ startedAt: "2026-08-05T12:00:00.000Z", totalJobsFound: 144 }),
        run({ startedAt: "2026-08-04T12:00:00.000Z" }),
        run({ startedAt: "2026-08-03T12:00:00.000Z" }),
      ])
    ).toEqual([]);
  });

  it("stops the streak at the first healthy run", () => {
    const warnings = detectZeroYieldLanes([
      run({ startedAt: "2026-08-05T12:00:00.000Z" }),
      run({ startedAt: "2026-08-04T12:00:00.000Z", totalJobsFound: 20 }),
      run({ startedAt: "2026-08-03T12:00:00.000Z" }),
    ]);
    expect(warnings[0].consecutiveRuns).toBe(1);
    expect(warnings[0].since).toBe("2026-08-05T12:00:00.000Z");
    expect(warnings[0].truncated).toBe(false);
    expect(warnings[0].message).toContain("its last 1 run");
  });

  it("is order-independent", () => {
    const ascending = detectZeroYieldLanes([
      run({ startedAt: "2026-08-03T12:00:00.000Z" }),
      run({ startedAt: "2026-08-04T12:00:00.000Z" }),
      run({ startedAt: "2026-08-05T12:00:00.000Z" }),
    ]);
    expect(ascending[0].consecutiveRuns).toBe(3);
    expect(ascending[0].since).toBe("2026-08-03T12:00:00.000Z");
  });

  it("separates lanes and ranks the longest streak first", () => {
    const warnings = detectZeroYieldLanes([
      run({ scanType: "private-page-scan", startedAt: "2026-08-05T12:00:00.000Z" }),
      run({ scanType: "private-page-scan", startedAt: "2026-08-04T12:00:00.000Z" }),
      run({ scanType: "linkedin-claude-scan", startedAt: "2026-08-05T09:00:00.000Z", companiesScanned: 30 }),
      run({ scanType: "careerops", startedAt: "2026-08-05T10:00:00.000Z", companiesScanned: 469, totalJobsFound: 21124 }),
    ]);
    expect(warnings.map((w) => w.scanType)).toEqual(["private-page-scan", "linkedin-claude-scan"]);
  });

  it("returns nothing for an empty history", () => {
    expect(detectZeroYieldLanes([])).toEqual([]);
  });
});

describe("detectZeroYieldLanes — truncation semantics", () => {
  const streakOf = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      run({ startedAt: `2026-08-${String(20 - i).padStart(2, "0")}T12:00:00.000Z` })
    );

  it("does not claim truncation when the sample window was not filled", () => {
    // Three runs sampled out of a window of twelve: `since` really is the start.
    const [w] = detectZeroYieldLanes(streakOf(3), 12);
    expect(w.truncated).toBe(false);
    expect(w.message).toContain("its last 3 runs");
  });

  it("claims truncation only when the streak fills the sample window", () => {
    const [w] = detectZeroYieldLanes(streakOf(12), 12);
    expect(w.truncated).toBe(true);
    expect(w.message).toContain("all 12 sampled runs");
  });

  it("does not mark a lane's first-ever failing run as truncated", () => {
    // Regression: this previously reported "since at least", claiming the outage
    // predated the only run the lane has ever had.
    const [w] = detectZeroYieldLanes(streakOf(1), 12);
    expect(w.truncated).toBe(false);
    expect(w.message).toContain("its last 1 run");
    expect(w.message).not.toContain("runs.");
  });

  it("pluralises sources and runs correctly", () => {
    const [single] = detectZeroYieldLanes(
      [run({ companiesScanned: 1, totalJobsFound: 0 })],
      12
    );
    // companiesScanned of 1 is below ZERO_YIELD_MIN_SOURCES, so nothing is flagged.
    expect(single).toBeUndefined();

    const [many] = detectZeroYieldLanes(streakOf(2), 12);
    expect(many.message).toContain("61 sources");
    expect(many.message).toContain("its last 2 runs");
  });

  it("sorts ISO timestamps chronologically without locale collation", () => {
    const [w] = detectZeroYieldLanes(
      [
        run({ startedAt: "2026-08-09T12:00:00.000Z" }),
        run({ startedAt: "2026-08-10T12:00:00.000Z" }),
        run({ startedAt: "2026-08-08T12:00:00.000Z" }),
      ],
      12
    );
    expect(w.since).toBe("2026-08-08T12:00:00.000Z");
  });
});
