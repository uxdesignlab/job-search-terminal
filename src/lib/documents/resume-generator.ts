import { readFileSync } from "node:fs";
import path from "node:path";
import { getAISettings, getApplicationPreparation, getEvaluationByJobId, getGeneratedDocumentById, getJobById, getJobGapResponses, getProfileSupplements, getResumeBuilderVersion, getResumes, getSkills, getUserProfile, saveGeneratedDocument, updateDocumentDraft, updateDocumentPdf,
  getEffectiveKeywordSignals
} from "../db/queries";
import type { EvaluationRecord, GeneratedDocumentInput, GenerationStageTiming, JobKeywordSignal, JobRecord, ResumeBuilderSection, ResumeBuilderVersionRecord, ResumeRecord, ResumeSectionMode, ResumeSectionModeInput, SkillRecord, UserProfileRecord } from "../db/types";
import { EvaluationRequiredError, prepareApplication } from "../application-preparation";
import { exhaustedProviders, orderForCredits, resolveWritingCandidates } from "../ai/factory";
import { GenerationCancelledError } from "../ai/retry";
import { aiErrorMessage } from "../ai/error-response";
import { renderHtmlToPdf } from "./pdf-renderer";
import { renderResumeHtml, type ResumeTemplateInput } from "./resume-template";
import {
  applyUnitResults,
  planKeywordPlacements,
  runUnits,
  summaryContextFor,
  unitKey,
  unitsForDraft,
  writeUnit,
  type ResumeUnit,
  type UnitFailure,
  type UnitInput,
  type UnitResult,
  type UnitSuccess,
  type UnitWriterContext,
} from "./resume-unit-writer";
import { checkResume } from "./resume-lint";
import { keywordCoverageFor, keywordStrengthDetailsForText, isKeywordInText } from "./keyword-coverage";
import { auditDraftAgainstEvidence, evidenceTextForDraft, revertUnsupportedMetrics, type EvidenceAudit, type EvidenceAuditIssue } from "./evidence-audit";
import { describeRestores, restoreLostKeywords, type KeywordRestore } from "./keyword-preservation";
import { analyzeTailoringEffect, describeUnchanged } from "./tailoring-effect";

export { keywordCoverageFor, missingKeywordsFor } from "./keyword-coverage";

export type GeneratedResumeResult = GeneratedDocumentInput & {
  pageCount: number;
  sizeBytes: number;
};

export class UnsupportedResumeClaimsError extends Error {
  readonly issues: EvidenceAuditIssue[];

  constructor(issues: EvidenceAuditIssue[]) {
    super("Review unsupported claims before exporting this PDF.");
    this.name = "UnsupportedResumeClaimsError";
    this.issues = issues;
  }
}

export type ResumeGenerationStage = GenerationStageTiming["stage"];

/**
 * One step of a generation, reported as it happens.
 *
 * A resume used to be a single blocking request behind a spinner that promised
 * "15–30 seconds" while a local model spent five minutes on it. Nothing here can
 * report a percentage honestly — each stage is one long call — so what it reports is
 * which stage is running, on which model, and how long it has taken.
 */
export type ResumeStageUpdate = {
  stage: ResumeGenerationStage;
  status: "started" | "done";
  provider?: string;
  model?: string;
  /** "reused" when a still-valid preparation was served instead of generated. */
  detail?: string;
  /** Something the user should know about how this stage ran, e.g. a credits fallback. */
  notice?: string;
  elapsedMs: number;
};

export type BuildDraftOptions = {
  resumeId?: string | null;
  sectionModes?: ResumeSectionModeInput[];
  onStage?: (update: ResumeStageUpdate) => void;
  /** The user stopped waiting. Nothing is saved once it fires. */
  signal?: AbortSignal;
};

export type TailoredDraftBuild = {
  job: JobRecord;
  profile: UserProfileRecord;
  baseResume: ResumeRecord;
  draft: ResumeTemplateInput;
  keywordCoverage: number;
  /** Coverage of the approved lane before any AI ran — the fair baseline for `keywordCoverage`. */
  sourceKeywordCoverage: number;
  tailoringPlan: string[];
  tailoringStatus: string;
  evidenceAudit: EvidenceAudit;
  fallbackReason: string;
  /** Credits fallbacks and similar, joined for display. Empty when there is nothing to say. */
  notice: string;
  generationMs: number;
  providerUsed: string;
  modelUsed: string;
  stages: GenerationStageTiming[];
};

type PreparationOutcome = {
  /** Why preparation could not run; empty when it ran or was reused. */
  fallback: string;
  reused: boolean;
  notice: string;
  provider: string;
  model: string;
};

/**
 * Run Application Preparation, treating failure as a degraded state rather than
 * a blocked one. Returns the reason when it could not run, so callers can
 * surface it the way AI-tailoring fallbacks already are.
 *
 * Cancellation is not a failure and is not degraded: it propagates, so a run the user
 * stopped goes no further.
 */
async function prepareApplicationOrDegrade(
  jobId: string,
  signal: AbortSignal | undefined,
  onProvider: (provider: string, model: string) => void
): Promise<PreparationOutcome> {
  try {
    const result = await prepareApplication(jobId, { signal, onProvider });
    return {
      fallback: "",
      reused: result.reused,
      notice: result.notice ?? "",
      provider: result.preparation.providerUsed,
      model: result.preparation.modelUsed,
    };
  } catch (error) {
    if (error instanceof GenerationCancelledError || signal?.aborted) throw new GenerationCancelledError();
    const reason = aiErrorMessage(error);
    console.warn(`[resume] application preparation unavailable for ${jobId}; continuing with stored keywords:`, reason);
    return { fallback: reason, reused: false, notice: "", provider: "", model: "" };
  }
}

/**
 * The whole tailoring pipeline up to — not including — saving: preparation, the AI
 * rewrite, the evidence guard, keyword preservation and coverage.
 *
 * `generateTailoredResume` and `generateResumeDraft` each carried their own copy of
 * this, line for line, which is how a fix could land in one and not the other. Both
 * now call this and differ only in what they save.
 */
