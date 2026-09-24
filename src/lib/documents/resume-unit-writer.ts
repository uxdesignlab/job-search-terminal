import { getWritingProvider } from "../ai/factory";
import { STRUCTURED_OUTPUT_MAX_TOKENS, totalGenerationDeadlineMs } from "../ai/deadlines";
import { getAIPromptText, renderPromptTemplate } from "../ai/prompt-registry";
import { GenerationCancelledError, withChainDeadline, withRetry } from "../ai/retry";
import type { AIMessage, AIProvider } from "../ai/provider";
import { aiErrorMessage } from "../ai/error-response";
import { normalizeForGrounding } from "../application-preparation";
import type {
  ApplicationRequirement,
  EvaluationRecord,
  EvidenceMapEntry,
  JobKeywordSignal,
  JobRecord,
  SkillRecord,
  UserProfileRecord,
} from "../db/types";
import { keywordMatchTier } from "./keyword-coverage";
import {
  buildBackgroundBlock,
  buildGapContext,
  buildJobDescriptionBlock,
  buildJobGapsBlock,
  buildKeywordStrategyBlock,
  buildEvaluationRequirementsBlock,
  buildSkillsPreferenceBlock,
  buildStrengthsBlock,
  buildStyleContextBlock,
  type GapResponseContext,
  type SupplementContext,
} from "./llm-tailorer";
import { HYPE_TERMS, MAX_SUMMARY_SENTENCES, MAX_SUMMARY_WORDS, SELF_ASSESSMENT_OPENERS, lintPart, type LintIssue, type LintPartKind } from "./resume-lint";
import type { ResumeTemplateInput } from "./resume-template";

/**
 * Writes a resume one part at a time: each job's bullets, the key achievements, the
 * skills, a custom section, and — last, from what the others became — the summary.
 *
 * It replaced a single call that returned every rewritten section as one JSON answer.
 * That shape failed in three ways at once. A long answer is where a small model's
 * instruction-following gives out, so the later roles were the weakest. One malformed
 * answer lost the whole resume to source text rather than one section. And the summary
 * was written before the bullets it was meant to summarise. One part at a time also
 * gives the progress window something true to say, and is the same code path Improve
 * and Regenerate use for a single section.
 *
 * Every call shares a byte-identical prefix — rules, the candidate's evidence, the
 * posting — and differs only in the part being written, so a local model's prefix cache
 * and a cloud provider's prompt cache pay for that prefix once.
 */

export type ResumeUnit =
  | { kind: "role"; index: number }
  | { kind: "impact" }
  | { kind: "summary" }
  | { kind: "skills" }
  | { kind: "extra"; id: string };

export function unitKey(unit: ResumeUnit): string {
  if (unit.kind === "role") return `role:${unit.index}`;
  if (unit.kind === "extra") return `extra:${unit.id}`;
  return unit.kind;
}

export function parseUnitKey(key: string): ResumeUnit | null {
  if (key === "impact" || key === "summary" || key === "skills") return { kind: key };
  const role = /^role:(\d+)$/.exec(key);
  if (role) return { kind: "role", index: Number(role[1]) };
  const extra = /^extra:(.+)$/.exec(key);
  if (extra) return { kind: "extra", id: extra[1] };
  return null;
}

/** What every part is written against. Built once per generation or section request. */
export type UnitWriterContext = {
  job: JobRecord;
  evaluation: EvaluationRecord;
  profile: UserProfileRecord;
  skills: SkillRecord[];
  /** The approved lane, whole — the evidence every part may draw on. */
  evidenceDraft: ResumeTemplateInput;
  gapResponses: GapResponseContext[];
  supplements: SupplementContext[];
  keywordSignals: JobKeywordSignal[];
  /** Posting phrases the candidate's evidence supports. */
  confirmedKeywords: string[];
  /** Posting phrases not yet present verbatim in the draft. */
  missingKeywords: string[];
  requirements: ApplicationRequirement[];
  evidenceMap: EvidenceMapEntry[];
};

