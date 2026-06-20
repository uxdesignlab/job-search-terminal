import { NextResponse } from "next/server";
import {
  deletePendingEmailCandidates,
  deleteAllPendingEmailCandidates,
  getPendingEmailCandidatesByIds,
} from "@/lib/db/queries";
import { importApprovedEmailCandidates } from "@/lib/scanner/email-job-alert-importer";

type ReviewBody = {
  action: "approve" | "dismiss" | "dismiss-all";
  ids?: string[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ReviewBody;

    if (body.action === "dismiss-all") {
      deleteAllPendingEmailCandidates();
      return NextResponse.json({ success: true, action: "dismiss-all" });
    }

    const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "No candidate IDs provided" }, { status: 400 });
    }

    if (body.action === "dismiss") {
      deletePendingEmailCandidates(ids);
      return NextResponse.json({ success: true, action: "dismiss", dismissed: ids.length });
    }

    if (body.action === "approve") {
      const candidates = getPendingEmailCandidatesByIds(ids);
      const result = await importApprovedEmailCandidates(candidates);
      if (!result.success) {
        return NextResponse.json({ action: "approve", ...result }, { status: 500 });
      }
      deletePendingEmailCandidates(ids);
      return NextResponse.json({ action: "approve", ...result });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