export async function buildTailoredDraft(jobId: string, options: BuildDraftOptions = {}): Promise<TailoredDraftBuild> {
  const { signal, onStage } = options;
  const startedAt = Date.now();
  const stages: GenerationStageTiming[] = [];
  const notices: string[] = [];
  const elapsed = () => Date.now() - startedAt;
  const ensureNotCancelled = () => {
    if (signal?.aborted) throw new GenerationCancelledError();
  };

  const job = getJobById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  // §5.2, §22: no hidden evaluation. Resume generation used to quietly run one
  // when it was missing, which made an expensive AI call with no user action
  // behind it and hid the dependency. The caller is told to evaluate first.
  const evaluation = getEvaluationByJobId(jobId);
  if (!evaluation) throw new EvaluationRequiredError(jobId);

  const profile = getUserProfile();
  const resumes = getResumes();
  const skills = getSkills();
  const baseResume = options.resumeId
    ? (resumes.find((r) => r.id === options.resumeId) ?? selectBaseResume(evaluation, resumes))
    : selectBaseResume(evaluation, resumes);
  // Checked before any AI work: an unapproved lane cannot be generated from, and
  // finding that out after a two-minute preparation wasted the wait.
  const approvedVersion = getApprovedResumeVersion(baseResume);

  // §32: preparation is generated on demand and reused while its hashes hold, so
  // editing a draft does not pay for it again — but answering a gap anywhere in
  // the global evidence bank invalidates it.
  //
  // Failure degrades rather than aborting, matching how AI tailoring below is
  // handled: the same provider outage must not produce a resume on one path and
  // a hard error on the other. Without preparation the effective-keyword resolver
  // falls back to whatever the evaluation stored, which is exactly the behaviour
  // that existed before this stage.
  const preparingStartedAt = Date.now();
  onStage?.({ stage: "preparing", status: "started", elapsedMs: elapsed() });
  const preparation = await prepareApplicationOrDegrade(jobId, signal, (provider, model) =>
    onStage?.({ stage: "preparing", status: "started", provider, model, elapsedMs: elapsed() })
  );
  ensureNotCancelled();
  if (preparation.notice) notices.push(preparation.notice);
  stages.push({
    stage: "preparing",
    ms: Date.now() - preparingStartedAt,
    detail: preparation.reused ? "reused" : preparation.fallback ? "unavailable" : "generated",
    ...(preparation.provider ? { provider: preparation.provider, model: preparation.model } : {}),
  });
  onStage?.({
    stage: "preparing",
    status: "done",
    detail: preparation.reused ? "reused" : preparation.fallback ? "unavailable" : "generated",
    notice: preparation.notice || undefined,
    elapsedMs: elapsed(),
  });

  const sourceResumeText = await loadSourceResumeText(baseResume);
  const resolvedSectionModes = resolveSectionModes(approvedVersion.sections, options.sectionModes ?? []);
  const sourceDraft = buildTailoredContent(job, evaluation, profile, skills, approvedVersion, resolvedSectionModes);
  const keywordSignals = getEffectiveKeywordSignals(job.id);
  const requirements = getApplicationPreparation(job.id)?.requirements ?? [];

  const aiSettings = getAISettings();
  // Any provider the writer chain can reach, local included. This used to test for
  // the three cloud keys only, so a user running Ollama alone never had a resume
  // tailored at all and was told nothing about why.
  const writerChain = resolveWritingCandidates(aiSettings);
  const hasAIProvider = writerChain.length > 0;
  // Seeded from preparation so a degraded run is reported even when AI tailoring
  // itself succeeds — otherwise the resume looks fully tailored while quietly
  // missing this job's extracted keywords.
  let fallbackReason = preparation.fallback
    ? `Application preparation unavailable (${preparation.fallback}); tailored from stored keywords.`
    : "";
  const gapResponses = getJobGapResponses(jobId).filter((r) => r.qualityStatus === "addressed");
  const supplements = getProfileSupplements().filter((s) => s.qualityStatus === "addressed");

  // Build evidence before the AI call so we can classify keywords into confirmed vs candidate.
  const evidenceText = buildEvidenceText(sourceResumeText, sourceDraft, gapResponses, supplements, otherActiveLanes(resumes, baseResume));

  let unitResults: UnitResult[] = [];
  if (hasAIProvider) {
    const writingStartedAt = Date.now();
    onStage?.({ stage: "writing", status: "started", elapsedMs: elapsed() });
    const { partial: partialInDraft, missing: missingFromDraft } = keywordStrengthDetailsForText(
      evidenceTextForDraft(sourceDraft), keywordSignals
    );
    const context: UnitWriterContext = {
      job,
      evaluation,
      profile,
      skills,
      evidenceDraft: sourceDraft,
      gapResponses,
      supplements,
      keywordSignals,
      // Keywords whose words are already in the full evidence corpus → safe to use verbatim.
      confirmedKeywords: keywordSignals.map((signal) => signal.keyword).filter((kw) => isKeywordInText(evidenceText, kw)),
      missingKeywords: [...partialInDraft, ...missingFromDraft],
      requirements,
      evidenceMap: getApplicationPreparation(job.id)?.evidenceMap ?? [],
    };
    const selected = (unit: ResumeUnit) => modeForSection(unitModeId(unit), resolvedSectionModes) === "update";
    // Decided by the section being present and set to update, not by it having text: a
    // lane built from the blank starter can leave the summary empty, and the unit writer
    // can write one from the parts it has just produced. It still needs something to
    // write from.
    const hasBody = sourceDraft.experience.some((entry) => entry.bullets.length > 0) || sourceDraft.impactItems.length > 0;
    const writesSummary = selected({ kind: "summary" }) && (Boolean(sourceDraft.summary.trim()) || hasBody);
    const placements = planKeywordPlacements(
      [...unitsForDraft(sourceDraft, selected), ...(writesSummary ? [{ unit: { kind: "summary" } as ResumeUnit, lines: [sourceDraft.summary] }] : [])],
      context
    );
    const units = unitsForDraft(sourceDraft, selected).map((input) => ({ ...input, placeKeywords: placements.get(unitKey(input.unit)) }));
    const total = units.length + (writesSummary ? 1 : 0);
    // A local server answers one request at a time, so a run led by Ollama writes one
    // part at a time. A run led by a cloud provider writes three — and if that provider
    // fails and the parts fall through to Ollama, the Ollama adapter makes them take
    // turns (`inTurnForServer`) rather than arriving together in Ollama's own queue.
    const concurrency = orderForCredits(writerChain, exhaustedProviders())[0] === "ollama" ? 1 : 3;
    let started = 0;
    const announce = (label: string, provider?: string, model?: string) =>
      onStage?.({ stage: "writing", status: "started", detail: label, provider, model, elapsedMs: elapsed() });

    const write = async (input: UnitInput) => {
      const position = ++started;
      const label = `Part ${position} of ${total}: ${input.label}`;
      announce(label);
      const result = await writeUnit(context, input, { signal, onProvider: (provider, model) => announce(label, provider, model) });
      ensureNotCancelled();
      return result;
    };

    unitResults = await runUnits(units, concurrency, write);
    if (writesSummary) {
      // Written last, from what the other parts became, so the summary describes the
      // resume that is actually being sent rather than the one it was made from.
      const soFar = applyUnitResults(sourceDraft, unitResults).applied;
      unitResults.push(await write({
        unit: { kind: "summary" },
        label: "Professional summary",
        lines: [sourceDraft.summary],
        context: summaryContextFor(soFar),
        mode: "tailor",
        placeKeywords: placements.get("summary"),
      }));
    }

    const succeeded = unitResults.filter((result): result is UnitSuccess => result.ok);
    for (const result of succeeded) if (result.notice) notices.push(result.notice);
    const last = succeeded[succeeded.length - 1];
    const failed = unitResults.filter((result): result is UnitFailure => !result.ok);
    if (unitResults.length > 0 && succeeded.length === 0) {
      const reasons = [...new Set(failed.map((result) => result.reason))].join(" ");
      fallbackReason = fallbackReason ? `${fallbackReason} ${reasons}` : reasons;
    }
    stages.push({
      stage: "writing",
      ms: Date.now() - writingStartedAt,
      detail: `${succeeded.length} of ${unitResults.length} parts`,
      ...(last ? { provider: last.providerUsed, model: last.modelUsed } : {}),
    });
    onStage?.({
      stage: "writing",
      status: "done",
      provider: last?.providerUsed,
      model: last?.modelUsed,
      notice: notices[notices.length - 1],
      elapsedMs: elapsed(),
    });
  }
  ensureNotCancelled();

  const checkingStartedAt = Date.now();
  onStage?.({ stage: "checking", status: "started", elapsedMs: elapsed() });
  const confirmedKwsForInjection = keywordSignals
    .filter((signal) => signal.priority !== "preferred" && signal.category !== "title")
    .map((signal) => signal.keyword)
    .filter((keyword) => isKeywordInText(evidenceText, keyword));
  const aiRan = unitResults.some((result) => result.ok);
  // Every comparison below is line by line, so each runs against the source in the
  // order the writer chose — see applyUnitResults.
  const { source: orderedSource, applied } = applyUnitResults(sourceDraft, unitResults);
  // Measured on the model's own output: the evidence guard and the preservation
  // pass below both restore source wording deliberately, and counting their work
  // as the model doing nothing would make this report meaningless.
  const effect = aiRan
    ? analyzeTailoringEffect(orderedSource, applied, resolvedSectionModes)
    : { measured: [], notable: [], noOp: false };
  // A model that ran and rewrote nothing produced source content, and the draft
  // says so in the same words a provider failure does.
  if (effect.noOp) {
    const noOpReason = describeUnchanged(effect.measured);
    fallbackReason = fallbackReason ? `${fallbackReason} ${noOpReason}` : noOpReason;
  }

  const reverted = revertUnsupportedMetrics(orderedSource, applied, evidenceText);
  // §ATS: a rewrite may add job language, never trade away language the source
  // already matched. Runs after the evidence guard so it only ever puts back
  // approved source wording.
  const preserved = restoreLostKeywords(orderedSource, reverted.draft, keywordSignals);
  const draft = injectMissingConfirmedKeywordsIntoSkills(preserved.draft, confirmedKwsForInjection, resolvedSectionModes, keywordSignals);
  const keywordCoverage = keywordCoverageFor(draft, keywordSignals);
  const tailoringPlan = buildTailoringPlan(evaluation, baseResume, keywordCoverage, keywordSignals, preserved.restored);
  const checks = checkResume(draft, keywordSignals, confirmedKwsForInjection.concat(
    keywordSignals.filter((signal) => signal.category === "title" && isKeywordInText(evidenceText, signal.keyword)).map((signal) => signal.keyword)
  ), job.title);
  const unitFailures = unitResults
    .filter((result): result is UnitFailure => !result.ok)
    .map((result) => ({ unit: unitKey(result.unit), label: result.label, reason: result.reason }));
  stages.push({ stage: "checking", ms: Date.now() - checkingStartedAt });
  onStage?.({ stage: "checking", status: "done", elapsedMs: elapsed() });

  const lastWriter = [...unitResults].reverse().find((result): result is UnitSuccess => result.ok);
  return {
    job,
    profile,
    baseResume,
    draft,
    keywordCoverage,
    sourceKeywordCoverage: keywordCoverageFor(sourceDraft, keywordSignals),
    tailoringPlan,
    tailoringStatus: aiRan && !effect.noOp ? reverted.audit.status : "source-only",
    evidenceAudit: { ...reverted.audit, restored: preserved.restored, unchanged: effect.notable, checks, unitFailures },
    fallbackReason,
    notice: [...new Set(notices)].join(" "),
    generationMs: elapsed(),
    providerUsed: lastWriter?.providerUsed ?? "",
    modelUsed: lastWriter?.modelUsed ?? "",
    stages,
  };
}

