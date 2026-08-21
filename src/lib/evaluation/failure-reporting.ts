import { findChainFailure } from "../ai/fallback-provider";
import type { EvaluationFailurePhase, EvaluationPhase } from "./evaluation-phases";

/**
 * How an evaluation failure is described to the person who clicked Evaluate (§18.5).
 *
 * Lifted out of the route so it can be tested directly: a Next.js route file may
 * only export its handlers and a small set of reserved config symbols, so
 * anything exported for a test breaks the build.
 */

/** What each failure phase means to someone who just clicked Evaluate (§18.5). */
export const FAILURE_PHASE_MESSAGE: Record<EvaluationFailurePhase, string> = {
  input: "The job could not be loaded.",
  provider: "The AI provider could not be reached.",
  parse: "The AI response could not be read.",
  validate: "The AI response was incomplete.",
  save: "The evaluation ran but could not be saved.",
};

/**
 * Which failure phase a run is in once a given progress phase has been announced.
 *
 * Exhaustive rather than a ternary chain: "preparing" fell to the chain's default
 * and was attributed to "validate", so anything that threw before a provider was
 * ever contacted — no provider configured, a job-description fetch that failed —
 * was reported as "The AI response was incomplete." for a run that never asked
 * for one. Only errors carrying their own EvaluationPhaseError override this.
 */
export const PHASE_FAILURE_ATTRIBUTION: Record<EvaluationPhase, EvaluationFailurePhase> = {
  preparing: "input",
  evaluating: "provider",
  validating: "validate",
  saving: "save",
};

export function toUserMessage(error: unknown): string {
  // A chain failure is reported as itself. Collapsing it into "quota exceeded"
  // named the last provider's problem as if it were the only one, which reads as
  // nonsense to someone whose first provider is a local model with no quota.
  const chainFailure = findChainFailure(error);
  if (chainFailure) return chainFailure.message;

  const msg = error instanceof Error ? error.message : String(error);
  // Answered before the invalid-key test below, because "No AI provider
  // configured. Add an API key in Settings → AI Provider." contains the words
  // "api key" and was matching it — telling a first-run user with an empty
  // settings page to re-enter a key they had never entered.
  if (msg.toLowerCase().includes("no ai provider configured")) {
    return "No AI provider is configured — add an API key in Settings → AI Provider.";
  }
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
