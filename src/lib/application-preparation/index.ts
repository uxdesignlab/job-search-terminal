import { getActiveProvider } from "../ai/factory";
import { STRUCTURED_OUTPUT_MAX_TOKENS } from "../ai/deadlines";
import { withRetry, withDeadline, GenerationTimeoutError } from "../ai/retry";
import type { AIMessage } from "../ai/provider";
import {
  getApplicationPreparation,
  getEvaluationByJobId,
  getJobById,
  getProfileSupplements,
  getResumes,
  getRoleDirections,
  getSkills,
  getUserProfile,
  saveApplicationPreparation,
} from "../db/queries";
import type {
  ApplicationPreparationInput,
  ApplicationPreparationRecord,
  ApplicationRequirement,
  EvidenceMapEntry,
  JobKeywordSignal,
} from "../db/types";
import { buildJobContext, buildSystemPrompt } from "../evaluation/prompts";
import { normalizeKeywordSignals } from "../evaluation/keyword-signals";
import { GAP_EVIDENCE_TAG } from "../gaps/evidence-id";
import { computeEvidenceHash, computeJdHash, stalenessReason } from "./hashing";
import { parsePostedCompensation, researchMarketCompensation, suggestCompensationResponse } from "./compensation";

export { computeEvidenceHash, computeJdHash, stalenessReason } from "./hashing";
export type { StalenessReason } from "./hashing";

/**
 * Application Preparation (PRD v0.2.1 §22–§30).
 *
 * The work Fast Evaluation deliberately skips, run when the user asks for a
 * resume: detailed requirements, ATS keywords, evidence mapping and compensation
 * context. One structured generation plus at most one live compensation lookup.
 */

/** Raised when a caller reaches this stage without an evaluation (§2.4, §22). */
export class EvaluationRequiredError extends Error {
  constructor(readonly jobId: string) {
    super("Evaluate this position before preparing the application.");
    this.name = "EvaluationRequiredError";
  }
}

/** Same ceiling as evaluation: not every provider bounds itself. */
export const PREPARATION_GENERATION_TIMEOUT_MS = 150_000;

const PREPARATION_SHAPE = `{
  "requirements": [{ "text": "string", "type": "must_have | preferred | responsibility | tool | method | credential | domain", "evidenceStatus": "supported | partial | unknown", "evidenceIds": ["string"] }],
  "keywordSignals": [{ "keyword": "string", "priority": "critical | required | preferred", "category": "title | technical | soft | domain | tool | methodology | credential", "source": "job_title | basic_qualification | required_qualification | preferred_qualification | responsibility | description", "rationale": "string" }],
  "evidenceMap": [{ "requirement": "string", "evidence": "string", "evidenceId": "string", "source": "string", "suggestedPlacement": "string" }],
  "suggestedCompensationResponse": "string"
}`;

type EvidenceItem = { id: string; text: string; source: string };

/**
 * The claims a resume may actually make.
 *
 * Note the asymmetry with the evidence *hash*, which spans every gap answer
 * regardless of quality so that finishing one invalidates stale preparations.
 * This list is narrower: only answers graded good enough to support a claim.
 * Hash broadly, use claims narrowly (§26.2).
 */
function usableEvidence(): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  for (const resume of getResumes().filter((resume) => resume.activeStatus)) {
    if (resume.extractedText) items.push({ id: `resume-${resume.id}`, text: resume.extractedText, source: `${resume.name} resume` });
  }
  for (const skill of getSkills()) {
    items.push({ id: `skill-${skill.skillName}`, text: `${skill.skillName} — ${skill.evidenceSource}`, source: "Skill inventory" });
  }
  for (const supplement of getProfileSupplements()) {
    if (supplement.qualityStatus !== "addressed") continue;
    items.push({
      id: supplement.id,
      text: supplement.content,
      source: supplement.tags.includes(GAP_EVIDENCE_TAG) ? "Gap evidence bank" : "Profile supplement",
    });
  }
  return items;
}