/** The section-mode id a unit is governed by. */
function unitModeId(unit: ResumeUnit): string {
  if (unit.kind === "role") return "experience";
  if (unit.kind === "extra") return unit.id;
  return unit.kind;
}

export async function generateTailoredResume(jobId: string, sectionModes: ResumeSectionModeInput[] = []): Promise<GeneratedResumeResult> {
  const built = await buildTailoredDraft(jobId, { sectionModes });
  const { job, profile, baseResume, draft: content, keywordCoverage } = built;
  const savingStartedAt = Date.now();
  const html = renderResumeHtml(content);
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(`${profile.name}-${job.company}-${job.title}`);
  const id = `document-${job.id}`;
  const htmlPath = path.join(process.cwd(), "output", `${slug}-${date}.html`);
  const pdfPath = path.join(process.cwd(), "output", `${slug}-${date}.pdf`);
  const render = await renderHtmlToPdf({
    html,
    htmlPath,
    pdfPath,
    format: paperFormatFor(job)
  });
  const stages = [...built.stages, { stage: "saving" as const, ms: Date.now() - savingStartedAt }];
  const document: GeneratedDocumentInput = {
    id,
    jobId: job.id,
    documentType: "resume",
    title: `${job.company} - ${job.title} tailored resume`,
    content: html,
    pdfUrl: render.pdfPath,
    htmlUrl: render.htmlPath,
    baseResume: baseResume.name,
    generatedDate: date,
    status: "Ready",
    tailoringSummary: `Generated from ${baseResume.name}. ${keywordCoverage}% of evaluation keywords appear in the tailored resume.`,
    keywordCoverage,
    tailoringPlan: built.tailoringPlan,
    draftJson: JSON.stringify(content),
    baseResumeId: baseResume.id,
    tailoringStatus: built.tailoringStatus,
    evidenceAuditJson: JSON.stringify(built.evidenceAudit),
    fallbackReason: built.fallbackReason,
    generationMs: built.generationMs + (Date.now() - savingStartedAt),
    providerUsed: built.providerUsed,
    modelUsed: built.modelUsed,
    generationStages: stages,
  };

  saveGeneratedDocument(document);

  return {
    ...document,
    pageCount: render.pageCount,
    sizeBytes: render.sizeBytes
  };
}

export type ResumeDraftResult = {
  documentId: string;
  draft: ResumeTemplateInput;
  tailoringStatus: string;
  evidenceAudit: EvidenceAudit;
  fallbackReason: string;
  notice: string;
  generationMs: number;
  providerUsed: string;
  modelUsed: string;
};

export async function generateResumeDraft(
  jobId: string,
  resumeId?: string | null,
  sectionModes: ResumeSectionModeInput[] = [],
  run: Pick<BuildDraftOptions, "onStage" | "signal"> = {}
): Promise<ResumeDraftResult> {
  const built = await buildTailoredDraft(jobId, { resumeId, sectionModes, ...run });
  // The last point a cancel can take effect. Past here the draft is written, and a
  // user who stopped waiting must not find one saved behind their back.
  if (run.signal?.aborted) throw new GenerationCancelledError();

  const { job, baseResume, draft, keywordCoverage } = built;
  const savingStartedAt = Date.now();
  run.onStage?.({ stage: "saving", status: "started", elapsedMs: built.generationMs });
  const date = new Date().toISOString().slice(0, 10);
  const documentId = `document-${job.id}`;
  const generationMs = built.generationMs + (Date.now() - savingStartedAt);

  saveGeneratedDocument({
    id: documentId,
    jobId: job.id,
    documentType: "resume",
    title: `${job.company} - ${job.title} tailored resume`,
    content: "",
    pdfUrl: "",
    htmlUrl: "",
    baseResume: baseResume.name,
    generatedDate: date,
    status: "Draft",
    tailoringSummary: `Generated from ${baseResume.name}. ${keywordCoverage}% keyword coverage.`,
    keywordCoverage,
    tailoringPlan: built.tailoringPlan,
    draftJson: JSON.stringify(draft),
    baseResumeId: baseResume.id,
    tailoringStatus: built.tailoringStatus,
    evidenceAuditJson: JSON.stringify(built.evidenceAudit),
    fallbackReason: built.fallbackReason,
    generationMs,
    providerUsed: built.providerUsed,
    modelUsed: built.modelUsed,
    generationStages: [...built.stages, { stage: "saving", ms: Date.now() - savingStartedAt }],
  });
  run.onStage?.({ stage: "saving", status: "done", elapsedMs: generationMs });

  return {
    documentId,
    draft,
    tailoringStatus: built.tailoringStatus,
    evidenceAudit: built.evidenceAudit,
    fallbackReason: built.fallbackReason,
    notice: built.notice,
    generationMs,
    providerUsed: built.providerUsed,
    modelUsed: built.modelUsed,
  };
}

