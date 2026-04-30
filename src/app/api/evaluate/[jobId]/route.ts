import { runAndSaveJobWithAI } from "@/lib/evaluation/llm-evaluator";
import type { BlockUpdate } from "@/lib/evaluation/llm-evaluator";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const onBlock = (update: BlockUpdate) => {
          send({ block: update.block, label: update.label, content: update.content, done: false });
        };

        const result = await runAndSaveJobWithAI(jobId, onBlock);

        send({
          block: "complete",
          fitScore: result.fitScore,
          scoreLabel: result.scoreLabel,
          recommendation: result.recommendation,
          roleArchetype: result.roleArchetype,
          legitimacyLabel: result.legitimacyLabel,
          providerUsed: result.providerUsed,
          modelUsed: result.modelUsed,
          generationMs: result.generationMs,
          done: true
        });
      } catch (error) {
        send({
          block: "error",
          error: error instanceof Error ? error.message : "Evaluation failed",
          done: true
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
