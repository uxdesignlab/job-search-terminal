import { NextResponse } from "next/server";
import { getLatestBrowserBoardImport } from "@/lib/db/queries";
import {
  browserBoardSourceLabel,
  isBrowserBoardScanType,
  scanTypeToBrowserBoardSource
} from "@/lib/scanner/browser-board-sources";

export const dynamic = "force-dynamic";

export async function GET() {
  const latest = getLatestBrowserBoardImport();

  if (!latest?.completed_at || !isBrowserBoardScanType(latest.scan_type)) {
    return NextResponse.json({ hasRecent: false });
  }

  const isRecent = Date.now() - new Date(latest.completed_at).getTime() < 5 * 60 * 1000;
  const source = scanTypeToBrowserBoardSource(latest.scan_type);

  return NextResponse.json({
    hasRecent: isRecent,
    source,
    sourceLabel: browserBoardSourceLabel(source),
    newJobsCount: latest.new_jobs_count,
    duplicateCount: latest.duplicate_count,
    completedAt: latest.completed_at
  });
}
