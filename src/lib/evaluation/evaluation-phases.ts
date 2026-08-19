/**
 * Progress vocabulary for a Fast Evaluation run (PRD v0.2.1 §18.2).
 *
 * Deliberately its own module with no imports: the streaming modal is a client
 * component, and importing these from `llm-evaluator` would pull `queries` →
 * `better-sqlite3` into the browser bundle. The old code only imported a *type*
 * from there, which erases at compile time and hid the coupling.
 */

/** Ordered, and exhaustive for progress — the client walks it to render steps. */
export const EVALUATION_PHASES = ["preparing", "evaluating", "validating", "saving"] as const;

export type EvaluationPhase = (typeof EVALUATION_PHASES)[number];

export const EVALUATION_PHASE_LABELS: Record<EvaluationPhase, string> = {
  preparing: "Loading job and evidence",
  evaluating: "Evaluating fit",
  validating: "Validating score and blockers",
  saving: "Saving results",
};

/**
 * Where a failure happened (§18.5). Block-level attribution went away with the
 * blocks, but "which step broke" is still the most useful thing to report.
 */
export type EvaluationFailurePhase = "input" | "provider" | "parse" | "validate" | "save";

/**
 * Written to provider/model on rows saved before an AI failure stopped being
 * scored by rules. Nothing writes it any more; the UI still reads it, because
 * those rows exist and have to say what they are.
 */
export const LOCAL_FALLBACK_LABEL = "local-fallback";
