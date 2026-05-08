import { NextResponse } from "next/server";
import { approveResumeBuilderVersion, saveResumeBuilderVersion } from "@/lib/db/queries";
import type { ResumeBuilderSection, ResumeBuilderVersionStatus } from "@/lib/db/types";

type RouteContext = {
  params: Promise<{ resumeId: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { resumeId } = await params;
    const body = (await req.json()) as {
      status?: ResumeBuilderVersionStatus;
      sections?: ResumeBuilderSection[];
      sourceHash?: string;
    };

    if (!Array.isArray(body.sections)) {
      return NextResponse.json({ error: "sections required" }, { status: 400 });
    }

    const status = body.status === "approved" ? "approved" : "needs_review";
    if (status === "approved") {
      approveResumeBuilderVersion(resumeId, body.sections, body.sourceHash ?? "");
    } else {
      saveResumeBuilderVersion({
        resumeId,
        status,
        sections: body.sections,
        sourceHash: body.sourceHash ?? ""
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
