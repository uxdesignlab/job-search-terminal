import type {
  DirectionAlignment,
  EvaluationConfidence,
  EvaluationScoreLabel,
  EvidenceMatch,
  FastEvaluationModelOutput,
  FastEvaluationRecommendation,
  FitComponents,
  Gap,
  HardBlocker,
  HardBlockerCandidate,
  HardBlockerKind,
  RequirementMatch,
  RequirementSummary,
} from "../db/types";

/**
 * Deterministic half of Fast Evaluation (PRD v0.2.1 §13–§16, §18.3).
 *
 * Everything here is pure — no database, no provider, no clock. The model
 * proposes component scores and observations; these functions decide the fit
 * total, the recommendation, the confidence and the compatibility label. Two
 * runs over the same model output must produce the same verdict, which is why
 * none of it lives in the prompt.
 */

// ─── Confidence thresholds (§16.1) ─────────────────────────────────────────
// Implementation constants, not product promises — tuned against real postings.

export const EVAL_JD_HIGH_CHARS = 800;
export const EVAL_JD_MIN_USABLE_CHARS = 300;
export const EVAL_EVIDENCE_HIGH_CHARS = 500;
export const EVAL_EVIDENCE_MIN_USABLE_CHARS = 200;

// ─── Fit scoring (§13) ─────────────────────────────────────────────────────

/** Maximum points each component may contribute. The four sum to 100. */
export const FIT_COMPONENT_MAX: FitComponents = {
  coreRequirements: 40,
  roleAndSeniority: 25,
  relevantEvidence: 20,
  userPreferences: 15,
};

const FIT_COMPONENT_KEYS = Object.keys(FIT_COMPONENT_MAX) as Array<keyof FitComponents>;

function clampComponent(value: unknown, max: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(max, Math.round(numeric)));
}

/** Clamp each component into its own range. Out-of-range values are model noise, not a failure. */
export function clampFitComponents(raw: Partial<FitComponents> | undefined): FitComponents {
  return {
    coreRequirements: clampComponent(raw?.coreRequirements, FIT_COMPONENT_MAX.coreRequirements),
    roleAndSeniority: clampComponent(raw?.roleAndSeniority, FIT_COMPONENT_MAX.roleAndSeniority),
    relevantEvidence: clampComponent(raw?.relevantEvidence, FIT_COMPONENT_MAX.relevantEvidence),
    userPreferences: clampComponent(raw?.userPreferences, FIT_COMPONENT_MAX.userPreferences),
  };
}

/**
 * The only place a fit total is produced. A model-supplied total is never
 * accepted — that is what lets the UI and the stored row agree.
 */
export function calculateFitScore(components: FitComponents): number {
  return FIT_COMPONENT_KEYS.reduce((total, key) => total + components[key], 0);
}

// ─── Compatibility label (§13) ─────────────────────────────────────────────

/**
 * Derived for the existing `score_label` column. Deliberately not surfaced as a
 * third headline judgment beside Fit and Recommendation — legacy screens read it.
 */
export function deriveScoreLabel(fitScore: number): EvaluationScoreLabel {
  if (fitScore >= 85) return "Strong fit";
  if (fitScore >= 70) return "Review";
  if (fitScore >= 55) return "Selective";
  return "Weak fit";
}

// ─── Hard blockers (§15) ───────────────────────────────────────────────────

const HARD_BLOCKER_KINDS = new Set<HardBlockerKind>([
  "relocation", "credential", "work_authorization", "onsite_location", "other",
]);

function blockerMessage(candidate: HardBlockerCandidate): string {
  return `${candidate.postingEvidence.trim()} — conflicts with: ${candidate.candidateConstraint.trim()}`;
}

/**
 * A blocker needs explicit evidence on both sides: something the posting states
 * and something the user saved. A candidate missing either half is an inference,
 * and §15 is emphatic that inferences never block — they are dropped silently
 * rather than downgraded into a red flag, which would smuggle the guess back in.
 */
export function validateHardBlockers(candidates: HardBlockerCandidate[]): HardBlocker[] {
  return candidates
    .filter((candidate) =>
      candidate
      && typeof candidate.postingEvidence === "string" && candidate.postingEvidence.trim().length > 0
      && typeof candidate.candidateConstraint === "string" && candidate.candidateConstraint.trim().length > 0
    )
    .map((candidate) => ({
      kind: HARD_BLOCKER_KINDS.has(candidate.kind) ? candidate.kind : "other",
      postingEvidence: candidate.postingEvidence.trim(),
      candidateConstraint: candidate.candidateConstraint.trim(),
      message: blockerMessage(candidate),
    }));
}

