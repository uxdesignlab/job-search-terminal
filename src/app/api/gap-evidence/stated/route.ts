import { GAP_EVIDENCE_TAG, gapEvidenceId } from "@/lib/gaps/evidence-id";
import { STATED_FACT_TAG, statedFactGapText } from "@/lib/gaps/stated-fact";
import { aiErrorMessage } from "@/lib/ai/error-response";

export const dynamic = "force-dynamic";

/**
 * Save a fact the user stated while editing a resume to the Evidence bank.
 *
 * Only ever called from the user pressing "Add to Evidence bank" on text they can see
 * and edit first — never automatically. It skips the gap-answer assessor on purpose:
 * that assessor asks whether an answer to a posting's gap has enough scale and outcome
 * for a bullet, and a plain fact such as "8+ years of healthcare experience" would be
 * parked as "Needs detail" — saved but unused, so the next rewrite would reject the
 * same claim again. The user is asserting the fact; it is stored as Answered.
 */
export async function POST(req: Request) {
  let body: { content?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const content = body.content?.trim().replace(/\s+/g, " ");
  if (!content) return Response.json({ error: "Write the fact to save." }, { status: 400 });
  if (content.length > 1000) return Response.json({ error: "Keep it under 1,000 characters." }, { status: 400 });

  const gapText = statedFactGapText(content);
  const id = gapEvidenceId(gapText);
  const { saveProfileSupplement } = await import("@/lib/db/queries");
  try {
    saveProfileSupplement({
      id,
      content,
      // The heading must come first: the bank reads the first non-bank tag as it.
      tags: [GAP_EVIDENCE_TAG, gapText, STATED_FACT_TAG],
      qualityStatus: "addressed",
      followUpQuestion: "",
      assessment: { source: "stated-by-user" },
    });
  } catch (err) {
    return Response.json({ error: `Could not save it: ${aiErrorMessage(err)}` }, { status: 500 });
  }
  return Response.json({ id, saved: true, qualityStatus: "addressed", gapText });
}
