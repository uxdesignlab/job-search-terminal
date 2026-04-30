import { generateOutreachDrafts } from "@/lib/outreach/llm-outreach";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  try {
    const drafts = await generateOutreachDrafts(jobId);
    return Response.json({ drafts });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
