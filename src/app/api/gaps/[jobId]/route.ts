export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const { getJobGapResponses } = await import("@/lib/db/queries");
  const responses = getJobGapResponses(jobId);
  return Response.json({ responses });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  let body: { gapText: string; rawResponse: string; polish?: boolean };
  try {
    body = await req.json() as { gapText: string; rawResponse: string; polish?: boolean };
  } catch {
    return Response.json({ error: "Invalid gap response payload" }, { status: 400 });
  }

  if (!body.gapText || typeof body.rawResponse !== "string") {
    return Response.json({ error: "Gap text and response are required" }, { status: 400 });
  }

  const { saveJobGapResponse } = await import("@/lib/db/queries");
  const { assessGapAnswer, assessmentToJson } = await import("@/lib/gaps/gap-answer-assessor");

  const id = `gap-${jobId}-${Buffer.from(body.gapText).toString("base64url").slice(0, 16)}`;

  const assessment = await assessGapAnswer(body.gapText, body.rawResponse);
  let polishedResponse = "";

  if (assessment.status === "addressed" && body.polish && body.rawResponse.trim()) {
    try {
      const { polishGapResponse } = await import("@/lib/gaps/llm-gap-polisher");
      polishedResponse = await polishGapResponse(body.gapText, body.rawResponse);
    } catch {
      // Polish failure is non-fatal; raw response is still saved
    }
  }

  saveJobGapResponse({
    id,
    jobId,
    gapText: body.gapText,
    rawResponse: body.rawResponse,
    polishedResponse,
    qualityStatus: assessment.status,
    followUpQuestion: assessment.followUpQuestion,
    assessment: assessmentToJson(assessment),
  });

  return Response.json({
    polishedResponse,
    saved: true,
    qualityStatus: assessment.status,
    followUpQuestion: assessment.followUpQuestion,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const body = await req.json() as { gapText: string };
  const { deleteJobGapResponse } = await import("@/lib/db/queries");
  deleteJobGapResponse(jobId, body.gapText);
  return Response.json({ deleted: true });
}
