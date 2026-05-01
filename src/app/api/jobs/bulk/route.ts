import { NextResponse } from "next/server";
import { archiveJob, deleteJob, updateJobStatus } from "@/lib/db/queries";

const ALLOWED_STATUSES = new Set(["Found", "Reviewed", "Skipped", "Applied", "Resume generated"]);

export async function DELETE(req: Request) {
  try {
    const { ids } = (await req.json()) as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }
    for (const id of ids) deleteJob(id);
    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { ids, status } = (await req.json()) as { ids: string[]; status: string };
    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (status === "Archived") {
      for (const id of ids) archiveJob(id);
      return NextResponse.json({ ok: true, updated: ids.length });
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    for (const id of ids) updateJobStatus(id, status);
    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