export async function createPdfForDocument(
  documentId: string,
  draft: ResumeTemplateInput,
  options: { allowUnsupportedClaims?: boolean } = {}
): Promise<{ pdfUrl: string }> {
  const doc = getGeneratedDocumentById(documentId);
  if (!doc) throw new Error(`Document not found: ${documentId}`);

  const job = getJobById(doc.jobId);
  if (!job) throw new Error(`Job not found: ${doc.jobId}`);

  const profile = getUserProfile();
  const resumes = getResumes();
  const baseResume = resolveDocumentResumeLane(doc, resumes);
  if (!baseResume) throw new Error(`Base resume lane not found: ${doc.baseResume}`);
  const sourceResumeText = await loadSourceResumeText(baseResume);
  const approvedVersion = getApprovedResumeVersion(baseResume);
  const sourceDraft = templateFromApprovedSections(approvedVersion.sections, profile, job, resolveSectionModes(approvedVersion.sections, []));
  const evidenceText = buildEvidenceText(
    sourceResumeText,
    sourceDraft,
    getJobGapResponses(doc.jobId).filter((response) => response.qualityStatus === "addressed"),
    getProfileSupplements().filter((supplement) => supplement.qualityStatus === "addressed"),
    otherActiveLanes(resumes, baseResume)
  );
  const audit = auditDraftAgainstEvidence(draft, evidenceText);
  const hasExplicitExportOverride = options.allowUnsupportedClaims === true;
  if (audit.status === "unsupported-claims" && !hasExplicitExportOverride) {
    throw new UnsupportedResumeClaimsError(audit.issues);
  }
  const html = renderResumeHtml(draft);
  const slug = slugify(`${profile.name}-${job.company}-${job.title}`);
  const date = new Date().toISOString().slice(0, 10);
  const htmlPath = path.join(process.cwd(), "output", `${slug}-${date}.html`);
  const pdfPath = path.join(process.cwd(), "output", `${slug}-${date}.pdf`);

  const render = await renderHtmlToPdf({ html, htmlPath, pdfPath, format: paperFormatFor(job) });

  updateDocumentDraft(documentId, JSON.stringify(draft));
  updateDocumentPdf(documentId, html, render.htmlPath, render.pdfPath, JSON.stringify({
    ...audit,
    exportOverride: audit.status === "unsupported-claims" && hasExplicitExportOverride,
  }));

  return { pdfUrl: render.pdfPath };
}

export function resolveDocumentResumeLane(doc: Pick<GeneratedDocumentInput, "baseResume" | "baseResumeId">, resumes: ResumeRecord[]) {
  return resumes.find((resume) => resume.id === doc.baseResumeId)
    ?? resumes.find((resume) => resume.name === doc.baseResume);
}

// After AI tailoring, inject any confirmed keywords that are still not present as exact phrases
// directly into the skills list. This handles cases where the AI placed the concept correctly
// but used a slight paraphrase. Only injects short phrases (≤3 words) to avoid awkward skill entries.
export function injectMissingConfirmedKeywordsIntoSkills(
  draft: ResumeTemplateInput,
  confirmedKeywords: string[],
  sectionModes: ResumeSectionModeInput[],
  keywordSignals: EvaluationRecord["keywordSignals"] = []
): ResumeTemplateInput {
  if (confirmedKeywords.length === 0) return draft;
  if (modeForSection("skills", sectionModes) === "keep") return draft;
  const { partial: stillPartial, missing: stillMissing } = keywordStrengthDetailsForText(
    evidenceTextForDraft(draft), confirmedKeywords
  );
  const toInject = [...stillPartial, ...stillMissing].filter((kw) => {
    const wordCount = kw.trim().split(/\s+/).length;
    const signal = keywordSignals.find((entry) => entry.keyword.toLowerCase() === kw.toLowerCase());
    const skillSafeCategory = !signal || ["technical", "tool", "methodology", "credential"].includes(signal.category);
    return wordCount <= 3 && skillSafeCategory;
  });
  if (toInject.length === 0) return draft;
  // keywordStrengthDetailsForText returns lowercased labels; restore original casing.
  const originalCasing = new Map(confirmedKeywords.map((kw) => [kw.trim().toLowerCase(), kw.trim()]));
  const existingSkillsLower = new Set(draft.skills.map((s) => s.toLowerCase()));
  const newSkills = toInject
    .map((kw) => originalCasing.get(kw.toLowerCase()) ?? kw)
    .filter((kw) => !existingSkillsLower.has(kw.toLowerCase()));
  if (newSkills.length === 0) return draft;

  if (!isCategorizedSkillList(draft.skills)) return { ...draft, skills: [...draft.skills, ...newSkills] };

  // A list written as "Category: a, b, c" lines. Appending a bare "Agile" line to it
  // printed a lone word under the categories, which reads as a mistake to a recruiter
  // and as an orphan entry to a parser. Each keyword joins the line it belongs with.
  const skills = [...draft.skills];
  for (const keyword of newSkills) {
    const signal = keywordSignals.find((entry) => entry.keyword.toLowerCase() === keyword.toLowerCase());
    const index = bestSkillLineFor(keyword, signal?.category, skills);
    skills[index] = `${skills[index].replace(/[.;,\s]+$/, "")}, ${keyword}`;
  }
  return { ...draft, skills };
}

const SKILL_CATEGORY_LINE = /^[^:]{2,48}:\s*\S/;

function isCategorizedSkillList(skills: string[]): boolean {
  if (skills.length === 0) return false;
  return skills.filter((line) => SKILL_CATEGORY_LINE.test(line)).length / skills.length >= 0.5;
}

const CATEGORY_HINTS: Partial<Record<JobKeywordSignal["category"], RegExp>> = {
  tool: /tool|technolog|software|platform|stack/i,
  methodology: /method|process|practice|approach|framework|delivery|operations|research/i,
  credential: /certif|credential|licen|training|education/i,
  technical: /technical|engineering|systems|development|design/i,
};

function termsOf(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9+#]+/).filter((term) => term.length > 2));
}

/** The category line a keyword fits best: by category name first, then by shared words, else the last line. */
function bestSkillLineFor(keyword: string, category: JobKeywordSignal["category"] | undefined, skills: string[]): number {
  const candidates = skills
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => SKILL_CATEGORY_LINE.test(line));
  const hint = category ? CATEGORY_HINTS[category] : undefined;
  if (hint) {
    const byName = candidates.find(({ line }) => hint.test(line.split(":")[0]));
    if (byName) return byName.index;
  }
  const keywordTerms = termsOf(keyword);
  let best = { index: candidates[candidates.length - 1]?.index ?? skills.length - 1, score: 0 };
  for (const { line, index } of candidates) {
    const score = [...termsOf(line)].filter((term) => keywordTerms.has(term)).length;
    if (score > best.score) best = { index, score };
  }
  return best.index;
}

export function buildEvidenceText(
  sourceResumeText: string,
  sourceDraft: ResumeTemplateInput,
  gapResponses: Array<{ rawResponse: string; polishedResponse: string }>,
  supplements: Array<{ content: string }>,
  otherLanes: ResumeRecord[] = []
) {
  return [
    sourceResumeText,
    evidenceTextForDraft(sourceDraft),
    // Every active lane counts as evidence, not just the one being tailored. A
    // fact recorded on another approved resume — a domain, a tool, a span of
    // years — is still the candidate's own attested history, and scoping the
    // corpus to a single lane made the guard discard true content as invented.
    ...otherLanes.map((lane) => lane.extractedText),
    ...gapResponses.flatMap((response) => [response.rawResponse, response.polishedResponse]),
    ...supplements.map((supplement) => supplement.content),
  ].join("\n");
}

