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
  let body: {
    gapText: string;
    rawResponse?: string;
    polish?: boolean;
    confirmation?: {
      companies?: string[];
      explanation?: string;
      approvedResumeLines?: Array<{ organization: string; text: string }>;
    };
  };
  try {
    body = await req.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid gap response payload" }, { status: 400 });
  }

  const companies = (body.confirmation?.companies ?? [])
    .filter((company): company is string => typeof company === "string")
    .map((company) => company.trim())
    .filter(Boolean);
  const approvedResumeLines = (body.confirmation?.approvedResumeLines ?? [])
    .filter((line): line is { organization: string; text: string } =>
      typeof line?.organization === "string" && typeof line?.text === "string"
    );
  const isKeywordConfirmation = companies.length > 0;
  const rawResponse = isKeywordConfirmation
    ? [
        `Confirmed use of "${body.gapText}" at: ${companies.join(", ")}.`,
        body.confirmation?.explanation?.trim() ? `Optional context: ${body.confirmation.explanation.trim()}` : "",
        ...approvedResumeLines
          .filter((line) => line.organization.trim() && line.text.trim())
          .map((line) => `Approved resume line for ${line.organization.trim()}: ${line.text.trim()}`),
      ].filter(Boolean).join("\n")
    : body.rawResponse;
  if (!body.gapText || typeof rawResponse !== "string") {
    return Response.json({ error: "Gap text and response are required" }, { status: 400 });
  }

  const { saveJobGapResponse } = await import("@/lib/db/queries");
  const { assessGapAnswer, assessmentToJson } = await import("@/lib/gaps/gap-answer-assessor");

  const id = `gap-${jobId}-${Buffer.from(body.gapText).toString("base64url").slice(0, 16)}`;

  const assessment = isKeywordConfirmation
    ? {
        status: "addressed" as const,
        followUpQuestion: "",
        rationale: "The user confirmed the companies where this keyword was applied and approved the resume wording.",
        signals: ["confirmed_companies", "approved_resume_wording"],
        assessedBy: "heuristic" as const,
      }
    : await assessGapAnswer(body.gapText, rawResponse);
  let polishedResponse = "";

  if (assessment.status === "addressed" && body.polish && rawResponse.trim()) {
    try {
      const { polishGapResponse } = await import("@/lib/gaps/llm-gap-polisher");
      polishedResponse = await polishGapResponse(body.gapText, rawResponse);
    } catch {
      // Polish failure is non-fatal; raw response is still saved
    }
  }

  saveJobGapResponse({
    id,
    jobId,
    gapText: body.gapText,
    rawResponse,
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
