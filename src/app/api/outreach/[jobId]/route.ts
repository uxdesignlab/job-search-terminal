import { markJobUserActivity } from "@/lib/db/queries";
import { generateOutreachDrafts } from "@/lib/outreach/llm-outreach";
import { aiErrorResponse } from "@/lib/ai/error-response";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  markJobUserActivity(jobId);

  try {
    const drafts = await generateOutreachDrafts(jobId);
    return Response.json({ drafts });
  } catch (err) {
    return aiErrorResponse(err);
  }
}
