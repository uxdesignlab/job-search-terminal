/**
 * One place that decides how a recommendation reads, so the jobs list, the job
 * detail header, the overview strip and analytics cannot disagree.
 *
 * They did disagree before fast-v2: two of them rendered `recommendation ===
 * "Skip" ? danger : success`, which painted "Review manually" green — the one
 * verdict that exists to say *look closer*.
 */
export type RecommendationTone = "neutral" | "success" | "warning" | "danger";

export function toneForRecommendation(recommendation: string): RecommendationTone {
  switch (recommendation) {
    case "Priority apply":
    case "Strong apply":
      return "success";
    // Blocked and Skip are both negative but not the same answer: Blocked means a
    // saved non-negotiable rules the role out, Skip means the fit is too low.
    // They share a tone because both end the pursuit; the label carries the why.
    case "Blocked":
    case "Skip":
      return "danger";
    case "Review manually":
      return "warning";
    default:
      return "neutral";
  }
}
