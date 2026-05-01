import { NextResponse } from "next/server";
import { createPdfForDocument } from "@/lib/documents/resume-generator";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { draft } = (await req.json()) as { draft: ResumeTemplateInput };
    if (!draft) return NextResponse.json({ error: "draft required" }, { status: 400 });

    const result = await createPdfForDocument(id, draft);
    return NextResponse.json({ ok: true, pdfUrl: result.pdfUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
