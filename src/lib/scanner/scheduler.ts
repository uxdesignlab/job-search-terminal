import { completeScheduledScan, getScanSchedule, releaseScheduledScan, tryStartScheduledScan } from "@/lib/db/queries";
import { runJobDiscoveryScan } from "./job-discovery";

const POLL_MS = 60_000;
let timer: NodeJS.Timeout | undefined;

export function startJobDiscoveryScheduler() {
  if (timer) return;
  timer = setInterval(() => void runDueScheduledScan(), POLL_MS);
  timer.unref();
  void runDueScheduledScan();
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
