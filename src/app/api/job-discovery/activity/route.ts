import { NextResponse } from "next/server";
import { getCatchUpStatus } from "@/lib/scanner/board-catch-up";
import { getActiveScans } from "@/lib/scanner/scan-activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Everything scanning in the background right now: running job-discovery scans
 * (scheduled, or a manual one the user stepped away from) with live progress, plus
 * the background check for boards a host refused. Read by the Dashboard's
 * "This week" card.
 */
export async function GET() {
  return NextResponse.json({ scans: getActiveScans(), catchUp: getCatchUpStatus() });
}
