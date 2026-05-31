import { NextResponse } from "next/server";
import { generateResumeDraft } from "@/lib/documents/resume-generator";
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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