function buildPreparationPrompt(jobCtx: string, evidence: EvidenceItem[]): string {
  const evidenceBlock = evidence
    .slice(0, 40)
    .map((item) => `[${item.id}] (${item.source}) ${item.text.slice(0, 600)}`)
    .join("\n");

  return `${jobCtx}

## Candidate evidence base
Every evidenceId you cite must be one of these ids. Do not invent ids.

${evidenceBlock || "No evidence recorded."}

Prepare this application. Return one JSON object matching this shape exactly:

${PREPARATION_SHAPE}

"requirements": the posting's real requirements, staying close to its own wording.
Do not turn every sentence into a requirement. Mark evidenceStatus "unknown" when the
evidence base is silent — silence is not a mismatch. Cite supporting ids in evidenceIds.

"keywordSignals": 12-18 high-signal phrases that appear verbatim in the posting.
Prefer precision over filling a quota. Capture the exact title once; keep title
variants only if they also appear in the posting. Extract named tools, platforms,
certifications and frameworks exactly as written. Exclude employer marketing copy and
generic traits ("team player", "fast-paced environment").
  - critical: the exact title, and explicit Basic/Required/Must-have qualifications
  - required: core responsibilities and repeated job-specific competencies
  - preferred: Nice-to-have qualifications and useful one-off context

"evidenceMap": for each high-value requirement, which evidence supports it and where it
belongs on the resume. Only map evidence that genuinely supports the claim — an unsupported
mapping becomes a false statement on a document the candidate sends to an employer, and on
messages sent to real people at that employer.
The "evidence" field must be copied **verbatim** from the evidence item you cite in
"evidenceId" — a span of its text, not a summary, paraphrase or improvement of it. A
mapping whose evidence cannot be found in the item it cites is discarded.

"suggestedCompensationResponse": leave as an empty string. Compensation is resolved
separately from the posting and live research, never from your own recollection.`;
}

function normalizeRequirements(raw: unknown): ApplicationRequirement[] {
  const types = new Set(["must_have", "preferred", "responsibility", "tool", "method", "credential", "domain"]);
  const statuses = new Set(["supported", "partial", "unknown"]);
  return (Array.isArray(raw) ? raw : [])
    .map((item) => {
      const value = item as Partial<ApplicationRequirement>;
      const text = typeof value?.text === "string" ? value.text.trim() : "";
      if (!text) return null;
      return {
        text,
        type: (types.has(value?.type as string) ? value!.type : "responsibility") as ApplicationRequirement["type"],
        evidenceStatus: (statuses.has(value?.evidenceStatus as string) ? value!.evidenceStatus : "unknown") as ApplicationRequirement["evidenceStatus"],
        evidenceIds: Array.isArray(value?.evidenceIds) ? value!.evidenceIds!.filter((id): id is string => typeof id === "string") : [],
      };
    })
    .filter((item): item is ApplicationRequirement => item !== null);
}

/**
 * Unicode letters and numbers, not `a-z0-9`.
 *
 * An ASCII-only class deletes every character of evidence written in Cyrillic,
 * Chinese, Arabic or any other non-Latin script. Both sides then normalise to the
 * empty string, `"".includes("")` is true, and the containment check below turns
 * into an accept-anything — the exact opposite of its purpose, for precisely the
 * users whose evidence it would be quietly failing to read.
 */
function normalizeForGrounding(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}%+]+/gu, " ").trim();
}

/**
 * `validIds` proves the pointer resolves; `evidenceById` proves the text attached
 * to it is the candidate's, not the model's.
 *
 * Requiring only a real id left the claim itself unchecked, so an invented line —
 * "grew revenue 40%" — could be filed under a real resume id and read as sourced.
 * person-outreach copies this field into a message to a real person at the
 * employer, which is the furthest an unsupported claim travels anywhere in the
 * app. The evidence has to be a span of the item it cites, so the check is
 * containment rather than resemblance: a paraphrase is the model's sentence, and
 * the point of the evidence bank is that these sentences are not.
 */
export function normalizeEvidenceMap(
  raw: unknown,
  validIds: Set<string>,
  evidenceById: Map<string, string> = new Map()
): EvidenceMapEntry[] {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => {
      const value = item as Partial<EvidenceMapEntry>;
      const requirement = typeof value?.requirement === "string" ? value.requirement.trim() : "";
      const evidence = typeof value?.evidence === "string" ? value.evidence.trim() : "";
      if (!requirement || !evidence) return null;
      const evidenceId = typeof value?.evidenceId === "string" ? value.evidenceId.trim() : "";
      // Drop mappings that cite an id we never supplied: an unverifiable pointer
      // is how an unsupported claim reaches a resume looking sourced. A mapping
      // with *no* id is the same claim with the pointer left off — the check used
      // to skip those entirely, and person-outreach lists them to a real human as
      // the candidate's evidence.
      if (!evidenceId || !validIds.has(evidenceId)) return null;
      // Only enforced when the caller supplied the texts; a caller that cannot
      // resolve ids still gets the id check above.
      const cited = evidenceById.get(evidenceId);
      if (cited !== undefined) {
        const citedText = normalizeForGrounding(cited);
        const claimText = normalizeForGrounding(evidence);
        // Nothing to compare is not a match. Either side reducing to nothing means
        // the check cannot be performed, and an unperformed check must not pass.
        if (!citedText || !claimText || !citedText.includes(claimText)) return null;
      }
      return {
        requirement,
        evidence,
        evidenceId,
        source: typeof value?.source === "string" ? value.source : "",
        suggestedPlacement: typeof value?.suggestedPlacement === "string" ? value.suggestedPlacement : "",
      };
    })
    .filter((item): item is EvidenceMapEntry => item !== null);
}

