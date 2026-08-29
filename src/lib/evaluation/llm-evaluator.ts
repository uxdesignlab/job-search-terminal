import { getActiveProvider } from "../ai/factory";
import {
  withRetry,
  withChainDeadline,
  isMalformedJsonResponse,
  GenerationCancelledError,
  GenerationTimeoutError,
} from "../ai/retry";
import {
  CLOUD_GENERATION_TIMEOUT_MS,
  STRUCTURED_OUTPUT_MAX_TOKENS,
  generationDeadlineMs,
  totalGenerationDeadlineMs,
} from "../ai/deadlines";
import type { AIMessage, AIProvider } from "../ai/provider";
import { getJobById, getRoleDirections, getResumes, getSkills, getUserProfile, saveJobEvaluation } from "../db/queries";
import type {
  EvaluationSections,
  FastEvaluationModelOutput,
  JobEvaluationResultInput,
  JobRecord,
  ResumeRecord,
  UserProfileRecord,
} from "../db/types";
import {
  EVALUATION_PHASES,
  EVALUATION_PHASE_LABELS,
  LOCAL_FALLBACK_LABEL,
  type EvaluationFailurePhase,
  type EvaluationPhase,
} from "./evaluation-phases";
import { coerceResumeBaseToLane } from "./resume-lane-picker";
import { UNASSESSED_LEGITIMACY } from "./legitimacy";
import { buildJobContext, buildSystemPrompt, type ResumeExcerpt } from "./prompts";
import {
  calculateFitScore,
  deriveConfidence,
  deriveRecommendation,
  deriveScoreLabel,
  normalizeModelOutput,
  validateHardBlockers,
} from "./fast-evaluation";

/**
 * Fast Evaluation (PRD v0.2.1 §11–§20).
 *
 * One structured generation answers "should I spend more time on this?".
 * Everything the user has not reached yet — ATS keywords, compensation
 * research, interview stories — belongs to a later stage and is not run here.
 */

// ─── Progress phases (§18.2) ───────────────────────────────────────────────

export class EvaluationPhaseError extends Error {
  constructor(readonly failedPhase: EvaluationFailurePhase, message: string, readonly cause?: unknown) {
    super(message);
    this.name = "EvaluationPhaseError";
  }
}

export type PhaseUpdate = {
  phase: EvaluationPhase;
  message: string;
  /** Set once a provider is chosen, so the client can name what it is waiting on. */
  providerUsed?: string;
  modelUsed?: string;
  /** Why the run moved on from the previous provider, when it did. */
  note?: string;
};

export type PhaseCallback = (update: PhaseUpdate) => void;

/**
 * Upper bound on the one generation an evaluation gets. Above the OpenAI
 * client's own 120s so a legitimately slow cloud call is not preempted, but
 * finite, so an unbounded local model degrades to rules instead of hanging.
 */
/** Kept as the module's own name for the cloud budget; the policy lives in `ai/deadlines`. */
export const EVALUATION_GENERATION_TIMEOUT_MS = CLOUD_GENERATION_TIMEOUT_MS;

/** The whole run's budget: each provider in the chain gets its own, in turn. */
function runDeadlineMs(provider: AIProvider): number {
  const names = (provider as { providerNames?: string[] }).providerNames ?? [provider.name];
  return totalGenerationDeadlineMs(names);
}

// ─── Prompt ────────────────────────────────────────────────────────────────

const FAST_EVALUATION_SHAPE = `{
  "roleArchetype": "string",
  "seniority": "string",
  "domain": "string",
  "directionAlignment": "strong | partial | none",
  "directionAlignmentRationale": "string",
  "fitComponents": {
    "coreRequirements": 0,
    "roleAndSeniority": 0,
    "relevantEvidence": 0,
    "userPreferences": 0
  },
  "strengths": [{ "claim": "string", "evidence": "string", "strength": "strong | moderate | weak" }],
  "gaps": [{ "requirement": "string", "detail": "string" }],
  "redFlags": ["string"],
  "hardBlockerCandidates": [{ "kind": "relocation | credential | work_authorization | onsite_location | other", "postingEvidence": "string", "candidateConstraint": "string" }],
  "requirementMatches": [{ "requirement": "string", "status": "supported | partial | unknown", "evidence": "string" }],
  "resumeEvidence": ["string"],
  "resumeBaseRecommendation": "string",
  "postedCompensation": "string",
  "summary": "string"
}`;