export function otherActiveLanes(resumes: ResumeRecord[], baseResume: ResumeRecord): ResumeRecord[] {
  return resumes.filter((resume) => resume.id !== baseResume.id && resume.activeStatus && resume.extractedText.trim());
}

function selectBaseResume(evaluation: EvaluationRecord, resumes: ResumeRecord[]) {
  const recommended = resumes.find((resume) => resume.name === evaluation.resumeBaseRecommendation);
  if (recommended) {
    return recommended;
  }

  const fallback = resumes.find((resume) => resume.activeStatus);
  if (!fallback) {
    throw new Error("No active resume lanes are available.");
  }

  return fallback;
}

export function getApprovedResumeVersion(resume: ResumeRecord): ResumeBuilderVersionRecord {
  const version = getResumeBuilderVersion(resume.id);
  if (!version || version.status !== "approved") {
    throw new Error(`Review and approve the "${resume.name}" resume builder version before generating a tailored resume.`);
  }
  return version;
}

export async function loadSourceResumeText(resume: ResumeRecord) {
  const sourcePath = path.join(process.cwd(), resume.sourceFile);

  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: readFileSync(sourcePath) });
    const result = await parser.getText();
    await parser.destroy();
    return normalizePdfText(result.text);
  } catch {
    return normalizePdfText(resume.extractedText);
  }
}

const LEADERSHIP_SIGNAL_TERMS = [
  "manage", "managed", "managing", "hire", "hired", "hiring", "built the team", "scaled the team",
  "led a team", "lead a team", "team of", "direct report", "org design", "organizational",
  "roadmap", "vision", "executive", "stakeholder", "c-suite", "board", "budget", "headcount",
  "cross-functional", "aligned", "strategic", "strategy", "department", "division"
];

function isLeadershipArchetype(archetype: string) {
  const a = archetype.toLowerCase();
  return a.includes("leadership") || a.includes("management") || a.includes("director") || a.includes("chief") || a.includes("vp");
}

function buildTailoredContent(
  job: JobRecord,
  evaluation: EvaluationRecord,
  profile: UserProfileRecord,
  skills: SkillRecord[],
  approvedVersion: ResumeBuilderVersionRecord,
  sectionModes: ResumeSectionModeInput[]
) {
  const keywordSignals = getEffectiveKeywordSignals(job.id);
  const keywords = keywordSignals
    .filter((signal) => signal.priority !== "preferred")
    .map((signal) => signal.keyword)
    .slice(0, 12);
  const preferredSkillNames = skills
    .filter((skill) => skill.usePreference !== "use_less")
    .map((skill) => skill.skillName);

  const leadershipRole = isLeadershipArchetype(evaluation.roleArchetype);
  const rankingKeywords = leadershipRole
    ? [...keywords, ...LEADERSHIP_SIGNAL_TERMS]
    : keywords;

  const source = templateFromApprovedSections(approvedVersion.sections, profile, job, sectionModes);
  const shouldRank = (sectionId: string) => modeForSection(sectionId, sectionModes) === "update";
  const experience = shouldRank("experience")
    ? source.experience.map((entry) => ({
      ...entry,
      bullets: rankItems(entry.bullets, rankingKeywords).slice(0, entry.bullets.length)
    }))
    : source.experience;

  return {
    name: source.name || profile.name,
    headline: source.headline,
    contactItems: source.contactItems,
    title: job.title,
    summaryHeading: source.summaryHeading,
    summary: source.summary,
    impactHeading: source.impactHeading,
    impactItems: shouldRank("impact") ? rankItems(source.impactItems, rankingKeywords).slice(0, source.impactItems.length) : source.impactItems,
    experienceHeading: source.experienceHeading,
    experience,
    skillsHeading: source.skillsHeading,
    skills: shouldRank("skills") ? rankItems(source.skills, [...rankingKeywords, ...preferredSkillNames]).slice(0, source.skills.length) : source.skills,
    recognitionHeading: source.recognitionHeading,
    recognition: source.recognition,
    extraSections: source.extraSections,
    education: source.education
  } satisfies ResumeTemplateInput;
}

export function resolveSectionModes(sections: ResumeBuilderSection[], submitted: ResumeSectionModeInput[]): ResumeSectionModeInput[] {
  const submittedById = new Map(submitted.map((item) => [item.sectionId, item.mode]));
  const resolved: ResumeSectionModeInput[] = [];
  // Types already addressable by their own id need no alias, and adding one
  // would let a later section of the same type override the real one — the
  // generator resolves a mode by first match, the tailorer by last.
  const aliased = new Set(sections.filter((section) => section.id === section.type).map((section) => section.type));

  for (const section of sections) {
    const mode = submittedById.get(section.id)
      ?? (section.type === "summary" || section.type === "impact" || section.type === "experience" ? "update" : "keep");
    resolved.push({ sectionId: section.id, mode });

    // Every downstream lookup — here and in the tailorer — asks for a mode by
    // section *type* ("summary", "experience"), while the UI submits and stores
    // section *ids*. A lane built from the blank starter uses ids like
    // "s-summary", so those lookups silently fell through to "keep" and the
    // section was never sent to the AI or applied back. Publishing a type alias
    // for the first section of each type keeps both spellings resolvable.
    if (section.id !== section.type && !aliased.has(section.type)) {
      resolved.push({ sectionId: section.type, mode });
      aliased.add(section.type);
    }
  }

  return resolved;
}

function modeForSection(sectionId: string, sectionModes: ResumeSectionModeInput[]): ResumeSectionMode {
  return sectionModes.find((mode) => mode.sectionId === sectionId)?.mode ?? "keep";
}

export function templateFromApprovedSections(
  sections: ResumeBuilderSection[],
  profile: UserProfileRecord,
  job: JobRecord,
  sectionModes: ResumeSectionModeInput[]
): ResumeTemplateInput {
  const template: ResumeTemplateInput = {
    name: profile.name,
    headline: "",
    contactItems: [profile.location, profile.portfolio].filter(Boolean),
    title: job.title,
    summaryHeading: "Professional Summary",
    summary: "",
    impactHeading: "Key Achievements",
    impactItems: [],
    experienceHeading: "Professional Experience",
    experience: [],
    skillsHeading: "Skills",
    skills: [],
    recognitionHeading: "Awards and Recognition",
    recognition: [],
    extraSections: [],
    education: []
  };

  for (const section of sections) {
    if (modeForSection(section.id, sectionModes) === "hide") continue;

    if (section.type === "header" && section.header) {
      template.name = section.header.name || template.name;
      template.headline = section.header.headline;
      template.contactItems = section.header.contactItems.length > 0 ? section.header.contactItems : template.contactItems;
    } else if (section.type === "summary") {
      // The heading the user gave the section. Without it every generated resume
      // printed "Professional Summary" over an approved "Summary".
      template.summaryHeading = section.title || template.summaryHeading;
      template.summary = section.text ?? "";
    } else if (section.type === "impact") {
      template.impactHeading = section.title || template.impactHeading;
      template.impactItems = section.items ?? [];
    } else if (section.type === "experience") {
      template.experienceHeading = section.title || template.experienceHeading;
      template.experience = section.experience ?? [];
    } else if (section.type === "skills") {
      template.skillsHeading = section.title || template.skillsHeading;
      template.skills = section.items ?? [];
    } else if (section.type === "recognition") {
      template.recognitionHeading = section.title || template.recognitionHeading;
      template.recognition = section.items ?? [];
    } else if (section.type === "education") {
      template.education = section.education ?? [];
    } else if (section.type === "custom") {
      template.extraSections?.push({ id: section.id, title: section.title, items: section.items ?? [] });
    }
  }

  return template;
}

