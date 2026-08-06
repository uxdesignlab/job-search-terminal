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
   * True when every sampled run for this lane is part of the streak, so the
   * outage began at or before `since` — reported honestly rather than implying
   * the sample window is the true start.
   */
  truncated: boolean;
  message: string;
};

/** A lane reaching at least this many sources yet retrieving nothing is almost certainly blocked. */
export const ZERO_YIELD_MIN_SOURCES = 10;

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
export function detectZeroYieldLanes(runs: ScanYieldRun[]): ScanYieldWarning[] {
  const byType = new Map<string, ScanYieldRun[]>();
  for (const run of runs) {
    const existing = byType.get(run.scanType);
    if (existing) existing.push(run);
    else byType.set(run.scanType, [run]);
  }

  const warnings: ScanYieldWarning[] = [];
  for (const [scanType, laneRuns] of byType) {
    const ordered = [...laneRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const streak: ScanYieldRun[] = [];
    for (const run of ordered) {
      if (!isZeroYieldRun(run)) break;
      streak.push(run);
    }
    if (streak.length === 0) continue;

    const oldest = streak[streak.length - 1];
    const sources = Math.max(...streak.map((run) => run.companiesScanned));
    const truncated = streak.length === ordered.length;
    warnings.push({
      scanType,
      consecutiveRuns: streak.length,
      since: oldest.startedAt,
      truncated,
      message:
        `${scanType} reached ${sources} source${sources === 1 ? "" : "s"} but retrieved 0 postings ` +
        `on ${truncated ? "all " : "its last "}${streak.length} ` +
        `${truncated ? "sampled runs" : `run${streak.length === 1 ? "" : "s"}`}. ` +
        `The source is likely blocking requests.`,
    });
  }

  return warnings.sort((a, b) => b.consecutiveRuns - a.consecutiveRuns);
}
