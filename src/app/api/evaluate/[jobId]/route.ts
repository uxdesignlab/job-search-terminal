import { runAndSaveJobWithAI, EvaluationPhaseError } from "@/lib/evaluation/llm-evaluator";
import type { PhaseUpdate } from "@/lib/evaluation/llm-evaluator";
import { EVALUATION_PHASES } from "@/lib/evaluation/evaluation-phases";
import type { EvaluationFailurePhase } from "@/lib/evaluation/evaluation-phases";
import { tryGetActiveProvider } from "@/lib/ai/factory";
import { findChainFailure } from "@/lib/ai/fallback-provider";

function toUserMessage(error: unknown): string {
  // A chain failure is reported as itself. Collapsing it into "quota exceeded"
  // named the last provider's problem as if it were the only one, which reads as
  // nonsense to someone whose first provider is a local model with no quota.
  const chainFailure = findChainFailure(error);
  if (chainFailure) return chainFailure.message;

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

/** What each failure phase means to someone who just clicked Evaluate (§18.5). */
const FAILURE_PHASE_MESSAGE: Record<EvaluationFailurePhase, string> = {
  input: "The job could not be loaded.",
  provider: "The AI provider could not be reached.",
  parse: "The AI response could not be read.",
  validate: "The AI response could not be validated. A local fallback was attempted.",
  fallback: "The AI response could not be validated and the local fallback also failed.",
  save: "The evaluation ran but could not be saved.",
};

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

      const startedAt = Date.now();
      // Where to attribute a failure if one arrives without its own phase.
      let currentPhase: EvaluationFailurePhase = "input";

      try {
        const activeProvider = tryGetActiveProvider();
        send({
          phase: "start",
          phases: EVALUATION_PHASES,
          providerUsed: activeProvider?.name ?? "",
          modelUsed: activeProvider?.effectiveModel ?? "",
          done: false
        });

        const onPhase = (update: PhaseUpdate) => {
          currentPhase = update.phase === "evaluating" ? "provider" : update.phase === "saving" ? "save" : "validate";
          send({
            phase: update.phase,
            message: update.message,
            providerUsed: update.providerUsed,
            modelUsed: update.modelUsed,
            // Elapsed time is the honest signal while one long call is pending —
            // there is no partial progress to report, and a percentage would be invented.
            elapsedMs: Date.now() - startedAt,
            done: false
          });
        };

        const result = await runAndSaveJobWithAI(jobId, onPhase);

        send({
          phase: "complete",
          fitScore: result.fitScore,
          scoreLabel: result.scoreLabel,
          recommendation: result.recommendation,
          confidence: result.confidenceLabel,
          roleArchetype: result.roleArchetype,
          evaluationVersion: result.evaluationVersion,
          completenessWarnings: result.completenessWarnings,
          providerUsed: result.providerUsed,
          modelUsed: result.modelUsed,
          generationMs: result.generationMs,
          done: true
        });
      } catch (error) {
        const failedPhase = error instanceof EvaluationPhaseError ? error.failedPhase : currentPhase;
        console.error(`[evaluate] error during ${failedPhase}:`, error);
        send({
          phase: "error",
          error: `${FAILURE_PHASE_MESSAGE[failedPhase]} ${toUserMessage(error)}`.trim(),
          failedPhase,
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
