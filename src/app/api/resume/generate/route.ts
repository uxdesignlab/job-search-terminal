import { NextResponse } from "next/server";
import { generateResumeDraft } from "@/lib/documents/resume-generator";
import { EvaluationRequiredError } from "@/lib/application-preparation";
import type { ResumeSectionModeInput } from "@/lib/db/types";

export async function POST(req: Request) {
  try {
    const { jobId, resumeId, sectionModes } = (await req.json()) as {
      jobId: string;
      resumeId?: string | null;
      sectionModes?: ResumeSectionModeInput[];
    };
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

    const result = await generateResumeDraft(jobId, resumeId, sectionModes ?? []);
    return NextResponse.json(result);
  } catch (err) {
    // §2.4: a missing evaluation is a precondition the user can fix, not a server
    // fault. It gets its own status and an actionable message rather than being
    // flattened into a 500 alongside real failures.
    if (err instanceof EvaluationRequiredError) {
      return NextResponse.json(
        { error: err.message, code: "evaluation_required", jobId: err.jobId },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
