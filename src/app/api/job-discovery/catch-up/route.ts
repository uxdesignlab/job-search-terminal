import { NextResponse } from "next/server";
import { getCatchUpStatus } from "@/lib/scanner/board-catch-up";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Status of the background check for boards a host refused during a scan. */
export async function GET() {
  return NextResponse.json(getCatchUpStatus());
}
