export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as { content: string; tags?: string[] };
  const { saveProfileSupplement } = await import("@/lib/db/queries");
  const { assessGapAnswer, assessmentToJson } = await import("@/lib/gaps/gap-answer-assessor");
  const gapText = body.tags?.[0] ?? "Reusable profile supplement for resume tailoring";
  const assessment = await assessGapAnswer(gapText, body.content);
  saveProfileSupplement({
    id,
    content: body.content,
    tags: body.tags ?? [],
    qualityStatus: assessment.status,
    followUpQuestion: assessment.followUpQuestion,
    assessment: assessmentToJson(assessment),
  });
  return Response.json({
    saved: true,
    qualityStatus: assessment.status,
    followUpQuestion: assessment.followUpQuestion,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { deleteProfileSupplement } = await import("@/lib/db/queries");
  deleteProfileSupplement(id);
  return Response.json({ deleted: true });
}
