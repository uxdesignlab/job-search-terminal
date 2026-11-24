/**
 * What job-discovery scans are running right now, with live progress, so the
 * Dashboard can show a scan the user is not watching: the scheduled scan that runs
 * by itself, or one sent to the background with "Keep working while it scans".
 *
 * Held on `globalThis`, not in a module variable: Next.js may load this module
 * separately for API routes and for `instrumentation.ts` (which runs scheduled
 * scans), and each copy would otherwise keep its own list. In-memory on purpose:
 * a scan cannot outlive the server process, so neither should its record.
 */
import type { ScanTrigger } from "@/lib/db/types";
import type { JobDiscoveryProgressUpdate, JobDiscoverySourceId } from "@/lib/scan-progress-types";

export type ActiveScan = {
  id: string;
  trigger: ScanTrigger;
  startedAt: string;
  /** Latest progress per source, in the order sources first reported. */
  sources: JobDiscoveryProgressUpdate[];
  /** Company job pages checked so far, and how many this scan set out to check. */
  careerChecked: number;
  careerTotal: number;
  /** Company pages handed to the background check so far, by host label ("Greenhouse"). */
  movedToBackground: Record<string, number>;
};

const store = globalThis as typeof globalThis & { __jstActiveScans?: Map<string, ActiveScan> };

function scans(): Map<string, ActiveScan> {
  store.__jstActiveScans ??= new Map();
  return store.__jstActiveScans;
}

let counter = 0;

export function beginScanActivity(trigger: ScanTrigger, now = new Date()): string {
  const id = `activity-${now.getTime()}-${++counter}`;
  scans().set(id, {
    id,
    trigger,
    startedAt: now.toISOString(),
    sources: [],
    careerChecked: 0,
    careerTotal: 0,
    movedToBackground: {},
  });
  return id;
}

export function recordScanSourceProgress(id: string, update: JobDiscoveryProgressUpdate) {
  const scan = scans().get(id);
  if (!scan) return;
  const index = scan.sources.findIndex((s) => s.sourceId === update.sourceId);
  if (index === -1) scan.sources.push(update);
  else scan.sources[index] = update;
}

export function recordCareerBoardProgress(
  id: string,
  checked: number,
  total: number,
  movedToBackground: Record<string, number> = {},
) {
  const scan = scans().get(id);
  if (!scan) return;
  scan.careerChecked = checked;
  scan.careerTotal = total;
  scan.movedToBackground = movedToBackground;
}

export function endScanActivity(id: string) {
  scans().delete(id);
}

export function getActiveScans(): ActiveScan[] {
  return [...scans().values()].map((s) => ({ ...s, sources: [...s.sources], movedToBackground: { ...s.movedToBackground } }));
}

export type { JobDiscoverySourceId };
