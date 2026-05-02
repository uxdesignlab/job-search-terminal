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
  const body = await req.json() as { gapText: string; rawResponse: string; polish?: boolean };

  const { saveJobGapResponse } = await import("@/lib/db/queries");

  const id = `gap-${jobId}-${Buffer.from(body.gapText).toString("base64url").slice(0, 16)}`;

  let polishedResponse = "";

  if (body.polish && body.rawResponse.trim()) {
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
  });

  return Response.json({ polishedResponse, saved: true });
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
