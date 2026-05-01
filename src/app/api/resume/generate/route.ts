import { NextResponse } from "next/server";
import { generateResumeDraft } from "@/lib/documents/resume-generator";

export async function POST(req: Request) {
  try {
    const { jobId, resumeId } = (await req.json()) as { jobId: string; resumeId?: string | null };
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

    const { documentId } = await generateResumeDraft(jobId, resumeId);
    return NextResponse.json({ documentId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