export type PreparationResult = {
  preparation: ApplicationPreparationRecord;
  reused: boolean;
};

/**
 * Prepare, or reuse a still-valid preparation.
 *
 * Reuse requires both hashes to match (§30). Editing a generated draft must not
 * pay for this again, but answering a gap anywhere in the global bank must
 * invalidate it.
 */
export async function prepareApplication(jobId: string, options: { force?: boolean } = {}): Promise<PreparationResult> {
  const job = getJobById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const evaluation = getEvaluationByJobId(jobId);
  if (!evaluation) throw new EvaluationRequiredError(jobId);

  // Built before the reuse check, not after, because it *is* part of the reuse
  // key: the prompt carries the profile and role strategy the preparation was
  // written under, and reusing across a change to either serves answers for a
  // candidate the user no longer describes.
  const profile = getUserProfile();
  const skills = getSkills();
  const systemPrompt = buildSystemPrompt(profile, skills, getRoleDirections());

  const current = {
    jdHash: computeJdHash(job),
    evidenceHash: computeEvidenceHash({
      resumes: getResumes(),
      skills,
      supplements: getProfileSupplements(),
      promptContext: systemPrompt,
    }),
  };

  const existing = getApplicationPreparation(jobId);
  if (!options.force && existing && stalenessReason(existing, current) === null) {
    return { preparation: existing, reused: true };
  }

  const startedAt = Date.now();
  const evidence = usableEvidence();
  const validIds = new Set(evidence.map((item) => item.id));

  const provider = getActiveProvider();
  // Keyword extraction needs a fuller view of the posting than evaluation did, to
  // find verbatim phrases and validate them against the body.
  const userPrompt = buildPreparationPrompt(buildJobContext(job, 12000), evidence);

  let requirements: ApplicationRequirement[] = [];
  let keywordSignals: JobKeywordSignal[] = [];
  let evidenceMap: EvidenceMapEntry[] = [];

  try {
    const raw = await withDeadline(
      () => withRetry(() => provider.generateJSON<Record<string, unknown>>(
        [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] as AIMessage[],
        PREPARATION_SHAPE,
        { maxTokens: STRUCTURED_OUTPUT_MAX_TOKENS }
      )),
      PREPARATION_GENERATION_TIMEOUT_MS
    );

    requirements = normalizeRequirements(raw?.requirements);
    // Reuse evaluation's validator: it rejects phrases absent from the posting,
    // invented title variants, duplicates and known low-signal wording.
    keywordSignals = normalizeKeywordSignals(Array.isArray(raw?.keywordSignals) ? raw.keywordSignals : [], {
      title: job.title,
      description: job.rawDescription || job.parsedDescription || "",
    });
    evidenceMap = normalizeEvidenceMap(
      raw?.evidenceMap,
      validIds,
      new Map(evidence.map((item) => [item.id, item.text]))
    );
  } catch (error) {
    if (error instanceof GenerationTimeoutError) {
      throw new Error(`Application preparation ${error.message} Try again, or switch provider in Settings.`);
    }
    throw error;
  }

  // At most one live lookup, and only when the posting states nothing (§28).
  const posted = parsePostedCompensation(job);
  const research = posted
    ? { market: null, sources: [], status: "not_run" as const, provider: "", query: "" }
    : await researchMarketCompensation(job);

  const input: ApplicationPreparationInput = {
    id: `preparation-${jobId}`,
    jobId,
    evaluationId: evaluation.id,
    status: "ready",
    jdHash: current.jdHash,
    evidenceHash: current.evidenceHash,
    requirements,
    keywordSignals,
    evidenceMap,
    postedCompensation: posted,
    marketCompensation: research.market,
    compensationSources: research.sources,
    compensationResearchStatus: research.status,
    suggestedCompensationResponse: suggestCompensationResponse({
      posted,
      research,
      savedTarget: profile.compensationNeeds ?? "",
    }),
    providerUsed: provider.name,
    modelUsed: provider.effectiveModel,
    researchProvider: research.provider,
    generationMs: Date.now() - startedAt,
  };

  saveApplicationPreparation(input);
  const saved = getApplicationPreparation(jobId);
  if (!saved) throw new Error(`Application preparation could not be saved for job: ${jobId}`);
  return { preparation: saved, reused: false };
}