// ─── Recommendation (§14.2) ────────────────────────────────────────────────

/**
 * `Blocked` and `Skip` are different answers. Blocked means a saved
 * non-negotiable rules the role out however well the candidate scores; Skip
 * means nothing blocks it but the fit does not justify the effort. Collapsing
 * them would tell a 92%-fit candidate they were unqualified.
 */
export function deriveRecommendation(input: {
  fitScore: number;
  directionAlignment: DirectionAlignment;
  hardBlockers: HardBlocker[];
}): FastEvaluationRecommendation {
  if (input.hardBlockers.length > 0) return "Blocked";
  if (input.fitScore >= 85 && input.directionAlignment === "strong") return "Priority apply";
  if (input.fitScore >= 70 && (input.directionAlignment === "strong" || input.directionAlignment === "partial")) {
    return "Strong apply";
  }
  if (input.fitScore >= 55) return "Review manually";
  return "Skip";
}

// ─── Confidence (§16.2) ────────────────────────────────────────────────────

export type ConfidenceInputs = {
  postingResolved: boolean;
  jdChars: number;
  evidenceChars: number;
  /** Set when the source is too damaged to match requirements reliably. */
  sourceIntegrityWarning?: boolean;
};

/**
 * Confidence describes source quality, never candidate quality. The rules are
 * ordered and end in an unconditional Medium so every input lands in exactly
 * one state — an earlier draft left gaps like "long JD, thin resume" unclassified.
 */
export function deriveConfidence(input: ConfidenceInputs): EvaluationConfidence {
  if (
    !input.postingResolved
    || input.jdChars < EVAL_JD_MIN_USABLE_CHARS
    || input.evidenceChars < EVAL_EVIDENCE_MIN_USABLE_CHARS
  ) {
    return "Low";
  }

  if (
    input.postingResolved
    && input.jdChars >= EVAL_JD_HIGH_CHARS
    && input.evidenceChars >= EVAL_EVIDENCE_HIGH_CHARS
    && !input.sourceIntegrityWarning
  ) {
    return "High";
  }

  return "Medium";
}

// ─── Model-output normalization (§18.3) ────────────────────────────────────

export const MAX_STRENGTHS = 5;
export const MAX_GAPS = 3;
export const MAX_RED_FLAGS = 3;

const DIRECTION_ALIGNMENTS = new Set<DirectionAlignment>(["strong", "partial", "none"]);
const REQUIREMENT_STATUSES = new Set<RequirementMatch["status"]>(["supported", "partial", "unknown"]);
const EVIDENCE_STRENGTHS = new Set<EvidenceMatch["strength"]>(["strong", "moderate", "weak"]);

export type NormalizedModelOutput =
  | { coreValid: true; output: FastEvaluationModelOutput; warnings: string[] }
  | { coreValid: false; missing: string[] };

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeStrengths(value: unknown): EvidenceMatch[] {
  return arr(value)
    .map((raw) => {
      const item = raw as Partial<EvidenceMatch>;
      const claim = str(item?.claim);
      if (!claim) return null;
      return {
        claim,
        evidence: str(item?.evidence),
        strength: EVIDENCE_STRENGTHS.has(item?.strength as EvidenceMatch["strength"])
          ? (item.strength as EvidenceMatch["strength"])
          : "moderate",
      };
    })
    .filter((item): item is EvidenceMatch => item !== null)
    .slice(0, MAX_STRENGTHS);
}

function normalizeGaps(value: unknown): Gap[] {
  return arr(value)
    .map((raw) => {
      const item = raw as Partial<Gap>;
      const requirement = str(item?.requirement);
      if (!requirement) return null;
      return { requirement, detail: str(item?.detail) };
    })
    .filter((item): item is Gap => item !== null)
    .slice(0, MAX_GAPS);
}

function normalizeRequirementMatches(value: unknown): RequirementMatch[] {
  return arr(value)
    .map((raw) => {
      const item = raw as Partial<RequirementMatch>;
      const requirement = str(item?.requirement);
      if (!requirement) return null;
      return {
        requirement,
        status: REQUIREMENT_STATUSES.has(item?.status as RequirementMatch["status"])
          ? (item.status as RequirementMatch["status"])
          : "unknown",
        evidence: str(item?.evidence),
      };
    })
    .filter((item): item is RequirementMatch => item !== null);
}

