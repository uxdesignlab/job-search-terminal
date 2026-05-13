import { revalidatePath } from "next/cache";
import { prepareApplicationAnswers } from "@/lib/applications/application-assistant";
import { prepareApplicationAnswersWithAI } from "@/lib/applications/llm-answer-generator";
import { getAISettings } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as { questions?: unknown };
    const customQuestions = Array.isArray(body.questions)
      ? body.questions.map((q) => String(q ?? "")).filter((q) => q.trim().length > 0)
      : [];

    const aiSettings = getAISettings();
    const hasAIKey = Boolean(
      aiSettings.anthropicApiKey || aiSettings.geminiApiKey || aiSettings.openaiApiKey
    );

    const drafts = hasAIKey
      ? await prepareApplicationAnswersWithAI(jobId, customQuestions)
      : prepareApplicationAnswers(jobId, customQuestions);

    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/applications");
    revalidatePath("/dashboard");

    return Response.json({ drafts, usedAI: hasAIKey });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
