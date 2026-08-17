export const dynamic = "force-dynamic";

/**
 * Draft a starting answer for a gap from evidence the user already has on file.
 * Returns a proposal only — nothing is persisted until the user saves it.
 */
export async function POST(req: Request) {
  let body: { gapText?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid draft payload" }, { status: 400 });
  }

  const gapText = body.gapText?.trim();
  if (!gapText) return Response.json({ error: "Gap text is required" }, { status: 400 });

  const { getProfileSupplements } = await import("@/lib/db/queries");
  const { draftGapAnswer } = await import("@/lib/gaps/llm-gap-drafter");
  const { GAP_EVIDENCE_TAG } = await import("@/lib/gaps/evidence-id");
  const { formatGapEvidenceContext, loadGapEvidenceContext } = await import("@/lib/gaps/evidence-context");

  // Other answered gaps are fair grounding — they are the user's own words.
  // The gap being drafted is excluded so the model cannot echo it back.
  const supplements = getProfileSupplements()
    .filter((supplement) => supplement.qualityStatus === "addressed")
    .filter((supplement) => !(supplement.tags.includes(GAP_EVIDENCE_TAG) && supplement.tags.includes(gapText)))
    .map((supplement) => supplement.content);

  const evidence = [
    formatGapEvidenceContext(loadGapEvidenceContext()),
    supplements.length > 0 ? `PREVIOUSLY SAVED ANSWERS:\n${supplements.join("\n\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const result = await draftGapAnswer(gapText, evidence);
  return Response.json(result);
}