/**
 * Recount rather than trusting the model's own totals — the summary drives the
 * "8 supported · 2 partial · 1 unknown" line, and a tally that disagrees with
 * the list beneath it is worse than no tally.
 */
function summarizeRequirements(matches: RequirementMatch[]): RequirementSummary {
  return {
    supported: matches.filter((match) => match.status === "supported").length,
    partial: matches.filter((match) => match.status === "partial").length,
    unknown: matches.filter((match) => match.status === "unknown").length,
  };
}

function normalizeHardBlockerCandidates(value: unknown): HardBlockerCandidate[] {
  return arr(value)
    .map((raw) => {
      const item = raw as Partial<HardBlockerCandidate>;
      return {
        kind: HARD_BLOCKER_KINDS.has(item?.kind as HardBlockerKind) ? (item.kind as HardBlockerKind) : "other",
        postingEvidence: str(item?.postingEvidence),
        candidateConstraint: str(item?.candidateConstraint),
      };
    })
    .filter((item) => item.postingEvidence.length > 0 || item.candidateConstraint.length > 0);
}

function normalizeStringList(value: unknown, limit?: number): string[] {
  const list = arr(value).map(str).filter((item) => item.length > 0);
  return typeof limit === "number" ? list.slice(0, limit) : list;
}

/**
 * Split a raw provider response into "usable" and "not usable" (§18.3).
 *
 * Core fields — role, direction alignment and the four components — decide
 * whether an evaluation exists at all. Everything else degrades to an empty
 * value and leaves a completeness warning, so one malformed array no longer
 * costs the user the whole evaluation the way a failed block used to.
 */
export function normalizeModelOutput(raw: unknown): NormalizedModelOutput {
  const input = (raw ?? {}) as Partial<FastEvaluationModelOutput>;
  const missing: string[] = [];

  const roleArchetype = str(input.roleArchetype);
  if (!roleArchetype) missing.push("roleArchetype");

  const directionAlignment = input.directionAlignment as DirectionAlignment;
  if (!DIRECTION_ALIGNMENTS.has(directionAlignment)) missing.push("directionAlignment");

  const rawComponents = input.fitComponents;
  const componentsPresent = rawComponents !== null
    && typeof rawComponents === "object"
    && FIT_COMPONENT_KEYS.every((key) => typeof rawComponents[key] === "number" && Number.isFinite(rawComponents[key]));
  if (!componentsPresent) missing.push("fitComponents");

  if (missing.length > 0) return { coreValid: false, missing };

  const warnings: string[] = [];
  const note = (field: string, reason: string) => warnings.push(`${field}: ${reason}`);

  const seniority = str(input.seniority) || "Unknown";
  if (seniority === "Unknown") note("seniority", "not returned by the model");

  const strengths = normalizeStrengths(input.strengths);
  if (strengths.length === 0) note("strengths", "no usable evidence matches returned");

  const gaps = normalizeGaps(input.gaps);
  const requirementMatches = normalizeRequirementMatches(input.requirementMatches);
  if (requirementMatches.length === 0) note("requirementMatches", "no usable requirements returned");

  const resumeEvidence = normalizeStringList(input.resumeEvidence);
  if (resumeEvidence.length === 0) note("resumeEvidence", "no evidence strings returned");

  const summary = str(input.summary);
  if (!summary) note("summary", "not returned by the model");

  return {
    coreValid: true,
    warnings,
    output: {
      roleArchetype,
      seniority,
      domain: str(input.domain),
      directionAlignment,
      directionAlignmentRationale: str(input.directionAlignmentRationale),
      fitComponents: clampFitComponents(rawComponents),
      strengths,
      gaps,
      redFlags: normalizeStringList(input.redFlags, MAX_RED_FLAGS),
      hardBlockerCandidates: normalizeHardBlockerCandidates(input.hardBlockerCandidates),
      requirementMatches,
      requirementSummary: summarizeRequirements(requirementMatches),
      resumeEvidence,
      resumeBaseRecommendation: str(input.resumeBaseRecommendation),
      postedCompensation: str(input.postedCompensation),
      summary,
    },
  };
}
