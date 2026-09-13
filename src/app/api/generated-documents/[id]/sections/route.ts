import { rewriteSection, SectionRewriteError, type SectionAction } from "@/lib/documents/section-rewrite";
import { EvaluationRequiredError } from "@/lib/application-preparation";
import { GenerationCancelledError } from "@/lib/ai/retry";
import { aiErrorResponse } from "@/lib/ai/error-response";
import type { ResumeTemplateInput } from "@/lib/documents/resume-template";

export const dynamic = "force-dynamic";

/**
 * Improve or regenerate one part of a draft. Returns a suggestion only — nothing is
 * saved until the user accepts it in the editor and the draft is exported or saved.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { action?: SectionAction; unit?: string; note?: string; draft?: ResumeTemplateInput };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.action !== "improve" && body.action !== "regenerate") {
    return Response.json({ error: "action must be improve or regenerate" }, { status: 400 });
  }
  if (!body.unit || !body.draft || !Array.isArray(body.draft.experience)) {
    return Response.json({ error: "unit and draft are required" }, { status: 400 });
  }

  try {
    const result = await rewriteSection({
      documentId: id,
      action: body.action,
      unit: body.unit,
      note: typeof body.note === "string" ? body.note : undefined,
      draft: body.draft,
      signal: req.signal,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof GenerationCancelledError) {
      return Response.json({ error: "Cancelled." }, { status: 499 });
    }
    if (error instanceof EvaluationRequiredError) {
      return Response.json({ error: error.message, code: "evaluation_required", jobId: error.jobId }, { status: 409 });
    }
    if (error instanceof SectionRewriteError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return aiErrorResponse(error);
  }
}
