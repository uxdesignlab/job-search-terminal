import {
  getApplicationPreparation,
  getEffectiveKeywordSignals,
  getEvaluationByJobId,
  getGeneratedDocumentById,
  getJobById,
  getJobGapResponses,
  getProfileSupplements,
  getResumes,
  getSkills,
  getUserProfile,
} from "../db/queries";
import { EvaluationRequiredError } from "../application-preparation";
import { evidenceTextForDraft, revertUnsupportedMetrics, type EvidenceRevert } from "./evidence-audit";
import { isKeywordInText, keywordStrengthDetailsForText } from "./keyword-coverage";
import { restoreLostKeywords, type KeywordRestore } from "./keyword-preservation";
import {
  buildEvidenceText,
  getApprovedResumeVersion,
  loadSourceResumeText,
  otherActiveLanes,
  resolveDocumentResumeLane,
  resolveSectionModes,
  templateFromApprovedSections,
} from "./resume-generator";
import { lintPart, type LintIssue } from "./resume-lint";
import type { ResumeTemplateInput } from "./resume-template";
import {
  parseUnitKey,
  planKeywordPlacements,
  summaryContextFor,
  unitKey,
  writeUnit,
  type ResumeUnit,
  type UnitInput,
  type UnitWriterContext,
} from "./resume-unit-writer";

/**
 * ✨ Improve and ↻ Regenerate for one part of a draft, with the same grounding a full
 * generation has.
 *
 * Improve used to be a separate prompt that saw neither the posting nor the evidence,
 * asked for bullets that were "measurable" and a summary that was "compelling", and
 * whose output skipped the claim guard entirely — the most likely place in the app for
 * an invented number to reach a PDF. Both actions now write through the unit writer and
 * the guard. They differ only in what they start from:
 *
 * - **improve** starts from the text in the editor, including the user's own edits, and
 *   keeps its substance. The user's edits count as their own evidence, so the guard only
 *   reverts claims the model added beyond both the text and the evidence bank.
 * - **regenerate** starts from the approved resume lane, as generation does.
 */

export type SectionAction = "improve" | "regenerate";

export class SectionRewriteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SectionRewriteError";
  }
}

export type SectionRewriteResult = {
  unit: string;
  action: SectionAction;
  /** The rewritten lines, in the order they should appear. A summary is one line. */
  lines: string[];
  /** The starting line each rewritten line was written from, in the same order. */
  sources: string[];
  /** Lines the guard put back, and the claims that caused it. */
  reverted: EvidenceRevert[];
  /** Lines kept at their starting wording to hold on to job language. */
  restored: KeywordRestore[];
  issues: LintIssue[];
  repaired: boolean;
  notice: string;
  providerUsed: string;
  modelUsed: string;
  ms: number;
};

function copyDraft(draft: ResumeTemplateInput): ResumeTemplateInput {
  return {
    ...draft,
    impactItems: [...draft.impactItems],
    skills: [...draft.skills],
    recognition: [...draft.recognition],
    experience: draft.experience.map((entry) => ({ ...entry, bullets: [...entry.bullets] })),
    extraSections: (draft.extraSections ?? []).map((section) => ({ ...section, items: [...section.items] })),
  };
}

function linesOf(draft: ResumeTemplateInput, unit: ResumeUnit): string[] {
  if (unit.kind === "summary") return draft.summary.trim() ? [draft.summary] : [];
  if (unit.kind === "impact") return draft.impactItems;
  if (unit.kind === "skills") return draft.skills;
  if (unit.kind === "role") return draft.experience[unit.index]?.bullets ?? [];
  return extraSectionOf(draft, unit.id)?.items ?? [];
}

function extraSectionOf(draft: ResumeTemplateInput, id: string) {
  return (draft.extraSections ?? []).find((section) => (section.id ?? `custom-${section.title}`) === id);
}

function withLines(draft: ResumeTemplateInput, unit: ResumeUnit, lines: string[]): ResumeTemplateInput {
  const next = copyDraft(draft);
  if (unit.kind === "summary") next.summary = lines[0] ?? "";
  else if (unit.kind === "impact") next.impactItems = lines;
  else if (unit.kind === "skills") next.skills = lines;
  else if (unit.kind === "role") {
    if (next.experience[unit.index]) next.experience[unit.index].bullets = lines;
  } else {
    const section = extraSectionOf(next, unit.id);
    if (section) section.items = lines;
  }
  return next;
}

/**
 * The approved version of the part being regenerated. A role is matched by title and
 * employer before position, because the editor lets the user reorder and remove
 * sections and a positional match would regenerate one job from another's bullets.
 */
function laneLinesFor(lane: ResumeTemplateInput, current: ResumeTemplateInput, unit: ResumeUnit): string[] {
  if (unit.kind !== "role") return linesOf(lane, unit);
  const entry = current.experience[unit.index];
  if (!entry) return [];
  const same = (value: string, other: string) => value.trim().toLowerCase() === other.trim().toLowerCase();
  const match = lane.experience.find((candidate) => same(candidate.title, entry.title) && same(candidate.organization, entry.organization))
    ?? lane.experience[unit.index];
  return match?.bullets ?? [];
}