export type UnitInput = {
  unit: ResumeUnit;
  /** How the part is named to the user and in the prompt: "Design Lead, Northwind". */
  label: string;
  /** The lines to write from. A summary is one line. */
  lines: string[];
  /** Extra framing: the role's title and dates, or for a summary what the resume now says. */
  context?: string;
  /** The user's own instruction for this part, from the editor. */
  note?: string;
  /**
   * Supported job phrases missing from the resume that this part, and no other, is
   * asked to work in. See `planKeywordPlacements`.
   */
  placeKeywords?: string[];
  /**
   * `tailor` writes the part for the posting from the approved source. `improve`
   * polishes text the user may have edited, keeping its substance.
   */
  mode: "tailor" | "improve";
};

export type UnitSuccess = {
  ok: true;
  unit: ResumeUnit;
  label: string;
  /** Source index behind each output line, in output order. Identity for a summary. */
  order: number[];
  lines: string[];
  /** Whether a repair pass replaced the first answer. */
  repaired: boolean;
  issues: LintIssue[];
  providerUsed: string;
  modelUsed: string;
  notice: string;
  ms: number;
};

export type UnitFailure = {
  ok: false;
  unit: ResumeUnit;
  label: string;
  reason: string;
  ms: number;
};

export type UnitResult = UnitSuccess | UnitFailure;

export type UnitRunOptions = {
  signal?: AbortSignal;
  onProvider?: (provider: string, model: string) => void;
};

function lintKind(unit: ResumeUnit): LintPartKind {
  return unit.kind;
}

/** The system prompt. Identical for every part of every resume a user writes. */
export function buildUnitSystemPrompt(ctx: Pick<UnitWriterContext, "job" | "evaluation" | "profile" | "skills">): string {
  const userTuningPrompt = renderPromptTemplate(getAIPromptText("resume_tailoring"), {
    company: ctx.job.company,
    role: ctx.job.title,
    archetype: ctx.evaluation.roleArchetype,
    candidate: ctx.profile.name,
  });
  const hype = HYPE_TERMS.filter((term) => !term.includes(" ")).map((term) => `"${term}"`).join(", ");
  const openers = SELF_ASSESSMENT_OPENERS.map((phrase) => `"${phrase[0].toUpperCase()}${phrase.slice(1)}"`).join(", ");

  return `You are a professional resume writer. You tailor one part of a candidate's resume at a time for one job posting. The result must be true, specific, and quick for a recruiter to scan, and it should use the posting's own words wherever they honestly describe the candidate.

TRUTH RULES — breaking any of these is a failure:
1. Use only facts found in the candidate's approved resume, confirmed gap answers, and profile context below. Never invent or imply an achievement, number, tool, employer, title, industry, credential, degree, responsibility, date, or level of seniority.
2. Keep every number that appears in a source line. Never add a number that the evidence does not give for that line. A summary has no single source line: a number in it must be stated in the approved resume or a confirmed gap answer for the same work it describes, never combined, inflated, or moved onto different work.
3. Keep each line about the work it described. Do not move facts between jobs, projects, or time periods, and do not merge two lines into one.
4. Return every source line exactly once. You may change the order and the wording. You may not drop lines or add new ones.
5. Never put the target job title on a job the candidate held. Use the target title in the summary only if the evidence shows that field and level; otherwise use an honest nearby description.
6. Posting requirements the evidence does not support are gaps. Do not insert them, hint at them, or hide them in a list.
7. No hype such as ${hype}. No self-rating openers such as ${openers}. No first person ("I", "my", "we").
8. The candidate may add a note about a part. Follow it unless it conflicts with these truth rules; the truth rules always win.

HOW TO WRITE A BULLET:
- Start with a strong action verb in the same tense as the source line.
- Say what was done, how (method or tool), for whom or at what scale, and the result — using only the parts the evidence gives.
- Put the posting's supported language early in the line, where it is true. Write it in the sentence's own capitalization — applicant systems match words regardless of case, and "Cross-Functional Collaboration" in the middle of a sentence reads as pasted in.
- Never tack a phrase onto the end of a sentence ("… using user-centered design") to include it. If it does not fit the line naturally, leave it out.
- Keep named specifics: products, domains, tools, audiences. Cutting a detail that is irrelevant to this posting is fine; blurring a specific into something vague is not.
- One or two printed lines — at most 220 characters.
- Do not start two bullets in the same job with the same verb.
- Put the lines most relevant to this posting first.
- If a line is already specific and relevant to this posting, you may keep its wording.

HOW TO WRITE A SUMMARY:
- When a current summary is given, preserve its truthful professional identity and strongest claims. Rewrite its emphasis and wording for this specific posting; copying it unchanged is not tailoring.
- Select the two or three most relevant facts from the approved resume and confirmed answers. Connect those facts to the posting's supported needs and outcomes. Prefer concrete experience over broad claims of expertise.
- You may replace generic or less relevant sentences with better supported evidence from elsewhere in the approved resume. Do not imply experience with a posting requirement merely because the posting mentions it.
- ${MAX_SUMMARY_SENTENCES - 2} to ${MAX_SUMMARY_SENTENCES} sentences, at most ${MAX_SUMMARY_WORDS} words.
- Open with the candidate's professional identity and scope, as the resume states them.
- Follow with the proof that matches this posting's must-haves most closely.
- Use each supported keyword at most once. Plain words over impressive ones.

USER TUNING PROMPT:
${userTuningPrompt}${buildStyleContextBlock()}${buildSkillsPreferenceBlock(ctx.skills)}`;
}

