import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const { getProfileSupplements } = await import("@/lib/db/queries");
  return Response.json({ supplements: getProfileSupplements() });
}

export async function POST(req: Request) {
  const body = await req.json() as { content: string; tags?: string[] };
  const { saveProfileSupplement } = await import("@/lib/db/queries");
  const { assessGapAnswer, assessmentToJson } = await import("@/lib/gaps/gap-answer-assessor");
  const id = randomUUID();
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
    id,
    saved: true,
    qualityStatus: assessment.status,
    followUpQuestion: assessment.followUpQuestion,
  });
}