function buildFastEvaluationPrompt(jobCtx: string, resumeLanes: string[]): string {
  return `${jobCtx}

Decide whether this candidate should spend more time on this position. Return one JSON object matching this shape exactly:

${FAST_EVALUATION_SHAPE}

Scoring — return component scores only. Do NOT return a total; it is calculated from your components.
- "coreRequirements" (0-40): how well demonstrated evidence covers the role's stated must-haves.
- "roleAndSeniority" (0-25): match of function and level.
- "relevantEvidence" (0-20): depth of directly relevant, evidenced experience.
- "userPreferences" (0-15): fit against the candidate's stated preferences and direction.

"directionAlignment" answers whether the role matches the direction this candidate is
searching in — not whether they could do the job. Use the target roles, role strategy and
career direction in the profile. A capable match in the wrong direction is "none".

"hardBlockerCandidates" require explicit evidence on BOTH sides: something the posting
actually states, and a constraint or deal breaker the candidate actually saved. Missing
salary, unknown reporting line, an absent preferred qualification, or an inferred culture
mismatch are NOT blockers — leave the array empty rather than guessing. Anything you are
inferring belongs in "redFlags".

"requirementMatches": the role's real requirements, each marked supported, partial or
unknown against the evidence base. Use "unknown" when the resume is silent — never treat
silence as a mismatch.

"strengths": at most 5, each grounded in the resume evidence provided. "gaps": at most 3.
"redFlags": at most 3 non-blocking concerns.

"resumeBaseRecommendation": choose one of these lanes — ${resumeLanes.join(", ") || "not configured"}.
"postedCompensation": copy any compensation the posting states, verbatim. Empty string if
it states none. Do not estimate, and do not research.

Ground every claim in the candidate profile and resume evidence. Never invent experience.`;
}

async function runFastEvaluation(
  provider: AIProvider,
  systemPrompt: string,
  userPrompt: string
): Promise<unknown> {
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  return provider.generateJSON<unknown>(messages, FAST_EVALUATION_SHAPE, {
    maxTokens: STRUCTURED_OUTPUT_MAX_TOKENS,
  });
}

// ─── Resume excerpts ───────────────────────────────────────────────────────

const MAX_EXCERPT_CHARS_PER_RESUME = 1800;
const RESUME_EXCERPT_BUDGET_CHARS = 5400;

/**
 * Every active lane, trimmed to fit — never the first two by array position.
 *
 * Dropping lanes by position broke the multi-lane model from both ends: the
 * model is offered *all* active lane names to recommend from, so it could pick a
 * lane whose text it never saw, and confidence is derived from the character
 * count of *all* active lanes, so a run that read two of three still reported
 * itself well-evidenced. Evidence unique to the third lane simply did not exist
 * as far as the evaluation was concerned.
 *
 * A budget shared across the lanes keeps the prompt bounded instead. One, two and
 * three lanes are unaffected; beyond that each gets a smaller slice, and the
 * combined excerpts never exceed the budget however many lanes exist.
 */
export function buildResumeExcerpts(resumes: { name: string; extractedText: string; activeStatus: boolean }[]): ResumeExcerpt[] {
  const active = resumes.filter((r) => r.activeStatus && r.extractedText && r.extractedText.length > 100);
  if (active.length === 0) return [];

  // Divided, never floored: a per-lane minimum that survives division stops being
  // a budget. Lane creation has no ceiling, so eight lanes at a 700-character
  // floor already exceeded the total and it grew from there — into provider cost
  // for a cloud model and past the context window for a local one.
  const perResume = Math.min(
    MAX_EXCERPT_CHARS_PER_RESUME,
    Math.max(1, Math.floor(RESUME_EXCERPT_BUDGET_CHARS / active.length))
  );

  return active.map((r) => ({ name: r.name, excerpt: r.extractedText.slice(0, perResume) }));
}