/**
 * Everything about the candidate and the posting, rendered once. It carries no trace of
 * the part being written, which is what keeps it a cacheable prefix.
 */
export function buildUnitSharedContext(ctx: UnitWriterContext): string {
  const evidence = buildBackgroundBlock(ctx.evidenceDraft, { extraSections: [] }, "## Candidate's Approved Resume (evidence)");
  // Missing phrases are deliberately left out of the shared lists. When every part was
  // told to "work each of these in", every part did, and the resume repeated the same
  // keywords in each job until it read as stuffed. Each part is told which phrases are
  // its own to place instead.
  // Shown in the case a sentence would use: a model copies the posting's heading case
  // ("Cross-Functional Collaboration") straight into the middle of a sentence otherwise.
  const casedSignals = ctx.keywordSignals.map((signal) => ({ ...signal, keyword: sentenceCase(signal.keyword) }));
  const casedConfirmed = ctx.keywordSignals
    .filter((signal) => ctx.confirmedKeywords.some((keyword) => keyword.toLowerCase() === signal.keyword.toLowerCase()))
    .map((signal) => sentenceCase(signal.keyword));
  const strategy = `${buildKeywordStrategyBlock(casedSignals, casedConfirmed, [])}

The resume is written one part at a time, so no part sees what the others say. Use a phrase from these lists only where the part's own lines already describe it, or where the part is explicitly asked to place it. Across the whole resume a phrase should appear once or twice, not in every part.`;
  return `Tailor part of this candidate's resume for the job below. You will be told which part at the end.

${evidence}${buildGapContext(ctx.gapResponses, ctx.supplements)}

## Target Role
Title: ${ctx.job.title}
Company: ${ctx.job.company}
Archetype: ${ctx.evaluation.roleArchetype}${buildEvaluationRequirementsBlock(ctx.evaluation, ctx.requirements)}${buildJobDescriptionBlock(ctx.job)}

${strategy}

Candidate strengths to consider (use only if supported):
${buildStrengthsBlock(ctx.evaluation.strengths.slice(0, 4))}${buildJobGapsBlock(ctx.evaluation.gaps ?? [], ctx.evaluation.redFlags ?? [])}`;
}

/** Evidence-map entries whose quoted evidence sits inside this part's own lines. */
export function evidenceForLines(evidenceMap: EvidenceMapEntry[], lines: string[]): EvidenceMapEntry[] {
  const haystack = normalizeForGrounding(lines.join("\n"));
  if (!haystack) return [];
  return evidenceMap.filter((entry) => {
    const quoted = normalizeForGrounding(entry.evidence);
    return quoted.length > 0 && haystack.includes(quoted);
  });
}

