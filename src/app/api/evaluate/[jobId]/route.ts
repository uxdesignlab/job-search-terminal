import { runAndSaveJobWithAI } from "@/lib/evaluation/llm-evaluator";
import type { BlockName, BlockUpdate } from "@/lib/evaluation/llm-evaluator";
import { tryGetActiveProvider } from "@/lib/ai/factory";

function toUserMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate limit")) {
    return "AI quota exceeded — you've hit the free-tier limit. Check your plan or try again in a few minutes.";
  }
  if (msg.includes("401") || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("invalid key")) {
    return "Invalid API key — check your AI provider settings and re-enter the key.";
  }
  if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
    return "Network error reaching the AI provider. Check your connection and try again.";
  }
  // Pass through already-humanized Ollama errors (they're user-readable and specific)
  if (msg.toLowerCase().includes("ollama") || msg.toLowerCase().startsWith("could not connect")) {
    return msg;
  }
  return "Evaluation failed. Check your AI provider settings and try again.";
}

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

      let currentBlock: BlockName | "save" = "a";

      try {
        const activeProvider = tryGetActiveProvider();
        if (activeProvider) {
          send({ block: "start", providerUsed: activeProvider.name, modelUsed: activeProvider.effectiveModel, done: false });
        }

        const onBlock = (update: BlockUpdate) => {
          send({ block: update.block, label: update.label, content: update.content, done: false });
        };

        const onBlockStart = (block: BlockName) => {
          currentBlock = block;
        };

        const result = await runAndSaveJobWithAI(jobId, onBlock, onBlockStart);
        currentBlock = "save";

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
        const blockLabel = currentBlock === "save" ? "saving results" : `block ${currentBlock.toUpperCase()}`;
        console.error(`[evaluate] error during ${blockLabel}:`, error);
        send({
          block: "error",
          error: toUserMessage(error),
          failedBlock: currentBlock,
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
