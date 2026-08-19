import type { ApplicationPreparationRecord, EvaluationRecord, JobKeywordSignal, JobRecord } from "../db/types";
import { legacyKeywordSignals } from "./keyword-signals";

/**
 * The one place that answers "which keywords describe this job?" (PRD v0.2.1 §25).
 *
 * This began as a private helper inside resume-generator.ts. Application
 * Preparation adds a third source, and several other consumers were reading
 * `evaluation.keywords` directly — so a second, subtly different fallback chain
 * was about to appear. There is one chain, and everything resolves through it.
 *
 * Tiers, in order:
 *   1. Application Preparation signals — the current source for fast-v2 jobs
 *   2. Legacy evaluation keyword signals — jobs evaluated under A–G
 *   3. Legacy evaluation keywords, normalized — the oldest rows
 *
 * A fast-v2 job with no preparation yet resolves to nothing, which is correct:
 * evaluation deliberately extracts no keywords, and inventing some would be worse
 * than having none.
 */
export function resolveEffectiveKeywordSignals(input: {
  preparation?: Pick<ApplicationPreparationRecord, "keywordSignals"> | null;
  evaluation?: Pick<EvaluationRecord, "keywordSignals" | "keywords"> | null;
  job: Pick<JobRecord, "title" | "rawDescription" | "parsedDescription">;
}): JobKeywordSignal[] {
  const prepared = input.preparation?.keywordSignals ?? [];
  if (prepared.length > 0) return prepared;

  const evaluation = input.evaluation;
  if (!evaluation) return [];

  if (evaluation.keywordSignals.length > 0) return evaluation.keywordSignals;

  // Normalization always appends the exact job title as a critical keyword, which
  // is right when there are keywords to normalize and wrong when there are none:
  // a fast-v2 job would resolve to a title-only signal instead of to nothing.
  // Downstream that reads as "this job has keywords", which is how taxonomy links
  // would get replaced by a thin title-and-archetype set.
  if (evaluation.keywords.length === 0) return [];

  return legacyKeywordSignals(evaluation.keywords, {
    title: input.job.title,
    description: input.job.rawDescription || input.job.parsedDescription || "",
  });
}

/** Plain phrases, for callers that match on text rather than on signal metadata. */
export function toKeywordPhrases(signals: JobKeywordSignal[]): string[] {
  return signals.map((signal) => signal.keyword);
}
