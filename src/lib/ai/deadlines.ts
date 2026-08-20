/**
 * How long one generation may run, per provider.
 *
 * The cloud deadline exists to cap what a stalled paid call can cost. A local
 * run costs nothing but time, so cutting it at the same point saves nothing and
 * throws away work that was nearly finished — measured on this app's own prompt,
 * a local model lands either side of the cloud deadline depending on the length
 * of the posting and the size of the model.
 */

export const CLOUD_GENERATION_TIMEOUT_MS = 150_000;

/**
 * Ten minutes. A local model's speed is a property of the machine it runs on, not
 * of the request: the same 12B model that answers in 70s on one Mac needs several
 * times that on older hardware, and a 27B model needs more again. Any bound tight
 * enough to feel responsive on fast hardware just makes the app unusable on slow
 * hardware, where waiting is the trade the user already accepted by running
 * locally. The bound exists only so a wedged request cannot hang forever —
 * impatience is served by cancelling, which the evaluation modal offers while the
 * run is in flight.
 */
export const LOCAL_GENERATION_TIMEOUT_MS = 600_000;

export function generationDeadlineMs(providerName: string): number {
  return providerName === "ollama" ? LOCAL_GENERATION_TIMEOUT_MS : CLOUD_GENERATION_TIMEOUT_MS;
}

/**
 * The budget for a whole run. A chain spends its providers' budgets one after
 * another — a local model that runs out of time is exactly when the cloud
 * fallback the user configured should get its turn, so the outer bound has to
 * cover the sum rather than cut the chain off at the first provider's limit.
 */
export function totalGenerationDeadlineMs(providerNames: readonly string[]): number {
  if (providerNames.length === 0) return CLOUD_GENERATION_TIMEOUT_MS;
  // A little headroom for the retry backoff between attempts.
  return providerNames.reduce((total, name) => total + generationDeadlineMs(name), 0) + 10_000;
}

/**
 * Output budget for the app's structured generations.
 *
 * Every provider defaults to 4096, which is under what these shapes need: an
 * Application Preparation answer alone carries 12–18 keyword signals with
 * rationale, a requirements list and an evidence map. Over the limit the answer
 * stops mid-object and arrives as "Unexpected end of JSON input" — indistinguishable,
 * from the outside, from a model that cannot follow a schema. Set it at the call
 * site so it holds whichever provider serves the request.
 */
export const STRUCTURED_OUTPUT_MAX_TOKENS = 8192;