export function parseSourceResume(text: string, profile: Pick<UserProfileRecord, "name" | "location" | "portfolio">) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim().replace(/\s+--\s+\d+ of \d+\s+--$/, ""))
    .filter((line) => line && !/^-- \d+ of \d+ --$/.test(line));

  const headingGroups = {
    summary: ["Summary", "Professional Summary", "Executive Summary", "Career Summary", "Profile", "Professional Profile", "About", "About Me"],
    impact: ["Selected Impact", "Selected Executive Impact", "Career Highlights", "Highlights", "Core Strengths", "Key Achievements", "Achievements", "Selected Achievements"],
    experience: ["Professional Experience", "Teaching Experience", "Work Experience", "Experience", "Relevant Experience", "Selected Experience", "Employment Experience", "Employment History", "Work History", "Career Experience", "Professional Background"],
    skills: ["Skills", "Core Skills", "Core Competencies", "Competencies", "Areas of Expertise", "Expertise", "Technical Skills", "Design Skills", "Skills and Tools", "Technical Skills and Tools", "Tools", "Tools and Technologies", "Technologies", "Soft Skills", "Languages"],
    recognition: ["Recognition", "Industry Leadership, Publications and Mentorship", "Awards and Recognition", "Awards", "Publications", "Certifications", "Licenses and Certifications"],
    education: ["Education", "Education and Training", "Education and Certifications", "Academic Background", "Credentials"],
  };

  const sections = {
    summary: findHeading(lines, headingGroups.summary),
    impact: findHeading(lines, headingGroups.impact),
    experience: findHeading(lines, headingGroups.experience),
    skills: findHeading(lines, headingGroups.skills),
    recognition: findHeading(lines, headingGroups.recognition),
    education: findHeading(lines, headingGroups.education),
  };

  const allHeadingIndexes = uniqueIndexes(
    Object.values(headingGroups).flatMap((headings) => findHeadingIndexes(lines, headings))
  );
  const skillIndexes = findHeadingIndexes(lines, headingGroups.skills);

  const getNextBoundary = (currentIndex: number) => {
    const boundaries = allHeadingIndexes.filter(v => v > currentIndex);
    return boundaries.length > 0 ? Math.min(...boundaries) : lines.length;
  };

  const header = parseHeader(lines.slice(0, Math.max(sections.summary, 0)), profile);

  return {
    ...header,
    summary: sections.summary !== -1 ? joinLines(lines.slice(sections.summary + 1, getNextBoundary(sections.summary))) : "",
    impactHeading: sections.impact !== -1 ? lines[sections.impact] : "Key Achievements",
    impactItems: sections.impact !== -1 ? parseBulletLines(lines.slice(sections.impact + 1, getNextBoundary(sections.impact))) : [],
    experienceHeading: sections.experience !== -1 ? lines[sections.experience] : "Professional Experience",
    experience: sections.experience !== -1 ? parseExperience(lines.slice(sections.experience + 1, getNextBoundary(sections.experience))) : [],
    skills: skillIndexes.flatMap((index) => parseSectionList(lines, index, getNextBoundary(index))),
    recognition: sections.recognition !== -1 ? parseSectionList(lines, sections.recognition, getNextBoundary(sections.recognition)) : [],
    education: sections.education !== -1 ? parseEducation(lines.slice(sections.education + 1, getNextBoundary(sections.education))) : []
  };
}

export type ParsedResumeSections = ReturnType<typeof parseSourceResume>;

export function validateResumeExtraction(parsed: ParsedResumeSections, sourceText: string) {
  const issues: string[] = [];
  const wordCount = sourceText.split(/\s+/).filter(Boolean).length;

  if (wordCount < 120) {
    issues.push("PDF text layer is too short to be a complete resume");
  }
  if (parsed.experience.length === 0) {
    issues.push("missing experience section");
  } else if (parsed.experience.every((entry) => entry.bullets.length === 0)) {
    issues.push("experience section has no role details or bullets");
  }
  if (parsed.skills.length === 0) {
    issues.push("missing skills section");
  }
  if (parsed.education.length === 0) {
    issues.push("missing education section");
  }

  return issues;
}

function parseHeader(lines: string[], profile: Pick<UserProfileRecord, "name" | "location" | "portfolio">) {
  if (lines.length === 0) {
    return {
      name: profile.name,
      headline: "",
      contactItems: [profile.location, profile.portfolio].filter(Boolean)
    };
  }

  // PDFs often put name + headline on a single line. Use the profile name to
  // split them: if line[0] starts with the known name, the rest is the headline.
  const { name, remaining } = extractHeaderName(lines, profile);

  const contactItems: string[] = [];
  let headline = "";

  for (const rawLine of remaining) {
    // normalizeText converts inline "•" / "●" separators to "\n● " — strip them
    const hasBulletPrefix = /^[●•●•]\s/.test(rawLine);
    const line = rawLine.replace(/^[●•●•]\s*/, "").trim();
    if (!line) continue;

    // First non-bullet line: extract headline even if it contains appended phone/email.
    // PDFs commonly produce "Headline Title +1-234-5678" on one line.
    if (!headline && !hasBulletPrefix) {
      const { headlinePart, contacts } = splitHeadlineFromMixedLine(line);
      if (headlinePart) {
        headline = headlinePart;
        contactItems.push(...contacts);
        continue;
      }
    }

    const parsedContact = parseContactLine(line);
    if (parsedContact.length > 0) {
      contactItems.push(...parsedContact);
      continue;
    }

    // "Nashville, TN" / "Remote" — city/state patterns without URL chars
    if (isLocationLike(line)) {
      contactItems.push(line);
      continue;
    }

    // Bare domain like "portfolio.example.com" without http/www prefix
    if (isDomainLike(line)) {
      contactItems.push(line);
      continue;
    }

    // Any line that was a normalised bullet separator is contact material
    if (hasBulletPrefix) {
      contactItems.push(line);
      continue;
    }

    // Plain text fallback
    if (!headline) {
      headline = line;
    } else {
      contactItems.push(line);
    }
  }

  return {
    name,
    headline,
    contactItems: contactItems.length > 0 ? unique(contactItems) : [profile.location, profile.portfolio].filter(Boolean)
  };
}