function outputShapeFor(input: UnitInput): string {
  if (input.unit.kind === "summary") return '{"summary":"the summary"}';
  return '{"lines":[{"source":0,"text":"rewritten line"}]}';
}

export function buildUnitTask(ctx: UnitWriterContext, input: UnitInput): string {
  const parts: string[] = [];
  const name = input.unit.kind === "summary" ? "the professional summary" : input.label;
  parts.push(`## The Part To Write Now: ${name}`);
  if (input.context) parts.push(input.context);

  if (input.unit.kind === "summary") {
    // Preserve the candidate's professional identity while asking for a real
    // connection to this posting. "Do not replace it" previously caused the
    // writer to return the approved summary verbatim.
    parts.push(input.lines[0]?.trim()
      ? `Current approved summary — preserve its factual identity, then rewrite it to lead with evidence relevant to this posting. Do not return it verbatim:\n${input.lines[0]}`
      : "There is no summary yet. Write one from what the resume says below.");
    const held = closestHeldTitle(ctx.evidenceDraft, ctx.job.title);
    if (held) {
      parts.push(`The posting's title is "${ctx.job.title}". The closest title the candidate has actually held is "${held.title}"${held.organization ? ` at ${held.organization}` : ""}. Open the summary with an honest professional identity that uses the posting's words for that field — never claim the posting's title itself unless the evidence shows it.`);
    }
  } else {
    parts.push(`Source lines, numbered:\n${input.lines.map((line, index) => `[${index}] ${line}`).join("\n")}`);
  }

  const proof = evidenceForLines(ctx.evidenceMap, input.unit.kind === "summary" ? [input.context ?? ""] : input.lines);
  if (proof.length > 0) {
    parts.push(`What these lines prove for this posting:\n${proof.map((entry) => `- ${entry.requirement} ← "${entry.evidence}"`).join("\n")}`);
  }

  if (input.placeKeywords && input.placeKeywords.length > 0) {
    parts.push(`Job language the resume does not yet use, which this part is the best place for. Work each phrase in once, only where it is true of these lines and reads naturally; otherwise leave it out:\n${input.placeKeywords.map((keyword) => `- ${sentenceCase(keyword)}`).join("\n")}`);
  }

  const text = input.lines.join("\n");
  const keep = ctx.keywordSignals
    .map((signal) => signal.keyword)
    .filter((keyword) => keywordMatchTier(text, keyword) === "exact");
  if (keep.length > 0) {
    parts.push(`Job phrases already here — keep each one verbatim somewhere in this part, however else you change the lines:\n${keep.map((keyword) => `- ${keyword}`).join("\n")}`);
  }

  parts.push(input.mode === "improve"
    ? "Improve these lines: tighten the wording, sharpen the verbs, and bring forward the posting's supported language. Keep what each line says."
    : "Write this part for this posting.");

  if (input.note?.trim()) {
    parts.push(`The candidate's note about this part (follow it within the truth rules):\n${input.note.trim().slice(0, 500)}`);
  }

  parts.push(input.unit.kind === "summary"
    ? `Return JSON only, in this shape: ${outputShapeFor(input)}`
    : `Return JSON only, in this shape: ${outputShapeFor(input)}\nInclude every source number from 0 to ${input.lines.length - 1} exactly once, most relevant first.`);

  return parts.join("\n\n");
}

function messagesFor(ctx: UnitWriterContext, input: UnitInput, repair?: { previous: unknown; issues: LintIssue[]; unchanged?: boolean }): AIMessage[] {
  const task = buildUnitTask(ctx, input);
  const feedback = repair ? [`Your previous answer was:\n${JSON.stringify(repair.previous)}`] : [];
  if (repair?.unchanged) {
    feedback.push("It copied the approved wording without tailoring it to this posting. Keep the claims true, but lead with the approved experience that best answers this job's needs and use the posting's language only where supported. Change the wording and emphasis, not just the line order.");
  }
  if (repair?.issues.length) {
    feedback.push(`It broke these rules:\n${repair.issues.map((issue) =>
      `- ${issue.index >= 0 && input.unit.kind !== "summary" ? `Line ${issue.index + 1}: ` : ""}${issue.message}`
    ).join("\n")}`);
  }
  if (repair) feedback.push("Return the whole part again in the same JSON shape.");
  const repairText = feedback.length ? `\n\n${feedback.join("\n\n")}` : "";
  return [
    { role: "system", content: buildUnitSystemPrompt(ctx) },
    { role: "user", content: `${buildUnitSharedContext(ctx)}\n\n${task}${repairText}` },
  ];
}

