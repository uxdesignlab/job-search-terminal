import { NextResponse } from "next/server";
import { countPendingEmailCandidates, getPendingEmailCandidates } from "@/lib/db/queries";

export async function GET() {
  try {
    const count = countPendingEmailCandidates();
    if (count === 0) {
      return NextResponse.json({ count: 0, candidates: [] });
    }
    const candidates = getPendingEmailCandidates();
    return NextResponse.json({ count, candidates });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