// Separates the professional headline from any contact info (phone, email, URL) that
// a PDF may have merged onto the same line as the title.
function splitHeadlineFromMixedLine(line: string): { headlinePart: string; contacts: string[] } {
  // Lines starting with contact markers are not headlines
  if (/^[+\d@]/.test(line) || /^https?:\/\//i.test(line) || /^www\./i.test(line)) {
    return { headlinePart: "", contacts: [] };
  }

  const hasPhone = /\+?\d[\d\s().-]{7,}/.test(line);
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line);
  const hasUrl = /https?:\/\/|www\.|linkedin\.com/i.test(line);

  if (!hasPhone && !hasEmail && !hasUrl) {
    // Pure headline with no contact info embedded
    return { headlinePart: line, contacts: [] };
  }

  // Strip contact markers from the line to recover the headline text
  const contacts: string[] = [];
  let cleaned = line;

  // Phone appended at the end: "...Headline Title +1-615-866-2369"
  cleaned = cleaned.replace(/\s+(\+?[\d][\d\s().-]{7,})\s*$/, (_, phone) => {
    contacts.push(phone.trim());
    return "";
  });

  // Emails embedded in the line
  cleaned = cleaned.replace(/\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi, (_, email) => {
    contacts.push(email.trim());
    return "";
  });

  // Full URLs
  cleaned = cleaned.replace(/\s+(https?:\/\/\S+)/gi, (_, url) => {
    contacts.push(url.trim());
    return "";
  });

  // Split remaining by | and drop any still-contact-looking segments
  const parts = cleaned.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
  const headlineParts: string[] = [];
  for (const part of parts) {
    if (/\+?\d[\d\s().-]{7,}/.test(part) || /[A-Z0-9._%+-]+@/i.test(part) || /linkedin\.com|https?:\/\//i.test(part)) {
      contacts.push(part);
    } else {
      headlineParts.push(part);
    }
  }

  const headlinePart = headlineParts.join(" | ").trim();
  if (headlinePart.length < 5) {
    return { headlinePart: "", contacts };
  }

  return { headlinePart, contacts };
}

function extractHeaderName(
  lines: string[],
  profile: Pick<UserProfileRecord, "name" | "location" | "portfolio">
): { name: string; remaining: string[] } {
  const firstLine = lines[0];

  if (profile.name) {
    const profileLower = profile.name.toLowerCase();
    const firstLower = firstLine.toLowerCase();

    if (firstLower === profileLower) {
      return { name: firstLine, remaining: lines.slice(1) };
    }

    if (firstLower.startsWith(profileLower)) {
      // e.g. "Jordan Rivera Executive UX & Product Design Leader..."
      const name = firstLine.slice(0, profile.name.length).trim();
      const rest = firstLine.slice(profile.name.length).trim();
      const remaining = rest ? [rest, ...lines.slice(1)] : lines.slice(1);
      return { name, remaining };
    }
  }

  return { name: firstLine, remaining: lines.slice(1) };
}

function isLocationLike(line: string): boolean {
  if (!line || line.includes("@") || /[./]/.test(line) || /[0-9]/.test(line)) return false;
  if (/^remote$/i.test(line)) return true;
  // "Nashville, TN" / "New York, NY" / "London, UK" — comma + 2-3-letter code
  return /^[A-Za-z\s.''-]{2,30},\s*[A-Z]{2,3}$/.test(line);
}

function isDomainLike(line: string): boolean {
  // "portfolio.example.com" or "ux.design" — no spaces, no @, at least one dot
  return /^[a-z0-9]([a-z0-9-]*\.)+[a-z]{2,}$/i.test(line) && !line.includes(" ");
}

