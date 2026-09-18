import { markJobUserActivity } from "@/lib/db/queries";
import { revalidatePath } from "next/cache";
import { prepareApplicationAnswers } from "@/lib/applications/application-assistant";
import { EvaluationRequiredError } from "@/lib/application-preparation";
import { prepareApplicationAnswersWithAI } from "@/lib/applications/llm-answer-generator";
import { getAISettings } from "@/lib/db/queries";
import { aiErrorResponse } from "@/lib/ai/error-response";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  markJobUserActivity(jobId);

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
    // §2.4: Apply no longer evaluates behind the user's back, so a missing
    // evaluation is a precondition with a clear next step, not a server error.
    if (err instanceof EvaluationRequiredError) {
      return Response.json(
        { error: err.message, code: "evaluation_required", jobId: err.jobId },
        { status: 409 }
      );
    }
    return aiErrorResponse(err);
  }
}