/**
 * Accept the model's answer only when it accounts for every source line exactly once.
 * Anything else is treated as a failed part rather than patched, because a guessed
 * mapping is how a bullet's facts end up attributed to the wrong line.
 */
export function validateUnitOutput(input: UnitInput, raw: unknown): { order: number[]; lines: string[] } | null {
  const value = raw as Record<string, unknown> | null;
  if (!value || typeof value !== "object") return null;

  if (input.unit.kind === "summary") {
    const summary = typeof value.summary === "string" ? value.summary.trim() : "";
    return summary ? { order: [0], lines: [summary] } : null;
  }

  const list = Array.isArray(value.lines) ? value.lines : Array.isArray(value.bullets) ? value.bullets : Array.isArray(value.items) ? value.items : null;
  if (!list || list.length !== input.lines.length) return null;

  if (list.every((entry) => typeof entry === "string")) {
    const lines = (list as string[]).map((line) => line.trim());
    return lines.every(Boolean) ? { order: lines.map((_, index) => index), lines } : null;
  }

  const order: number[] = [];
  const lines: string[] = [];
  const seen = new Set<number>();
  for (const entry of list) {
    const item = entry as { source?: unknown; text?: unknown } | null;
    const source = typeof item?.source === "number" ? item.source : typeof item?.source === "string" ? Number(item.source) : NaN;
    const text = typeof item?.text === "string" ? item.text.trim() : "";
    if (!Number.isInteger(source) || source < 0 || source >= input.lines.length || seen.has(source) || !text) return null;
    seen.add(source);
    order.push(source);
    lines.push(text);
  }
  return { order, lines };
}

async function callModel(ctx: UnitWriterContext, input: UnitInput, run: UnitRunOptions, repair?: { previous: unknown; issues: LintIssue[]; unchanged?: boolean }) {
  const provider: AIProvider = getWritingProvider();
  const chain = provider as AIProvider & {
    abortOn?: (signal: AbortSignal) => void;
    observe?: (listener: (attempt: { provider: string; model: string }) => void) => void;
    providerNames?: string[];
    notice?: string;
  };
  chain.observe?.((attempt) => run.onProvider?.(attempt.provider, attempt.model));
  if (!chain.observe) run.onProvider?.(provider.name, provider.effectiveModel);

  const raw = await withChainDeadline(
    chain,
    (runSignal) => withRetry(() =>
      provider.generateJSON<unknown>(
        messagesFor(ctx, input, repair),
        outputShapeFor(input),
        { maxTokens: STRUCTURED_OUTPUT_MAX_TOKENS, reasoning: "low", temperature: 0.3, signal: runSignal }
      ), 3, 1500, runSignal),
    totalGenerationDeadlineMs(chain.providerNames ?? [provider.name]),
    run.signal
  );
  return { raw, providerUsed: provider.name, modelUsed: provider.effectiveModel, notice: chain.notice ?? "" };
}

/**
 * Write one part, and send it back once if it breaks a writing rule.
 *
 * The repair is bounded to a single extra call: a part that still breaks the rules
 * after it keeps whichever answer broke fewer, and the remaining problems are
 * reported rather than retried until the budget runs out.
 */
