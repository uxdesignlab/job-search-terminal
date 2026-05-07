import { NextResponse } from "next/server";
import { getLatestLinkedInImport } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const latest = getLatestLinkedInImport();

  if (!latest?.completed_at) {
    return NextResponse.json({ hasRecent: false });
  }

  const isRecent = Date.now() - new Date(latest.completed_at).getTime() < 5 * 60 * 1000;

  return NextResponse.json({
    hasRecent: isRecent,
    newJobsCount: latest.new_jobs_count,
    duplicateCount: latest.duplicate_count,
    completedAt: latest.completed_at
  });
}
