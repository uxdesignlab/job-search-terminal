import { NextResponse } from "next/server";
import { createResumeLane, saveResumeBuilderVersion } from "@/lib/db/queries";
import { BLANK_STARTER_SECTIONS, hashText } from "@/lib/documents/resume-builder";

const SCRATCH_SOURCE_HASH = hashText("");

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string };
    const name = body.name?.trim() || "New Resume";
    const id = createResumeLane(name);
    saveResumeBuilderVersion({
      resumeId: id,
      status: "needs_review",
      sections: BLANK_STARTER_SECTIONS,
      sourceHash: SCRATCH_SOURCE_HASH,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