export async function writeUnit(ctx: UnitWriterContext, input: UnitInput, run: UnitRunOptions = {}): Promise<UnitResult> {
  const startedAt = Date.now();
  try {
    const first = await callModel(ctx, input, run);
    const valid = validateUnitOutput(input, first.raw);
    if (!valid) {
      return {
        ok: false,
        unit: input.unit,
        label: input.label,
        reason: input.unit.kind === "summary"
          ? "the answer had no summary in it"
          : `the answer did not return each of the ${input.lines.length} lines exactly once`,
        ms: Date.now() - startedAt,
      };
    }

    // Any job phrase this part did not already carry counts, not only the ones it was
    // asked to place: the shared keyword lists are in every prompt, and a model tacks
    // those on just as readily.
    const sourceText = input.lines.join("\n");
    const placed = ctx.keywordSignals
      .map((signal) => signal.keyword)
      .filter((keyword) => keywordMatchTier(sourceText, keyword) !== "exact");
    let best = { ...valid, issues: lintPart(lintKind(input.unit), valid.lines, placed), meta: first, repaired: false };
    // Reordering alone may improve scanning, but a copied summary or achievement
    // section still makes the finished resume read like the approved lane.
    const unchanged = input.mode === "tailor" && (input.unit.kind === "summary" || input.unit.kind === "impact") &&
      best.lines.every((line, index) => line.trim() === input.lines[best.order[index]]?.trim());
    if (best.issues.length > 0 || unchanged) {
      if (run.signal?.aborted) throw new GenerationCancelledError();
      try {
        const second = await callModel(ctx, input, run, { previous: first.raw, issues: best.issues, unchanged });
        const repaired = validateUnitOutput(input, second.raw);
        if (repaired) {
          const issues = lintPart(lintKind(input.unit), repaired.lines, placed);
          const changed = repaired.lines.some((line, index) => line.trim() !== input.lines[repaired.order[index]]?.trim());
          if (issues.length < best.issues.length || (unchanged && changed && issues.length <= best.issues.length)) {
            best = { ...repaired, issues, meta: second, repaired: true };
          }
        }
      } catch (error) {
        if (error instanceof GenerationCancelledError) throw error;
        // A failed repair leaves the first answer standing; it was already valid.
      }
    }

    return {
      ok: true,
      unit: input.unit,
      label: input.label,
      order: best.order,
      lines: best.lines,
      repaired: best.repaired,
      issues: best.issues,
      providerUsed: best.meta.providerUsed,
      modelUsed: best.meta.modelUsed,
      notice: best.meta.notice,
      ms: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof GenerationCancelledError || run.signal?.aborted) throw new GenerationCancelledError();
    return { ok: false, unit: input.unit, label: input.label, reason: aiErrorMessage(error), ms: Date.now() - startedAt };
  }
}

/**
 * Run parts with at most `concurrency` in flight. A local Ollama server answers one
 * request at a time, so sending it several only queues them behind each other — and a
 * request that waits too long in Ollama's queue is dropped — so callers pass 1 there.
 */
export async function runUnits<T, R>(
  items: T[],
  concurrency: number,
  work: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await work(items[index], index);
    }
  });
  await Promise.all(lanes);
  return results;
}

/** Inputs for every part a generation should write, in the order they run. The summary is not among them. */
export function unitsForDraft(
  draft: ResumeTemplateInput,
  isSelected: (unit: ResumeUnit) => boolean
): UnitInput[] {
  const units: UnitInput[] = [];
  draft.experience.forEach((entry, index) => {
    const unit: ResumeUnit = { kind: "role", index };
    if (entry.bullets.length === 0 || !isSelected(unit)) return;
    units.push({
      unit,
      label: [entry.title, entry.organization].filter(Boolean).join(", "),
      lines: entry.bullets,
      context: `Role: ${[entry.title, entry.organization].filter(Boolean).join(", ")}${entry.dateRange ? ` (${entry.dateRange})` : ""}`,
      mode: "tailor",
    });
  });
  if (draft.impactItems.length > 0 && isSelected({ kind: "impact" })) {
    units.push({ unit: { kind: "impact" }, label: draft.impactHeading || "Key achievements", lines: draft.impactItems, context: "These are the resume's headline achievements, read before any job.", mode: "tailor" });
  }
  if (draft.skills.length > 0 && isSelected({ kind: "skills" })) {
    units.push({
      unit: { kind: "skills" },
      label: draft.skillsHeading || "Skills",
      lines: draft.skills,
      context: "Skills lines. Reorder terms within a line and lines within the list so the posting's supported skills lead. Keep a line's category label if it has one. Do not add skills the evidence does not show.",
      mode: "tailor",
    });
  }
  for (const section of draft.extraSections ?? []) {
    const unit: ResumeUnit = { kind: "extra", id: section.id ?? `custom-${section.title}` };
    if (section.items.length === 0 || !isSelected(unit)) continue;
    units.push({ unit, label: section.title, lines: section.items, mode: "tailor" });
  }
  return units;
}