function labelFor(draft: ResumeTemplateInput, unit: ResumeUnit): string {
  if (unit.kind === "summary") return "Professional summary";
  if (unit.kind === "impact") return draft.impactHeading || "Key achievements";
  if (unit.kind === "skills") return draft.skillsHeading || "Skills";
  if (unit.kind === "role") {
    const entry = draft.experience[unit.index];
    return entry ? [entry.title, entry.organization].filter(Boolean).join(", ") : "Experience";
  }
  return extraSectionOf(draft, unit.id)?.title ?? "Section";
}

export async function rewriteSection(input: {
  documentId: string;
  action: SectionAction;
  unit: string;
  note?: string;
  draft: ResumeTemplateInput;
  signal?: AbortSignal;
}): Promise<SectionRewriteResult> {
  const unit = parseUnitKey(input.unit);
  if (!unit) throw new SectionRewriteError(`Unknown section: ${input.unit}`, 400);

  const doc = getGeneratedDocumentById(input.documentId);
  if (!doc) throw new SectionRewriteError("Draft not found.", 404);
  const job = getJobById(doc.jobId);
  if (!job) throw new SectionRewriteError("The job for this draft no longer exists.", 404);
  const evaluation = getEvaluationByJobId(job.id);
  if (!evaluation) throw new EvaluationRequiredError(job.id);

  const resumes = getResumes();
  const lane = resolveDocumentResumeLane(doc, resumes);
  if (!lane) throw new SectionRewriteError(`The resume lane "${doc.baseResume}" this draft came from is gone.`, 409);
  const approved = getApprovedResumeVersion(lane);
  const profile = getUserProfile();
  const laneDraft = templateFromApprovedSections(approved.sections, profile, job, resolveSectionModes(approved.sections, []));

  const current = input.draft;
  const startingLines = input.action === "improve" ? linesOf(current, unit) : laneLinesFor(laneDraft, current, unit);
  if (startingLines.length === 0) {
    throw new SectionRewriteError(
      input.action === "improve"
        ? "This section is empty, so there is nothing to improve."
        : "Your approved resume has nothing for this section to be written from.",
      400
    );
  }

  const keywordSignals = getEffectiveKeywordSignals(job.id);
  const preparation = getApplicationPreparation(job.id);
  const gapResponses = getJobGapResponses(job.id).filter((response) => response.qualityStatus === "addressed");
  const supplements = getProfileSupplements().filter((supplement) => supplement.qualityStatus === "addressed");
  const laneEvidence = buildEvidenceText(await loadSourceResumeText(lane), laneDraft, gapResponses, supplements, otherActiveLanes(resumes, lane));
  // What the user typed into this part is their own statement, so Improve may keep it.
  // Only what the model adds beyond it and the evidence bank is reverted.
  const evidenceText = input.action === "improve" ? `${laneEvidence}\n${startingLines.join("\n")}` : laneEvidence;
  const { partial, missing } = keywordStrengthDetailsForText(evidenceTextForDraft(current), keywordSignals);

  const context: UnitWriterContext = {
    job,
    evaluation,
    profile,
    skills: getSkills(),
    evidenceDraft: laneDraft,
    gapResponses,
    supplements,
    keywordSignals,
    confirmedKeywords: keywordSignals.map((signal) => signal.keyword).filter((keyword) => isKeywordInText(evidenceText, keyword)),
    missingKeywords: [...partial, ...missing],
    requirements: preparation?.requirements ?? [],
    evidenceMap: preparation?.evidenceMap ?? [],
  };

  const placements = planKeywordPlacements([{ unit, lines: startingLines }], context);
  const unitInput: UnitInput = {
    unit,
    label: labelFor(current, unit),
    lines: startingLines,
    context: unit.kind === "summary"
      ? summaryContextFor(current)
      : unit.kind === "role" && current.experience[unit.index]
        ? `Role: ${labelFor(current, unit)}${current.experience[unit.index].dateRange ? ` (${current.experience[unit.index].dateRange})` : ""}`
        : undefined,
    note: input.note,
    mode: input.action === "improve" ? "improve" : "tailor",
    placeKeywords: placements.get(unitKey(unit)),
  };

  const result = await writeUnit(context, unitInput, { signal: input.signal });
  if (!result.ok) throw new SectionRewriteError(`The AI could not rewrite this section: ${result.reason}`, 502);

  // The same guard and keyword preservation a full generation applies, on a draft that
  // differs from the current one only in this part.
  const source = withLines(current, unit, result.order.map((index) => startingLines[index]));
  const applied = withLines(current, unit, result.lines);
  const reverted = revertUnsupportedMetrics(source, applied, evidenceText);
  const preserved = restoreLostKeywords(source, reverted.draft, keywordSignals);
  const lines = linesOf(preserved.draft, unit);

  return {
    unit: unitKey(unit),
    action: input.action,
    lines,
    sources: result.order.map((index) => startingLines[index]),
    reverted: reverted.reverted,
    restored: preserved.restored,
    issues: lintPart(unit.kind, lines),
    repaired: result.repaired,
    notice: result.notice,
    providerUsed: result.providerUsed,
    modelUsed: result.modelUsed,
    ms: result.ms,
  };
}
