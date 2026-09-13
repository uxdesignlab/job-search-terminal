import { generateResumeDraft, type ResumeStageUpdate } from "@/lib/documents/resume-generator";
import { EvaluationRequiredError } from "@/lib/application-preparation";
import { GenerationCancelledError } from "@/lib/ai/retry";
import { AI_CREDITS_EXHAUSTED_CODE, aiErrorMessage, isAICreditsExhausted } from "@/lib/ai/error-response";
import type { ResumeSectionModeInput } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/**
 * Generate a resume draft while reporting each stage as it runs.
 *
 * The plain POST route answered only at the end, so the modal could show nothing but
 * a spinner for however long a local model took — measured at five minutes. This
 * route streams the same generation as server-sent events: which stage is running, on
 * which provider and model, and the elapsed time, which is the honest signal while one
 * long call is pending.
 *
 * Cancelling closes the request. That stops everything that has not started yet and,
 * above all, the save — a request already in flight at a provider cannot be recalled.
 */
export async function POST(req: Request) {
  let body: { jobId?: string; resumeId?: string | null; sectionModes?: ResumeSectionModeInput[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid generation request" }, { status: 400 });
  }
  const jobId = body.jobId;
  if (!jobId) return Response.json({ error: "jobId required" }, { status: 400 });

  const encoder = new TextEncoder();
  const cancellation = new AbortController();
  req.signal.addEventListener("abort", () => cancellation.abort(), { once: true });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (cancellation.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The client is gone; the abort listener stops the run.
        }
      };

      try {
        const result = await generateResumeDraft(jobId, body.resumeId, body.sectionModes ?? [], {
          signal: cancellation.signal,
          onStage: (update: ResumeStageUpdate) => send({ type: "stage", ...update }),
        });
        send({
          type: "complete",
          documentId: result.documentId,
          tailoringStatus: result.tailoringStatus,
          fallbackReason: result.fallbackReason,
          notice: result.notice,
          generationMs: result.generationMs,
          providerUsed: result.providerUsed,
          modelUsed: result.modelUsed,
        });
      } catch (error) {
        if (error instanceof GenerationCancelledError) {
          console.info(`[resume] generation for ${jobId} cancelled by the user; nothing was saved.`);
          return;
        }
        // §2.4: a missing evaluation is a precondition the user can fix, not a fault.
        if (error instanceof EvaluationRequiredError) {
          send({ type: "error", error: error.message, code: "evaluation_required", jobId: error.jobId });
          return;
        }
        console.error(`[resume] generation for ${jobId} failed:`, error);
        send({
          type: "error",
          error: aiErrorMessage(error),
          ...(isAICreditsExhausted(error) ? { code: AI_CREDITS_EXHAUSTED_CODE } : {}),
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a cancelled client.
        }
      }
    },

    cancel() {
      cancellation.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
