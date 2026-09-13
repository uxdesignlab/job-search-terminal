import { findChainFailure } from "./chain-failure";
import { ProviderCreditsExhaustedError, isCreditsExhaustedError, providerLabel } from "./credit-status";

/** Response code an AI route returns when no provider in the chain has credits left. */
export const AI_CREDITS_EXHAUSTED_CODE = "ai_credits_exhausted";

/** The providers that failed for lack of credits, when that is the *only* reason anything failed. */
function exhaustedEverywhere(error: unknown): string[] | null {
  const chain = findChainFailure(error);
  if (chain) {
    if (chain.attempts.length === 0) return null;
    return chain.attempts.every((attempt) => isCreditsExhaustedError(attempt.error))
      ? chain.attempts.map((attempt) => attempt.provider)
      : null;
  }
  if (error instanceof ProviderCreditsExhaustedError) return [error.provider];
  return isCreditsExhaustedError(error) ? [] : null;
}

/**
 * What an AI action tells the user when it could not run.
 *
 * Out of credits on every provider gets its own sentence, because it is the one failure
 * that retrying can never fix and that the user can fix in a minute. A chain where only
 * some providers ran dry is reported as the chain, which already names each one.
 */
export function aiErrorMessage(error: unknown): string {
  const exhausted = exhaustedEverywhere(error);
  if (exhausted) {
    const names = [...new Set(exhausted)].map(providerLabel);
    const who = names.length === 0
      ? "Your AI provider"
      : names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    const verb = names.length > 1 ? "are" : "is";
    return `${who} ${verb} out of credits and no other AI provider is available. ` +
      "Add credits with your provider, or turn on a local model in Settings → AI Provider.";
  }
  const chain = findChainFailure(error);
  if (chain) return chain.message;
  return error instanceof Error ? error.message : String(error);
}

export function isAICreditsExhausted(error: unknown): boolean {
  return exhaustedEverywhere(error) !== null;
}

/** JSON body and status for an AI route's catch block. 402 when nothing has credits left. */
export function aiErrorResponse(error: unknown, fallbackStatus = 500): Response {
  const exhausted = isAICreditsExhausted(error);
  return Response.json(
    { error: aiErrorMessage(error), ...(exhausted ? { code: AI_CREDITS_EXHAUSTED_CODE } : {}) },
    { status: exhausted ? 402 : fallbackStatus }
  );
}