/** Fast-v2 generates no A–G prose. Written as a complete shape because readers expect the keys. */
function emptySections(): EvaluationSections {
  return {
    roleSummary: [],
    matchWithResume: [],
    levelStrategy: [],
    compensationDemand: [],
    tailoringPlan: [],
    interviewPlan: [],
    postingLegitimacy: [],
  };
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

export async function evaluateJobWithAI(
  jobId: string,
  onPhase?: PhaseCallback,
  signal?: AbortSignal
): Promise<JobEvaluationResultInput> {
  const start = Date.now();

  onPhase?.({ phase: "preparing", message: EVALUATION_PHASE_LABELS.preparing });

  let job = getJobById(jobId);
  if (!job) throw new EvaluationPhaseError("input", `Job not found: ${jobId}`);

  // Auto-fetch the JD for scanned jobs that arrived as metadata only. Confidence
  // is calculated from what we end up with, so this runs before, not after.
  if (!job.rawDescription && job.url) {
    const { fetchJobDescription } = await import("../scanner/jd-fetcher");
    const { saveJobDescription } = await import("../db/queries");
    const desc = await fetchJobDescription(job);
    if (desc) {
      saveJobDescription(jobId, desc);
      job = { ...job, rawDescription: desc, parsedDescription: desc };
    }
  }

  const profile = getUserProfile();
  const skills = getSkills();
  const roleDirections = getRoleDirections();
  const resumes = getResumes();

  const resumeExcerpts = buildResumeExcerpts(resumes);
  const systemPrompt = buildSystemPrompt(profile, skills, roleDirections, resumeExcerpts);
  const userPrompt = buildFastEvaluationPrompt(
    buildJobContext(job),
    resumes.filter((resume) => resume.activeStatus).map((resume) => resume.name)
  );

  const provider = getActiveProvider();

  // Resolve an auto setting before naming it: a single provider has no chain to
  // announce the concrete id later, so this is the only chance to report a model
  // rather than a policy.
  await provider.prepare?.().catch(() => undefined);

  onPhase?.({
    phase: "evaluating",
    message: EVALUATION_PHASE_LABELS.evaluating,
    providerUsed: provider.name,
    modelUsed: provider.effectiveModel,
  });

  const deadlineMs = runDeadlineMs(provider);
  // Read after the call, never before: in a chain, the provider that answers is
  // usually not the one the run started on, and naming the wrong one is how the
  // modal ended up crediting a local model for a cloud model's work.
  const ranOn = () => `${provider.name} / ${provider.effectiveModel}`;

  // A chain announces each hand-over, so the modal can stop claiming a provider
  // that has already failed and say why it moved on.
  const chain = provider as {
    observe?: (listener: (attempt: { provider: string; model: string; after: { provider: string; model: string; error: string } | null }) => void) => void;
    abortOn?: (signal: AbortSignal) => void;
  };
  // Cancelling has to reach the chain, not just the deadline wrapped around it,
  // or a cancelled run keeps walking down to the paid providers behind the one
  // that was still going. `withChainDeadline` below owns that wiring, and extends
  // it to the deadline lapsing — which left the chain walking on to a paid provider
  // after the run had already been reported as failed.
  chain.observe?.((attempt) => {
    onPhase?.({
      phase: "evaluating",
      message: EVALUATION_PHASE_LABELS.evaluating,
      providerUsed: attempt.provider,
      modelUsed: attempt.model,
      note: attempt.after ? `${attempt.after.provider} (${attempt.after.model}) — ${attempt.after.error}` : undefined,
    });
  });

  let normalized: ReturnType<typeof normalizeModelOutput> | null = null;
  try {
    const raw = await withChainDeadline(
      chain,
      () => withRetry(() => runFastEvaluation(provider, systemPrompt, userPrompt), 3, 1500, signal),
      deadlineMs,
      signal
    );
    normalized = normalizeModelOutput(raw);
  } catch (error) {
    // Cancelling is not a failure: the user stopped waiting, and the only thing
    // that must not happen is a result arriving later and being saved anyway.
    if (error instanceof GenerationCancelledError) throw error;
    // Every failure here surfaces as itself. Scoring the job by keyword rules
    // instead produced a plausible-looking evaluation that was simply wrong — a
    // Senior Director role scored 64% "Technical Specialist" — and it was saved,
    // badged and counted like a real one. A wrong answer presented as an answer
    // costs more than no answer, and the user can act on this one: retry, or
    // pick a different model.
    if (error instanceof GenerationTimeoutError) {
      throw new EvaluationPhaseError(
        "provider",
        `${ranOn()} did not finish within ${Math.round(generationDeadlineMs(provider.name) / 1000)}s. ` +
          (provider.name === "ollama"
            ? "A smaller or faster local model, or a shorter job description, will fit the budget — or move a cloud provider first in Settings → AI Provider."
            : "Retry, or pick a different model in Settings → AI Provider."),
        error
      );
    }
    if (isMalformedJsonResponse(error)) {
      throw new EvaluationPhaseError(
        "parse",
        `${ranOn()} returned a response that could not be read as JSON, after 3 attempts. ` +
          "A larger model (14B+ locally) is more reliable at structured output.",
        error
      );
    }
    // Auth, quota and network problems are the user's to act on.
    throw new EvaluationPhaseError("provider", error instanceof Error ? error.message : String(error), error);
  }

  onPhase?.({ phase: "validating", message: EVALUATION_PHASE_LABELS.validating });

  /**
   * §18.4. Core fields decide whether an AI evaluation exists at all: without a
   * role and component scores there is nothing to score, and inventing one is
   * worse than admitting the model failed. Optional fields degrade instead, so a
   * single malformed array no longer costs the whole evaluation the way a failed
   * block used to.
   */
  if (!normalized || !normalized.coreValid) {
    const missing = normalized && !normalized.coreValid ? normalized.missing.join(", ") : "unparseable response";
    throw new EvaluationPhaseError(
      "validate",
      `${ranOn()} answered, but the answer was missing what an evaluation is made of (${missing}). ` +
        "Retry, or pick a different model in Settings → AI Provider."
    );
  }

  return buildFastEvaluationResult({
    job,
    output: normalized.output,
    warnings: normalized.warnings,
    profile,
    resumes,
    providerUsed: provider.name,
    modelUsed: provider.effectiveModel,
    generationMs: Date.now() - start,
  });
}

/**
 * Turn a validated model output into the stored record: derive everything the
 * model was not allowed to decide, then fill the compatibility columns the
 * existing `evaluations` and `jobs` rows still require (§20.1, §20.4).
 */
function buildFastEvaluationResult(input: {
  job: JobRecord;
  output: FastEvaluationModelOutput;
  warnings: string[];
  profile: UserProfileRecord;
  resumes: ResumeRecord[];
  providerUsed: string;
  modelUsed: string;
  generationMs: number;
}): JobEvaluationResultInput {
  const { job, output } = input;

  const fitScore = calculateFitScore(output.fitComponents);
  // Both halves are checked against their sources: a blocker becomes `Blocked`
  // with nothing downstream to question it, so an invented pair would rule out a
  // high-fit role on nothing.
  const hardBlockers = validateHardBlockers(output.hardBlockerCandidates, {
    // Every field buildJobContext puts in front of the model, not just the
    // description. An imported job often states "On-site" in its location and
    // remote-type fields and never repeats it in the body — the model reads that
    // correctly, and checking the description alone threw the conflict away as
    // unverifiable.
    postingText: [
      job.title,
      job.company,
      job.location,
      job.remoteType,
      job.rawDescription || job.parsedDescription || "",
    ].filter(Boolean).join("\n"),
    savedConstraints: [...input.profile.constraints, ...input.profile.dealBreakers],
  });
  const recommendation = deriveRecommendation({
    fitScore,
    directionAlignment: output.directionAlignment,
    hardBlockers,
  });

  const jdText = (job.rawDescription || job.parsedDescription || "").trim();
  const evidenceText = input.resumes
    .filter((resume) => resume.activeStatus)
    .map((resume) => resume.extractedText ?? "")
    .join(" ")
    .trim();

  const confidence = deriveConfidence({
    postingResolved: jdText.length > 0,
    jdChars: jdText.length,
    evidenceChars: evidenceText.length,
  });

  // Compatibility projections. The structured forms stay on model_output_json;
  // these are the flattened strings the existing screens already render.
  const strengthStrings = output.strengths.map((item) =>
    item.evidence ? `${item.claim} — ${item.evidence}` : item.claim
  );
  const gapStrings = output.gaps.map((item) => (item.detail ? `${item.requirement}: ${item.detail}` : item.requirement));
  const blockerStrings = hardBlockers.map((blocker) => blocker.message);
  const requirementMatchStrings = output.requirementMatches.map(
    (match) => `${match.requirement} — ${match.status}${match.evidence ? ` (${match.evidence})` : ""}`
  );

  const summary = output.summary
    || `${output.roleArchetype} · ${output.seniority} · ${fitScore}% fit · ${recommendation}`;

  return {
    id: `evaluation-${job.id}`,
    jobId: job.id,
    fitScore,
    scoreLabel: deriveScoreLabel(fitScore),
    roleArchetype: output.roleArchetype,
    summary,
    strengths: strengthStrings,
    gaps: gapStrings,
    // Validated blockers lead: they are the reason a recommendation reads Blocked,
    // so a screen showing only red flags would omit the cause.
    redFlags: Array.from(new Set([...blockerStrings, ...output.redFlags])),
    recommendation,
    resumeBaseRecommendation: output.resumeBaseRecommendation,
    requirementMatch: requirementMatchStrings,
    resumeEvidence: output.resumeEvidence,
    sections: emptySections(),
    legitimacyLabel: UNASSESSED_LEGITIMACY,
    // Detailed keyword work belongs to Application Preparation (§24). Empty here
    // is deliberate — saveJobEvaluation() reads it to decide whether to leave the
    // job's existing taxonomy links and legacy keyword fallback intact.
    keywords: [],
    keywordSignals: [],
    userCorrection: {},
    providerUsed: input.providerUsed,
    modelUsed: input.modelUsed,
    tokensUsed: 0,
    generationMs: input.generationMs,
    evaluationVersion: "fast-v2",
    seniority: output.seniority,
    domain: output.domain,
    directionAlignment: output.directionAlignment,
    confidenceLabel: confidence,
    fitComponents: output.fitComponents,
    hardBlockers,
    requirementsSummary: output.requirementSummary,
    jdHash: "",
    modelOutput: output,
    completenessWarnings: input.warnings,
    whyItMatches: strengthStrings.slice(0, 3).join("; ") || "Pending review.",
    mainConcern: blockerStrings[0] ?? output.redFlags[0] ?? gapStrings[0] ?? "No major concern identified.",
    salaryNotes: output.postedCompensation || "Not provided",
  };
}

export async function runAndSaveJobWithAI(
  jobId: string,
  onPhase?: PhaseCallback,
  signal?: AbortSignal
): Promise<JobEvaluationResultInput> {
  const result = await evaluateJobWithAI(jobId, onPhase, signal);

  // A run that finished after the user walked away must not overwrite what they
  // are looking at. The generation is unstoppable once sent; the save is not.
  if (signal?.aborted) throw new GenerationCancelledError();

  onPhase?.({ phase: "saving", message: EVALUATION_PHASE_LABELS.saving });
  try {
    saveJobEvaluation(result);
  } catch (error) {
    throw new EvaluationPhaseError("save", error instanceof Error ? error.message : String(error), error);
  }

  const resumeNames = getResumes().map((r) => r.name);
  return {
    ...result,
    resumeBaseRecommendation: coerceResumeBaseToLane(
      result.resumeBaseRecommendation,
      result.roleArchetype,
      resumeNames
    ),
  };
}

export { EVALUATION_PHASES, EVALUATION_PHASE_LABELS, LOCAL_FALLBACK_LABEL };
export type { EvaluationFailurePhase, EvaluationPhase };
