import { GAP_EVIDENCE_TAG, gapEvidenceId } from "@/lib/gaps/evidence-id";

export const dynamic = "force-dynamic";

export async function GET() {
  const { getGapEvidenceBacklog, getGapEvidenceCounts } = await import("@/lib/db/queries");
  return Response.json({ entries: getGapEvidenceBacklog(), counts: getGapEvidenceCounts() });
}

/**
 * Save one reusable answer to the global evidence bank. Keyed on gap text, so
 * this is the same record the job-level gap panel writes through.
 */
export async function POST(req: Request) {
  let body: { gapText?: string; content?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid evidence payload" }, { status: 400 });
  }

  const gapText = body.gapText?.trim();
  const content = body.content?.trim();
  if (!gapText || !content) {
    return Response.json({ error: "Gap text and content are required" }, { status: 400 });
  }

  const { saveProfileSupplement } = await import("@/lib/db/queries");
  const { assessGapAnswer, assessmentToJson } = await import("@/lib/gaps/gap-answer-assessor");
  const { loadGapEvidenceContext } = await import("@/lib/gaps/evidence-context");

  // Employers, titles, and dates come from here so the assessor never asks for them.
  const assessment = await assessGapAnswer(gapText, content, loadGapEvidenceContext());
  const id = gapEvidenceId(gapText);

  try {
    saveProfileSupplement({
      id,
      content,
      tags: [GAP_EVIDENCE_TAG, gapText],
      qualityStatus: assessment.status,
      followUpQuestion: assessment.followUpQuestion,
      assessment: assessmentToJson(assessment),
    });
  } catch (err) {
    return Response.json(
      { error: `Failed to save evidence: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  return Response.json({
    id,
    saved: true,
    qualityStatus: assessment.status,
    followUpQuestion: assessment.followUpQuestion,
    followUpQuestions: assessment.followUpQuestions,
    rationale: assessment.rationale,
    assessedBy: assessment.assessedBy,
  });
}

export async function DELETE(req: Request) {
  let body: { gapText?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid evidence payload" }, { status: 400 });
  }
  const gapText = body.gapText?.trim();
  if (!gapText) return Response.json({ error: "Gap text is required" }, { status: 400 });

  const { deleteProfileSupplement } = await import("@/lib/db/queries");
  deleteProfileSupplement(gapEvidenceId(gapText));
  return Response.json({ deleted: true });
}
