import { NextResponse } from "next/server";
import { createPdfForDocument, UnsupportedResumeClaimsError } from "@/lib/documents/resume-generator";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { draft, allowUnsupportedClaims = false } = (await req.json()) as {
      draft: ResumeTemplateInput;
      allowUnsupportedClaims?: boolean;
    };
    if (!draft) return NextResponse.json({ error: "draft required" }, { status: 400 });

    const result = await createPdfForDocument(id, draft, { allowUnsupportedClaims });
    return NextResponse.json({ ok: true, pdfUrl: result.pdfUrl });
  } catch (err) {
    if (err instanceof UnsupportedResumeClaimsError) {
      return NextResponse.json({
        code: "unsupported-claims",
        error: err.message,
        issues: err.issues,
      }, { status: 409 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
