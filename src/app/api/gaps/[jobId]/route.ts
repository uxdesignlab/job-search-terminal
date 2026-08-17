import { GAP_EVIDENCE_TAG, gapEvidenceId } from "@/lib/gaps/evidence-id";

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
    wasPolished?: boolean;
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

  const { saveJobGapResponse, saveProfileSupplement } = await import("@/lib/db/queries");
  const { assessGapAnswer, assessmentToJson } = await import("@/lib/gaps/gap-answer-assessor");
  const { loadGapEvidenceContext } = await import("@/lib/gaps/evidence-context");

  const id = `gap-${jobId}-${Buffer.from(body.gapText).toString("base64url").slice(0, 16)}`;
  const globalId = gapEvidenceId(body.gapText);

  const assessment = isKeywordConfirmation
    ? {
        status: "addressed" as const,
        followUpQuestion: "",
        rationale: "The user confirmed the companies where this keyword was applied and approved the resume wording.",
        signals: ["confirmed_companies", "approved_resume_wording"],
        followUpQuestions: [] as string[],
        assessedBy: "heuristic" as const,
      }
    : await assessGapAnswer(body.gapText, rawResponse, loadGapEvidenceContext());
  let polishedResponse = "";

  if (assessment.status === "addressed" && rawResponse.trim()) {
    if (body.wasPolished) {
      // Content was already polished client-side via /api/gaps/polish; store as-is.
      polishedResponse = rawResponse;
    } else if (body.polish) {
      try {
        const { polishGapResponse } = await import("@/lib/gaps/llm-gap-polisher");
        polishedResponse = await polishGapResponse(body.gapText, rawResponse);
      } catch {
        // Polish failure is non-fatal; raw response is still saved
      }
    }
  }

  try {
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
  } catch (err) {
    return Response.json(
      { error: `Failed to save gap response: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  // Promote to the global evidence bank (non-fatal) regardless of quality.
  // Half-finished answers are promoted too: a gap is a fact about the person,
  // so an unfinished story about it belongs in one backlog the user can finish
  // later, not stranded on the requisition that happened to surface it.
  // Resume generation only reads `addressed` supplements, so parking a
  // `needs_followup` answer here never leaks into tailored documents.
  let savedToBank = false;
  const evidenceContent = polishedResponse.trim() || rawResponse.trim();
  if (evidenceContent) {
    try {
      saveProfileSupplement({
        id: globalId,
        content: evidenceContent,
        tags: [GAP_EVIDENCE_TAG, body.gapText],
        qualityStatus: assessment.status,
        followUpQuestion: assessment.followUpQuestion,
        assessment: assessmentToJson(assessment),
      });
      savedToBank = assessment.status === "addressed";
    } catch {
      // Non-fatal — job-specific record is already saved above.
    }
  }

  return Response.json({
    polishedResponse,
    saved: true,
    qualityStatus: assessment.status,
    followUpQuestion: assessment.followUpQuestion,
    followUpQuestions: assessment.followUpQuestions,
    savedToBank,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const body = await req.json() as { gapText: string };
  const { deleteJobGapResponse, deleteProfileSupplement } = await import("@/lib/db/queries");
  deleteJobGapResponse(jobId, body.gapText);
  // The answer is global, so clearing it has to clear the bank too. Leaving the
  // supplement behind would let it auto-fill straight back into this gap and
  // make the Clear button look broken.
  deleteProfileSupplement(gapEvidenceId(body.gapText));
  return Response.json({ deleted: true });
}
