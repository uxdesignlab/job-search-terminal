/**
 * What a stage stores for a legitimacy judgement it does not make.
 *
 * Fast Evaluation answers "should I pursue this?" and leaves posting legitimacy
 * to the legacy A–G analysis, so it writes this label rather than an assessment.
 * `saveJobEvaluation` has to recognise it as *no value*: it is non-empty, so a
 * plain emptiness test reads it as new detail and overwrites a legacy row's real
 * assessment — losing one of the four fields the carry exists to protect.
 *
 * Lives in its own module because both the evaluator and the database layer need
 * it, and those two already import each other in the other direction.
 */
export const UNASSESSED_LEGITIMACY = "Not assessed";
