/**
 * How often background scans run, and when the next one is due.
 *
 * The choices stop at six hours on the short end because of what one scan costs
 * other people's services, not because of anything local:
 *
 * - Adzuna's free tier is 2,000 searches a month, and the aggregator scanner is
 *   budgeted for about seven full scans a day (see ADZUNA_MAX_SEARCH_TERMS). Four
 *   scheduled scans plus a few manual ones fit; eight a day would not.
 * - A full scan reads several thousand company boards, and the shared host pool
 *   exists because those hosts rate-limit. Scanning them more often than every six
 *   hours mostly finds the same postings and spends that goodwill.
 *
 * The long end is a day. Longer than that and the 24-hour freshness window could
 * fall between two scans and miss postings entirely.
 */
export const SCAN_INTERVAL_OPTIONS = [6, 8, 12, 24] as const;

export type ScanIntervalHours = (typeof SCAN_INTERVAL_OPTIONS)[number];

export const DEFAULT_SCAN_INTERVAL_HOURS: ScanIntervalHours = 6;

const HOUR_MS = 60 * 60 * 1000;

/** Anything not on the list — a stale form value, a hand-edited row — becomes the default. */
export function normalizeScanIntervalHours(value: unknown): ScanIntervalHours {
  const hours = Number(value);
  return (SCAN_INTERVAL_OPTIONS as readonly number[]).includes(hours)
    ? (hours as ScanIntervalHours)
    : DEFAULT_SCAN_INTERVAL_HOURS;
}

/** "Every 6 hours", "Once a day" — the words the settings menu shows. */
export function scanIntervalLabel(hours: number): string {
  return hours === 24 ? "Once a day" : `Every ${hours} hours`;
}

/**
 * When the next scheduled scan is due after a settings save.
 *
 * Anchored on the last scan rather than on the save: saving the form (or changing
 * an unrelated setting stored in the same row) used to push the next scan a full
 * interval into the future every time. Shortening the interval brings the next
 * scan forward to match.
 *
 * A save never starts a scan by itself. If the last scan is older than the new
 * interval, or there has never been one, the next scan is a full interval away —
 * so switching scans on, or back on after weeks, does not fire one the same minute.
 */
export function computeNextScanAt(input: {
  enabled: boolean;
  intervalHours: number;
  lastRunAt: string | null;
  /** The currently stored due time, kept when there is no usable last scan to anchor on. */
  nextRunAt?: string | null;
  now?: Date;
}): string | null {
  if (!input.enabled) return null;
  const nowMs = (input.now ?? new Date()).getTime();
  const intervalMs = input.intervalHours * HOUR_MS;
  const fullInterval = nowMs + intervalMs;

  const lastMs = input.lastRunAt ? Date.parse(input.lastRunAt) : Number.NaN;
  const anchored = lastMs + intervalMs;
  if (Number.isFinite(anchored) && anchored > nowMs) return new Date(anchored).toISOString();

  // No scheduled scan yet (or the last one is long past): a due time already on
  // file still stands, as long as it is in the future and no further off than
  // the new interval. Otherwise every save would restart the wait from zero.
  const storedMs = input.nextRunAt ? Date.parse(input.nextRunAt) : Number.NaN;
  if (Number.isFinite(storedMs) && storedMs > nowMs && storedMs <= fullInterval) {
    return new Date(storedMs).toISOString();
  }
  return new Date(fullInterval).toISOString();
}