function parseContactLine(line: string) {
  const labeled = /^(Location|Phone|Email|Portfolio|LinkedIn|Website|Relocation):\s*(.+)$/i.exec(line);
  if (labeled) {
    const label = labeled[1].toLowerCase();
    const value = labeled[2].trim();
    if (label === "email") {
      const email = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
      return email ? [email] : [];
    }
    if (label === "relocation") {
      return [`Relocation: ${value}`];
    }
    return value ? [value] : [];
  }

  if (line.includes("@") || /\+?\d[\d\s().-]{7,}/.test(line) || /linkedin\.com|https?:\/\/|www\./i.test(line)) {
    return line.split(/[|\u2022]/).map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function parseExperience(lines: string[]) {
  const entries: ResumeTemplateInput["experience"] = [];
  let current: ResumeTemplateInput["experience"][number] | undefined;
  let pendingTitle = "";

  for (const line of lines) {
    if (isBulletLine(line)) {
      const bullet = stripBullet(line);
      if (current) {
        current.bullets.push(bullet);
      }
      pendingTitle = "";
      continue;
    }

    const dateMatch = DATE_RANGE_RE.exec(line);
    if (dateMatch) {
      const orgPart = line.slice(0, dateMatch.index).replace(/[\t|]+\s*$/, "").trim();
      const dateRange = formatDate(`${dateMatch[1]} - ${dateMatch[2]}`);
      const { organization, location } = splitOrganizationAndLocation(orgPart);

      if (pendingTitle) {
        current = { title: pendingTitle, organization, location, dateRange, bullets: [] };
        entries.push(current);
        pendingTitle = "";
      } else {
        // Org+date line without a preceding title — use org as title
        current = { title: organization, organization: "", location, dateRange, bullets: [] };
        entries.push(current);
      }
      continue;
    }

    const looksLikeTitle =
      /^[A-Z]/.test(line) &&
      line.length <= 120 &&
      !line.startsWith("\u2013") &&
      !line.startsWith("-");

    if (current && !pendingTitle && current.bullets.length === 0) {
      current.bullets.push(line);
    } else if (looksLikeTitle || !current?.bullets.length) {
      pendingTitle = pendingTitle ? `${pendingTitle} ${line}` : line;
    } else if (current?.bullets.length) {
      current.bullets[current.bullets.length - 1] =
        `${current.bullets[current.bullets.length - 1]} ${line}`.trim();
    }
  }

  return entries;
}

const MONTH_RE = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE_VALUE_RE = `(?:\\d{2}[/.]\\d{4}|${MONTH_RE}\\s+\\d{4})`;
const DATE_RANGE_RE = new RegExp(`(${DATE_VALUE_RE})\\s*[\\-\u2013\u2014]\\s*(Present|${DATE_VALUE_RE})`, "i");

function splitOrganizationAndLocation(value: string) {
  const pipeParts = value.split(/\s+\|\s+/);
  if (pipeParts.length >= 2) {
    return {
      organization: pipeParts[0].trim(),
      location: pipeParts.slice(1).join(" | ").trim() || undefined,
    };
  }

  const dashParts = value.split(/\s+[\-\u2013\u2014]\s+/);
  if (dashParts.length >= 2) {
    return {
      organization: dashParts[0].trim(),
      location: dashParts.slice(1).join(" - ").trim() || undefined,
    };
  }

  return { organization: value.trim(), location: undefined };
}

function formatDate(dateStr: string) {
  return dateStr.replace(new RegExp(`\\d{2}[/.]\\d{4}|${MONTH_RE}\\s+\\d{4}`, "gi"), (date) => {
    const numeric = /(\d{2})[/.](\d{4})/.exec(date);
    if (!numeric) {
      return formatMonthDate(date);
    }

    const [, m, y] = numeric;
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parseInt(m, 10) - 1];
    return `${month} ${y}`;
  });
}

function formatMonthDate(value: string) {
  const match = new RegExp(`^(${MONTH_RE})\\s+(\\d{4})$`, "i").exec(value.trim());
  if (!match) return value;
  const monthKey = match[1].slice(0, 3).toLowerCase();
  const month = {
    jan: "Jan",
    feb: "Feb",
    mar: "Mar",
    apr: "Apr",
    may: "May",
    jun: "Jun",
    jul: "Jul",
    aug: "Aug",
    sep: "Sep",
    oct: "Oct",
    nov: "Nov",
    dec: "Dec",
  }[monthKey] ?? match[1];
  return `${month} ${match[2]}`;
}

function parseEducation(lines: string[]) {
  const entries: ResumeTemplateInput["education"] = [];
  let current: ResumeTemplateInput["education"][number] | undefined;
  let pendingSchool = "";

  for (const line of lines) {
    const text = stripBullet(line);
    if (!text || /^-- \d+ of \d+ --$/.test(text)) continue;

    // Match both spelled-out degree names and common abbreviations (B.S., M.A., A.S., etc.)
    const isDegreeKeyword = /Bachelor|Master|Doctor|Associate|Ph\.?D|MBA|M\.B\.A|M\.D\.|Ed\.D\.|J\.D\.|LL\.M|B\.S\.|B\.A\.|B\.Sc\.|B\.E\.|B\.F\.A\.|M\.S\.|M\.A\.|M\.Sc\.|M\.Eng\.|A\.A\.|A\.S\.|A\.A\.S\./i.test(text);
    if (text.includes(" | ") || isDegreeKeyword) {
      let degree = text;
      let inlineSchool = "";
      let inlineFocus = "";

      if (text.includes(" | ")) {
        const parts = text.split(" | ");
        // parts[0] = "Computer and Digital Communication Science"
        // parts[1] = "Master of Science" OR "Master of Science Belarus State University... Focus: ..."
        let levelAndMore = parts[1];

        // Detach trailing "Focus: ..." that was merged onto the same line by the PDF extractor
        const focusIdx = levelAndMore.search(/\s+Focus:\s/);
        if (focusIdx !== -1) {
          inlineFocus = levelAndMore.slice(focusIdx).trim();
          levelAndMore = levelAndMore.slice(0, focusIdx).trim();
        }

        // Extract just the degree level ("Master of Science", "Bachelor of Arts", etc.)
        // then treat the remainder as the inline school name.
        // Use an explicit discipline list so the regex doesn't greedily consume school name words.
        const DISCIPLINES = "Science|Arts|Engineering|Fine Arts|Business Administration|Education|"
          + "Public Health|Law|Music|Commerce|Nursing|Divinity|Architecture|Design|Philosophy|"
          + "Technology|Computer Science|Information Systems|Social Work|Public Policy|"
          + "International Relations|Digital Communication Science|Communication Science";
        const degreeLevelMatch = new RegExp(
          `^((?:Master|Bachelor|Doctor)\\s+of\\s+(?:${DISCIPLINES})|Ph\\.?D\\.?|M\\.?B\\.?A\\.?|M\\.?D\\.?|Ed\\.?D\\.?)`,
          "i"
        ).exec(levelAndMore);
        const degreeLevel = degreeLevelMatch ? degreeLevelMatch[1].trim() : levelAndMore;
        const schoolRemainder = levelAndMore.slice(degreeLevel.length).trim();
        if (schoolRemainder) inlineSchool = schoolRemainder;

        if (degreeLevel.match(/Master|Bachelor|Doctor/i)) {
          degree = `${degreeLevel}, ${parts[0]}`;
        } else {
          degree = `${parts[0]}, ${degreeLevel}`;
        }
      }

      current = { degree, school: inlineSchool || pendingSchool };
      pendingSchool = "";
      if (inlineFocus) current.focus = inlineFocus.replace(/^Focus:\s*/, "");
      entries.push(current);
    } else if (current) {
      const stripped = text.replace(/^Focus:\s*/, "");
      if (text.startsWith("Focus:")) {
        current.focus = stripped;
      } else if (!current.school) {
        current.school = text;
      }
    } else {
      // School name before the degree line (common format)
      pendingSchool = text;
    }
  }

  // Fallback: if no entries were parsed but the section had content, create a basic entry
  // so validation doesn't falsely report a missing education section.
  if (entries.length === 0) {
    const nonEmpty = lines.map((l) => stripBullet(l)).filter((l) => l && !/^-- \d+ of \d+ --$/.test(l));
    if (nonEmpty.length > 0) {
      entries.push({ degree: nonEmpty[0], school: nonEmpty[1] ?? "" });
    }
  }

  return entries;
}


function parseSectionList(lines: string[], startIndex: number, endIndex: number) {
  if (startIndex < 0) {
    return [];
  }

  const sectionLines = lines.slice(startIndex + 1, endIndex).filter((line) => !/^-- \d+ of \d+ --$/.test(line));
  const bullets = parseBulletLines(sectionLines);
  return bullets.length > 0 ? bullets : sectionLines;
}

function parseBulletLines(lines: string[]) {
  const items: string[] = [];

  for (const line of lines) {
    if (isBulletLine(line)) {
      items.push(stripBullet(line));
      continue;
    }

    // Category-style entry: "Category Name: content..." — common in Skills
    // sections that have no bullet markers between sub-categories. Treat each
    // such line as a new item rather than continuing the previous one.
    if (/^[A-Z][A-Za-z0-9 &/\-]{2,40}:\s/.test(line)) {
      items.push(line);
      continue;
    }

    if (items.length > 0) {
      items[items.length - 1] = `${items[items.length - 1]} ${line}`.trim();
    } else if (line) {
      items.push(line);
    }
  }

  return items;
}

function isBulletLine(line: string) {
  return /^[\u25aa\u25ab\u25cf\u25e6\u2022*\-]\s+/.test(line);
}

function stripBullet(line: string) {
  return line.replace(/^[\u25aa\u25ab\u25cf\u25e6\u2022*\-]\s+/, "").trim();
}

function rankItems(items: string[], keywords: string[]) {
  return unique(
    items
      .map((item, index) => ({
        item: item.trim(),
        index,
        score: keywords.reduce((count, keyword) => count + (item.toLowerCase().includes(keyword.toLowerCase()) ? 1 : 0), 0)
      }))
      .filter((item) => item.item.length > 0)
      .sort((a, b) => (b.score === a.score ? a.index - b.index : b.score - a.score))
      .map((item) => item.item)
  );
}

function buildTailoringPlan(
  evaluation: EvaluationRecord,
  resume: ResumeRecord,
  keywordCoverage: number,
  keywordSignals: JobKeywordSignal[],
  restored: KeywordRestore[] = []
) {
  const plan = [
    `Base resume selected: ${resume.name}.`,
    `Role archetype: ${evaluation.roleArchetype}.`,
    `Top keywords inserted only where supported: ${keywordSignals.slice(0, 8).map((signal) => signal.keyword).join(", ") || "none captured"}.`,
    `Proof points reordered by overlap with the job/evaluation keywords.`,
    `Keyword coverage: ${keywordCoverage}%.`
  ];
  const restoreNotice = describeRestores(restored);
  if (restoreNotice) plan.push(restoreNotice);
  return plan;
}

function paperFormatFor(job: JobRecord): "letter" | "a4" {
  const location = `${job.location} ${job.remoteType}`.toLowerCase();
  return location.includes("united states") || location.includes(" us") || location.includes("canada") ? "letter" : "a4";
}

function findHeading(lines: string[], headings: string[]) {
  const normalizedHeadings = headings.map(normalizeHeading);
  return lines.findIndex((line) => normalizedHeadings.includes(normalizeHeading(line)));
}

function findHeadingIndexes(lines: string[], headings: string[]) {
  const normalizedHeadings = headings.map(normalizeHeading);
  return lines
    .map((line, index) => normalizedHeadings.includes(normalizeHeading(line)) ? index : -1)
    .filter((index) => index !== -1);
}

function normalizeHeading(line: string) {
  return line
    .replace(/^[#\s]+/, "")
    .replace(/[:|]+$/, "")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function uniqueIndexes(values: number[]) {
  return [...new Set(values.filter((value) => value >= 0))].sort((a, b) => a - b);
}



function joinLines(lines: string[]) {
  return lines.join(" ").replace(/\s+/g, " ").trim();
}

function normalizePdfText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/\n[ \t]*-- \d+ of \d+ --[ \t]*\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}



function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