/**
 * A posting's heading-style phrase ("Cross-Functional Collaboration") in the case a
 * sentence would use. Single words keep their case, since those are usually names
 * ("Figma", "Agile"), and so do phrases carrying an acronym ("WCAG 2.2", "AI-native").
 */
export function sentenceCase(phrase: string): string {
  const words = phrase.trim().split(/\s+/);
  if (words.length < 2) return phrase.trim();
  if (/[A-Z]{2,}/.test(phrase)) return phrase.trim();
  const allCapitalized = words.every((word) => /^[A-Z][a-z'’-]*(?:-[A-Z]?[a-z'’]+)*$/.test(word));
  return allCapitalized ? phrase.trim().toLowerCase() : phrase.trim();
}

const TITLE_STOP_WORDS = new Set(["of", "and", "the", "for", "to", "in", "a", "an", "sr", "senior", "jr", "junior", "remote", "hybrid", "i", "ii", "iii"]);

function titleTerms(title: string): Set<string> {
  return new Set(normalizeForGrounding(title).split(" ").filter((term) => term.length > 1 && !TITLE_STOP_WORDS.has(term)));
}

/**
 * The job the candidate held whose title shares the most words with the posting's.
 *
 * The summary is where a recruiter and a title search look first, and a small model
 * writing it defaults to a safe generic identity ("product design leader") even when the
 * candidate has held a title very close to the one being hired for. Naming that title
 * gives the writer something true to align with; it needs at least two shared words, so
 * "Designer" never stands in for "Director of Design Operations".
 */
export function closestHeldTitle(draft: ResumeTemplateInput, targetTitle: string): { title: string; organization: string } | null {
  const target = titleTerms(targetTitle);
  let best: { title: string; organization: string; score: number } | null = null;
  for (const entry of draft.experience) {
    const shared = [...titleTerms(entry.title)].filter((term) => target.has(term)).length;
    if (shared >= 2 && (!best || shared > best.score)) best = { title: entry.title, organization: entry.organization, score: shared };
  }
  return best ? { title: best.title, organization: best.organization } : null;
}

const PLACEMENT_STOP_WORDS = new Set(["and", "the", "for", "with", "of", "to", "in", "on", "a", "an", "or"]);

function placementTerms(value: string): string[] {
  return normalizeForGrounding(value)
    .split(" ")
    .filter((term) => term.length > 2 && !PLACEMENT_STOP_WORDS.has(term))
    .map((term) => term.replace(/(ing|ed|es|s)$/, ""));
}

/**
 * Decide which part each missing, evidence-supported job phrase belongs in — one part
 * per phrase.
 *
 * A part scores by how much of the phrase its own lines already talk about, and by an
 * evidence-map entry for a requirement naming the phrase whose proof sits in those
 * lines. Tools and methods lean towards the skills list when it is being written; soft
 * and domain language with no better home goes to the summary. A phrase no part relates
 * to is left unplaced, which is the honest outcome: the skills pass after writing adds
 * short supported terms, and the checks report names anything still missing.
 */
