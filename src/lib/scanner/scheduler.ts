import { completeScheduledScan, getScanSchedule, releaseScheduledScan, tryStartScheduledScan } from "@/lib/db/queries";
import { runJobDiscoveryScan } from "./job-discovery";
import { CATCH_UP_TICK_MS, runCatchUpTick } from "./board-catch-up";

const POLL_MS = 60_000;
let timer: NodeJS.Timeout | undefined;
let catchUpTimer: NodeJS.Timeout | undefined;

export function startJobDiscoveryScheduler() {
  if (timer) return;
  timer = setInterval(() => void runDueScheduledScan(), POLL_MS);
  timer.unref();
  void runDueScheduledScan();

  // Works through boards a host refused during a scan. Idle ticks are one small
  // database read; the queue survives restarts, so this also resumes old work.
  catchUpTimer = setInterval(() => {
    runCatchUpTick().catch((error) => console.error("[board-catch-up] tick failed:", error));
  }, CATCH_UP_TICK_MS);
  catchUpTimer.unref();
}

export async function runDueScheduledScan() {
  if (!tryStartScheduledScan()) return false;
  try {
    const schedule = getScanSchedule();
    await runJobDiscoveryScan({
      trigger: "scheduled",
      freshnessWindowHours: schedule.freshnessWindowHours,
    });
    completeScheduledScan();
    return true;
  } catch (error) {
    console.error("[job-discovery-scheduler] scheduled scan failed:", error);
    releaseScheduledScan();
    return false;
  }
}
