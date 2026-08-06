/**
 * Zero-yield detection for scan lanes.
 *
 * A lane can fail without ever reporting an error: `private-page-scan` returned
 * `total_jobs_found = 0` on every run for a week while still reporting 31–61
 * "companies scanned" and a `completed_with_errors` status, so nothing surfaced
 * and the outage went unnoticed. These helpers turn "reached many sources but
 * retrieved nothing" into an explicit, visible signal.
 *
 * Deliberately NOT flagged: a run that retrieves postings but imports none. That
 * is the normal steady state for the careerops lane, where every match is
 * already in the database, and flagging it would train the warning to be ignored.
 */

export type ScanYieldRun = {
  scanType: string;
  startedAt: string;
  companiesScanned: number;
  totalJobsFound: number;
};

export type ScanYieldWarning = {
  scanType: string;
  /** Consecutive most-recent runs of this lane that retrieved nothing. */
  consecutiveRuns: number;
  /** ISO timestamp of the oldest run in the streak. */
  since: string;
  /**
   * True when the sample window was saturated by the streak, so the outage began
   * at or before `since` and the real start is unknown.
   *
   * Requires the caller to say how many runs per lane it sampled. Without that,
   * "the streak covers every run I was given" is indistinguishable from "this
   * lane has only ever run twice" — and a brand-new lane's first failure would
   * claim the outage predates its own first run.
   */
  truncated: boolean;
  message: string;
};

/** A lane reaching at least this many sources yet retrieving nothing is almost certainly blocked. */
export const ZERO_YIELD_MIN_SOURCES = 10;

/** Runs sampled per lane by the default query; also the saturation threshold for `truncated`. */
export const SCAN_YIELD_SAMPLE_PER_LANE = 12;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** True when a single run reached real sources but came back empty. */
export function isZeroYieldRun(run: ScanYieldRun): boolean {
  return run.companiesScanned >= ZERO_YIELD_MIN_SOURCES && run.totalJobsFound === 0;
}

/**
 * Finds lanes whose most recent runs are all zero-yield.
 *
 * `runs` may be in any order and may mix scan types; it is grouped and sorted
 * internally. Only the leading (most recent) streak counts, so a lane that has
 * recovered is not reported.
 */
export function detectZeroYieldLanes(
  runs: ScanYieldRun[],
  sampleSizePerLane?: number,
): ScanYieldWarning[] {
  const byType = new Map<string, ScanYieldRun[]>();
  for (const run of runs) {
    const existing = byType.get(run.scanType);
    if (existing) existing.push(run);
    else byType.set(run.scanType, [run]);
  }

  const warnings: ScanYieldWarning[] = [];
  for (const [scanType, laneRuns] of byType) {
    // Plain comparison, not localeCompare: these are ISO-8601 strings, where
    // lexical order is chronological order and locale collation is irrelevant.
    const ordered = [...laneRuns].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
    const streak: ScanYieldRun[] = [];
    for (const run of ordered) {
      if (!isZeroYieldRun(run)) break;
      streak.push(run);
    }
    if (streak.length === 0) continue;

    const oldest = streak[streak.length - 1];
    const sources = Math.max(...streak.map((run) => run.companiesScanned));
    // Only "truncated" when the caller's sample window was actually filled and
    // wholly consumed by the streak; otherwise `since` really is the start.
    const truncated =
      sampleSizePerLane !== undefined &&
      ordered.length >= sampleSizePerLane &&
      streak.length === ordered.length;

    warnings.push({
      scanType,
      consecutiveRuns: streak.length,
      since: oldest.startedAt,
      truncated,
      message:
        `${scanType} reached ${plural(sources, "source")} but retrieved 0 postings on ` +
        `${truncated ? `all ${plural(streak.length, "sampled run")}` : `its last ${plural(streak.length, "run")}`}. ` +
        `The source is likely blocking requests.`,
    });
  }

  return warnings.sort((a, b) => b.consecutiveRuns - a.consecutiveRuns);
}