export function planKeywordPlacements(
  inputs: Array<Pick<UnitInput, "unit" | "lines">>,
  ctx: Pick<UnitWriterContext, "keywordSignals" | "confirmedKeywords" | "missingKeywords" | "evidenceMap">
): Map<string, string[]> {
  const confirmed = new Set(ctx.confirmedKeywords.map((keyword) => keyword.toLowerCase()));
  const missing = new Set(ctx.missingKeywords.map((keyword) => keyword.toLowerCase()));
  const placements = new Map<string, string[]>();

  for (const signal of ctx.keywordSignals) {
    const key = signal.keyword.toLowerCase();
    if (signal.category === "title" || signal.priority === "preferred" || !confirmed.has(key) || !missing.has(key)) continue;
    const terms = placementTerms(signal.keyword);
    if (terms.length === 0) continue;

    let best: { unit: string; score: number } | null = null;
    for (const input of inputs) {
      if (input.unit.kind === "summary") continue;
      const lineTerms = new Set(placementTerms(input.lines.join(" ")));
      let score = terms.filter((term) => lineTerms.has(term)).length / terms.length;
      const proven = ctx.evidenceMap.some((entry) =>
        normalizeForGrounding(entry.requirement).includes(normalizeForGrounding(signal.keyword)) &&
        normalizeForGrounding(input.lines.join("\n")).includes(normalizeForGrounding(entry.evidence))
      );
      if (proven) score += 1;
      if (input.unit.kind === "skills" && ["tool", "methodology", "technical", "credential"].includes(signal.category) && terms.length <= 3) score += 0.75;
      if (score > 0 && (!best || score > best.score)) best = { unit: unitKey(input.unit), score };
    }

    const summary = inputs.find((input) => input.unit.kind === "summary");
    const target = best && best.score >= 0.5
      ? best.unit
      : summary && ["soft", "domain", "technical", "methodology"].includes(signal.category)
        ? "summary"
        : best?.unit;
    if (!target) continue;
    placements.set(target, [...(placements.get(target) ?? []), signal.keyword]);
  }
  return placements;
}

/**
 * What the rest of the resume says. With no summary yet the summary is written from it;
 * with one, it keeps the tailored summary consistent with the parts and may back up a
 * point, but the current summary stays the foundation.
 */
export function summaryContextFor(draft: ResumeTemplateInput): string {
  const impact = draft.impactItems.length > 0 ? `${draft.impactHeading}:\n${draft.impactItems.map((item) => `- ${item}`).join("\n")}\n\n` : "";
  const roles = draft.experience
    .map((entry) => `${[entry.title, entry.organization].filter(Boolean).join(", ")}${entry.dateRange ? ` (${entry.dateRange})` : ""}\n${entry.bullets.map((bullet) => `- ${bullet}`).join("\n")}`)
    .join("\n");
  const lead = draft.summary.trim()
    ? "What the tailored resume now says — use its most relevant supported proof to connect the approved summary to this posting"
    : "What the tailored resume now says — write the summary from this";
  return `${lead}:\n${draft.headline ? `Headline: ${draft.headline}\n` : ""}${impact}${roles}`;
}

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

/**
 * Apply written parts to a draft, and reorder the source to match.
 *
 * The evidence guard, keyword preservation, and the unchanged-section measure all
 * compare the rewrite with its source line by line, by position. When a part comes back
 * in a new order, the source is put in that order too, so every one of those checks
 * still compares each line with the line it was written from.
 */
export function applyUnitResults(source: ResumeTemplateInput, results: UnitResult[]): { source: ResumeTemplateInput; applied: ResumeTemplateInput } {
  const reordered = copyDraft(source);
  const applied = copyDraft(source);
  const pick = <T>(items: T[], order: number[]) => order.map((index) => items[index]);

  for (const result of results) {
    if (!result.ok) continue;
    const { unit, order, lines } = result;
    if (unit.kind === "summary") {
      applied.summary = lines[0];
    } else if (unit.kind === "role") {
      const entry = source.experience[unit.index];
      if (!entry) continue;
      reordered.experience[unit.index].bullets = pick(entry.bullets, order);
      applied.experience[unit.index].bullets = lines;
    } else if (unit.kind === "impact") {
      reordered.impactItems = pick(source.impactItems, order);
      applied.impactItems = lines;
    } else if (unit.kind === "skills") {
      reordered.skills = pick(source.skills, order);
      applied.skills = lines;
    } else {
      const index = (source.extraSections ?? []).findIndex((section) => (section.id ?? `custom-${section.title}`) === unit.id);
      if (index < 0) continue;
      reordered.extraSections![index].items = pick(source.extraSections![index].items, order);
      applied.extraSections![index].items = lines;
    }
  }
  return { source: reordered, applied };
}
